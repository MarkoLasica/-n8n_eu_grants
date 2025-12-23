// Quick test script for Creative Europe scraper - limits to 5 grants
const CreativeEuropeScraper = require('./creative_europe_scraper');
const config = require('../config/sources.json');

class TestCreativeEuropeScraper extends CreativeEuropeScraper {
  async scrape() {
    const existingTitles = this.loadExistingGrants();
    const allGrants = [];
    const MAX_GRANTS = 5; // LIMIT TO 5 GRANTS FOR TESTING

    await this.page.goto(this.baseUrl + this.params, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await this.page.waitForSelector('sedia-result-card', { timeout: 60000 });

    this.log(`Processing page 1 (test mode - max ${MAX_GRANTS} grants)...`);

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

    this.log(`Found ${grants.length} grants on page 1`);

    for (const grant of grants) {
      if (allGrants.length >= MAX_GRANTS) {
        this.log(`Reached limit of ${MAX_GRANTS} grants. Stopping.`);
        break;
      }

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
          this.log(`Added (${allGrants.length}/${MAX_GRANTS}): ${grant.title.substring(0, 50)}...`);
        }
      }
    }

    this.log(`Test scraping complete. Found ${allGrants.length} new grants.`);
    return allGrants;
  }
}

const scraper = new TestCreativeEuropeScraper(config);
scraper.run().then(() => process.exit(0)).catch(() => process.exit(1));
