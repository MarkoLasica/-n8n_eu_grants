# EU Grants Multi-Company Multi-Scraper System - Scaling Plan

## 1. Current System Analysis

### Existing Structure
**Single Scraper System:**
- `eu_portal_scraper.js` - EU Funding Portal scraper
- Puppeteer-based, scrapes ~336 grants
- Writes to: `eu_portal_grants.csv` (master) + `new_grants.csv` (daily)
- Duplicate detection via title normalization
- 15-minute timeout per grant

**Data Organization:**
```
data/
├── grants/
│   ├── eu_portal_grants.csv  (2.4MB, 337 rows - master storage)
│   └── new_grants.csv         (7.4KB - daily new grants for n8n)
├── processed/
│   └── non_relevant.csv       (76KB - rejected grants)
└── companies.json             (1 company: Alicorn)
```

**Current n8n Workflow:**
```
Schedule (7 AM) → Run Scraper → Read new_grants.csv → Check Empty?
                                                         ↓
                                                    Extract Grants
                                                         ↓
                                            Load Companies × Grants
                                                         ↓
                                               AI Relevance Check
                                                    ↙        ↘
                                            Relevant?      Not Relevant
                                                ↓              ↓
                                      Extract Details    Log to CSV
                                                ↓
                                        Send to Slack
```

---

## 2. Scaling Requirements Analysis

### Immediate Needs:
1. **Multiple Scrapers** - Different EU funding portals
2. **Multiple Companies** - Each with unique profiles
3. **Data Isolation** - Track which scraper found which grant
4. **Scraper Orchestration** - When/how to run each scraper
5. **Unified Processing** - Single n8n workflow for all sources

### Current Limitations:
- ❌ Only 1 scraper (EU Portal)
- ❌ Hardcoded paths throughout code
- ❌ No configuration system
- ❌ No scraper registry
- ❌ Single CSV per source (no unified view)
- ❌ Race conditions (n8n may read before scraper finishes)
- ✅ Multi-company support in code (but only 1 configured)

---

## 3. Proposed Architecture

### 3.1 Directory Structure
```
n8n_eu_grants/
├── scrapers/
│   ├── base_scraper.js              # Abstract base class
│   ├── scraper_eu_portal.js         # Refactored current scraper
│   ├── scraper_horizon.js           # NEW: Horizon Europe
│   ├── scraper_interreg.js          # NEW: Interreg programs
│   ├── scraper_creative_europe.js   # NEW: Creative Europe
│   └── orchestrator.js              # Runs all enabled scrapers
│
├── config/
│   ├── scrapers.json                # Scraper definitions & schedules
│   ├── companies.json               # Moved from data/
│   └── .env                         # Environment variables
│
├── data/
│   ├── grants/
│   │   ├── by_source/
│   │   │   ├── eu_portal.csv
│   │   │   ├── horizon.csv
│   │   │   └── interreg.csv
│   │   ├── unified_grants.csv       # Master merged file
│   │   └── new_grants_daily.csv     # Today's new (all sources)
│   │
│   ├── processed/
│   │   ├── sent_notifications.json  # Track what's been sent
│   │   └── non_relevant.csv
│   │
│   └── logs/
│       └── scraper_runs/
│           └── 2025-11-28.json
│
└── workflows/
    └── N8N_Unified_Multi_Source.json
```

### 3.2 Configuration System

**config/scrapers.json:**
```json
{
  "scrapers": [
    {
      "id": "eu_portal",
      "name": "EU Funding Portal",
      "enabled": true,
      "script": "scraper_eu_portal.js",
      "schedule": "daily",
      "priority": 1,
      "output": "data/grants/by_source/eu_portal.csv"
    },
    {
      "id": "horizon",
      "name": "Horizon Europe",
      "enabled": true,
      "script": "scraper_horizon.js",
      "schedule": "daily",
      "priority": 2,
      "output": "data/grants/by_source/horizon.csv"
    }
  ],
  "global": {
    "unified_output": "data/grants/unified_grants.csv",
    "daily_output": "data/grants/new_grants_daily.csv",
    "max_parallel": 2,
    "timeout": 900000
  }
}
```

**config/companies.json:**
```json
[
  {
    "id": "alicorn",
    "name": "Alicorn",
    "enabled": true,
    "notification": {
      "slack_channel_id": "C09U22T1QDS",
      "email": "marko@alicorn.me",
      "digest": false
    },
    "scraper_preferences": {
      "enabled_scrapers": ["eu_portal", "horizon", "creative_europe"],
      "priority_keywords": ["AI", "edtech", "games"]
    },
    "profile": { ... }
  },
  {
    "id": "company2",
    "name": "Company 2",
    "enabled": true,
    "notification": {
      "slack_channel_id": "C12345678",
      "email": "contact@company2.com",
      "digest": true
    },
    "scraper_preferences": {
      "enabled_scrapers": ["eu_portal", "interreg"],
      "priority_keywords": ["healthcare", "biotech"]
    },
    "profile": { ... }
  }
]
```

### 3.3 Data Flow

**Phase 1: Scraping (Orchestrator)**
```
orchestrator.js
   ↓
Load config/scrapers.json
   ↓
For each enabled scraper:
   ↓
Run scraper → Write to by_source/{scraper_id}.csv
   ↓
Merge all by_source/*.csv → unified_grants.csv (with 'source' column)
   ↓
Compare with previous unified_grants.csv → Extract new grants
   ↓
Write new_grants_daily.csv
   ↓
Create completion marker: data/logs/scraper_runs/{date}.json
```

**Phase 2: n8n Processing**
```
Schedule Trigger (after scrapers complete)
   ↓
Read new_grants_daily.csv
   ↓
Load config/companies.json
   ↓
For each grant × company:
   ↓
Filter by company.scraper_preferences.enabled_scrapers
   ↓
AI Relevance Check (GPT-4o-mini)
   ↓
If relevant → Send notification (Slack/Email per company prefs)
   ↓
Log to sent_notifications.json (prevent duplicates)
```

### 3.4 Unified Grants CSV Structure

**unified_grants.csv:**
```csv
"Grant_ID","Source","Title","Link","Date","Description","Scraped_At"
"eu_portal_001","eu_portal","EIC Accelerator 2026","https://...","2026-01-15","...","2025-11-28 07:15:23"
"horizon_045","horizon","Horizon Europe Call","https://...","2026-02-01","...","2025-11-28 07:18:45"
```

**new_grants_daily.csv:**
- Same structure as unified_grants.csv
- Contains only grants added today
- Used by n8n workflow for processing

---

## 4. Implementation Phases

### Phase 1: Refactor & Config (Week 1)
1. Create `config/scrapers.json`
2. Move `companies.json` to `config/`
3. Refactor `eu_portal_scraper.js` → `scraper_eu_portal.js`
   - Use config paths
   - Add source tracking
4. Create `base_scraper.js` (abstract class)
5. Create `orchestrator.js`

### Phase 2: Unified Data (Week 1-2)
1. Create `by_source/` directory structure
2. Implement grant merging logic
3. Add Grant_ID generation (source + hash)
4. Update scraper to write to new structure
5. Create `new_grants_daily.csv` logic

### Phase 3: Multi-Scraper (Week 2-3)
1. Create `scraper_horizon.js`
2. Create `scraper_interreg.js`
3. Add scrapers to `config/scrapers.json`
4. Test parallel execution
5. Implement error handling & retry logic

### Phase 4: Enhanced n8n Workflow (Week 3)
1. Update workflow to read from `new_grants_daily.csv`
2. Add company scraper filtering
3. Implement notification tracking (`sent_notifications.json`)
4. Add digest mode support
5. Email notification node (optional)

### Phase 5: Multi-Company (Week 4)
1. Add 3-5 test companies to `config/companies.json`
2. Test notification routing
3. Implement per-company AI prompt customization
4. Add company dashboard (optional)

---

## 5. Key Design Decisions

### 5.1 Scraper Execution Logic

**Option A: Sequential (Recommended for Start)**
- Run scrapers one after another
- Simpler error handling
- Easier debugging
- Slower total execution time

**Option B: Parallel**
- Run multiple scrapers simultaneously
- Faster overall
- More complex error handling
- Resource intensive

**Recommendation**: Start with Sequential, add Parallel in Phase 3

### 5.2 Data Storage Strategy

**Option A: Separate CSVs + Unified (RECOMMENDED)**
```
by_source/eu_portal.csv    (source-specific, never deleted)
by_source/horizon.csv
unified_grants.csv          (merged view with 'source' column)
new_grants_daily.csv        (daily processing queue)
```
**Pros**:
- Clear data lineage
- Easy to debug source-specific issues
- Can reprocess individual sources
- Supports different scraper schedules

**Option B: Single Unified Only**
```
unified_grants.csv (all grants, 'source' column)
```
**Pros**:
- Simpler structure
- Less disk space

**Recommendation**: Option A for better maintainability

### 5.3 Grant Deduplication Strategy

**Current**: Title normalization (lowercase, special chars)

**Enhanced for Multi-Source**:
```javascript
function generateGrantID(grant, source) {
  const normalized = normalizeTitle(grant.title);
  const dateHash = grant.date ? hashDate(grant.date) : '';
  return `${source}_${crypto.createHash('md5')
    .update(normalized + dateHash)
    .digest('hex')
    .substring(0, 8)}`;
}
```

**Cross-Source Deduplication**:
- Same grant appears on multiple portals
- Compare: normalized title + date + description similarity
- Mark as duplicate, keep earliest source
- Store all source URLs in `Sources` column (JSON array)

---

## 6. Critical Files to Modify

### Must Update:
1. `scrapers/eu_portal_scraper.js` → refactor
2. `workflows/N8N_EU_Grants_MultiCompany4.json` → update paths
3. Create: `config/scrapers.json`
4. Create: `config/companies.json` (from data/)
5. Create: `scrapers/orchestrator.js`
6. Create: `scrapers/base_scraper.js`

### Optional/Future:
7. `scrapers/scraper_horizon.js` (new)
8. `scrapers/scraper_interreg.js` (new)
9. `utils/grant_deduplicator.js` (new)
10. `utils/notification_tracker.js` (new)

---

## 7. Testing Strategy

### Unit Tests:
- Scraper duplicate detection
- Grant ID generation
- Config validation

### Integration Tests:
- Orchestrator runs all scrapers
- Unified CSV merging
- n8n workflow end-to-end

### Manual Tests:
- Add 3 test companies
- Run with empty database
- Run with existing grants (test deduplication)
- Test Slack notifications to different channels

---

## 8. User Requirements & Final Decisions

### Timeline: Full Implementation (All Phases)
Complete multi-scraper, multi-company system with all features.

### Priority Scrapers (4 sources):
1. **Horizon Europe** - Research & innovation
2. **Creative Europe** - Media, games, creative industries
3. **Digital Europe** - AI, cybersecurity, digital skills
4. **Interreg** - Cross-border cooperation

### Target Scale:
- 2-5 companies for initial rollout
- Architecture supports future scaling to 10+

### Notifications:
- **Slack only** (no email needed)
- **Daily digest mode** supported (bundle all matches into one message per company)
- Individual grant notifications also supported (per company preference)

---

## 9. Final Rollout Plan

### Week 1: Foundation
**Goal**: Refactor with config system + orchestrator

**Tasks**:
1. Create `config/` directory with `scrapers.json` and `companies.json`
2. Refactor `eu_portal_scraper.js` → `scraper_eu_portal.js`
   - Use config-based paths
   - Add `source` field to output
   - Generate Grant_ID
3. Create `base_scraper.js` (abstract class)
4. Create `orchestrator.js` (run all scrapers, merge CSVs)
5. Create `data/grants/by_source/` directory structure
6. Update n8n workflow paths to use `new_grants_daily.csv`

**Deliverables**:
- Working config system
- Refactored EU Portal scraper
- Orchestrator runs single scraper
- Unified CSV structure in place

---

### Week 2: Multi-Source Data

**Goal**: Add all 4 new scrapers + unified data merging

**Tasks**:
1. Create `scraper_horizon.js` (Horizon Europe portal)
2. Create `scraper_creative_europe.js` (Creative Europe)
3. Create `scraper_digital_europe.js` (Digital Europe)
4. Create `scraper_interreg.js` (Interreg programs)
5. Add all scrapers to `config/scrapers.json`
6. Implement unified CSV merging in orchestrator
7. Test duplicate detection across sources
8. Implement cross-source deduplication logic

**Deliverables**:
- 5 working scrapers (EU Portal + 4 new)
- `unified_grants.csv` with 'source' column
- `new_grants_daily.csv` populated from all sources
- Cross-source duplicate detection working

---

### Week 3: Enhanced n8n Workflow

**Goal**: Update workflow for multi-source + multi-company + digest

**Tasks**:
1. Update n8n workflow to read `new_grants_daily.csv`
2. Add company scraper filtering node
   - Filter grants by `company.scraper_preferences.enabled_scrapers`
3. Implement `sent_notifications.json` tracking
   - Prevent re-notifying same grant to same company
4. Add daily digest aggregation node
   - Group all relevant grants per company
   - Send one message with all matches
5. Add toggle: immediate vs digest mode per company
6. Update Slack message template to show 'source' field

**Deliverables**:
- Updated n8n workflow handling multi-source grants
- Notification tracking (no duplicates)
- Daily digest mode working
- Immediate notification mode working

---

### Week 4: Multi-Company & Production

**Goal**: Onboard 2-5 companies + production ready

**Tasks**:
1. Add 4 test companies to `config/companies.json`
   - Different scraper preferences per company
   - Mix of digest vs immediate notification
2. Test notification routing to different Slack channels
3. Implement per-company AI prompt customization
   - Emphasize company-specific keywords in relevance check
4. Add monitoring & logging
   - Daily scraper run logs
   - Notification success/failure tracking
5. Create user documentation
   - How to add new company
   - How to add new scraper
6. Production deployment checklist
   - Remove debug logging
   - Set up error alerts
   - Configure backup schedule

**Deliverables**:
- 5 companies configured and receiving notifications
- All 5 scrapers running daily
- Complete documentation
- Production-ready system

---

## 10. Success Metrics

### After Week 1:
- ✅ Single scraper working with new architecture
- ✅ Config system in place
- ✅ No regressions for Alicorn

### After Week 2:
- ✅ 5 scrapers collecting grants
- ✅ 500+ grants in unified CSV
- ✅ No duplicate grants within same source

### After Week 3:
- ✅ n8n workflow processes all sources
- ✅ Digest mode working
- ✅ Notification tracking prevents duplicates

### After Week 4:
- ✅ 5 companies receiving relevant grants
- ✅ 90%+ uptime for daily scraper runs
- ✅ System ready for scaling to 10+ companies
