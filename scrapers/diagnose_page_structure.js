// scrapers/diagnose_page_structure.js
// Diagnostic script to compare old vs new EU portal page structures
const puppeteer = require('puppeteer');

const OLD_STRUCTURE_URL = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/competitive-calls-cs/12083?isExactMatch=true&status=31094502&frameworkProgramme=43108390&order=DESC&pageNumber=1&pageSize=50&sortBy=startDate';

const NEW_STRUCTURE_URL = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/topic-details/JUST-2026-JTRA?isExactMatch=true&status=31094501,31094502,31094503&order=DESC&pageNumber=9&pageSize=50&sortBy=startDate';

async function analyzePage(browser, url, label) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`ANALYZING: ${label}`);
  console.log(`URL: ${url.substring(0, 100)}...`);
  console.log('='.repeat(80));

  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    await new Promise(r => setTimeout(r, 4000)); // Wait for dynamic content

    const analysis = await page.evaluate(() => {
      const result = {
        title: document.title,
        headings: [],
        descriptionSelectors: {},
        contentPreview: ''
      };

      // Find all section headers (h1, h2, h3, h4)
      document.querySelectorAll('h1, h2, h3, h4, h5').forEach(h => {
        const text = h.innerText.trim();
        if (text && text.length < 150 && text.length > 0) {
          result.headings.push({
            tag: h.tagName,
            text: text.substring(0, 80)
          });
        }
      });

      // Check for old selector (.col-md-9.col-xxl-10)
      const oldSelector = document.querySelector('.col-md-9.col-xxl-10');
      result.descriptionSelectors['OLD: .col-md-9.col-xxl-10'] = {
        exists: !!oldSelector,
        textLength: oldSelector ? oldSelector.innerText.length : 0,
        preview: oldSelector ? oldSelector.innerText.substring(0, 150).replace(/\s+/g, ' ') : null
      };

      // Check for various potential content containers
      const testSelectors = [
        'sedia-topic-details',
        '.sedia-topic-details__content',
        'sedia-call-details',
        '.eui-card__content',
        '.topic-description',
        '[data-test="topic-description"]',
        'main article',
        '.eui-u-mt-m',
        'eui-accordion',
        '.sedia-accordion'
      ];

      testSelectors.forEach(sel => {
        try {
          const el = document.querySelector(sel);
          result.descriptionSelectors[sel] = {
            exists: !!el,
            textLength: el ? el.innerText.length : 0
          };
        } catch(e) {
          result.descriptionSelectors[sel] = { exists: false, error: e.message };
        }
      });

      // Get full page text for analysis
      result.contentPreview = document.body.innerText.substring(0, 2000).replace(/\s+/g, ' ');

      return result;
    });

    // Print results
    console.log('\n--- PAGE TITLE ---');
    console.log(analysis.title);

    console.log('\n--- HEADINGS/SECTIONS FOUND ---');
    analysis.headings.forEach((h, i) => {
      if (i < 15) console.log(`  ${h.tag}: ${h.text}`);
    });
    if (analysis.headings.length > 15) console.log(`  ... and ${analysis.headings.length - 15} more`);

    console.log('\n--- SELECTOR TEST RESULTS ---');
    Object.entries(analysis.descriptionSelectors).forEach(([sel, info]) => {
      const status = info.exists ? `YES (${info.textLength} chars)` : 'NO';
      console.log(`  ${sel}: ${status}`);
      if (info.preview) {
        console.log(`    Preview: "${info.preview.substring(0, 100)}..."`);
      }
    });

    console.log('\n--- CONTENT PREVIEW (first 800 chars) ---');
    console.log(analysis.contentPreview.substring(0, 800));

    await page.close();
    return analysis;

  } catch (error) {
    console.error(`Error analyzing page: ${error.message}`);
    await page.close();
    return null;
  }
}

async function main() {
  console.log('EU Portal Page Structure Diagnostic Tool');
  console.log('========================================\n');

  const browser = await puppeteer.launch({ headless: false });

  try {
    const oldAnalysis = await analyzePage(browser, OLD_STRUCTURE_URL, 'OLD STRUCTURE (competitive-calls-cs)');
    const newAnalysis = await analyzePage(browser, NEW_STRUCTURE_URL, 'NEW STRUCTURE (topic-details)');

    // Summary comparison
    console.log('\n' + '='.repeat(80));
    console.log('KEY FINDINGS');
    console.log('='.repeat(80));

    if (oldAnalysis && newAnalysis) {
      const oldSelectorWorks = oldAnalysis.descriptionSelectors['OLD: .col-md-9.col-xxl-10']?.exists;
      const newSelectorWorks = newAnalysis.descriptionSelectors['OLD: .col-md-9.col-xxl-10']?.exists;

      console.log(`\nOld CSS selector (.col-md-9.col-xxl-10):`);
      console.log(`  On OLD page type: ${oldSelectorWorks ? 'WORKS' : 'BROKEN'}`);
      console.log(`  On NEW page type: ${newSelectorWorks ? 'WORKS' : 'BROKEN'}`);

      console.log(`\nOLD page sections: ${oldAnalysis.headings.map(h => h.text).slice(0, 5).join(', ')}`);
      console.log(`NEW page sections: ${newAnalysis.headings.map(h => h.text).slice(0, 5).join(', ')}`);
    }

  } finally {
    await browser.close();
  }

  console.log('\n\nDiagnostic complete!');
}

main().catch(console.error);
