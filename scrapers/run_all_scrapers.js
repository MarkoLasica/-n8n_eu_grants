// scrapers/run_all_scrapers.js
const fs = require('fs');
const path = require('path');

async function runAllScrapers() {
  const configPath = path.join(__dirname, '..', 'config', 'sources.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const results = {
    timestamp: new Date().toISOString(),
    sources: [],
    totalNewGrants: 0,
    errors: []
  };

  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 Starting scraper run at ${results.timestamp}`);
  console.log(`📋 Found ${config.sources.length} configured source(s)`);
  console.log(`${'='.repeat(60)}\n`);

  // Clear new_grants.csv before starting (each scraper will append to it)
  const newGrantsPath = path.join(__dirname, '..', 'data', 'grants', 'new_grants.csv');
  if (fs.existsSync(newGrantsPath)) {
    fs.unlinkSync(newGrantsPath);
    console.log('🗑️  Cleared previous new_grants.csv\n');
  }

  for (const source of config.sources) {
    if (!source.enabled) {
      console.log(`⏭️  Skipping disabled source: ${source.name}\n`);
      continue;
    }

    console.log(`${'─'.repeat(60)}`);
    console.log(`🔍 Running scraper: ${source.name}`);
    console.log(`   ID: ${source.id}`);
    console.log(`   File: ${source.scraper}`);
    console.log(`${'─'.repeat(60)}\n`);

    try {
      const ScraperClass = require(`./${source.scraper.replace('.js', '')}`);
      const scraper = new ScraperClass(config);
      const grants = await scraper.run();

      results.sources.push({
        id: source.id,
        name: source.name,
        success: true,
        grantsFound: grants.length
      });
      results.totalNewGrants += grants.length;

      console.log(`\n✅ ${source.name}: Successfully found ${grants.length} new grant(s)\n`);
    } catch (error) {
      console.error(`\n❌ Error running ${source.name}:`, error.message);
      console.error(`   Stack: ${error.stack}\n`);

      results.sources.push({
        id: source.id,
        name: source.name,
        success: false,
        error: error.message
      });
      results.errors.push({
        source: source.id,
        error: error.message,
        stack: error.stack
      });
    }
  }

  // Write summary
  const summaryDir = path.join(__dirname, '..', 'logs', 'daily');
  if (!fs.existsSync(summaryDir)) {
    fs.mkdirSync(summaryDir, { recursive: true });
  }

  const today = new Date().toISOString().split('T')[0];
  const summaryPath = path.join(summaryDir, `summary_${today}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));

  // Write marker file to signal n8n that scraping is complete
  const markerPath = path.join(__dirname, '..', 'scraper_finished.txt');
  fs.writeFileSync(markerPath, Date.now().toString());

  // Final summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 SCRAPING COMPLETE`);
  console.log(`${'='.repeat(60)}`);
  console.log(`⏰ Duration: Started at ${results.timestamp}`);
  console.log(`🎯 Total new grants found: ${results.totalNewGrants}`);
  console.log(`✅ Successful sources: ${results.sources.filter(s => s.success).length}/${config.sources.length}`);

  if (results.errors.length > 0) {
    console.log(`⚠️  Errors encountered: ${results.errors.length}`);
    results.errors.forEach(err => {
      console.log(`   - ${err.source}: ${err.error}`);
    });
  }

  console.log(`📁 Summary saved to: logs/daily/summary_${today}.json`);
  console.log(`✔️  Marker file updated: scraper_finished.txt`);
  console.log(`${'='.repeat(60)}\n`);

  return results;
}

// Run when executed directly
if (require.main === module) {
  runAllScrapers()
    .then(() => {
      console.log('🎉 All scrapers completed successfully!\n');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Fatal error:', error);
      process.exit(1);
    });
}

module.exports = runAllScrapers;
