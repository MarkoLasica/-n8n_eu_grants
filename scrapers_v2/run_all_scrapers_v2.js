// scrapers_v2/run_all_scrapers_v2.js
// Orchestrator for running all v2 programme scrapers with structured extraction
const fs = require('fs');
const path = require('path');

const HorizonEuropeScraperV2 = require('./horizon_europe_scraper_v2');
const DigitalEuropeScraperV2 = require('./digital_europe_scraper_v2');
const CreativeEuropeScraperV2 = require('./creative_europe_scraper_v2');
const ErasmusScraperV2 = require('./erasmus_scraper_v2');

const config = require('../config/sources.json');

const SCRAPERS = [
  { name: 'Horizon Europe', Scraper: HorizonEuropeScraperV2 },
  { name: 'Digital Europe', Scraper: DigitalEuropeScraperV2 },
  { name: 'Creative Europe', Scraper: CreativeEuropeScraperV2 },
  { name: 'Erasmus+', Scraper: ErasmusScraperV2 }
];

async function runAllScrapers() {
  const startTime = Date.now();
  const results = [];
  let totalNewGrants = 0;
  let totalBudgetExtracted = 0;

  console.log('='.repeat(60));
  console.log('EU GRANTS SCRAPER V2 - STRUCTURED EXTRACTION');
  console.log('='.repeat(60));
  console.log(`Started at: ${new Date().toISOString()}`);
  console.log(`Running ${SCRAPERS.length} programme scrapers...\n`);

  // Delete new_grants.csv before starting (fresh file each run)
  const newGrantsPath = path.join(__dirname, '..', 'data', 'grants', 'new_grants.csv');
  if (fs.existsSync(newGrantsPath)) {
    fs.unlinkSync(newGrantsPath);
    console.log('Deleted existing new_grants.csv\n');
  }

  for (const { name, Scraper } of SCRAPERS) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`Starting: ${name}`);
    console.log('─'.repeat(50));

    try {
      const scraper = new Scraper(config);
      const grants = await scraper.run();

      const withBudget = grants.filter(g => g.budget_amount).length;
      const topicDetails = grants.filter(g => g.url_type === 'topic-details').length;

      results.push({
        source: name,
        status: 'success',
        newGrants: grants.length,
        withBudget,
        topicDetails,
        competitiveCalls: grants.length - topicDetails
      });

      totalNewGrants += grants.length;
      totalBudgetExtracted += withBudget;

      console.log(`✓ ${name}: ${grants.length} new grants (${withBudget} with budget)`);

    } catch (error) {
      console.error(`✗ ${name}: ERROR - ${error.message}`);
      results.push({
        source: name,
        status: 'error',
        error: error.message,
        newGrants: 0
      });
    }
  }

  const endTime = Date.now();
  const duration = Math.round((endTime - startTime) / 1000);

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Duration: ${duration} seconds`);
  console.log(`Total new grants: ${totalNewGrants}`);
  console.log(`Grants with budget extracted: ${totalBudgetExtracted}/${totalNewGrants} (${totalNewGrants > 0 ? Math.round(totalBudgetExtracted/totalNewGrants*100) : 0}%)`);
  console.log('\nPer source:');

  results.forEach(r => {
    if (r.status === 'success') {
      console.log(`  ${r.source}: ${r.newGrants} grants (${r.withBudget} with budget, ${r.topicDetails} topic-details, ${r.competitiveCalls} competitive-calls)`);
    } else {
      console.log(`  ${r.source}: ERROR - ${r.error}`);
    }
  });

  // Save summary to logs
  const logsDir = path.join(__dirname, '..', 'logs', 'daily');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const today = new Date().toISOString().split('T')[0];
  const summaryPath = path.join(logsDir, `summary_v2_${today}.json`);

  const summary = {
    timestamp: new Date().toISOString(),
    duration_seconds: duration,
    total_new_grants: totalNewGrants,
    total_with_budget: totalBudgetExtracted,
    budget_extraction_rate: totalNewGrants > 0 ? Math.round(totalBudgetExtracted/totalNewGrants*100) : 0,
    results
  };

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\nSummary saved to: ${summaryPath}`);

  // Write completion marker
  const markerPath = path.join(__dirname, '..', 'scraper_finished.txt');
  fs.writeFileSync(markerPath, Date.now().toString());
  console.log('Wrote completion marker');

  console.log('\n' + '='.repeat(60));
  console.log('SCRAPING COMPLETE');
  console.log('='.repeat(60));

  return results;
}

// Run if called directly
runAllScrapers()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
