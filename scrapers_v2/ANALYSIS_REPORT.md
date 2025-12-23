# Grant Structure Analysis Report

**Date:** 2025-12-16
**Grants Analyzed:** 60 (15 per source)
**Sources:** Horizon Europe, Digital Europe, Creative Europe, Erasmus+

---

## Executive Summary

We discovered **TWO distinct page structures** on the EU Funding Portal:

| Page Type | URL Pattern | Budget Table | Structured Data | Count |
|-----------|-------------|--------------|-----------------|-------|
| **NEW** (topic-details) | `/topic-details/TOPIC-ID` | YES | Rich | 46/60 (77%) |
| **OLD** (competitive-calls) | `/competitive-calls-cs/ID` | NO | Limited | 14/60 (23%) |

**Budget Extraction Success:**
- topic-details pages: **100%** success
- competitive-calls-cs pages: **0%** success (no budget table exists)

---

## Per-Source Breakdown

| Source | Total | topic-details | competitive-calls | Budget Found |
|--------|-------|---------------|-------------------|--------------|
| **Horizon Europe** | 15 | 12 (80%) | 3 (20%) | 12/15 (80%) |
| **Digital Europe** | 15 | 4 (27%) | 11 (73%) | 4/15 (27%) |
| **Creative Europe** | 15 | 15 (100%) | 0 (0%) | 15/15 (100%) |
| **Erasmus+** | 15 | 15 (100%) | 0 (0%) | 15/15 (100%) |

**Critical Finding:** Digital Europe has mostly `competitive-calls-cs` pages (cascade funding calls), which lack structured budget tables.

---

## Page Structure Comparison

### NEW Structure (topic-details)

**Sections found:**
- General information (Programme, Call, Type of action, Deadline model, Opening date, Deadline date, Status)
- Topic description
- Expected Outcome
- Scope
- Budget overview (TABLE with amounts)
- Conditions and documents
- Partner search announcements

**Data extractable:**
- ✅ Programme name
- ✅ Opening date
- ✅ Deadline date
- ✅ Deadline model (single-stage, two-stage)
- ✅ Type of action
- ✅ Status
- ✅ Budget amount (from table)
- ✅ Budget year
- ✅ Expected outcome
- ✅ Scope
- ✅ Eligible countries

### OLD Structure (competitive-calls-cs)

**Sections found:**
- General Information
- Submission & evaluation process
- Call Timeline
- Evaluation Criteria
- Further information
- Task description

**Data extractable:**
- ✅ Opening date
- ✅ Deadline date (sometimes)
- ✅ Deadline model
- ✅ Status
- ❌ Budget (NO TABLE - only mentioned in text, if at all)
- ❌ Programme name (not in structured format)
- ⚠️ Description (in "Task description" section, different format)

---

## Sample Extracted Data

### Example 1: topic-details (MSCA COFUND 2026)

```json
{
  "url_type": "topic-details",
  "general_info": {
    "programme": "Horizon Europe (HORIZON)",
    "type_of_action": "HORIZON-TMA-MSCA-Cofund-D HORIZON TMA MSCA Cofund Doctoral programme",
    "deadline_model": "single-stage",
    "opening_date": "16 December 2025",
    "deadline_date": "08 April 2026",
    "status": "Open For Submission"
  },
  "budget": {
    "found": true,
    "amount": "105457362",
    "currency": "EUR",
    "year": "2026"
  }
}
```

### Example 2: competitive-calls-cs (ERDERA Joint Call)

```json
{
  "url_type": "competitive-calls-cs",
  "general_info": {
    "programme": null,
    "type_of_action": null,
    "deadline_model": "multiple",
    "opening_date": "11 December 2025",
    "deadline_date": null,
    "status": "Open For Submission"
  },
  "budget": {
    "found": false,
    "amount": null
  }
}
```

---

## Recommendations for v2 Scraper

### 1. Handle Both Page Types

The v2 scraper must detect the page type and use appropriate extraction logic:

```javascript
if (url.includes('topic-details')) {
  // Use topic-details extraction (budget table, structured sections)
} else if (url.includes('competitive-calls-cs')) {
  // Use competitive-calls extraction (different sections, no budget table)
}
```

### 2. Extract These Fields Directly (when available)

| Field | topic-details | competitive-calls-cs |
|-------|---------------|---------------------|
| `programme` | ✅ Extract | ⚠️ From URL/context |
| `opening_date` | ✅ Extract | ✅ Extract |
| `deadline_date` | ✅ Extract | ✅ Extract |
| `deadline_model` | ✅ Extract | ✅ Extract |
| `status` | ✅ Extract | ✅ Extract |
| `type_of_action` | ✅ Extract | ❌ N/A |
| `budget_amount` | ✅ From table | ❌ Not available |
| `budget_year` | ✅ From table | ❌ N/A |
| `expected_outcome` | ✅ Extract | ❌ Different format |
| `scope` | ✅ Extract | ❌ Different format |
| `description` | Topic description | Task description |

### 3. Keep Description Field for LLM

Even with structured extraction, keep a `description` field containing:
- **topic-details:** Topic description + Expected Outcome + Scope
- **competitive-calls-cs:** Task description + Further information

The LLM node can still extract:
- Summary (always)
- Partner requirements (from description)
- Application type (individual vs partnership)
- Co-financing (if mentioned)

### 4. New CSV Format

```csv
"Title","Link","Date","Source","URL_Type","Programme","Opening_Date","Deadline_Date","Deadline_Model","Status","Budget_Amount","Budget_Currency","Budget_Year","Description"
```

---

## Next Steps

1. ✅ Analysis complete
2. ⏳ Design v2 base scraper with dual-mode extraction
3. ⏳ Implement v2 scrapers for all 4 sources
4. ⏳ Test v2 scrapers
5. ⏳ Update n8n workflow to use new CSV format
6. ⏳ Simplify LLM extraction node
7. ⏳ Test full pipeline
