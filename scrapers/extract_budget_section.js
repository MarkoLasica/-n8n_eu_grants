// scrapers/extract_budget_section.js
// Extract the actual Budget Overview section content
const puppeteer = require('puppeteer');

const GRANTS_TO_CHECK = [
  {
    name: 'MSCA COFUND 2026',
    url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-MSCA-2026-COFUND-01-01'
  },
  {
    name: 'European Startup and Scaleup Hubs pilot',
    url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-EIE-2026-02-CONNECT-01'
  }
];

async function extractBudgetSection(browser, grant) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Grant: ${grant.name}`);
  console.log('='.repeat(70));

  const page = await browser.newPage();

  try {
    await page.goto(grant.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    // Try to click on "Budget overview" to expand it if needed
    try {
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a, [role="button"]'));
        const budgetBtn = buttons.find(b => b.innerText.toLowerCase().includes('budget overview'));
        if (budgetBtn) budgetBtn.click();
      });
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {}

    const budgetData = await page.evaluate(() => {
      const result = {
        generalInfo: '',
        budgetSection: '',
        topicDescription: '',
        tableData: []
      };

      // Get full page text
      const fullText = document.body.innerText;

      // Extract General Information section
      const generalMatch = fullText.match(/General information([\s\S]*?)(?=Topic description|Budget overview|$)/i);
      if (generalMatch) {
        result.generalInfo = generalMatch[1].substring(0, 800).replace(/\s+/g, ' ').trim();
      }

      // Extract Budget Overview section
      const budgetMatch = fullText.match(/Budget overview([\s\S]*?)(?=Partner search|Start submission|$)/i);
      if (budgetMatch) {
        result.budgetSection = budgetMatch[1].substring(0, 1000).replace(/\s+/g, ' ').trim();
      }

      // Look for tables with budget data
      const tables = document.querySelectorAll('table');
      tables.forEach((table, i) => {
        const text = table.innerText;
        if (text.toLowerCase().includes('budget') || text.toLowerCase().includes('contribution')) {
          result.tableData.push({
            index: i,
            content: text.substring(0, 500).replace(/\s+/g, ' ')
          });
        }
      });

      // Look for specific budget fields
      const budgetFields = fullText.match(/(?:indicative budget|total budget|topic budget|estimated budget|contribution)[:\s]*([€\d,.\s\w]+)/gi);
      result.budgetFields = budgetFields || [];

      // Look for specific amounts
      const amounts = fullText.match(/€\s*[\d,.']+\s*(?:million|EUR)?|[\d,.']+\s*(?:million|EUR)/gi);
      result.amounts = [...new Set(amounts || [])];

      return result;
    });

    console.log('\n--- GENERAL INFORMATION ---');
    console.log(budgetData.generalInfo || 'Not found');

    console.log('\n--- BUDGET OVERVIEW SECTION ---');
    console.log(budgetData.budgetSection || 'Not found');

    console.log('\n--- BUDGET TABLES FOUND ---');
    if (budgetData.tableData.length > 0) {
      budgetData.tableData.forEach(t => {
        console.log(`Table ${t.index}: "${t.content}..."`);
      });
    } else {
      console.log('No budget tables found');
    }

    console.log('\n--- BUDGET FIELD MATCHES ---');
    if (budgetData.budgetFields.length > 0) {
      budgetData.budgetFields.forEach(f => console.log(`  - ${f}`));
    } else {
      console.log('No budget field matches');
    }

    console.log('\n--- ALL AMOUNTS FOUND ---');
    if (budgetData.amounts.length > 0) {
      budgetData.amounts.forEach(a => console.log(`  - ${a}`));
    } else {
      console.log('No amounts found');
    }

    await page.close();
    return budgetData;

  } catch (error) {
    console.error(`Error: ${error.message}`);
    await page.close();
    return null;
  }
}

async function main() {
  console.log('Budget Section Extraction Tool');
  console.log('==============================\n');

  const browser = await puppeteer.launch({ headless: false });

  try {
    for (const grant of GRANTS_TO_CHECK) {
      await extractBudgetSection(browser, grant);
    }
  } finally {
    await browser.close();
  }

  console.log('\n\nExtraction complete!');
}

main().catch(console.error);
