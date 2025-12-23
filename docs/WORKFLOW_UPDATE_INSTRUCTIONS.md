# Workflow Update Instructions

**Date:** 2025-12-18  
**Status:** Pending  
**Workflow:** N8N_EU_Grants_MultiCompany18.json

---

## Context

We updated the v2 scrapers to capture more data:
- **Description** - Now captures full Expected Outcome + Scope sections (4,000-7,600 chars)
- **Full_Content** - Entire page content (2000 words)
- **New v2 fields** - Programme, Opening_Date, Deadline_Date, Budget_Amount, Budget_Currency, Type_of_Action

The workflow nodes need to be updated to pass these new fields through the data flow.

---

## Changes Completed ✅

1. **Scraper Description field** - Removed character limits, now captures full content
2. **Extract Information prompt** - Updated to use Full_Content and added mismatch check

---

## Changes Needed

### 1. "Load Companies and Combine" Node

**Location:** Around line 45-60 in the JavaScript code

**Current code:**
```javascript
grant: {
  Title: grantItem.json.Title,
  Link: grantItem.json.Link,
  Date: grantItem.json.Date,
  Description: grantItem.json.Description,
  Source: grantSource
}
```

**Replace with:**
```javascript
grant: {
  Title: grantItem.json.Title,
  Link: grantItem.json.Link,
  Date: grantItem.json.Date,
  Description: grantItem.json.Description,
  Source: grantSource,
  // NEW V2 FIELDS:
  Programme: grantItem.json.Programme || '',
  Opening_Date: grantItem.json.Opening_Date || '',
  Deadline_Date: grantItem.json.Deadline_Date || '',
  Budget_Amount: grantItem.json.Budget_Amount || '',
  Budget_Currency: grantItem.json.Budget_Currency || 'EUR',
  Type_of_Action: grantItem.json.Type_of_Action || '',
  Full_Content: grantItem.json.Full_Content || ''
}
```

---

### 2. "To JSON" Node

**Change A:** Add `mismatch` field from AI response

Find this section:
```javascript
co_financing_required: extracted.co_financing_required || 'Not specified',
```

Add after it:
```javascript
co_financing_required: extracted.co_financing_required || 'Not specified',
mismatch: extracted.mismatch || '',  // ← ADD THIS LINE
```

**Change B:** Add new grant fields

Find this section:
```javascript
// Grant info from the grant object
title: grantData?.Title || 'No title',
link: grantData?.Link || 'No link',
date: grantData?.Date || 'No date',
source: grantData?.Source || 'Unknown',
```

Add after `source`:
```javascript
source: grantData?.Source || 'Unknown',
// NEW V2 FIELDS:
programme: grantData?.Programme || '',
opening_date: grantData?.Opening_Date || '',
deadline_date: grantData?.Deadline_Date || '',
budget_amount: grantData?.Budget_Amount || '',
budget_currency: grantData?.Budget_Currency || 'EUR',
```

---

### 3. "Aggregate By Company" Node

Find this section:
```javascript
companiesMap[companyId].grants.push({
  title: item.json.title,
  link: item.json.link,
  date: item.json.date,
  source: item.json.source,
  summary: item.json.summary,
  total_funding_available: item.json.total_funding_available,
  application_type: item.json.application_type,
  partner_types: item.json.partner_types,
  partner_origins: item.json.partner_origins,
  co_financing_required: item.json.co_financing_required
});
```

Replace with:
```javascript
companiesMap[companyId].grants.push({
  title: item.json.title,
  link: item.json.link,
  date: item.json.date,
  source: item.json.source,
  summary: item.json.summary,
  total_funding_available: item.json.total_funding_available,
  application_type: item.json.application_type,
  partner_types: item.json.partner_types,
  partner_origins: item.json.partner_origins,
  co_financing_required: item.json.co_financing_required,
  // NEW FIELDS:
  mismatch: item.json.mismatch,
  programme: item.json.programme,
  opening_date: item.json.opening_date,
  deadline_date: item.json.deadline_date,
  budget_amount: item.json.budget_amount,
  budget_currency: item.json.budget_currency
});
```

---

### 4. "Personalized Message" Node (OPTIONAL)

If you want to show the new fields in Slack messages, update the message template.

**Current fields shown:**
- Summary, Funding, Application, Partners, Origins, Co-financing, Opening date, Link

**Suggested additions:**
```
📋 *Programme:* ${g.programme}
💰 *Budget:* ${g.budget_amount} ${g.budget_currency}
📅 *Deadline:* ${g.deadline_date}
${g.mismatch ? `⚠️ *Mismatch:* ${g.mismatch}` : ''}
```

---

## Testing After Changes

1. Run the v2 scraper to generate test data:
   ```bash
   node scrapers_v2/run_all_scrapers_v2.js
   ```

2. Manually trigger the workflow in n8n

3. Check that:
   - Full_Content is being passed to Extract Information
   - New fields appear in the Slack messages
   - Mismatch field shows when data doesn't match

---

## Files Modified in This Session

- `scrapers_v2/base_scraper_v2.js` - Removed Description limits, improved DOM extraction
- `scrapers_v2/test_horizon_v2.js` - Updated test output format
- `scrapers_v2/debug_description.js` - Created (can be deleted)

---

## CSV Column Order (v2 format)

For reference, the 16 columns in order:
1. Title
2. Link
3. Date
4. Source
5. URL_Type
6. Programme
7. Opening_Date
8. Deadline_Date
9. Deadline_Model
10. Status
11. Budget_Amount
12. Budget_Currency
13. Budget_Year
14. Type_of_Action
15. Description
16. Full_Content

