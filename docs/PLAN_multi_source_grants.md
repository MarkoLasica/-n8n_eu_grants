# Multi-Source EU Grants Monitoring System - Architecture Plan

Based on your current workflow, here's how to scale it for multiple scrapers, multiple company profiles, and personalized notifications.

---

## Current vs. Proposed Architecture

```
CURRENT:
Schedule → Scraper → Filter → AI Analysis → Slack (single channel)

PROPOSED:
Schedule → [Multiple Scrapers] → Unified Grant Store →
         → [Multiple Company Profiles] → Per-Company AI Matching →
         → Personalized Notifications (Slack DM/Email per company)
```

---

## Key Components to Add

### 1. **Multi-Source Scraper System**

Create separate scraper files for each source:

| File | Source | Notes |
|------|--------|-------|
| `scraper_eu_portal.js` | EC Funding Portal | Your existing scraper2.js |
| `scraper_horizon.js` | Horizon Europe | Similar structure |
| `scraper_interreg.js` | Interreg Programs | Regional focus |
| `scraper_eic.js` | EIC Accelerator | Startup-focused |
| `scraper_creative_europe.js` | Creative Europe | Media/culture grants |

**Each scraper writes to:**
- `grants/{source}_grants.csv` - Source-specific file
- `grants/all_unified.csv` - Merged master file with `source` column

---

### 2. **Company Profiles Database**

Create `companies.json`:

```json
[
  {
    "id": "alicorn",
    "name": "Alicorn",
    "slack_channel": "#grants-alicorn",
    "slack_user": "@marko",
    "email": "marko@alicorn.me",
    "profile": {
      "country": "Montenegro",
      "sectors": ["software", "marketing", "edtech", "AI/ML"],
      "keywords": ["educational games", "gamification", "HR tech", "SDG"],
      "company_size": "SME",
      "eligible_programs": ["Horizon Europe", "Creative Europe", "Digital Europe"]
    }
  },
  {
    "id": "client_b",
    "name": "TechStartup XYZ",
    "slack_channel": "#grants-techxyz",
    "email": "ceo@techxyz.com",
    "profile": {
      "country": "Serbia",
      "sectors": ["fintech", "blockchain"],
      "keywords": ["payments", "DeFi", "banking"],
      "company_size": "Startup",
      "eligible_programs": ["EIC Accelerator", "Horizon Europe"]
    }
  }
]
```

---

### 3. **n8n Workflow Nodes (Revised)**

```
┌─────────────────────────────────────────────────────────────────────┐
│                         MAIN WORKFLOW                                │
└─────────────────────────────────────────────────────────────────────┘

1. SCHEDULE TRIGGER (07:00 daily)
        │
        ▼
2. EXECUTE COMMAND (Run all scrapers)
   └── node run_all_scrapers.js
        │
        ▼
3. WAIT (5-10 min for scrapers to complete)
        │
        ▼
4. READ FILE: grants/all_unified.csv
        │
        ▼
5. FILTER: Where status = "NEW" (not seen before)
        │
        ▼
6. READ FILE: companies.json
        │
        ▼
7. SPLIT IN BATCHES: Loop through each company
        │
        ▼
   ┌────────────────────────────────────────┐
   │  FOR EACH COMPANY:                     │
   │                                        │
   │  8. LOOP: For each NEW grant           │
   │          │                             │
   │          ▼                             │
   │  9. AI NODE (Claude/GPT)               │
   │     Prompt: "Is this grant relevant    │
   │     for {company.profile}?"            │
   │     Output: { relevant: true/false,    │
   │              score: 0-100,             │
   │              reason: "..." }           │
   │          │                             │
   │          ▼                             │
   │  10. IF relevant (score > 70):         │
   │          │                             │
   │          ▼                             │
   │  11. SLACK NODE (personalized)         │
   │      Channel: company.slack_channel    │
   │      Message: Custom for this company  │
   │                                        │
   │  12. EMAIL NODE (optional)             │
   │      To: company.email                 │
   │                                        │
   └────────────────────────────────────────┘
        │
        ▼
13. UPDATE CSV: Mark grants as "PROCESSED"
        │
        ▼
14. WRITE LOG: daily_report.json
```

---

### 4. **New Files Structure**

```
n8n_eu_grants/
├── scrapers/
│   ├── scraper_eu_portal.js
│   ├── scraper_horizon.js
│   ├── scraper_interreg.js
│   └── run_all_scrapers.js      # Orchestrator
├── data/
│   ├── grants/
│   │   ├── eu_portal_grants.csv
│   │   ├── horizon_grants.csv
│   │   └── all_unified.csv      # Master merged file
│   ├── companies.json           # Company profiles
│   └── processed_grants.json    # Track what's been sent
├── templates/
│   └── slack_message.hbs        # Personalized message template
└── logs/
    └── daily_runs/
```

---

### 5. **AI Prompt for Personalized Matching**

```
You are evaluating EU grant opportunities for a specific company.

COMPANY PROFILE:
- Name: {{company.name}}
- Country: {{company.country}}
- Sectors: {{company.sectors}}
- Keywords: {{company.keywords}}
- Size: {{company.company_size}}

GRANT OPPORTUNITY:
- Title: {{grant.title}}
- Programme: {{grant.programme}}
- Description: {{grant.description}}
- Deadline: {{grant.deadline}}
- Budget: {{grant.budget}}
- Eligibility: {{grant.eligibility}}

TASK: Rate relevance 0-100 and explain in 2 sentences why this is or isn't a good fit.

Response format:
{
  "score": <0-100>,
  "relevant": <true if score > 70>,
  "reason": "<2 sentence explanation>"
}
```

---

### 6. **Personalized Slack Message Template**

```
🇪🇺 *New Grant Match for {{company.name}}*

*{{grant.title}}*
📅 Deadline: {{grant.deadline}}
💰 Budget: {{grant.budget}}
🎯 Match Score: {{match.score}}/100

*Why this fits you:*
{{match.reason}}

🔗 <{{grant.url}}|View Full Call>

_Matched based on your profile: {{company.sectors}}_
```

---

## Implementation Steps

1. **Refactor scrapers** - Split scraper2.js into modular scrapers per source
2. **Create companies.json** - Start with Alicorn, add more clients
3. **Build run_all_scrapers.js** - Orchestrator that runs all scrapers and merges results
4. **Modify n8n workflow** - Add company loop and personalized AI analysis
5. **Add Slack user/channel routing** - Dynamic based on company profile
6. **Track processed grants** - Avoid duplicate notifications

---

## Questions to Decide

1. **How many grant sources** do you want to add initially?
2. **Notification preference** per company - Slack DM, channel, email, or all?
3. **Relevance threshold** - What score (e.g., 70/100) triggers a notification?
4. **Frequency** - Daily digest vs. instant notification per grant?
