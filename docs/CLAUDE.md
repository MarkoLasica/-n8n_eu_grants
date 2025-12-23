# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Automated EU grants monitoring system serving **9 companies** (Montenegro-based tech companies + international partners). The system scrapes EU funding opportunities daily from 4 major programmes, uses AI to determine relevance per company, and sends personalized Slack notifications with daily digests.

## Architecture

```
Schedule (07:00) → Run Scrapers (4 programmes) → Read CSV → Filter NEW
    ↓
Load Companies & Pre-filter by Programme → AI Relevance Check (per company)
    ↓
Aggregate by Company → Ensure All Companies Get Messages → Route by Grant Count
    ↓                                                              ↓
Personalized Digest (with grants)                    No Grants Message (0 grants)
```

**Key Components:**
- **scrapers/run_all_scrapers.js**: Orchestrator running 4 programme-specific scrapers
- **scrapers/{programme}_scraper.js**: Puppeteer-based scrapers extending BaseScraper
- **n8n workflow**: `N8N_EU_Grants_MultiCompany17.json` (current production version)
- **data/grants/all_unified.csv**: Master database (~400+ grants from all programmes)
- **data/grants/new_grants.csv**: Today's new grants only (temporary, deleted each run)
- **data/companies.json**: 9 company profiles with Slack channels and preferences
- **scraper_finished.txt**: Completion marker with timestamp

## Common Commands

### Run All Scrapers (Production)
```bash
cd C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants
node scrapers/run_all_scrapers.js
```

### Run Individual Programme Scrapers (Testing)
```bash
node scrapers/test_horizon.js         # 5 grants only
node scrapers/test_digital_europe.js
node scrapers/test_creative_europe.js
node scrapers/test_erasmus.js
```

### Check Grant Count
```powershell
# All grants database
(Get-Content data\grants\all_unified.csv | Measure-Object -Line).Lines

# Today's new grants
(Get-Content data\grants\new_grants.csv | Measure-Object -Line).Lines
```

### View Last Scraped Grants
```powershell
Get-Content data\grants\all_unified.csv -Tail 10
```

### Check Scraper Status
```powershell
Get-Content scraper_finished.txt
```

### Check Company Non-Relevant Grants
```powershell
Get-Content data\processed\non_relevant_alicorn.csv
```

### n8n Workflow Operations
```bash
# Import latest workflow
n8n import:workflow --input="workflows/N8N_EU_Grants_MultiCompany17.json"

# Export workflow for backup
n8n export:workflow --id=7IjYE2TQQbJE2nML --output=workflows/backup.json
```

## Known Issues

### ⚠️ Issue #1: Aggregate Node May Not Execute with 0 Items
**Status:** Documented, not yet fixed
**Impact:** If ALL grants filtered out by AI, companies may not receive "no grants" messages
**Priority:** Low (rare scenario)

**Solution:** Enable "Always Output Data" on "Aggregate By Company" and "Ensure_All_Companies_Have_Messages" nodes. See `docs/PROGRESS.md` for details.

### Other Notes:
1. **Race Condition**: Resolved via `scraper_finished.txt` marker
2. **Hardcoded Paths**: Project uses absolute Windows paths (`C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants`)
3. **new_grants.csv lifecycle**: File deleted at start of each run, rebuilt from scratch

## Target URLs

The scrapers target EU Funding Portal with programme-specific filters:
```
https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals

# With frameworkProgramme parameter:
- Horizon Europe: ?frameworkProgramme=43108390
- Digital Europe: ?frameworkProgramme=43152860
- Creative Europe: ?frameworkProgramme=43251814
- Erasmus+: ?frameworkProgramme=43353764
```

## Dependencies

**Node.js (package.json):**
- puppeteer: Browser automation for scraping
- cheerio: HTML parsing
- axios: HTTP requests
- csv-parser / json2csv: CSV handling
- moment: Date manipulation

**Python (requirements.txt):** Legacy - not actively used. Contains Django, CrewAI, LangChain deps from other projects.

## Companies (9 total)

All companies have detailed profiles in `data/companies.json` with:
- Company description, country, sectors, keywords
- Slack channel ID for notifications
- `eligible_programs` array (pre-filtering before AI check)

**Active Companies:**
1. **Alicorn** (Montenegro) - Marketing + software dev, edtech, AI/ML
2. **Codepixel** (Montenegro) - Digital product development, AI, IoT
3. **Coinis** (Montenegro) - Digital marketing, adtech, AI
4. **Bild Studio** (Montenegro) - Digital product design, fintech, edutech, healthtech
5. **Payten** (Montenegro) - Fintech, payment solutions, IT infrastructure
6. **Data Design** (Montenegro) - ERP software
7. **ICT Cortex** (Montenegro) - IT cluster (45+ companies), education, innovation
8. **First Line Software** (International) - Healthcare, digital transformation, AI
9. **Pannone GTC** (Hungary/Croatia/Bosnia) - EGTC, regional development, EU projects

## How Scrapers Work

Each scraper:
1. Reads its own programme-specific CSV (e.g., `horizon_europe_grants.csv`)
2. Loads existing grant titles for deduplication
3. Scrapes EU portal with programme filter
4. Compares new grants against existing (normalized title matching)
5. Saves new grants to 3 places:
   - Programme-specific CSV (permanent)
   - `all_unified.csv` (permanent master database)
   - `new_grants.csv` (temporary, for n8n workflow)

**Important:** Each scraper is independent. Deduplication happens per-source based on the scraper's own CSV file, not `all_unified.csv`.
