# Plan: Multi-Company n8n Workflow with Daily Digest

**Created**: 2025-12-09
**Status**: PAUSED - Rethinking Architecture
**Last Updated**: 2025-12-09

---

## Overview

Enhance the n8n workflow to:
1. Handle multiple companies with separate Slack channels
2. Send **daily digest** (batched summary) instead of individual notifications
3. Fix dynamic Slack channel routing (currently hardcoded)

---

## IMPORTANT: Session Summary (2025-12-09)

### What was completed:
1. **companies.json updated** with 9 companies (Alicorn + 8 from surveys)
2. **Safety measure**: Email field renamed to `email_DISABLED` to prevent accidental emails during testing
3. **Slack channel created**: `n8n_testiranje_codepixel` (ID: `C0A20RJQ98F`) for Codepixel testing
4. **Workflow saved**: `N8N_EU_Grants_MultiCompany9.json` contains partial work on Code-based aggregation approach

### What didn't work (Code-based approach):
- Created `Aggregate_By_Company` Code node to group grants by company
- Had issues with n8n Code node not producing output when connected
- The approach used too much hidden logic in Code nodes
- Hard to debug, hard to visualize data flow

### Why we stopped:
The user correctly identified that the Code-heavy approach goes against n8n's philosophy:
- n8n is meant for visual drag-and-drop data flow
- Hidden JSON files (`companies.json`) are not visible in n8n
- Code nodes with complex loops are hard to debug
- No visual connection between grants and companies

---

## NEW APPROACH TO TRY (Next Session)

### Core Principle:
**Use native n8n nodes instead of Code nodes wherever possible.**

### Ideas to explore:

1. **Replace companies.json with n8n Table/Set node**
   - Company data visible and editable directly in n8n
   - Can drag-and-drop fields between nodes

2. **Use native n8n nodes for data manipulation**
   - `Merge` node for combining grants × companies
   - `IF` / `Switch` node for filtering by eligible_programs
   - `Split Out` / `Loop` for iterating
   - `Aggregate` node (if available) for grouping

3. **Consider per-company filtering BEFORE LLM**
   - Each company has `eligible_programs` (e.g., Horizon Europe, Digital Europe)
   - Filter grants by programme before sending to LLM
   - Saves LLM calls and money

4. **Possibly use Sub-workflows**
   - n8n has "Call n8n Workflow Tool" option
   - Could have a reusable "Check Relevance for Company" sub-workflow

### Questions to answer next session:
- What n8n nodes exist for aggregating/grouping data?
- Can we use a Google Sheet or n8n Table instead of companies.json?
- How to visually route different grants to different companies?

---

## Current Files State

| File | Status |
|------|--------|
| `data/companies.json` | Updated with 9 companies, emails DISABLED |
| `workflows/N8N_EU_Grants_MultiCompany8.json` | Working workflow (before digest changes) |
| `workflows/N8N_EU_Grants_MultiCompany9.json` | Paused work with Aggregate_By_Company node |

### Companies in companies.json:

| ID | Company | Slack Channel | Status |
|----|---------|---------------|--------|
| alicorn | Alicorn | C09U22T1QDS | Ready |
| codepixel | Codepixel | C0A20RJQ98F | Ready |
| coinis | Coinis | PLACEHOLDER | Needs channel |
| bild-studio | Bild Studio | PLACEHOLDER | Needs channel |
| payten | Payten | PLACEHOLDER | Needs channel |
| datadesign | Data Design | PLACEHOLDER | Needs channel |
| ictcortex | ICT Cortex | PLACEHOLDER | Needs channel |
| firstline | First Line Software | PLACEHOLDER | Needs channel |
| pannonegtc | Pannone GTC | PLACEHOLDER | Needs channel |

---

## Workflow Flow (Current - MultiCompany8)

```
Schedule Trigger (7 AM)
    ↓
Grant_Scrapers (runs all 4 scrapers)
    ↓
Read_New_Grants (reads new_grants.csv)
    ↓
New_Grants_Empty? ──TRUE──→ No_Grants_Today (hardcoded to Alicorn)
    ↓ FALSE
Extract_New_Grants
    ↓
Load_Companies_And_Combine (creates grant × company pairs)
    ↓
"Is it for me?" (LLM relevance check)
    ↓
IF ──FALSE──→ Non_Relevant_CSV
    ↓ TRUE
Extract Information (LLM extracts details)
    ↓
To_JSON
    ↓
Send_Personalized_Message (HARDCODED to Alicorn channel!)
```

### Known Issues:
1. `Send_Personalized_Message` is hardcoded to Alicorn's channel
2. Sends individual messages, not daily digest
3. No filtering by `eligible_programs` before LLM
4. `No_Grants_Today` only notifies Alicorn

---

## Testing Done Today

- Ran full workflow with 10 test grants
- 10 grants × 9 companies = 90 items to "Is it for me?"
- 12 passed as relevant
- Error at "Extract Information" node: `Paired item data unavailable`
- This error is related to n8n item tracking in Code nodes

---

## Next Session TODO

1. Load `N8N_EU_Grants_MultiCompany9.json` into n8n
2. Explore native n8n nodes:
   - Look for Table/Data input nodes
   - Look for Aggregate/Group nodes
   - Look for Merge/Combine nodes
3. Design new visual approach:
   - Company data in n8n (not hidden JSON)
   - Programme filtering before LLM
   - Native grouping instead of Code node
4. Test with Alicorn + Codepixel (2 companies)

---

## Progress Log

| Date | Step | Status | Notes |
|------|------|--------|-------|
| 2025-12-09 | Plan created | ✅ | Initial plan documented |
| 2025-12-09 | Step 1 complete | ✅ | Added 8 companies from surveys to companies.json |
| 2025-12-09 | Safety measures | ✅ | Renamed email to email_DISABLED |
| 2025-12-09 | Codepixel channel | ✅ | Created n8n_testiranje_codepixel (C0A20RJQ98F) |
| 2025-12-09 | Code approach | ❌ | Aggregate_By_Company had issues, approach too complex |
| 2025-12-09 | Paused | ⏸️ | Saved as MultiCompany9.json, rethinking architecture |
