# EU Grants Monitoring System - Development Roadmap

## Kompletan vodic za razvoj projekta od trenutnog stanja do profesionalnog multi-source, multi-company sistema

---

# TRENUTNO STANJE PROJEKTA

## Sta vec imas:

### 1. Scraper (`scraper2.js`)
- Scrapes: EC Funding Portal
- Output: `allgrants.csv`, `grants2.csv`, `new_grants.csv`
- Marker: `scraper_finished.txt`

### 2. n8n Workflow (`N8N_EU_Grants_MultiCompany.json`)
```
Schedule (07:00) → Scraper → Read CSV → Filter New →
→ Load Companies → AI Check → If Relevant → Extract Info → Slack
```

### 3. Company Database (`companies.json`)
- Trenutno samo Alicorn
- Strukturirano za vise kompanija

### 4. Fajlovi:
```
n8n_eu_grants/
├── scraper2.js                      # Glavni scraper
├── N8N_EU_Grants_MultiCompany.json  # n8n workflow
├── companies.json                   # Company profiles
├── allgrants.csv                    # Master CSV (~327+ grants)
├── grants2.csv                      # Duplicate (legacy)
├── new_grants.csv                   # Today's new grants
├── NonRelevant.csv                  # Rejected grants log
└── scraper_finished.txt             # Completion marker
```

---

# FAZA 1: STABILIZACIJA I REFAKTORISANJE
**Cilj: Ocistiti projekat, organizovati strukturu, pripremiti za skaliranje**

---

## Korak 1.1: Reorganizacija Folder Strukture

### Akcija: Kreiraj novu strukturu foldera

```
n8n_eu_grants/
├── scrapers/
│   ├── base_scraper.js          # NOVO: Base class za sve scrapere
│   ├── eu_portal_scraper.js     # Preimenovan scraper2.js
│   └── run_all_scrapers.js      # NOVO: Orchestrator
├── data/
│   ├── grants/
│   │   ├── eu_portal_grants.csv
│   │   └── all_unified.csv      # NOVO: Master merged file
│   ├── companies.json
│   └── processed/
│       ├── sent_notifications.json
│       └── non_relevant.csv
├── config/
│   └── sources.json             # NOVO: Lista svih izvora
├── logs/
│   └── daily/
├── workflows/
│   └── N8N_EU_Grants_MultiCompany.json
└── docs/
    ├── CLAUDE.md
    ├── PLAN_multi_source_grants.md
    └── DEVELOPMENT_ROADMAP.md
```

### Kako testirati:
```powershell
# Kreiraj foldere
mkdir scrapers, data, data\grants, data\processed, config, logs, logs\daily, workflows, docs

# Premesti fajlove
move scraper2.js scrapers\eu_portal_scraper.js
move companies.json data\companies.json
move allgrants.csv data\grants\eu_portal_grants.csv
move N8N_EU_Grants_MultiCompany.json workflows\
```

---

## Korak 1.2: Kreiraj Config Fajl za Izvore

### Akcija: Kreiraj `config/sources.json`

```json
{
  "sources": [
    {
      "id": "eu_portal",
      "name": "EU Funding & Tenders Portal",
      "scraper": "eu_portal_scraper.js",
      "url": "https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals",
      "enabled": true,
      "schedule": "0 7 * * *",
      "output_file": "eu_portal_grants.csv"
    }
  ],
  "settings": {
    "timeout_per_grant_ms": 900000,
    "max_retries": 3,
    "headless": false
  }
}
```

### Svrha:
- Centralizovana konfiguracija svih izvora
- Lako dodavanje novih izvora
- Enable/disable bez menjanja koda

---

## Korak 1.3: Kreiraj Base Scraper Class

### Akcija: Kreiraj `scrapers/base_scraper.js`

```javascript
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
    fs.appendFileSync(logFile, logMessage + '\n');
  }

  loadExistingGrants() {
    const csvPath = path.join(this.dataDir, `${this.sourceId}_grants.csv`);
    const existingTitles = new Set();

    if (fs.existsSync(csvPath)) {
      const csvData = fs.readFileSync(csvPath, 'utf-8');
      const lines = csvData.split('\n').slice(1);

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
      fs.writeFileSync(newGrantsPath, csvHeader + csvContent);
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
```

### Svrha:
- DRY princip - zajednicki kod na jednom mestu
- Standardizovan output format za sve scrapere
- Unified logging
- Lakse dodavanje novih izvora

---

## Korak 1.4: Refaktorisi EU Portal Scraper

### Akcija: Kreiraj `scrapers/eu_portal_scraper.js`

```javascript
// scrapers/eu_portal_scraper.js
const BaseScraper = require('./base_scraper');
const cheerio = require('cheerio');

class EUPortalScraper extends BaseScraper {
  constructor(config) {
    super('eu_portal', config);
    this.baseUrl = 'https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals';
    this.params = '?order=DESC&pageNumber=1&pageSize=50&sortBy=startDate&isExactMatch=true&status=31094502';
  }

  async scrape() {
    const existingTitles = this.loadExistingGrants();
    const allGrants = [];
    let hasNextPage = true;
    let currentPage = 1;

    await this.page.goto(this.baseUrl + this.params, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });
    await this.page.waitForSelector('sedia-result-card', { timeout: 60000 });

    while (hasNextPage) {
      this.log(`Processing page ${currentPage}...`);

      const grants = await this.page.evaluate(() => {
        const data = [];
        const cards = document.querySelectorAll('sedia-result-card');

        cards.forEach(card => {
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
      });

      this.log(`Found ${grants.length} grants on page ${currentPage}`);

      for (const grant of grants) {
        const normalizedTitle = this.normalizeTitle(grant.title);

        if (existingTitles.has(normalizedTitle)) {
          this.log(`Skipped (exists): ${grant.title.substring(0, 50)}...`);
          continue;
        }

        if (grant.link !== 'N/A') {
          const enrichedGrant = await this.enrichGrant(grant);
          if (enrichedGrant) {
            allGrants.push(enrichedGrant);
            existingTitles.add(normalizedTitle);
            this.log(`Added: ${grant.title.substring(0, 50)}...`);
          }
        }
      }

      hasNextPage = await this.goToNextPage();
      currentPage++;
    }

    this.log(`Scraping complete. Found ${allGrants.length} new grants.`);
    return allGrants;
  }

  async enrichGrant(grant) {
    const timeout = this.config.settings?.timeout_per_grant_ms || 900000;

    return new Promise(async (resolve) => {
      const timeoutId = setTimeout(() => {
        this.log(`Timeout for: ${grant.title.substring(0, 50)}...`);
        resolve(null);
      }, timeout);

      try {
        const newPage = await this.browser.newPage();
        await newPage.goto(grant.link, { waitUntil: 'networkidle2', timeout: 60000 });
        await new Promise(r => setTimeout(r, 2000));

        const content = await newPage.content();
        const $ = cheerio.load(content);

        const descriptionElements = $('.col-md-9.col-xxl-10 *')
          .map((_, el) => $(el).text().trim())
          .get();

        const fullDescription = [grant.title, ...descriptionElements]
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim() || 'N/A';

        const descriptionTokens = fullDescription.split(/\s+/);
        grant.description = descriptionTokens.slice(0, 1000).join(' ');

        await newPage.close();
        clearTimeout(timeoutId);
        resolve(grant);
      } catch (error) {
        this.log(`Error enriching grant: ${error.message}`);
        clearTimeout(timeoutId);
        resolve(null);
      }
    });
  }

  async goToNextPage() {
    try {
      await this.page.waitForSelector('button.eui-button.eui-button--basic', { timeout: 30000 });
      const nextPageButtons = await this.page.$$('button.eui-button.eui-button--basic');

      if (nextPageButtons.length > 0) {
        const isDisabled = await nextPageButtons[nextPageButtons.length - 1].evaluate(
          button => button.hasAttribute('disabled')
        );

        if (!isDisabled) {
          await Promise.all([
            this.page.waitForNavigation({ timeout: 60000 }),
            nextPageButtons[nextPageButtons.length - 2].click()
          ]);
          await this.page.waitForSelector('sedia-result-card', { timeout: 60000 });
          await new Promise(r => setTimeout(r, 3000));
          return true;
        }
      }
    } catch (error) {
      this.log(`Navigation error: ${error.message}`);
    }

    return false;
  }
}

// Allow running directly
if (require.main === module) {
  const config = require('../config/sources.json');
  const scraper = new EUPortalScraper(config);
  scraper.run().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = EUPortalScraper;
```

### Kako testirati:
```powershell
cd C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants
node scrapers/eu_portal_scraper.js
```

---

## Korak 1.5: Kreiraj Scraper Orchestrator

### Akcija: Kreiraj `scrapers/run_all_scrapers.js`

```javascript
// scrapers/run_all_scrapers.js
const fs = require('fs');
const path = require('path');

async function runAllScrapers() {
  const configPath = path.join(__dirname, '..', 'config', 'sources.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const results = {
    timestamp: new Date().toISOString(),
    sources: [],
    totalNewGrants: 0,
    errors: []
  };

  console.log(`Starting scraper run at ${results.timestamp}`);
  console.log(`Found ${config.sources.length} configured sources`);

  for (const source of config.sources) {
    if (!source.enabled) {
      console.log(`Skipping disabled source: ${source.id}`);
      continue;
    }

    console.log(`\n${'='.repeat(50)}`);
    console.log(`Running scraper: ${source.name}`);
    console.log(`${'='.repeat(50)}\n`);

    try {
      const ScraperClass = require(`./${source.scraper.replace('.js', '')}`);
      const scraper = new ScraperClass(config);
      const grants = await scraper.run();

      results.sources.push({
        id: source.id,
        name: source.name,
        success: true,
        grantsFound: grants.length
      });
      results.totalNewGrants += grants.length;

      console.log(`\n${source.name}: Found ${grants.length} new grants`);
    } catch (error) {
      console.error(`Error running ${source.name}:`, error.message);
      results.sources.push({
        id: source.id,
        name: source.name,
        success: false,
        error: error.message
      });
      results.errors.push({
        source: source.id,
        error: error.message
      });
    }
  }

  // Write summary
  const summaryPath = path.join(__dirname, '..', 'logs', 'daily', `summary_${new Date().toISOString().split('T')[0]}.json`);
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));

  // Write marker file
  const markerPath = path.join(__dirname, '..', 'scraper_finished.txt');
  fs.writeFileSync(markerPath, Date.now().toString());

  console.log(`\n${'='.repeat(50)}`);
  console.log('SCRAPING COMPLETE');
  console.log(`${'='.repeat(50)}`);
  console.log(`Total new grants: ${results.totalNewGrants}`);
  console.log(`Successful sources: ${results.sources.filter(s => s.success).length}/${config.sources.length}`);
  if (results.errors.length > 0) {
    console.log(`Errors: ${results.errors.length}`);
  }

  return results;
}

runAllScrapers()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
```

### Kako testirati:
```powershell
node scrapers/run_all_scrapers.js
```

---

## Korak 1.6: Azuriraj n8n Workflow Putanje

### Akcija: Promeni putanje u n8n workflow-u

U `N8N_EU_Grants_MultiCompany.json`, azuriraj sledece node-ove:

**Scraper2 node:**
```json
{
  "parameters": {
    "command": "cd C:\\Users\\Korisnik\\Desktop\\Alicorn\\n8n_eu_grants && node scrapers/run_all_scrapers.js"
  }
}
```

**Read_New_Grants node:**
```javascript
const filePath = 'C:\\\\Users\\\\Korisnik\\\\Desktop\\\\Alicorn\\\\n8n_eu_grants\\\\data\\\\grants\\\\new_grants.csv';
```

**Load_Companies_And_Combine node:**
```javascript
const companiesPath = 'C:\\\\Users\\\\Korisnik\\\\Desktop\\\\Alicorn\\\\n8n_eu_grants\\\\data\\\\companies.json';
```

---

# FAZA 2: DODAVANJE NOVIH IZVORA
**Cilj: Implementirati scrapere za dodatne EU grant portale**

---

## Korak 2.1: Istrazivanje Novih Izvora

### Lista Prioritetnih Izvora:

| Prioritet | Izvor | URL | Tip | Tezina |
|-----------|-------|-----|-----|--------|
| 1 | Horizon Europe | ec.europa.eu/info/funding-tenders | Scraping | Srednja |
| 2 | Creative Europe | ec.europa.eu/culture/creative-europe | Scraping | Srednja |
| 3 | EIC Accelerator | eic.ec.europa.eu | API/Scraping | Laka |
| 4 | Interreg | interreg.eu | Scraping | Teska |
| 5 | Digital Europe | digital-strategy.ec.europa.eu | Scraping | Srednja |
| 6 | Erasmus+ | erasmus-plus.ec.europa.eu | Scraping | Srednja |

### Pre implementacije svakog izvora:
1. Rucno poseti sajt i identifikuj strukturu
2. Proveri da li ima API (Developer Tools → Network tab)
3. Identifikuj CSS selektore za grantove
4. Proveri paginaciju
5. Testiraj scraping u browser console

---

## Korak 2.2: Implementiraj Creative Europe Scraper

### Akcija: Kreiraj `scrapers/creative_europe_scraper.js`

```javascript
// scrapers/creative_europe_scraper.js
const BaseScraper = require('./base_scraper');
const cheerio = require('cheerio');

class CreativeEuropeScraper extends BaseScraper {
  constructor(config) {
    super('creative_europe', config);
    this.baseUrl = 'https://culture.ec.europa.eu/creative-europe/creative-europe-calls';
  }

  async scrape() {
    const existingTitles = this.loadExistingGrants();
    const allGrants = [];

    await this.page.goto(this.baseUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // Wait for content to load
    await new Promise(r => setTimeout(r, 3000));

    const content = await this.page.content();
    const $ = cheerio.load(content);

    // Adjust selectors based on actual page structure
    // This is a template - you need to inspect the actual page
    const callItems = $('.call-item, .funding-opportunity, article');

    callItems.each((_, element) => {
      const $el = $(element);
      const title = $el.find('h2, h3, .title').first().text().trim();
      const link = $el.find('a').first().attr('href');
      const date = $el.find('.date, .deadline, time').first().text().trim();
      const description = $el.find('p, .description, .summary').first().text().trim();

      if (title && !existingTitles.has(this.normalizeTitle(title))) {
        allGrants.push({
          title,
          link: link?.startsWith('http') ? link : `https://culture.ec.europa.eu${link}`,
          date: date || 'N/A',
          description: description || 'N/A'
        });
        this.log(`Found: ${title.substring(0, 50)}...`);
      }
    });

    this.log(`Scraping complete. Found ${allGrants.length} new grants.`);
    return allGrants;
  }
}

if (require.main === module) {
  const config = require('../config/sources.json');
  const scraper = new CreativeEuropeScraper(config);
  scraper.run().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = CreativeEuropeScraper;
```

### Akcija: Dodaj u `config/sources.json`

```json
{
  "sources": [
    {
      "id": "eu_portal",
      "name": "EU Funding & Tenders Portal",
      "scraper": "eu_portal_scraper.js",
      "enabled": true
    },
    {
      "id": "creative_europe",
      "name": "Creative Europe",
      "scraper": "creative_europe_scraper.js",
      "enabled": true
    }
  ]
}
```

### Kako testirati:
```powershell
# Test pojedinacno
node scrapers/creative_europe_scraper.js

# Test sve zajedno
node scrapers/run_all_scrapers.js
```

---

## Korak 2.3: Template za Nove Scrapere

### Akcija: Kreiraj `scrapers/scraper_template.js`

```javascript
// scrapers/scraper_template.js
// TEMPLATE - Copy this file and modify for new sources

const BaseScraper = require('./base_scraper');
const cheerio = require('cheerio');

class NewSourceScraper extends BaseScraper {
  constructor(config) {
    // CHANGE: Update source ID
    super('new_source_id', config);
    // CHANGE: Update base URL
    this.baseUrl = 'https://example.com/grants';
  }

  async scrape() {
    const existingTitles = this.loadExistingGrants();
    const allGrants = [];

    await this.page.goto(this.baseUrl, {
      waitUntil: 'networkidle2',
      timeout: 60000
    });

    // CHANGE: Update wait selector
    await this.page.waitForSelector('.grant-item', { timeout: 60000 });

    let hasNextPage = true;
    let currentPage = 1;

    while (hasNextPage) {
      this.log(`Processing page ${currentPage}...`);

      const content = await this.page.content();
      const $ = cheerio.load(content);

      // CHANGE: Update selectors based on target site
      $('.grant-item').each((_, element) => {
        const $el = $(element);

        // CHANGE: Update these selectors
        const title = $el.find('.title').text().trim();
        const link = $el.find('a').attr('href');
        const date = $el.find('.deadline').text().trim();
        const description = $el.find('.description').text().trim();

        if (title && !existingTitles.has(this.normalizeTitle(title))) {
          allGrants.push({
            title,
            link: this.makeAbsoluteUrl(link),
            date: date || 'N/A',
            description: description || 'N/A'
          });
          existingTitles.add(this.normalizeTitle(title));
          this.log(`Found: ${title.substring(0, 50)}...`);
        }
      });

      // CHANGE: Update pagination logic
      hasNextPage = await this.goToNextPage();
      currentPage++;
    }

    this.log(`Scraping complete. Found ${allGrants.length} new grants.`);
    return allGrants;
  }

  makeAbsoluteUrl(url) {
    if (!url) return 'N/A';
    if (url.startsWith('http')) return url;
    // CHANGE: Update base domain
    return `https://example.com${url}`;
  }

  async goToNextPage() {
    try {
      // CHANGE: Update next page selector
      const nextButton = await this.page.$('.pagination .next:not(.disabled)');
      if (nextButton) {
        await Promise.all([
          this.page.waitForNavigation({ timeout: 60000 }),
          nextButton.click()
        ]);
        await new Promise(r => setTimeout(r, 2000));
        return true;
      }
    } catch (error) {
      this.log(`Pagination error: ${error.message}`);
    }
    return false;
  }
}

if (require.main === module) {
  const config = require('../config/sources.json');
  const scraper = new NewSourceScraper(config);
  scraper.run().then(() => process.exit(0)).catch(() => process.exit(1));
}

module.exports = NewSourceScraper;
```

---

# FAZA 3: PROSIRENJE COMPANY SISTEMA
**Cilj: Dodati vise kompanija, poboljsati matching, personalizovati notifikacije**

---

## Korak 3.1: Prosiri Company Schema

### Akcija: Azuriraj `data/companies.json`

```json
[
  {
    "id": "alicorn",
    "name": "Alicorn",
    "active": true,
    "contact": {
      "primary_email": "marko@alicorn.me",
      "secondary_email": "info@alicorn.me",
      "phone": "+382 XX XXX XXX"
    },
    "notifications": {
      "slack": {
        "enabled": true,
        "channel_id": "C09U22T1QDS",
        "mention_users": ["@marko"]
      },
      "email": {
        "enabled": false,
        "recipients": ["marko@alicorn.me"]
      },
      "webhook": {
        "enabled": false,
        "url": ""
      }
    },
    "matching": {
      "min_relevance_score": 70,
      "auto_apply": false,
      "digest_mode": false
    },
    "profile": {
      "description": "Marketing agency and software development company from Montenegro...",
      "country": "Montenegro",
      "region": "Western Balkans",
      "legal_entity_type": "SME",
      "year_founded": 2015,
      "employees": "10-50",
      "annual_revenue_eur": "500000-1000000",
      "sectors": [
        "software development",
        "marketing",
        "edtech",
        "AI/ML",
        "video games"
      ],
      "keywords": [
        "educational games",
        "gamification",
        "HR tech",
        "compliance training",
        "SDG",
        "domain names",
        "LLM",
        "machine learning"
      ],
      "previous_grants": [
        {
          "program": "Horizon 2020",
          "year": 2022,
          "role": "partner"
        }
      ],
      "eligible_programs": [
        "Horizon Europe",
        "Creative Europe",
        "Digital Europe",
        "Erasmus+",
        "Interreg"
      ],
      "excluded_topics": [
        "agriculture",
        "fisheries",
        "nuclear"
      ]
    }
  },
  {
    "id": "techstartup_xyz",
    "name": "TechStartup XYZ",
    "active": true,
    "contact": {
      "primary_email": "ceo@techxyz.com"
    },
    "notifications": {
      "slack": {
        "enabled": true,
        "channel_id": "C0XXXXXXX",
        "mention_users": ["@ceo"]
      },
      "email": {
        "enabled": true,
        "recipients": ["ceo@techxyz.com", "grants@techxyz.com"]
      }
    },
    "matching": {
      "min_relevance_score": 75,
      "auto_apply": false
    },
    "profile": {
      "description": "Fintech startup specializing in blockchain payments and DeFi solutions.",
      "country": "Serbia",
      "region": "Western Balkans",
      "legal_entity_type": "Startup",
      "sectors": ["fintech", "blockchain", "payments"],
      "keywords": ["DeFi", "smart contracts", "digital payments", "banking API"],
      "eligible_programs": ["EIC Accelerator", "Horizon Europe", "Digital Europe"]
    }
  }
]
```

---

## Korak 3.2: Poboljsaj AI Matching Prompt

### Akcija: Azuriraj "Is it for me?" node u n8n

```
You are an expert EU grants consultant evaluating funding opportunities.

COMPANY PROFILE:
- Name: {{ $json.company.name }}
- Country: {{ $json.company.profile.country }}
- Region: {{ $json.company.profile.region }}
- Entity Type: {{ $json.company.profile.legal_entity_type }}
- Description: {{ $json.company.profile.description }}
- Sectors: {{ $json.company.profile.sectors.join(', ') }}
- Keywords: {{ $json.company.profile.keywords.join(', ') }}
- Eligible Programs: {{ $json.company.profile.eligible_programs.join(', ') }}
- Excluded Topics: {{ $json.company.profile.excluded_topics?.join(', ') || 'None' }}
- Previous Grant Experience: {{ $json.company.profile.previous_grants ? 'Yes' : 'No' }}

GRANT OPPORTUNITY:
- Title: {{ $json.grant.Title }}
- Source: {{ $json.grant.Source || 'EU Portal' }}
- Link: {{ $json.grant.Link }}
- Deadline: {{ $json.grant.Date }}
- Description: {{ $json.grant.Description }}

EVALUATION CRITERIA:
1. Sector alignment (0-30 points)
2. Geographic eligibility (0-20 points)
3. Entity type match (0-20 points)
4. Keyword relevance (0-20 points)
5. Program type match (0-10 points)

TASK: Evaluate this grant and respond with ONLY a JSON object:

{
  "relevant": true/false,
  "score": <0-100>,
  "reasoning": "<1-2 sentences explaining the match>",
  "sector_match": "<which company sectors align>",
  "concerns": "<any eligibility concerns or 'None'>"
}

IMPORTANT:
- Score >= 70 means relevant
- If the grant topic is in excluded_topics, score = 0
- If country/region is not eligible, mention in concerns
- Be strict - only high-quality matches should score above 70
```

---

## Korak 3.3: Dodaj Relevance Score u Workflow

### Akcija: Azuriraj "If" node da koristi score

Promeni uslov iz:
```
{{ $json.output[0].content[0].text }} contains "Yes"
```

U:
```javascript
// In Code node before If
const aiResponse = $json.output[0].content[0].text;
let parsed;
try {
  parsed = JSON.parse(aiResponse);
} catch (e) {
  parsed = { relevant: false, score: 0 };
}

const minScore = $json.company.matching?.min_relevance_score || 70;
return {
  ...parsed,
  passes_threshold: parsed.score >= minScore,
  company_threshold: minScore
};
```

If node condition:
```
{{ $json.passes_threshold }} equals true
```

---

## Korak 3.4: Implementiraj Email Notifikacije

### Akcija: Dodaj Email node posle Slack node-a

**n8n Node: "Send Email Notification"**
- Type: `n8n-nodes-base.emailSend` ili `n8n-nodes-base.gmail`

```json
{
  "parameters": {
    "fromEmail": "grants@yourdomain.com",
    "toEmail": "={{ $json.company.contact.primary_email }}",
    "subject": "=New Grant Match: {{ $json.title }}",
    "emailType": "html",
    "html": "=<h2>New Grant Opportunity for {{ $json.company_name }}</h2>\n<p><strong>Title:</strong> {{ $json.title }}</p>\n<p><strong>Relevance Score:</strong> {{ $json.score }}/100</p>\n<p><strong>Deadline:</strong> {{ $json.date }}</p>\n<p><strong>Summary:</strong><br>{{ $json.summary }}</p>\n<p><strong>Why this matches:</strong><br>{{ $json.reasoning }}</p>\n<p><a href=\"{{ $json.link }}\">View Full Grant Details</a></p>"
  },
  "type": "n8n-nodes-base.emailSend"
}
```

### Akcija: Dodaj If node za email check

Pre Email node-a dodaj:
```
{{ $json.company.notifications.email.enabled }} equals true
```

---

## Korak 3.5: Implementiraj Daily Digest Mode

### Akcija: Kreiraj novi workflow "Daily Digest"

Umesto instant notifikacija, sakupi sve matcheve i posalji jedan email/Slack dnevno.

**Nova n8n struktura za digest:**
```
Schedule (18:00) → Read Today's Matches → Group by Company →
→ For Each Company → Generate Digest → Send Slack/Email
```

**Code node: "Generate Digest"**
```javascript
const matches = $input.all();
const companyMatches = {};

// Group by company
for (const match of matches) {
  const companyId = match.json.company_id;
  if (!companyMatches[companyId]) {
    companyMatches[companyId] = {
      company: match.json.company,
      grants: []
    };
  }
  companyMatches[companyId].grants.push(match.json);
}

// Generate output for each company
const output = [];
for (const [companyId, data] of Object.entries(companyMatches)) {
  output.push({
    json: {
      company_id: companyId,
      company_name: data.company.name,
      slack_channel_id: data.company.slack_channel_id,
      total_matches: data.grants.length,
      grants: data.grants,
      digest_text: generateDigestText(data)
    }
  });
}

function generateDigestText(data) {
  let text = `📊 *Daily Grant Digest for ${data.company.name}*\n\n`;
  text += `Found *${data.grants.length}* relevant grants today:\n\n`;

  for (let i = 0; i < data.grants.length; i++) {
    const g = data.grants[i];
    text += `${i+1}. *${g.title}*\n`;
    text += `   Score: ${g.score}/100 | Deadline: ${g.date}\n`;
    text += `   ${g.link}\n\n`;
  }

  return text;
}

return output;
```

---

# FAZA 4: NAPREDNE FUNKCIONALNOSTI
**Cilj: Dashboard, analytics, automatsko apliciranje**

---

## Korak 4.1: Kreiraj Grant Database (JSON/SQLite)

### Akcija: Kreiraj `data/grants_database.json`

```json
{
  "grants": [
    {
      "id": "eu_portal_12345",
      "source": "eu_portal",
      "title": "Horizon Europe Call XYZ",
      "link": "https://...",
      "deadline": "2025-03-15",
      "status": "open",
      "scraped_at": "2025-01-15T07:00:00Z",
      "description": "...",
      "extracted_info": {
        "budget": "5000000 EUR",
        "application_type": "Partnership required",
        "partner_types": ["SME", "University"],
        "co_financing": "20%"
      },
      "company_matches": [
        {
          "company_id": "alicorn",
          "score": 85,
          "reasoning": "Strong match for edtech sector...",
          "notified_at": "2025-01-15T07:30:00Z",
          "notification_channels": ["slack"],
          "user_feedback": null
        }
      ]
    }
  ],
  "statistics": {
    "total_grants_scraped": 500,
    "total_matches_sent": 150,
    "matches_by_company": {
      "alicorn": 75,
      "techstartup_xyz": 50
    },
    "matches_by_source": {
      "eu_portal": 100,
      "creative_europe": 50
    }
  }
}
```

---

## Korak 4.2: Kreiraj Analytics Dashboard

### Opcija A: Simple HTML Dashboard

Kreiraj `dashboard/index.html`:
```html
<!DOCTYPE html>
<html>
<head>
  <title>EU Grants Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .stats { display: flex; gap: 20px; margin-bottom: 30px; }
    .stat-card {
      background: #f5f5f5;
      padding: 20px;
      border-radius: 8px;
      min-width: 150px;
    }
    .stat-number { font-size: 32px; font-weight: bold; color: #2196F3; }
    .charts { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  </style>
</head>
<body>
  <h1>EU Grants Monitoring Dashboard</h1>

  <div class="stats">
    <div class="stat-card">
      <div class="stat-number" id="total-grants">0</div>
      <div>Total Grants</div>
    </div>
    <div class="stat-card">
      <div class="stat-number" id="total-matches">0</div>
      <div>Total Matches</div>
    </div>
    <div class="stat-card">
      <div class="stat-number" id="companies">0</div>
      <div>Active Companies</div>
    </div>
  </div>

  <div class="charts">
    <canvas id="matchesByCompany"></canvas>
    <canvas id="matchesBySource"></canvas>
  </div>

  <script>
    // Load data and render charts
    fetch('../data/grants_database.json')
      .then(r => r.json())
      .then(data => {
        document.getElementById('total-grants').textContent = data.statistics.total_grants_scraped;
        document.getElementById('total-matches').textContent = data.statistics.total_matches_sent;
        document.getElementById('companies').textContent = Object.keys(data.statistics.matches_by_company).length;

        // Render charts...
      });
  </script>
</body>
</html>
```

### Opcija B: n8n Workflow za Weekly Report

Kreiraj workflow koji salje weekly summary email sa statistikom.

---

## Korak 4.3: Feedback Loop - User Can Rate Matches

### Akcija: Dodaj Slack Interactive Buttons

U Slack poruci dodaj buttons:
```json
{
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*New Grant Match*\n{{ $json.title }}"
      }
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "👍 Relevant" },
          "action_id": "grant_relevant",
          "value": "{{ $json.grant_id }}"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "👎 Not Relevant" },
          "action_id": "grant_not_relevant",
          "value": "{{ $json.grant_id }}"
        },
        {
          "type": "button",
          "text": { "type": "plain_text", "text": "📝 Will Apply" },
          "action_id": "grant_will_apply",
          "value": "{{ $json.grant_id }}",
          "style": "primary"
        }
      ]
    }
  ]
}
```

### Akcija: Kreiraj Webhook za Slack Interactions

n8n Webhook node koji prima feedback i cuva u database.

---

## Korak 4.4: Auto-kategorisanje Grantova

### Akcija: Dodaj AI node za kategorizaciju

```
Based on this grant description, categorize it:

Title: {{ $json.grant.Title }}
Description: {{ $json.grant.Description }}

Categories (select all that apply):
- Research & Innovation
- Digital Transformation
- Green/Sustainability
- Education & Training
- Culture & Media
- Health
- Infrastructure
- SME Support
- International Cooperation

Response format:
{
  "primary_category": "...",
  "secondary_categories": ["...", "..."],
  "tags": ["keyword1", "keyword2", "keyword3"],
  "estimated_budget_range": "small/medium/large/unknown",
  "complexity": "low/medium/high"
}
```

---

# FAZA 5: PRODUKCIJA I SKALIRANJE
**Cilj: Stabilnost, monitoring, backup**

---

## Korak 5.1: Error Handling i Alerting

### Akcija: Dodaj Error Workflow u n8n

Kreiraj "Error Handler" workflow:
```
On Error → Log to File → Send Slack Alert → [Optional: Send Email]
```

**Error Alert Slack poruka:**
```
🚨 *EU Grants Workflow Error*

Workflow: {{ $workflow.name }}
Node: {{ $node.name }}
Error: {{ $json.error.message }}
Time: {{ $now }}

Check logs for details.
```

---

## Korak 5.2: Backup Sistema

### Akcija: Kreiraj backup script

`scripts/backup.js`:
```javascript
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const backupDir = path.join(__dirname, '..', 'backups');
const timestamp = new Date().toISOString().split('T')[0];

// Create backup folder
const backupPath = path.join(backupDir, timestamp);
if (!fs.existsSync(backupPath)) {
  fs.mkdirSync(backupPath, { recursive: true });
}

// Copy all data files
const files = [
  'companies.json',
  'grants/all_unified.csv',
  'grants/eu_portal_grants.csv',
  'processed/sent_notifications.json'
];

for (const file of files) {
  const src = path.join(dataDir, file);
  const dest = path.join(backupPath, file.replace('/', '_'));
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Backed up: ${file}`);
  }
}

// Clean old backups (keep last 30 days)
const backups = fs.readdirSync(backupDir);
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

for (const backup of backups) {
  const backupDate = new Date(backup);
  if (backupDate < thirtyDaysAgo) {
    fs.rmSync(path.join(backupDir, backup), { recursive: true });
    console.log(`Deleted old backup: ${backup}`);
  }
}

console.log('Backup complete!');
```

### Akcija: Dodaj u Windows Task Scheduler

```powershell
# Run daily at 23:00
schtasks /create /tn "EU Grants Backup" /tr "node C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants\scripts\backup.js" /sc daily /st 23:00
```

---

## Korak 5.3: Health Check Endpoint

### Akcija: Kreiraj health check workflow u n8n

Webhook: `GET /health`

Response:
```json
{
  "status": "healthy",
  "last_scrape": "2025-01-15T07:00:00Z",
  "grants_in_db": 500,
  "active_companies": 5,
  "last_notification": "2025-01-15T07:30:00Z"
}
```

---

## Korak 5.4: Monitoring Dashboard

### Opcija: Koristeci n8n + Slack

Kreiraj daily status report:
```
📊 *Daily System Status*

✅ Scraper ran successfully
📥 New grants found: 5
🎯 Matches sent: 3
👥 Active companies: 2

*Sources Status:*
- EU Portal: ✅ OK (15 grants)
- Creative Europe: ✅ OK (3 grants)
- Interreg: ⚠️ 0 grants (check manually)

*Upcoming Deadlines:*
- Grant XYZ: 3 days
- Grant ABC: 7 days
```

---

# TESTIRANJE CHECKLIST

## Pre svake promene:

- [ ] Backup current working version
- [ ] Test in development first
- [ ] Check n8n execution logs
- [ ] Verify Slack messages format
- [ ] Check CSV file integrity

## Posle svake faze:

### Faza 1 Testovi:
- [ ] `node scrapers/eu_portal_scraper.js` radi bez gresaka
- [ ] `node scrapers/run_all_scrapers.js` radi
- [ ] CSV fajlovi se kreiraju u `data/grants/`
- [ ] n8n workflow radi sa novim putanjama

### Faza 2 Testovi:
- [ ] Novi scraper daje rezultate
- [ ] Grants iz svih izvora se spajaju u `all_unified.csv`
- [ ] Source kolona je ispravno popunjena

### Faza 3 Testovi:
- [ ] Nova kompanija dobija notifikacije
- [ ] Relevance score se ispravno racuna
- [ ] Email notifikacije stizu (ako su ukljucene)

### Faza 4 Testovi:
- [ ] Dashboard prikazuje ispravne statistike
- [ ] Feedback buttons rade u Slacku
- [ ] Kategorije se ispravno dodeljuju

### Faza 5 Testovi:
- [ ] Error handling hvata greske
- [ ] Backup script radi
- [ ] Health check vraca status

---

# TIMELINE PREPORUKA

| Faza | Trajanje | Prioritet |
|------|----------|-----------|
| Faza 1 | 1-2 dana | KRITIČNO |
| Faza 2 | 3-5 dana | VISOK |
| Faza 3 | 2-3 dana | VISOK |
| Faza 4 | 5-7 dana | SREDNJI |
| Faza 5 | 2-3 dana | SREDNJI |

**Ukupno: 2-3 nedelje za full implementaciju**

---

# BRZI START - Sta uraditi ODMAH

1. **Danas**: Korak 1.1 - Reorganizuj foldere
2. **Sutra**: Korak 1.2-1.4 - Base scraper i refaktorisanje
3. **Za 3 dana**: Korak 1.5-1.6 - Orchestrator i n8n update
4. **Za nedelju dana**: Faza 2 - Prvi novi izvor
5. **Za 2 nedelje**: Faza 3 - Druga kompanija + email

---

*Poslednje azuriranje: {{ current_date }}*
*Verzija: 1.0*
