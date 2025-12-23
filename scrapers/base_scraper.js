// scrapers/base_scraper.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

class BaseScraper {
  constructor(sourceId, config) {
    this.sourceId = sourceId;
    this.config = config;
    this.browser = null;
    this.page = null;
    this.dataDir = path.join(__dirname, '..', 'data', 'grants');
    this.logsDir = path.join(__dirname, '..', 'logs', 'daily');
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: this.config.settings?.headless ?? false
    });
    this.page = await this.browser.newPage();
    this.log(`Initialized scraper for ${this.sourceId}`);
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

    // Also write to daily log file
    const today = new Date().toISOString().split('T')[0];
    const logFile = path.join(this.logsDir, `${today}.log`);

    // Ensure logs directory exists
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    fs.appendFileSync(logFile, logMessage + '\n');
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

  saveGrants(grants, isNew = false) {
    if (grants.length === 0) {
      this.log('No grants to save');
      return;
    }

    const csvHeader = '"Title","Link","Date","Description","Source"\n';
    const csvContent = grants.map(g =>
      `"${g.title.replace(/"/g, '""')}",` +
      `"${g.link}",` +
      `"${g.date}",` +
      `"${(g.description || 'N/A').replace(/"/g, '""')}",` +
      `"${this.sourceId}"`
    ).join('\n') + '\n';

    // Save to source-specific file
    const sourceCsvPath = path.join(this.dataDir, `${this.sourceId}_grants.csv`);
    const isNewFile = !fs.existsSync(sourceCsvPath);
    fs.appendFileSync(sourceCsvPath, (isNewFile ? csvHeader : '') + csvContent);
    this.log(`Saved ${grants.length} grants to ${this.sourceId}_grants.csv`);

    // Save to unified file
    const unifiedCsvPath = path.join(this.dataDir, 'all_unified.csv');
    const isNewUnified = !fs.existsSync(unifiedCsvPath);
    fs.appendFileSync(unifiedCsvPath, (isNewUnified ? csvHeader : '') + csvContent);
    this.log(`Appended ${grants.length} grants to all_unified.csv`);

    // Save new grants for n8n processing
    if (isNew) {
      const newGrantsPath = path.join(this.dataDir, 'new_grants.csv');

      // If new_grants.csv already exists, append to it (for multi-source support)
      const existingNewGrants = fs.existsSync(newGrantsPath);
      fs.appendFileSync(newGrantsPath, (existingNewGrants ? '' : csvHeader) + csvContent);
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

module.exports = BaseScraper;
