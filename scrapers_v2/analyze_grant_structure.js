// scrapers_v2/analyze_grant_structure.js
// Temporary script to analyze grant page structure across all sources
// Scrapes 15 grants from each source to verify structure consistency

const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const SOURCES = [
  {
    id: 'horizon_europe',
    name: 'Horizon Europe',
    listUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals?order=DESC&pageNumber=1&pageSize=50&sortBy=startDate&isExactMatch=true&status=31094502&frameworkProgramme=43108390',
    limit: 15
  },
  {
    id: 'digital_europe',
    name: 'Digital Europe',
    listUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals?order=DESC&pageNumber=1&pageSize=50&sortBy=startDate&isExactMatch=true&status=31094502&frameworkProgramme=43152860',
    limit: 15
  },
  {
    id: 'creative_europe',
    name: 'Creative Europe',
    listUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals?order=DESC&pageNumber=1&pageSize=50&sortBy=startDate&isExactMatch=true&status=31094502&frameworkProgramme=43251814',
    limit: 15
  },
  {
    id: 'erasmus',
    name: 'Erasmus+',
    listUrl: 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals?order=DESC&pageNumber=1&pageSize=50&sortBy=startDate&isExactMatch=true&status=31094502&frameworkProgramme=43353764',
    limit: 15
  }
];

async function extractStructuredData(page, url) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 3000));

    const data = await page.evaluate(() => {
      const result = {
        url_type: null,  // 'topic-details' or 'competitive-calls-cs'
        page_title: document.title,

        // General Information fields
        general_info: {
          programme: null,
          call: null,
          type_of_action: null,
          grant_type: null,
          deadline_model: null,
          opening_date: null,
          deadline_date: null,
          status: null
        },

        // Budget from table
        budget: {
          found: false,
          raw_text: null,
          amount: null,
          currency: 'EUR',
          year: null
        },

        // Sections found on page
        sections_found: [],

        // Topic/Task description
        description: {
          topic_description: null,
          expected_outcome: null,
          scope: null
        },

        // Conditions
        conditions: {
          eligible_countries: null,
          eligibility_conditions: null
        },

        // Raw extractions for analysis
        raw: {
          full_text_length: 0,
          main_content_length: 0,
          has_budget_table: false,
          table_count: 0
        }
      };

      // Determine URL type
      const currentUrl = window.location.href;
      if (currentUrl.includes('topic-details')) {
        result.url_type = 'topic-details';
      } else if (currentUrl.includes('competitive-calls-cs')) {
        result.url_type = 'competitive-calls-cs';
      } else {
        result.url_type = 'unknown';
      }

      // Get all headings to identify sections
      document.querySelectorAll('h1, h2, h3, h4, h5').forEach(h => {
        const text = h.innerText.trim();
        if (text && text.length < 100) {
          result.sections_found.push(text);
        }
      });

      // Extract General Information
      const bodyText = document.body.innerText;

      // Programme
      const progMatch = bodyText.match(/Programme\s+([A-Za-z\s\(\)]+?)(?=\s*Call|\s*Type|\n)/);
      if (progMatch) result.general_info.programme = progMatch[1].trim();

      // Opening date
      const openMatch = bodyText.match(/Opening date\s*(\d{1,2}\s+\w+\s+\d{4})/i);
      if (openMatch) result.general_info.opening_date = openMatch[1];

      // Deadline date
      const deadlineMatch = bodyText.match(/Deadline date\s*(\d{1,2}\s+\w+\s+\d{4})/i);
      if (deadlineMatch) result.general_info.deadline_date = deadlineMatch[1];

      // Deadline model
      const modelMatch = bodyText.match(/Deadline model\s*(\w+[-\w]*)/i);
      if (modelMatch) result.general_info.deadline_model = modelMatch[1];

      // Type of action
      const actionMatch = bodyText.match(/Type of action\s*([A-Z\-]+\s+[^\n]+)/i);
      if (actionMatch) result.general_info.type_of_action = actionMatch[1].trim().substring(0, 100);

      // Status
      if (bodyText.includes('Open For Submission')) {
        result.general_info.status = 'Open For Submission';
      } else if (bodyText.includes('Forthcoming')) {
        result.general_info.status = 'Forthcoming';
      } else if (bodyText.includes('Closed')) {
        result.general_info.status = 'Closed';
      }

      // Extract Budget from table
      const tables = document.querySelectorAll('table');
      result.raw.table_count = tables.length;

      tables.forEach(table => {
        const tableText = table.innerText;
        if (tableText.includes('Budget') || tableText.includes('Contribution')) {
          result.raw.has_budget_table = true;
          result.budget.raw_text = tableText.substring(0, 500);

          // Try to extract amount - look for patterns like "20 000 000" or "105 457 362"
          const amountMatch = tableText.match(/(\d{1,3}(?:\s\d{3})+)\s*(?:Single|Two|Multi)/);
          if (amountMatch) {
            result.budget.amount = amountMatch[1].replace(/\s/g, '');
            result.budget.found = true;
          }

          // Alternative pattern
          if (!result.budget.found) {
            const altMatch = tableText.match(/(\d{1,3}(?:\s\d{3})+)/);
            if (altMatch) {
              result.budget.amount = altMatch[1].replace(/\s/g, '');
              result.budget.found = true;
            }
          }

          // Year
          const yearMatch = tableText.match(/Year\s*:\s*(\d{4})/);
          if (yearMatch) result.budget.year = yearMatch[1];
        }
      });

      // Extract Topic Description
      const descMatch = bodyText.match(/Topic description([\s\S]*?)(?=Topic updates|Conditions|Budget overview|$)/i);
      if (descMatch) {
        result.description.topic_description = descMatch[1].substring(0, 1000).replace(/\s+/g, ' ').trim();
      }

      // Extract Expected Outcome
      const outcomeMatch = bodyText.match(/Expected Outcome[s]?[:\s]*([\s\S]*?)(?=Scope|Objective|$)/i);
      if (outcomeMatch) {
        result.description.expected_outcome = outcomeMatch[1].substring(0, 500).replace(/\s+/g, ' ').trim();
      }

      // Extract Scope
      const scopeMatch = bodyText.match(/Scope[:\s]*([\s\S]*?)(?=Expected|Destination|$)/i);
      if (scopeMatch) {
        result.description.scope = scopeMatch[1].substring(0, 500).replace(/\s+/g, ' ').trim();
      }

      // Extract Eligible countries
      const countriesMatch = bodyText.match(/Eligible countries[\s\S]*?((?:EU|member|Associated|countries)[\s\S]*?)(?=\d\.|Eligibility|$)/i);
      if (countriesMatch) {
        result.conditions.eligible_countries = countriesMatch[1].substring(0, 300).replace(/\s+/g, ' ').trim();
      }

      // Raw metrics
      result.raw.full_text_length = bodyText.length;
      const mainContent = document.querySelector('.col-md-9.col-xxl-10');
      result.raw.main_content_length = mainContent ? mainContent.innerText.length : 0;

      return result;
    });

    return data;

  } catch (error) {
    return { error: error.message, url };
  }
}

async function scrapeSource(browser, source) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scraping ${source.name} (${source.limit} grants)`);
  console.log('='.repeat(60));

  const page = await browser.newPage();
  const results = [];

  try {
    // Go to list page
    await page.goto(source.listUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector('sedia-result-card', { timeout: 60000 });

    // Extract grant links from list
    const grants = await page.evaluate((limit) => {
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
    }, source.limit);

    console.log(`Found ${grants.length} grants on list page`);

    // Visit each grant detail page
    for (let i = 0; i < grants.length; i++) {
      const grant = grants[i];
      console.log(`  [${i + 1}/${grants.length}] ${grant.title.substring(0, 50)}...`);

      const detailPage = await browser.newPage();
      const structuredData = await extractStructuredData(detailPage, grant.link);
      await detailPage.close();

      results.push({
        source: source.id,
        source_name: source.name,
        list_data: grant,
        detail_data: structuredData
      });

      // Small delay to be nice to the server
      await new Promise(r => setTimeout(r, 1000));
    }

  } catch (error) {
    console.error(`Error scraping ${source.name}: ${error.message}`);
  }

  await page.close();
  return results;
}

async function main() {
  console.log('Grant Structure Analysis Tool');
  console.log('=============================');
  console.log(`Scraping ${SOURCES.length} sources, ${SOURCES[0].limit} grants each`);
  console.log(`Total grants to analyze: ${SOURCES.length * SOURCES[0].limit}\n`);

  const browser = await puppeteer.launch({ headless: false });
  const allResults = [];

  try {
    for (const source of SOURCES) {
      const results = await scrapeSource(browser, source);
      allResults.push(...results);
    }

    // Save results
    const outputPath = path.join(__dirname, 'analysis_results.json');
    fs.writeFileSync(outputPath, JSON.stringify(allResults, null, 2));
    console.log(`\n\nResults saved to: ${outputPath}`);

    // Generate summary
    console.log('\n' + '='.repeat(60));
    console.log('ANALYSIS SUMMARY');
    console.log('='.repeat(60));

    // Count URL types
    const urlTypes = {};
    const budgetFound = { yes: 0, no: 0 };
    const sectionsFound = new Set();

    allResults.forEach(r => {
      if (r.detail_data && !r.detail_data.error) {
        // URL type
        const type = r.detail_data.url_type || 'unknown';
        urlTypes[type] = (urlTypes[type] || 0) + 1;

        // Budget
        if (r.detail_data.budget?.found) {
          budgetFound.yes++;
        } else {
          budgetFound.no++;
        }

        // Sections
        r.detail_data.sections_found?.forEach(s => sectionsFound.add(s));
      }
    });

    console.log(`\nURL Types:`);
    Object.entries(urlTypes).forEach(([type, count]) => {
      console.log(`  ${type}: ${count} grants`);
    });

    console.log(`\nBudget Extraction:`);
    console.log(`  Successfully found: ${budgetFound.yes}`);
    console.log(`  Not found: ${budgetFound.no}`);

    console.log(`\nUnique Sections Found (${sectionsFound.size}):`);
    [...sectionsFound].slice(0, 20).forEach(s => console.log(`  - ${s}`));

    // Per-source breakdown
    console.log(`\nPer-Source Breakdown:`);
    SOURCES.forEach(source => {
      const sourceResults = allResults.filter(r => r.source === source.id);
      const withBudget = sourceResults.filter(r => r.detail_data?.budget?.found).length;
      const topicDetails = sourceResults.filter(r => r.detail_data?.url_type === 'topic-details').length;
      const competitiveCalls = sourceResults.filter(r => r.detail_data?.url_type === 'competitive-calls-cs').length;

      console.log(`\n  ${source.name}:`);
      console.log(`    Total scraped: ${sourceResults.length}`);
      console.log(`    Budget found: ${withBudget}/${sourceResults.length}`);
      console.log(`    URL types: topic-details=${topicDetails}, competitive-calls=${competitiveCalls}`);
    });

  } finally {
    await browser.close();
  }

  console.log('\n\nAnalysis complete!');
  console.log('Review analysis_results.json for full data.');
}

main().catch(console.error);
