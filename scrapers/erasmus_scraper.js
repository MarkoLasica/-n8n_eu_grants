// scrapers/erasmus_scraper.js
const BaseScraper = require('./base_scraper');
const cheerio = require('cheerio');

class ErasmusScraper extends BaseScraper {
  constructor(config) {
    super('erasmus', config);
    this.baseUrl = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals';
    // frameworkProgramme=43353764 filters for Erasmus+ Programme only
    this.params = '?order=DESC&pageNumber=1&pageSize=50&sortBy=startDate&isExactMatch=true&status=31094502&frameworkProgramme=43353764';
  }

  async scrape() {
    const existingTitles = this.loadExistingGrants();
    const allGrants = [];
    let hasNextPage = true;
    let currentPage = 1;

    await this.page.goto(this.baseUrl + this.params, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await this.page.waitForSelector('sedia-result-card', { timeout: 60000 });

    while (hasNextPage) {
      this.log(`Processing page ${currentPage}...`);

      const grants = await this.page.evaluate(() => {
        const data = [];
        const cards = document.querySelectorAll('sedia-result-card');

        cards.forEach(card => {
          const title = card.querySelector('a.eui-u-font-regular')?.innerText.trim() || 'N/A';
          let link = card.querySelector('a.eui-u-font-regular')?.getAttribute('href') || 'N/A';

          if (link.startsWith('/')) {
            link = 'https://ec.europa.eu' + link;
          }

          const dates = card.querySelectorAll('strong');
          const date = dates.length > 0 ? dates[0].innerText.trim() : 'N/A';

          data.push({ title, link, date });
        });

        return data;
      });

      this.log(`Found ${grants.length} grants on page ${currentPage}`);

      for (const grant of grants) {
        const normalizedTitle = this.normalizeTitle(grant.title);

        if (existingTitles.has(normalizedTitle)) {
          this.log(`Skipped (exists): ${grant.title.substring(0, 50)}...`);
          continue;
        }

        if (grant.link !== 'N/A') {
          const enrichedGrant = await this.enrichGrant(grant);
          if (enrichedGrant) {
            allGrants.push(enrichedGrant);
            existingTitles.add(normalizedTitle);
            this.log(`Added: ${grant.title.substring(0, 50)}...`);
          }
        }
      }

      hasNextPage = await this.goToNextPage();
      currentPage++;
    }

    this.log(`Scraping complete. Found ${allGrants.length} new grants.`);
    return allGrants;
  }

  async enrichGrant(grant) {
    const timeout = this.config.settings?.timeout_per_grant_ms || 900000;

    return new Promise(async (resolve) => {
      const timeoutId = setTimeout(() => {
        this.log(`Timeout for: ${grant.title.substring(0, 50)}...`);
        resolve(null);
      }, timeout);

      try {
        const newPage = await this.browser.newPage();
        await newPage.goto(grant.link, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));

        const content = await newPage.content();
        const $ = cheerio.load(content);

        const descriptionElements = $('.col-md-9.col-xxl-10 *')
          .map((_, el) => $(el).text().trim())
          .get();

        const fullDescription = [grant.title, ...descriptionElements]
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim() || 'N/A';

        const descriptionTokens = fullDescription.split(/\s+/);
        grant.description = descriptionTokens.slice(0, 1000).join(' ');

        await newPage.close();
        clearTimeout(timeoutId);
        resolve(grant);
      } catch (error) {
        this.log(`Error enriching grant: ${error.message}`);
        clearTimeout(timeoutId);
        resolve(null);
      }
    });
  }

  async goToNextPage() {
    try {
      await this.page.waitForSelector('button.eui-button.eui-button--basic', { timeout: 30000 });
      const nextPageButtons = await this.page.$$('button.eui-button.eui-button--basic');

      if (nextPageButtons.length > 0) {
        const isDisabled = await nextPageButtons[nextPageButtons.length - 1].evaluate(
          button => button.hasAttribute('disabled')
        );

        if (!isDisabled) {
          await Promise.all([
            this.page.waitForNavigation({ timeout: 60000 }),
            nextPageButtons[nextPageButtons.length - 2].click()
          ]);
          await this.page.waitForSelector('sedia-result-card', { timeout: 60000 });
          await new Promise(r => setTimeout(r, 3000));
          return true;
        }
      }
    } catch (error) {
      this.log(`Navigation error: ${error.message}`);

      // Try alternative navigation method
      try {
        const currentUrl = await this.page.url();
        const urlObj = new URL(currentUrl);
        const currentPageNum = parseInt(urlObj.searchParams.get('pageNumber') || '1');
        urlObj.searchParams.set('pageNumber', (currentPageNum + 1).toString());

        await this.page.goto(urlObj.toString(), { waitUntil: 'networkidle2', timeout: 60000 });

        const hasResults = await this.page.evaluate(() => {
          return document.querySelectorAll('sedia-result-card').length > 0;
        });

        if (hasResults) {
          this.log(`Successfully navigated to page ${currentPageNum + 1} via URL`);
          return true;
        }
      } catch (altNavError) {
        this.log(`Alternative navigation failed: ${altNavError.message}`);
      }
    }

    return false;
  }
}

// Allow running directly
if (require.main === module) {
  const config = require('../config/sources.json');
  const scraper = new ErasmusScraper(config);
  scraper.run().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = ErasmusScraper;
