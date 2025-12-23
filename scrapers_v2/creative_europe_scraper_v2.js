// scrapers_v2/creative_europe_scraper_v2.js
const BaseScraperV2 = require('./base_scraper_v2');

class CreativeEuropeScraperV2 extends BaseScraperV2 {
  constructor(config) {
    super('creative_europe', config);
    this.baseUrl = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals';
    // frameworkProgramme=43251814 filters for Creative Europe Programme only
    this.params = '?order=DESC&pageNumber=1&pageSize=50&sortBy=startDate&isExactMatch=true&status=31094502&frameworkProgramme=43251814';
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

if (require.main === module) {
  const config = require('../config/sources.json');
  const scraper = new CreativeEuropeScraperV2(config);
  scraper.run().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = CreativeEuropeScraperV2;
