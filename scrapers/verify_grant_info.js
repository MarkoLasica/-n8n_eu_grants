// scrapers/verify_grant_info.js
// Verify if grant information extraction is accurate
const puppeteer = require('puppeteer');

const GRANTS_TO_CHECK = [
  {
    name: 'MSCA COFUND 2026',
    url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-MSCA-2026-COFUND-01-01',
    slackSaid: {
      funding: 'Not specified',
      opening: '16 December 2025',
      application: 'Both individual and partnership applications accepted'
    }
  },
  {
    name: 'European Startup and Scaleup Hubs pilot',
    url: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/HORIZON-EIE-2026-02-CONNECT-01',
    slackSaid: {
      funding: 'Not specified',
      opening: '11 December 2025',
      application: 'Partnership required (minimum 2 partners)'
    }
  }
];

async function checkGrant(browser, grant) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Checking: ${grant.name}`);
  console.log(`URL: ${grant.url}`);
  console.log('='.repeat(70));

  const page = await browser.newPage();

  try {
    await page.goto(grant.url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    const pageData = await page.evaluate(() => {
      const result = {
        allText: '',
        sections: {},
        budgetInfo: [],
        fundingInfo: [],
        deadlineInfo: [],
        partnerInfo: []
      };

      // Get all text
      result.allText = document.body.innerText;

      // Look for specific budget-related text
      const budgetPatterns = [
        /budget[:\s]+([€\d,.\s]+)/gi,
        /funding[:\s]+([€\d,.\s]+)/gi,
        /(\d+[\s,]*\d*)\s*(million|€|EUR)/gi,
        /indicative budget/gi,
        /total budget/gi,
        /available budget/gi
      ];

      const text = document.body.innerText;

      // Find budget mentions
      const budgetMatches = text.match(/budget[\s\S]{0,100}/gi) || [];
      result.budgetInfo = budgetMatches.slice(0, 5);

      // Find funding mentions
      const fundingMatches = text.match(/funding[\s\S]{0,100}/gi) || [];
      result.fundingInfo = fundingMatches.slice(0, 5);

      // Find euro amounts
      const euroMatches = text.match(/€[\s\d,.']+|[\d,.']+\s*(million|EUR|euro)/gi) || [];
      result.euroAmounts = [...new Set(euroMatches)].slice(0, 10);

      // Find deadline info
      const deadlineMatches = text.match(/deadline[\s\S]{0,100}/gi) || [];
      result.deadlineInfo = deadlineMatches.slice(0, 3);

      // Find opening date
      const openingMatches = text.match(/opening[\s\S]{0,100}/gi) || [];
      result.openingInfo = openingMatches.slice(0, 3);

      // Look for "Budget overview" section specifically
      const budgetOverviewSection = text.match(/budget overview[\s\S]{0,500}/gi) || [];
      result.budgetOverview = budgetOverviewSection.slice(0, 2);

      return result;
    });

    console.log('\n--- WHAT SLACK MESSAGE SAID ---');
    console.log(`Funding: "${grant.slackSaid.funding}"`);
    console.log(`Opening: "${grant.slackSaid.opening}"`);
    console.log(`Application: "${grant.slackSaid.application}"`);

    console.log('\n--- ACTUAL BUDGET/FUNDING INFO ON PAGE ---');
    if (pageData.euroAmounts && pageData.euroAmounts.length > 0) {
      console.log('Euro amounts found:');
      pageData.euroAmounts.forEach(e => console.log(`  - ${e.trim()}`));
    } else {
      console.log('No euro amounts found!');
    }

    console.log('\n--- BUDGET MENTIONS ---');
    if (pageData.budgetInfo.length > 0) {
      pageData.budgetInfo.forEach(b => console.log(`  "${b.substring(0, 80).replace(/\s+/g, ' ')}..."`));
    } else {
      console.log('No budget mentions found');
    }

    console.log('\n--- BUDGET OVERVIEW SECTION ---');
    if (pageData.budgetOverview && pageData.budgetOverview.length > 0) {
      pageData.budgetOverview.forEach(b => console.log(`  "${b.substring(0, 200).replace(/\s+/g, ' ')}..."`));
    } else {
      console.log('No Budget Overview section found');
    }

    console.log('\n--- OPENING DATE INFO ---');
    if (pageData.openingInfo && pageData.openingInfo.length > 0) {
      pageData.openingInfo.forEach(o => console.log(`  "${o.substring(0, 80).replace(/\s+/g, ' ')}..."`));
    }

    await page.close();
    return pageData;

  } catch (error) {
    console.error(`Error: ${error.message}`);
    await page.close();
    return null;
  }
}

async function main() {
  console.log('Grant Information Verification Tool');
  console.log('====================================');
  console.log('Checking if Slack messages have accurate information\n');

  const browser = await puppeteer.launch({ headless: false });

  try {
    for (const grant of GRANTS_TO_CHECK) {
      await checkGrant(browser, grant);
    }
  } finally {
    await browser.close();
  }

  console.log('\n\nVerification complete!');
}

main().catch(console.error);
