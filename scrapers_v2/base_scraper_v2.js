// scrapers_v2/base_scraper_v2.js
// Enhanced base scraper with structured data extraction
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class BaseScraperV2 {
  constructor(sourceId, config) {
    this.sourceId = sourceId;
    this.config = config;
    this.browser = null;
    this.page = null;
    this.dataDir = path.join(__dirname, '..', 'data', 'grants');
    this.logsDir = path.join(__dirname, '..', 'logs', 'daily');

    // CSV header for v2 format
    this.csvHeader = '"Title","Link","Date","Source","URL_Type","Programme","Opening_Date","Deadline_Date","Deadline_Model","Status","Budget_Amount","Budget_Currency","Budget_Year","Type_of_Action","Description","Full_Content"\n';
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: this.config.settings?.headless ?? false
    });
    this.page = await this.browser.newPage();
    this.log(`Initialized v2 scraper for ${this.sourceId}`);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.log(`Closed browser for ${this.sourceId}`);
    }
  }

  log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${this.sourceId}] ${message}`;
    console.log(logMessage);

    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logsDir, `${today}.log`);

    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    fs.appendFileSync(logFile, logMessage + '\n');
  }

  // Detect page type from URL
  detectPageType(url) {
    if (url.includes('topic-details')) {
      return 'topic-details';
    } else if (url.includes('competitive-calls-cs')) {
      return 'competitive-calls-cs';
    }
    return 'unknown';
  }

  // Extract structured data from topic-details pages (new structure)
  async extractTopicDetailsData(page) {
    return await page.evaluate(() => {
      const result = {
        url_type: 'topic-details',
        programme: null,
        opening_date: null,
        deadline_date: null,
        deadline_model: null,
        status: null,
        type_of_action: null,
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

      // Type of action
      const actionMatch = bodyText.match(/Type of action\s*([A-Z\-]+\s+[^\n]{0,80})/i);
      if (actionMatch) result.type_of_action = actionMatch[1].trim();

      // Status
      if (bodyText.includes('Open For Submission')) {
        result.status = 'Open';
      } else if (bodyText.includes('Forthcoming')) {
        result.status = 'Forthcoming';
      } else if (bodyText.includes('Closed')) {
        result.status = 'Closed';
      }

      // Extract Budget from table
      const tables = document.querySelectorAll('table');
      tables.forEach(table => {
        const tableText = table.innerText;
        if (tableText.includes('Budget') || tableText.includes('Contribution')) {
          // Pattern: numbers with spaces like "20 000 000" or "105 457 362"
          const amountMatch = tableText.match(/(\d{1,3}(?:\s\d{3})+)\s*(?:Single|Two|Multi|-stage)/);
          if (amountMatch) {
            result.budget_amount = amountMatch[1].replace(/\s/g, '');
          }

          // Alternative pattern - just find large number
          if (!result.budget_amount) {
            const altMatch = tableText.match(/(\d{1,3}(?:\s\d{3}){2,})/);
            if (altMatch) {
              result.budget_amount = altMatch[1].replace(/\s/g, '');
            }
          }

          // Year
          const yearMatch = tableText.match(/Year\s*:\s*(\d{4})/);
          if (yearMatch) result.budget_year = yearMatch[1];
        }
      });

      // Extract Description from topic description section (full content, no truncation)
      let description = '';
      
      // Method 1: Find by topicdescriptionkind class (Expected Outcome: / Scope:)
      const descriptionSpans = document.querySelectorAll('span.topicdescriptionkind');
      if (descriptionSpans.length > 0) {
        // Get the parent container that has both Expected Outcome and Scope
        const parentDiv = descriptionSpans[0].closest('div');
        if (parentDiv) {
          description = parentDiv.innerText.replace(/\s+/g, ' ').trim();
          // Remove "Show less" / "Show more" button text if present
          description = description.replace(/Show less|Show more/gi, '').trim();
        }
      }
      
      // Method 2: Try by class .eui-card-content
      if (!description.trim()) {
        const cardContent = document.querySelector('.eui-card-content');
        if (cardContent) {
          description = cardContent.innerText.replace(/\s+/g, ' ').trim();
          description = description.replace(/Show less|Show more/gi, '').trim();
        }
      }
      
      // Method 3: Final fallback - main content area
      if (!description.trim()) {
        const mainContent = document.querySelector('.col-md-9.col-xxl-10');
        if (mainContent) {
          description = mainContent.innerText.replace(/\s+/g, ' ').trim();
        }
      }

      result.description = description.trim();

      // Extract Full_Content for LLM (2000 words like v1)
      const fullContentElement = document.querySelector('.col-md-9.col-xxl-10');
      if (fullContentElement) {
        const fullText = fullContentElement.innerText.replace(/\s+/g, ' ').trim();
        const words = fullText.split(/\s+/);
        result.full_content = words.slice(0, 2000).join(' ');
      } else {
        result.full_content = '';
      }

      return result;
    });
  }

  // Extract data from competitive-calls-cs pages (cascade funding - limited data)
  async extractCompetitiveCallData(page) {
    return await page.evaluate(() => {
      const result = {
        url_type: 'competitive-calls-cs',
        programme: null,
        opening_date: null,
        deadline_date: null,
        deadline_model: null,
        status: null,
        type_of_action: null,
        budget_amount: null,  // Usually not available
        budget_currency: null,
        budget_year: null,
        description: null
      };

      const bodyText = document.body.innerText;

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
      if (bodyText.includes('Open For Submission')) {
        result.status = 'Open';
      } else if (bodyText.includes('Forthcoming')) {
        result.status = 'Forthcoming';
      } else if (bodyText.includes('Closed')) {
        result.status = 'Closed';
      }

      // Try to find budget in text (be conservative - only clear patterns)
      // Look for patterns like "€5 million", "5,000,000 EUR", "budget: 5000000"
      const budgetPatterns = [
        /(?:total|available)\s*(?:budget|funding)[:\s]*(?:€|EUR)?\s*([\d,.']+)\s*(?:million|EUR|€)/i,
        /(?:€|EUR)\s*([\d,.']+)\s*million/i,
        /([\d,.']+)\s*(?:million|Million)\s*(?:€|EUR)/i,
        /budget[:\s]+(?:€|EUR)\s*([\d,.']{6,})/i  // At least 6 digits with € or EUR
      ];

      for (const pattern of budgetPatterns) {
        const budgetMatch = bodyText.match(pattern);
        if (budgetMatch) {
          let amount = budgetMatch[1].replace(/[,.']/g, '');
          if (budgetMatch[0].toLowerCase().includes('million')) {
            amount = (parseFloat(amount) * 1000000).toString();
          }
          // Only accept if amount is at least 10,000 (filter out false positives)
          if (parseInt(amount) >= 10000) {
            result.budget_amount = amount;
            result.budget_currency = 'EUR';
            break;
          }
        }
      }

      // Extract Description from Task description section - NO LIMIT
      const taskMatch = bodyText.match(/Task description([\s\S]*?)(?=Further information|Documents|$)/i);
      if (taskMatch) {
        result.description = taskMatch[1].replace(/\s+/g, ' ').trim();
      }

      // Fallback to main content
      if (!result.description) {
        const mainContent = document.querySelector('.col-md-9.col-xxl-10');
        if (mainContent) {
          result.description = mainContent.innerText.replace(/\s+/g, ' ').trim();
        }
      }

      // Extract Full_Content for LLM (2000 words)
      const fullContentElement = document.querySelector('.col-md-9.col-xxl-10');
      if (fullContentElement) {
        const fullText = fullContentElement.innerText.replace(/\s+/g, ' ').trim();
        const words = fullText.split(/\s+/);
        result.full_content = words.slice(0, 2000).join(' ');
      } else {
        result.full_content = '';
      }

      return result;
    });
  }

  // Enhanced enrichGrant method with structured extraction
  async enrichGrant(grant) {
    const timeout = this.config.settings?.timeout_per_grant_ms || 60000;

    return new Promise(async (resolve) => {
      const timeoutId = setTimeout(() => {
        this.log(`Timeout for: ${grant.title.substring(0, 50)}...`);
        resolve(null);
      }, timeout);

      try {
        const newPage = await this.browser.newPage();
        await newPage.goto(grant.link, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));

        // Detect page type and extract accordingly
        const pageType = this.detectPageType(grant.link);
        let structuredData;

        if (pageType === 'topic-details') {
          structuredData = await this.extractTopicDetailsData(newPage);
        } else {
          structuredData = await this.extractCompetitiveCallData(newPage);
        }

        // Merge structured data with grant
        grant.url_type = structuredData.url_type;
        grant.programme = structuredData.programme;
        grant.opening_date = structuredData.opening_date;
        grant.deadline_date = structuredData.deadline_date;
        grant.deadline_model = structuredData.deadline_model;
        grant.status = structuredData.status;
        grant.type_of_action = structuredData.type_of_action;
        grant.budget_amount = structuredData.budget_amount;
        grant.budget_currency = structuredData.budget_currency;
        grant.budget_year = structuredData.budget_year;
        grant.description = structuredData.description;
        grant.full_content = structuredData.full_content;

        await newPage.close();
        clearTimeout(timeoutId);

        // Log extraction success
        const budgetStatus = grant.budget_amount ? `€${parseInt(grant.budget_amount).toLocaleString()}` : 'N/A';
        this.log(`  → ${pageType} | Budget: ${budgetStatus}`);

        resolve(grant);
      } catch (error) {
        this.log(`Error enriching grant: ${error.message}`);
        clearTimeout(timeoutId);
        resolve(null);
      }
    });
  }

  loadExistingGrants() {
    const csvPath = path.join(this.dataDir, `${this.sourceId}_grants.csv`);
    const existingTitles = new Set();

    if (fs.existsSync(csvPath)) {
      const csvData = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvData.split('\n').slice(1);

      this.log(`Loading existing grants from ${csvPath}`);

      for (const line of lines) {
        if (!line.trim()) continue;
        const title = this.extractTitleFromCSVLine(line);
        if (title) {
          existingTitles.add(this.normalizeTitle(title));
        }
      }
    }

    this.log(`Loaded ${existingTitles.size} existing grants`);
    return existingTitles;
  }

  extractTitleFromCSVLine(line) {
    if (line.startsWith('"')) {
      const closingQuoteIndex = line.indexOf('",', 1);
      if (closingQuoteIndex === -1) return null;
      return line.substring(1, closingQuoteIndex);
    } else {
      const firstCommaIndex = line.indexOf(',');
      if (firstCommaIndex === -1) return null;
      return line.substring(0, firstCommaIndex);
    }
  }

  normalizeTitle(title) {
    return title
      .replace(/""/g, '"')
      .replace(/"|"/g, '"')
      .replace(/[–—−]/g, '-')
      .replace(/[\u00A0\u2009\u202F]/g, ' ')
      .replace(/"/g, '')
      .trim()
      .toLowerCase();
  }

  // Helper to escape CSV values
  escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value).replace(/"/g, '""');
    return `"${str}"`;
  }

  saveGrants(grants, isNew = false) {
    if (grants.length === 0) {
      this.log('No grants to save');
      return;
    }

    // Build CSV content with new v2 format
    const csvContent = grants.map(g => {
      return [
        this.escapeCSV(g.title),
        this.escapeCSV(g.link),
        this.escapeCSV(g.date),
        this.escapeCSV(this.sourceId),
        this.escapeCSV(g.url_type),
        this.escapeCSV(g.programme),
        this.escapeCSV(g.opening_date),
        this.escapeCSV(g.deadline_date),
        this.escapeCSV(g.deadline_model),
        this.escapeCSV(g.status),
        this.escapeCSV(g.budget_amount),
        this.escapeCSV(g.budget_currency),
        this.escapeCSV(g.budget_year),
        this.escapeCSV(g.type_of_action),
        this.escapeCSV(g.description),
        this.escapeCSV(g.full_content)
      ].join(',');
    }).join('\n') + '\n';

    // Save to source-specific file
    const sourceCsvPath = path.join(this.dataDir, `${this.sourceId}_grants.csv`);
    const isNewFile = !fs.existsSync(sourceCsvPath);
    fs.appendFileSync(sourceCsvPath, (isNewFile ? this.csvHeader : '') + csvContent);
    this.log(`Saved ${grants.length} grants to ${this.sourceId}_grants.csv`);

    // Save to unified file
    const unifiedCsvPath = path.join(this.dataDir, 'all_unified.csv');
    const isNewUnified = !fs.existsSync(unifiedCsvPath);
    fs.appendFileSync(unifiedCsvPath, (isNewUnified ? this.csvHeader : '') + csvContent);
    this.log(`Appended ${grants.length} grants to all_unified.csv`);

    // Save new grants for n8n processing
    if (isNew) {
      const newGrantsPath = path.join(this.dataDir, 'new_grants.csv');
      const existingNewGrants = fs.existsSync(newGrantsPath);
      fs.appendFileSync(newGrantsPath, (existingNewGrants ? '' : this.csvHeader) + csvContent);
      this.log(`Wrote ${grants.length} NEW grants to new_grants.csv`);
    }
  }

  writeMarker() {
    const markerPath = path.join(__dirname, '..', 'scraper_finished.txt');
    fs.writeFileSync(markerPath, Date.now().toString());
    this.log('Wrote completion marker');
  }

  // Abstract method - must be implemented by child classes
  async scrape() {
    throw new Error('scrape() must be implemented by child class');
  }

  async run() {
    try {
      await this.init();
      const grants = await this.scrape();
      this.saveGrants(grants, true);
      this.writeMarker();
      return grants;
    } catch (error) {
      this.log(`ERROR: ${error.message}`);
      throw error;
    } finally {
      await this.close();
    }
  }
}

module.exports = BaseScraperV2;
