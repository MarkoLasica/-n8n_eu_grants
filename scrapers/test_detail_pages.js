// scrapers/test_detail_pages.js
// Test script to verify detail page scraping works on both old and new page structures
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

// Test URLs - one old structure, one new structure
const TEST_PAGES = [
  {
    label: 'OLD STRUCTURE (competitive-calls-cs)',
    url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/competitive-calls-cs/12083',
    title: '2nd ARISE Open Call'
  },
  {
    label: 'NEW STRUCTURE (topic-details)',
    url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/JUST-2026-JTRA',
    title: 'JUST-2026-JTRA Judicial Training'
  }
];

// This is the exact enrichGrant logic from the current scrapers
async function testEnrichGrant(browser, testPage) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${testPage.label}`);
  console.log(`URL: ${testPage.url}`);
  console.log('='.repeat(70));

  const page = await browser.newPage();

  try {
    console.log('Loading page...');
    await page.goto(testPage.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));

    console.log('Extracting content with current scraper logic...');
    const content = await page.content();
    const $ = cheerio.load(content);

    // Current scraper selector
    const descriptionElements = $('.col-md-9.col-xxl-10 *')
      .map((_, el) => $(el).text().trim())
      .get();

    const fullDescription = [testPage.title, ...descriptionElements]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim() || 'N/A';

    const descriptionTokens = fullDescription.split(/\s+/);
    const description = descriptionTokens.slice(0, 1000).join(' ');

    // Results
    console.log('\n--- EXTRACTION RESULTS ---');
    console.log(`Total tokens extracted: ${descriptionTokens.length}`);
    console.log(`Description length: ${description.length} characters`);
    console.log(`First 500 chars of description:`);
    console.log(`"${description.substring(0, 500)}..."`);

    // Check for key content indicators
    const hasGeneralInfo = description.toLowerCase().includes('general information');
    const hasDeadline = description.toLowerCase().includes('deadline');
    const hasBudget = description.toLowerCase().includes('budget') || description.toLowerCase().includes('funding');
    const hasDescription = description.toLowerCase().includes('description') || description.toLowerCase().includes('objective');

    console.log('\n--- CONTENT QUALITY CHECK ---');
    console.log(`Contains "General Information": ${hasGeneralInfo ? 'YES' : 'NO'}`);
    console.log(`Contains deadline info: ${hasDeadline ? 'YES' : 'NO'}`);
    console.log(`Contains budget/funding info: ${hasBudget ? 'YES' : 'NO'}`);
    console.log(`Contains description/objective: ${hasDescription ? 'YES' : 'NO'}`);

    const success = description.length > 500 && (hasGeneralInfo || hasDeadline);
    console.log(`\nOVERALL: ${success ? 'SUCCESS - Good content extracted' : 'WARNING - May need review'}`);

    await page.close();

    return {
      label: testPage.label,
      success,
      descriptionLength: description.length,
      tokenCount: descriptionTokens.length,
      preview: description.substring(0, 300)
    };

  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    await page.close();
    return {
      label: testPage.label,
      success: false,
      error: error.message
    };
  }
}

async function main() {
  console.log('EU Portal Detail Page Scraper Test');
  console.log('===================================');
  console.log('Testing if current scraper logic works on both page structures\n');

  const browser = await puppeteer.launch({ headless: false });
  const results = [];

  try {
    for (const testPage of TEST_PAGES) {
      const result = await testEnrichGrant(browser, testPage);
      results.push(result);
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('FINAL SUMMARY');
    console.log('='.repeat(70));

    results.forEach(r => {
      const status = r.success ? 'PASS' : 'FAIL';
      console.log(`\n${r.label}:`);
      console.log(`  Status: ${status}`);
      if (r.error) {
        console.log(`  Error: ${r.error}`);
      } else {
        console.log(`  Extracted: ${r.descriptionLength} chars, ${r.tokenCount} tokens`);
      }
    });

    const allPassed = results.every(r => r.success);
    console.log(`\n${'='.repeat(70)}`);
    console.log(`CONCLUSION: ${allPassed ? 'ALL TESTS PASSED - Scrapers work correctly!' : 'SOME TESTS FAILED - Scrapers may need updates'}`);
    console.log('='.repeat(70));

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
