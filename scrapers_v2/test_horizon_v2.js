// scrapers_v2/test_horizon_v2.js
// Test script for Horizon Europe v2 scraper - scrapes 5 grants and shows extracted data
const BaseScraperV2 = require('./base_scraper_v2');

class TestHorizonV2 extends BaseScraperV2 {
  constructor(config) {
    super('horizon_europe_test', config);
    this.baseUrl = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals';
    this.params = '?order=DESC&pageNumber=1&pageSize=50&sortBy=startDate&isExactMatch=true&status=31094502&frameworkProgramme=43108390';
    this.maxGrants = 5;  // Test limit
  }

  async scrape() {
    const allGrants = [];

    await this.page.goto(this.baseUrl + this.params, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await this.page.waitForSelector('sedia-result-card', { timeout: 60000 });

    this.log(`Processing page 1 (test mode - max ${this.maxGrants} grants)...`);

    const grants = await this.page.evaluate((limit) => {
      const data = [];
      const cards = document.querySelectorAll('sedia-result-card');

      cards.forEach((card, i) => {
        if (i >= limit) return;

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
    }, this.maxGrants);

    this.log(`Found ${grants.length} grants on page 1`);

    for (const grant of grants) {
      this.log(`\nProcessing: ${grant.title.substring(0, 60)}...`);

      if (grant.link !== 'N/A') {
        const enrichedGrant = await this.enrichGrant(grant);
        if (enrichedGrant) {
          allGrants.push(enrichedGrant);
        }
      }
    }

    this.log(`\nTest scraping complete. Processed ${allGrants.length} grants.`);

    // Print detailed results
    console.log('\n' + '='.repeat(70));
    console.log('EXTRACTED DATA SUMMARY');
    console.log('='.repeat(70));

    allGrants.forEach((g, i) => {
      console.log(`\n--- Grant ${i + 1}: ${g.title.substring(0, 50)}... ---`);
      console.log(`  URL Type: ${g.url_type}`);
      console.log(`  Programme: ${g.programme || 'N/A'}`);
      console.log(`  Opening Date: ${g.opening_date || 'N/A'}`);
      console.log(`  Deadline Date: ${g.deadline_date || 'N/A'}`);
      console.log(`  Deadline Model: ${g.deadline_model || 'N/A'}`);
      console.log(`  Status: ${g.status || 'N/A'}`);
      console.log(`  Budget Amount: ${g.budget_amount ? '€' + parseInt(g.budget_amount).toLocaleString() : 'N/A'}`);
      console.log(`  Budget Year: ${g.budget_year || 'N/A'}`);
      console.log(`  Type of Action: ${g.type_of_action?.substring(0, 60) || 'N/A'}...`);
      console.log(`  Description: ${g.description ? g.description.length + ' chars, first 150: ' + g.description.substring(0, 150) + '...' : 'N/A'}`);
      console.log(`  Full_Content: ${g.full_content ? g.full_content.split(' ').length + ' words, first 150 chars: ' + g.full_content.substring(0, 150) + '...' : 'N/A'}`);
    });

    // Statistics
    console.log('\n' + '='.repeat(70));
    console.log('EXTRACTION STATISTICS');
    console.log('='.repeat(70));

    const stats = {
      total: allGrants.length,
      topicDetails: allGrants.filter(g => g.url_type === 'topic-details').length,
      competitiveCalls: allGrants.filter(g => g.url_type === 'competitive-calls-cs').length,
      withBudget: allGrants.filter(g => g.budget_amount).length,
      withProgramme: allGrants.filter(g => g.programme).length,
      withDeadline: allGrants.filter(g => g.deadline_date).length
    };

    console.log(`Total grants: ${stats.total}`);
    console.log(`topic-details pages: ${stats.topicDetails}`);
    console.log(`competitive-calls-cs pages: ${stats.competitiveCalls}`);
    console.log(`Budget extracted: ${stats.withBudget}/${stats.total} (${Math.round(stats.withBudget/stats.total*100)}%)`);
    console.log(`Programme extracted: ${stats.withProgramme}/${stats.total}`);
    console.log(`Deadline extracted: ${stats.withDeadline}/${stats.total}`);

    return allGrants;
  }

  // Override saveGrants to not actually save during test
  saveGrants(grants, isNew = false) {
    this.log(`[TEST MODE] Would save ${grants.length} grants (not saving)`);
  }

  writeMarker() {
    this.log('[TEST MODE] Would write marker (not writing)');
  }
}

// Run test
const config = require('../config/sources.json');
const scraper = new TestHorizonV2(config);
scraper.run().then(() => process.exit(0)).catch(e => {
  console.error(e);
  process.exit(1);
});
