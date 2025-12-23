// scrapers/compare_selectors.js
// Compare what different selectors capture
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

const TEST_URL = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-EIE-2026-02-CONNECT-01';

async function main() {
  console.log('Selector Comparison Tool');
  console.log('========================\n');
  console.log(`Testing: European Startup and Scaleup Hubs pilot`);
  console.log(`Expected budget: €20,000,000 or 35 million\n`);

  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto(TEST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    const content = await page.content();
    const $ = cheerio.load(content);

    // Test current scraper selector
    console.log('='.repeat(70));
    console.log('CURRENT SCRAPER SELECTOR: .col-md-9.col-xxl-10');
    console.log('='.repeat(70));

    const currentSelectorText = $('.col-md-9.col-xxl-10').text().replace(/\s+/g, ' ').trim();

    const hasBudgetInCurrent = currentSelectorText.includes('20 000 000') ||
                               currentSelectorText.includes('20000000') ||
                               currentSelectorText.includes('35 million');

    console.log(`Length: ${currentSelectorText.length} chars`);
    console.log(`Contains budget amount: ${hasBudgetInCurrent ? 'YES' : 'NO'}`);

    // Search for budget-related content
    const budgetIndex = currentSelectorText.toLowerCase().indexOf('budget');
    if (budgetIndex > -1) {
      console.log(`Budget context: "...${currentSelectorText.substring(budgetIndex, budgetIndex + 200)}..."`);
    }

    // Check if table is included
    const tableText = $('table').text().replace(/\s+/g, ' ').trim();
    console.log(`\nTable content in page: ${tableText.substring(0, 300)}...`);

    // Check if table is inside .col-md-9.col-xxl-10
    const tableInSelector = $('.col-md-9.col-xxl-10 table').length;
    console.log(`Tables inside .col-md-9.col-xxl-10: ${tableInSelector}`);

    // Try alternative selectors
    console.log('\n' + '='.repeat(70));
    console.log('TESTING ALTERNATIVE SELECTORS');
    console.log('='.repeat(70));

    const selectors = [
      '.col-md-9.col-xxl-10',
      'main',
      'article',
      '.eui-u-pt-m',
      'body',
      '.sedia-topic-page'
    ];

    for (const sel of selectors) {
      const el = $(sel);
      if (el.length > 0) {
        const text = el.text();
        const hasBudget = text.includes('20 000 000') || text.includes('35 million');
        console.log(`${sel}: ${text.length} chars, has budget: ${hasBudget ? 'YES' : 'NO'}`);
      }
    }

    // Show where budget actually is
    console.log('\n' + '='.repeat(70));
    console.log('SEARCHING FOR BUDGET AMOUNT IN DOM');
    console.log('='.repeat(70));

    const pageText = $('body').text();
    const match20m = pageText.indexOf('20 000 000');
    const match35m = pageText.indexOf('35 million');

    if (match20m > -1) {
      console.log(`Found "20 000 000" at position ${match20m}`);
      console.log(`Context: "...${pageText.substring(match20m - 50, match20m + 100)}..."`);
    }
    if (match35m > -1) {
      console.log(`Found "35 million" at position ${match35m}`);
      console.log(`Context: "...${pageText.substring(match35m - 50, match35m + 100)}..."`);
    }

  } finally {
    await browser.close();
  }

  console.log('\n\nComparison complete!');
}

main().catch(console.error);
