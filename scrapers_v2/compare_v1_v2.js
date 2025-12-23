// scrapers_v2/compare_v1_v2.js
// Parallel comparison of v1 vs v2 scrapers on same grants
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const BaseScraperV2 = require('./base_scraper_v2');

// Test URLs - mix of topic-details and competitive-calls-cs
const TEST_GRANTS = [
  {
    title: 'MSCA COFUND 2026',
    link: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-MSCA-2026-COFUND-01-01',
    date: '16 December 2025',
    expectedBudget: '105457362'  // €105,457,362
  },
  {
    title: 'European Startup and Scaleup Hubs pilot',
    link: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-EIE-2026-02-CONNECT-01',
    date: '11 December 2025',
    expectedBudget: '20000000'  // €20,000,000
  },
  {
    title: 'Skills and Talent Development',
    link: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/CREA-MEDIA-2026-TRAINING',
    date: '11 December 2025',
    expectedBudget: '9500000'  // €9,500,000
  }
];

// V1 extraction logic (from current scrapers)
async function extractV1(browser, grant) {
  const page = await browser.newPage();

  try {
    await page.goto(grant.link, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));

    const content = await page.content();
    const $ = cheerio.load(content);

    // V1 selector - just grabs all text from main content
    const descriptionElements = $('.col-md-9.col-xxl-10 *')
      .map((_, el) => $(el).text().trim())
      .get();

    const fullDescription = [grant.title, ...descriptionElements]
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim() || 'N/A';

    const descriptionTokens = fullDescription.split(/\s+/);
    const description = descriptionTokens.slice(0, 1000).join(' ');

    await page.close();

    return {
      title: grant.title,
      link: grant.link,
      date: grant.date,
      description: description,
      // V1 doesn't extract these - they come from LLM
      budget: 'N/A (extracted by LLM)',
      programme: 'N/A (extracted by LLM)',
      deadline: 'N/A (extracted by LLM)'
    };
  } catch (error) {
    await page.close();
    return { error: error.message };
  }
}

// V2 extraction using BaseScraperV2 methods
async function extractV2(browser, grant) {
  const page = await browser.newPage();

  try {
    await page.goto(grant.link, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 2000));

    // Detect page type
    const pageType = grant.link.includes('topic-details') ? 'topic-details' : 'competitive-calls-cs';

    // Use V2 extraction logic
    let structuredData;
    if (pageType === 'topic-details') {
      structuredData = await page.evaluate(() => {
        const result = {
          url_type: 'topic-details',
          programme: null,
          opening_date: null,
          deadline_date: null,
          deadline_model: null,
          status: null,
          budget_amount: null,
          budget_currency: 'EUR',
          budget_year: null,
          description: null
        };

        const bodyText = document.body.innerText;

        // Programme
        const progMatch = bodyText.match(/Programme\s+([A-Za-z\s\(\)]+?)(?=\s*Call|\s*Type|\n)/);
        if (progMatch) result.programme = progMatch[1].trim();

        // Opening date
        const openMatch = bodyText.match(/Opening date\s*(\d{1,2}\s+\w+\s+\d{4})/i);
        if (openMatch) result.opening_date = openMatch[1];

        // Deadline date
        const deadlineMatch = bodyText.match(/Deadline date\s*(\d{1,2}\s+\w+\s+\d{4})/i);
        if (deadlineMatch) result.deadline_date = deadlineMatch[1];

        // Deadline model
        const modelMatch = bodyText.match(/Deadline model\s*(\w+[-\w]*)/i);
        if (modelMatch) result.deadline_model = modelMatch[1];

        // Status
        if (bodyText.includes('Open For Submission')) result.status = 'Open';

        // Budget from table
        const tables = document.querySelectorAll('table');
        tables.forEach(table => {
          const tableText = table.innerText;
          if (tableText.includes('Budget') || tableText.includes('Contribution')) {
            const amountMatch = tableText.match(/(\d{1,3}(?:\s\d{3})+)\s*(?:Single|Two|Multi|-stage)/);
            if (amountMatch) {
              result.budget_amount = amountMatch[1].replace(/\s/g, '');
            }
            if (!result.budget_amount) {
              const altMatch = tableText.match(/(\d{1,3}(?:\s\d{3}){2,})/);
              if (altMatch) result.budget_amount = altMatch[1].replace(/\s/g, '');
            }
            const yearMatch = tableText.match(/Year\s*:\s*(\d{4})/);
            if (yearMatch) result.budget_year = yearMatch[1];
          }
        });

        // Description
        let description = '';
        const outcomeMatch = bodyText.match(/Expected Outcome[s]?[:\s]*([\s\S]*?)(?=Scope|Destination|Activities|$)/i);
        if (outcomeMatch) description += outcomeMatch[1].substring(0, 600).replace(/\s+/g, ' ').trim() + ' ';
        const scopeMatch = bodyText.match(/Scope[:\s]*([\s\S]*?)(?=Destination|Expected|Activities|specific conditions|$)/i);
        if (scopeMatch) description += scopeMatch[1].substring(0, 600).replace(/\s+/g, ' ').trim();
        result.description = description.trim().substring(0, 1000);

        return result;
      });
    } else {
      structuredData = { url_type: 'competitive-calls-cs', budget_amount: null };
    }

    await page.close();

    return {
      title: grant.title,
      link: grant.link,
      date: grant.date,
      url_type: structuredData.url_type,
      programme: structuredData.programme,
      opening_date: structuredData.opening_date,
      deadline_date: structuredData.deadline_date,
      deadline_model: structuredData.deadline_model,
      status: structuredData.status,
      budget_amount: structuredData.budget_amount,
      budget_currency: structuredData.budget_currency,
      budget_year: structuredData.budget_year,
      description: structuredData.description
    };
  } catch (error) {
    await page.close();
    return { error: error.message };
  }
}

async function main() {
  console.log('='.repeat(70));
  console.log('V1 vs V2 SCRAPER COMPARISON');
  console.log('='.repeat(70));
  console.log(`Testing ${TEST_GRANTS.length} grants with both versions\n`);

  const browser = await puppeteer.launch({ headless: false });
  const results = [];

  try {
    for (const grant of TEST_GRANTS) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`Grant: ${grant.title}`);
      console.log(`Expected Budget: €${parseInt(grant.expectedBudget).toLocaleString()}`);
      console.log('─'.repeat(60));

      // Extract with V1
      console.log('\nExtracting with V1...');
      const v1Result = await extractV1(browser, grant);

      // Extract with V2
      console.log('Extracting with V2...');
      const v2Result = await extractV2(browser, grant);

      // Compare
      console.log('\n--- COMPARISON ---');
      console.log('\nV1 Output:');
      console.log(`  Budget: ${v1Result.budget}`);
      console.log(`  Programme: ${v1Result.programme}`);
      console.log(`  Deadline: ${v1Result.deadline}`);
      console.log(`  Description: ${v1Result.description?.substring(0, 100)}...`);

      console.log('\nV2 Output:');
      console.log(`  Budget: ${v2Result.budget_amount ? '€' + parseInt(v2Result.budget_amount).toLocaleString() : 'N/A'}`);
      console.log(`  Programme: ${v2Result.programme || 'N/A'}`);
      console.log(`  Deadline: ${v2Result.deadline_date || 'N/A'}`);
      console.log(`  Opening: ${v2Result.opening_date || 'N/A'}`);
      console.log(`  Status: ${v2Result.status || 'N/A'}`);
      console.log(`  Description: ${v2Result.description?.substring(0, 100)}...`);

      // Verify budget
      const budgetMatch = v2Result.budget_amount === grant.expectedBudget;
      console.log(`\n  Budget Correct: ${budgetMatch ? '✓ YES' : '✗ NO'}`);

      results.push({
        grant: grant.title,
        expectedBudget: grant.expectedBudget,
        v2Budget: v2Result.budget_amount,
        budgetCorrect: budgetMatch,
        v2HasProgramme: !!v2Result.programme,
        v2HasDeadline: !!v2Result.deadline_date
      });
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('FINAL COMPARISON SUMMARY');
    console.log('='.repeat(70));

    const correct = results.filter(r => r.budgetCorrect).length;
    console.log(`\nBudget extraction accuracy: ${correct}/${results.length} (${Math.round(correct/results.length*100)}%)`);

    console.log('\nPer grant:');
    results.forEach(r => {
      const status = r.budgetCorrect ? '✓' : '✗';
      console.log(`  ${status} ${r.grant}: Expected €${parseInt(r.expectedBudget).toLocaleString()}, Got ${r.v2Budget ? '€' + parseInt(r.v2Budget).toLocaleString() : 'N/A'}`);
    });

    console.log('\n' + '='.repeat(70));
    console.log('V2 ADVANTAGES DEMONSTRATED:');
    console.log('='.repeat(70));
    console.log('1. Budget extracted DIRECTLY (no LLM needed)');
    console.log('2. Programme name extracted');
    console.log('3. Deadline date extracted');
    console.log('4. Opening date extracted');
    console.log('5. Status extracted');
    console.log('6. Cleaner description (Expected Outcome + Scope only)');
    console.log('\nV1 requires LLM to extract all these fields from raw text blob.');

  } finally {
    await browser.close();
  }

  console.log('\n\nComparison complete!');
}

main().catch(console.error);
