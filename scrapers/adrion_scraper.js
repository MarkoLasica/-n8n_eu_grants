// scrapers/adrion_scraper.js
// Scraper for Interreg ADRION Programme (Adriatic-Ionian Transnational Cooperation)
// Covers: Albania, Bosnia and Herzegovina, Croatia, Greece, Italy, Montenegro, Serbia, Slovenia

const BaseScraper = require('./base_scraper');
const cheerio = require('cheerio');

class AdrionScraper extends BaseScraper {
  constructor(config) {
    super('adrion', config);

    // ADRION has two separate websites:
    // 1. Main ADRION (for EU member states)
    // 2. IPA ADRION (for IPA countries including Montenegro)
    this.sources = [
      {
        name: 'ADRION Main',
        listUrl: 'https://www.adrioninterreg.eu/index.php/call-for-proposals/',
        baseUrl: 'https://www.adrioninterreg.eu',
      },
      {
        name: 'IPA ADRION',
        listUrl: 'https://www.interreg-ipa-adrion.eu/calls/',
        baseUrl: 'https://www.interreg-ipa-adrion.eu',
      }
    ];
  }

  async scrape() {
    const existingTitles = this.loadExistingGrants();
    const allGrants = [];

    for (const source of this.sources) {
      this.log(`\n${'─'.repeat(50)}`);
      this.log(`Scraping ${source.name}...`);
      this.log(`URL: ${source.listUrl}`);
      this.log(`${'─'.repeat(50)}`);

      try {
        const grants = await this.scrapeSource(source, existingTitles);
        allGrants.push(...grants);
        this.log(`${source.name}: Found ${grants.length} new grants`);
      } catch (error) {
        this.log(`ERROR scraping ${source.name}: ${error.message}`);
      }
    }

    this.log(`\nTotal new grants found: ${allGrants.length}`);
    return allGrants;
  }

  async scrapeSource(source, existingTitles) {
    const grants = [];

    // Navigate to calls listing page (longer timeout for WordPress/Divi sites)
    await this.page.goto(source.listUrl, {
      waitUntil: 'networkidle2',
      timeout: 120000
    });

    // Wait for page content to load
    await new Promise(r => setTimeout(r, 3000));

    // Get page content
    const content = await this.page.content();
    const $ = cheerio.load(content);

    // Extract all call links based on which source we're scraping
    const callLinks = this.extractCallLinks($, source);
    this.log(`Found ${callLinks.length} call links on ${source.name}`);

    // Process each call
    for (const callInfo of callLinks) {
      const normalizedTitle = this.normalizeTitle(callInfo.title);

      if (existingTitles.has(normalizedTitle)) {
        this.log(`Skipped (exists): ${callInfo.title.substring(0, 50)}...`);
        continue;
      }

      // Enrich grant with details from individual page
      const enrichedGrant = await this.enrichGrant(callInfo, source);
      if (enrichedGrant) {
        grants.push(enrichedGrant);
        existingTitles.add(normalizedTitle);
        this.log(`Added: ${callInfo.title.substring(0, 50)}...`);
      }
    }

    return grants;
  }

  extractCallLinks($, source) {
    const calls = [];
    const seenUrls = new Set();

    if (source.name === 'ADRION Main') {
      // Main ADRION site - WordPress/Enfold theme
      // Look for links to individual call pages
      $('a[href*="call-for-proposals"]').each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const text = $el.text().trim();

        // Skip navigation/menu links and the main calls page itself
        if (!href ||
            href === source.listUrl ||
            href.endsWith('/call-for-proposals/') ||
            href.includes('#') ||  // Skip anchor links
            seenUrls.has(href) ||
            text.length < 5) {
          return;
        }

        // Must be a subpage of call-for-proposals (not just an anchor)
        if (href.includes('/call-for-proposals/') && href !== source.listUrl && !href.includes('#')) {
          seenUrls.add(href);
          calls.push({
            title: text || this.extractTitleFromUrl(href),
            link: href.startsWith('http') ? href : source.baseUrl + href,
            date: 'N/A'
          });
        }
      });

      // Also look for article/post entries
      $('article a, .entry-title a, h2 a, h3 a').each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const text = $el.text().trim();

        if (!href || seenUrls.has(href) || !href.includes('call')) {
          return;
        }

        if (text.length > 5 && !seenUrls.has(href)) {
          seenUrls.add(href);
          calls.push({
            title: text,
            link: href.startsWith('http') ? href : source.baseUrl + href,
            date: 'N/A'
          });
        }
      });

    } else if (source.name === 'IPA ADRION') {
      // IPA ADRION site - Divi theme
      // Look for links to individual call pages (1st-call, 2nd-call, etc.)
      $('a[href*="/calls/"]').each((_, el) => {
        const $el = $(el);
        const href = $el.attr('href');
        const text = $el.text().trim();

        // Skip the main calls page and navigation links
        if (!href ||
            href === source.listUrl ||
            href.endsWith('/calls/') ||
            seenUrls.has(href)) {
          return;
        }

        // Must be a subpage with "call" in it (1st-call, 2nd-call, etc.)
        if (href.includes('/calls/') &&
            href !== source.listUrl &&
            (href.includes('-call') || href.includes('call-'))) {
          seenUrls.add(href);

          // Try to get a better title
          let title = text;
          if (!title || title.length < 3 || title.toLowerCase() === 'read more') {
            title = this.extractTitleFromUrl(href);
          }

          calls.push({
            title: title,
            link: href.startsWith('http') ? href : source.baseUrl + href,
            date: 'N/A'
          });
        }
      });
    }

    return calls;
  }

  extractTitleFromUrl(url) {
    // Extract a readable title from URL
    // e.g., /calls/2nd-call/ -> "2nd Call"
    const parts = url.split('/').filter(p => p);
    const lastPart = parts[parts.length - 1] || parts[parts.length - 2];
    return lastPart
      .replace(/-/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  async enrichGrant(grant, source) {
    const timeout = this.config.settings?.timeout_per_grant_ms || 60000;

    return new Promise(async (resolve) => {
      const timeoutId = setTimeout(() => {
        this.log(`Timeout enriching: ${grant.title.substring(0, 50)}...`);
        resolve(grant); // Return unenriched grant rather than null
      }, timeout);

      try {
        const newPage = await this.browser.newPage();
        await newPage.goto(grant.link, {
          waitUntil: 'networkidle2',
          timeout: 60000
        });
        await new Promise(r => setTimeout(r, 2000));

        const content = await newPage.content();
        const $ = cheerio.load(content);

        // Try to extract description from various possible containers
        let description = '';

        // Try different selectors for content (prioritize actual content over CSS)
        const contentSelectors = [
          '.et_pb_text_inner p',    // Divi paragraphs
          '.entry-content p',       // WordPress content paragraphs
          '.post-content p',        // Post paragraphs
          'article p',              // Article paragraphs
          '.et_pb_text_inner',      // Divi text blocks
          '.entry-content',         // WordPress content
          '.av-special-heading',    // Enfold headings
          'main p'                  // Main content paragraphs
        ];

        for (const selector of contentSelectors) {
          const $content = $(selector);
          if ($content.length > 0) {
            // Get text and filter out CSS/JS content
            description = $content.map((_, el) => $(el).text().trim()).get().join(' ');
            // Skip if it looks like CSS/JS code
            if (description.length > 50 &&
                !description.includes('{') &&
                !description.includes('function') &&
                !description.startsWith('.')) {
              break;
            }
            description = '';
          }
        }

        // Fallback: get all paragraph text
        if (!description || description.length < 50) {
          description = $('p').map((_, el) => $(el).text().trim()).get().join(' ');
        }

        // Clean up description - remove CSS/JS artifacts
        description = description
          .replace(/\s+/g, ' ')
          .replace(/\.[\w-]+\{[^}]+\}/g, '')  // Remove CSS rules like .class{...}
          .replace(/#top\s*/g, '')            // Remove #top references
          .replace(/\{[^}]+\}/g, '')          // Remove any remaining {..} blocks
          .replace(/\s+/g, ' ')               // Clean up whitespace again
          .trim();

        // If description still looks like CSS, try one more selector
        if (description.startsWith('.') || description.includes('border-radius') || description.includes('padding:')) {
          const bodyText = $('body').text()
            .replace(/\.[\w-]+\{[^}]+\}/g, '')
            .replace(/\{[^}]+\}/g, '')
            .replace(/\s+/g, ' ')
            .trim();
          // Extract meaningful content (skip first ~500 chars which is usually nav/header)
          description = bodyText.substring(500, 3000);
        }

        // Limit description length
        const descriptionTokens = description.split(/\s+/);
        grant.description = descriptionTokens.slice(0, 500).join(' ') || 'N/A';

        // Try to extract deadline from page content
        const pageText = $('body').text();
        const deadlineMatch = pageText.match(/deadline[:\s]*(\d{1,2}[\s./-]\w+[\s./-]\d{4}|\d{4}[-/]\d{2}[-/]\d{2})/i);
        if (deadlineMatch) {
          grant.date = deadlineMatch[1];
        }

        // Also try to get a better title from the page if current one is generic
        const pageTitle = $('h1').first().text().trim() || $('title').text().split('–')[0].trim();
        if (pageTitle && pageTitle.length > grant.title.length && pageTitle.length < 200) {
          grant.title = pageTitle;
        }

        await newPage.close();
        clearTimeout(timeoutId);
        resolve(grant);
      } catch (error) {
        this.log(`Error enriching grant: ${error.message}`);
        clearTimeout(timeoutId);
        resolve(grant); // Return unenriched grant
      }
    });
  }
}

// Allow running directly
if (require.main === module) {
  const config = require('../config/sources.json');
  const scraper = new AdrionScraper(config);
  scraper.run()
    .then((grants) => {
      console.log(`\n✅ Scraping complete. Found ${grants.length} new grants.`);
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Scraper failed:', error);
      process.exit(1);
    });
}

module.exports = AdrionScraper;
