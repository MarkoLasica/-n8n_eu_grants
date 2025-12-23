// scrapers_v2/test_all_v2.js
// Test all v2 scrapers with 3 grants each
const BaseScraperV2 = require('./base_scraper_v2');

class TestScraperV2 extends BaseScraperV2 {
  constructor(sourceId, sourceName, frameworkProgramme, config) {
    super(sourceId + '_test', config);
    this.sourceName = sourceName;
    this.baseUrl = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals';
    this.params = `?order=DESC&pageNumber=1&pageSize=50&sortBy=startDate&isExactMatch=true&status=31094502&frameworkProgramme=${frameworkProgramme}`;
    this.maxGrants = 3;
  }

  async scrape() {
    const allGrants = [];

    await this.page.goto(this.baseUrl + this.params, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await this.page.waitForSelector('sedia-result-card', { timeout: 60000 });

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

    this.log(`Found ${grants.length} grants`);

    for (const grant of grants) {
      if (grant.link !== 'N/A') {
        const enrichedGrant = await this.enrichGrant(grant);
        if (enrichedGrant) {
          allGrants.push(enrichedGrant);
        }
      }
    }

    return allGrants;
  }

  saveGrants() { /* Test mode - don't save */ }
  writeMarker() { /* Test mode - don't write */ }
}

const SOURCES = [
  { id: 'horizon_europe', name: 'Horizon Europe', frameworkProgramme: '43108390' },
  { id: 'digital_europe', name: 'Digital Europe', frameworkProgramme: '43152860' },
  { id: 'creative_europe', name: 'Creative Europe', frameworkProgramme: '43251814' },
  { id: 'erasmus', name: 'Erasmus+', frameworkProgramme: '43353764' }
];

async function runTests() {
  const config = require('../config/sources.json');
  const allResults = [];
  const stats = {
    total: 0,
    topicDetails: 0,
    competitiveCalls: 0,
    withBudget: 0,
    withProgramme: 0,
    withDeadline: 0
  };

  console.log('='.repeat(70));
  console.log('V2 SCRAPER TEST - ALL SOURCES (3 grants each)');
  console.log('='.repeat(70));

  for (const source of SOURCES) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Testing: ${source.name}`);
    console.log('─'.repeat(50));

    const scraper = new TestScraperV2(source.id, source.name, source.frameworkProgramme, config);

    try {
      const grants = await scraper.run();

      grants.forEach(g => {
        allResults.push({ source: source.name, ...g });
        stats.total++;
        if (g.url_type === 'topic-details') stats.topicDetails++;
        if (g.url_type === 'competitive-calls-cs') stats.competitiveCalls++;
        if (g.budget_amount) stats.withBudget++;
        if (g.programme) stats.withProgramme++;
        if (g.deadline_date) stats.withDeadline++;
      });

      // Print results for this source
      grants.forEach((g, i) => {
        console.log(`\n  [${i+1}] ${g.title.substring(0, 45)}...`);
        console.log(`      Type: ${g.url_type} | Budget: ${g.budget_amount ? '€' + parseInt(g.budget_amount).toLocaleString() : 'N/A'} | Deadline: ${g.deadline_date || 'N/A'}`);
      });

    } catch (error) {
      console.error(`  ERROR: ${error.message}`);
    }
  }

  // Final summary
  console.log('\n' + '='.repeat(70));
  console.log('FINAL TEST SUMMARY');
  console.log('='.repeat(70));
  console.log(`Total grants tested: ${stats.total}`);
  console.log(`Page types: ${stats.topicDetails} topic-details, ${stats.competitiveCalls} competitive-calls`);
  console.log(`Budget extracted: ${stats.withBudget}/${stats.total} (${Math.round(stats.withBudget/stats.total*100)}%)`);
  console.log(`Programme extracted: ${stats.withProgramme}/${stats.total}`);
  console.log(`Deadline extracted: ${stats.withDeadline}/${stats.total}`);

  console.log('\n' + '='.repeat(70));
  console.log('TEST COMPLETE');
  console.log('='.repeat(70));
}

runTests()
  .then(() => process.exit(0))
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
