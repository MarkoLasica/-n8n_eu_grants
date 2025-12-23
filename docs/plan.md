# Plan: Multi-Company EU Grants Daily Digest Workflow

## Goal
Build an n8n workflow that:
1. Scrapes new EU grants daily
2. Filters grants by each company's eligible programs
3. Uses AI to determine relevance per company
4. Creates a daily digest summary per company
5. Sends each company their personalized digest via Slack

---

## Research Summary: Available n8n Nodes

### Data Flow Nodes
| Node | Purpose | When to Use |
|------|---------|-------------|
| **Set (Edit Fields)** | Add/modify/rename fields | Simple transformations, visible data |
| **Code** | Custom JavaScript/Python | Complex logic, cross-joins, when Set isn't enough |
| **Filter** | Remove items that don't match | Single output, just filtering |
| **IF** | Split into 2 branches (true/false) | Binary decisions |
| **Switch** | Split into 3+ branches | Multi-value routing |
| **Loop Over Items** | Process items in batches | Rate limiting, sequential processing |
| **Aggregate** | Combine items into single list | Grouping by field, bundling for API |
| **Summarize** | Pivot-table style grouping | Count, sum, average by field |
| **Merge** | Combine data from branches | Join, append, cross-join |

### AI Nodes
| Node | Purpose | When to Use |
|------|---------|-------------|
| **Basic LLM Chain** | Simple prompt → response | One-off questions, no memory needed |
| **AI Agent** | Multi-step reasoning with tools | Complex decisions, tool usage, iteration |
| **Summarization Chain** | Summarize documents | Large text chunking, document processing |

### Key Insight: AI Agent vs Basic LLM
- **AI Agent**: Can loop, use tools, make decisions autonomously
- **Basic LLM Chain**: Simple prompt/response, faster, cheaper
- For your use case: Basic LLM Chain is sufficient for "is it for me?" checks

---

## Proposed Workflow Architecture

### Visual Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│ STAGE 1: DATA COLLECTION                                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Schedule Trigger] → [Run Scrapers] → [Read New Grants] → [Has Grants?]    │
│       7 AM                                   CSV              │              │
│                                                               ↓ NO           │
│                                                    [Slack: No grants today]  │
│                                                               ↓ YES          │
│                                                    [Extract from CSV]        │
│                                                               ↓              │
└───────────────────────────────────────────────────────────────┼──────────────┘
                                                                │
┌───────────────────────────────────────────────────────────────┼──────────────┐
│ STAGE 2: COMPANY DATA                                         ↓              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [📋 Companies Table]  ←──── Contains: id, name, slack_channel,              │
│         │                    eligible_programs, profile info                 │
│         │                                                                    │
│         └──→ Outputs: One item per company (Alicorn, Codepixel, etc.)       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                                                │
┌───────────────────────────────────────────────────────────────┼──────────────┐
│ STAGE 3: CROSS-JOIN (Grant × Company)                         ↓              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Loop Over Items: Companies] ←── For each company:                         │
│         │                                                                    │
│         ├──→ [Filter Grants by eligible_programs]                           │
│         │         │                                                          │
│         │         └──→ Only grants matching company's programs pass          │
│         │                                                                    │
│         ├──→ [Basic LLM: "Is it for me?"]                                   │
│         │         │                                                          │
│         │         └──→ Returns Yes/No + reason per grant                     │
│         │                                                                    │
│         ├──→ [IF: Relevant?]                                                │
│         │         │                                                          │
│         │         ├── YES → [Aggregate: Relevant Grants for Company]        │
│         │         │                                                          │
│         │         └── NO  → [Log to non_relevant.csv]                       │
│         │                                                                    │
│         └──→ [Loop continues to next company...]                            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                                                │
┌───────────────────────────────────────────────────────────────┼──────────────┐
│ STAGE 4: EXTRACT DETAILS (for relevant grants only)           ↓              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Basic LLM: Extract Information]                                           │
│         │                                                                    │
│         └──→ For each relevant grant, extract:                              │
│              - Summary                                                       │
│              - Total funding                                                 │
│              - Application type                                              │
│              - Partner requirements                                          │
│              - Co-financing                                                  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                                                │
┌───────────────────────────────────────────────────────────────┼──────────────┐
│ STAGE 5: CREATE DIGEST PER COMPANY                            ↓              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Summarize Node: Group by company_id]                                      │
│         │                                                                    │
│         └──→ Groups all relevant grants by company                          │
│                                                                              │
│  [Code/Set: Format Digest Message]                                          │
│         │                                                                    │
│         └──→ Creates formatted Slack message per company:                   │
│                                                                              │
│              "Daily EU Grants Digest for {company_name}                     │
│               Found {count} relevant grants:                                 │
│                                                                              │
│               1. {Title}                                                     │
│                  Summary: ...                                                │
│                  Funding: ...                                                │
│                  Link: ...                                                   │
│                                                                              │
│               2. {Title}                                                     │
│                  ..."                                                        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
                                                                │
┌───────────────────────────────────────────────────────────────┼──────────────┐
│ STAGE 6: SEND TO SLACK                                        ↓              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  [Slack: Send Message]                                                      │
│         │                                                                    │
│         └──→ Channel: {{ $json.slack_channel_id }}  (DYNAMIC!)              │
│              Message: {{ $json.digest_message }}                             │
│                                                                              │
│  Each company gets ONE message with ALL their relevant grants               │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Node-by-Node Implementation

### Stage 1: Data Collection

#### Node 1.1: Schedule Trigger
- **Type**: `scheduleTrigger`
- **Purpose**: Run workflow daily at 7 AM
- **Config**: `triggerAtHour: 7`

#### Node 1.2: Run_Scrapers
- **Type**: `executeCommand`
- **Purpose**: Execute all grant scrapers
- **Config**: `node scrapers/run_all_scrapers.js`

#### Node 1.3: Read_New_Grants
- **Type**: `code`
- **Purpose**: Read new_grants.csv, check if empty
- **Output**: `{ hasNewGrants: true/false, binary: csv_data }`

#### Node 1.4: Has_Grants?
- **Type**: `if`
- **Purpose**: Branch based on whether new grants exist
- **TRUE branch**: No grants → Send "no grants today" Slack
- **FALSE branch**: Grants exist → Continue processing

#### Node 1.5: Extract_Grants
- **Type**: `extractFromFile`
- **Purpose**: Parse CSV into JSON items
- **Output**: Array of grant objects

---

### Stage 2: Company Data

#### Node 2.1: 📋 COMPANIES_TABLE
- **Type**: `code`
- **Purpose**: Define company data as editable table
- **Why Code?**: Allows tabular data directly in n8n, easy to edit
- **Output**: One item per company

```javascript
const companies = [
  {
    id: 'alicorn',
    name: 'Alicorn',
    slack_channel_id: 'C09U22T1QDS',
    eligible_programs: ['Horizon Europe', 'Creative Europe', 'Digital Europe', 'Erasmus+'],
    description: '...',
    sectors: '...',
    keywords: '...'
  },
  {
    id: 'codepixel',
    name: 'Codepixel',
    slack_channel_id: 'C0A20RJQ98F',
    eligible_programs: ['Horizon Europe', 'Digital Europe', 'Interreg', 'COSME'],
    // ...
  }
];
return companies.map(c => ({ json: c }));
```

---

### Stage 3: Cross-Join and Filtering

#### Option A: Loop Over Items (Recommended for clarity)

#### Node 3.1: Loop_Over_Companies
- **Type**: `splitInBatches`
- **Purpose**: Process one company at a time
- **Config**: Batch size = 1
- **Why**: Clear flow, easy debugging, prevents rate limiting

#### Node 3.2: Filter_By_Program
- **Type**: `code` or `filter`
- **Purpose**: Filter grants to only those matching company's eligible_programs
- **Logic**:
  ```javascript
  const company = $('Loop_Over_Companies').item.json;
  const grants = $('Extract_Grants').all();
  const eligiblePrograms = company.eligible_programs;

  return grants.filter(grant => {
    const source = grant.json.Source; // e.g., "horizon_europe"
    return eligiblePrograms.some(prog =>
      source.toLowerCase().includes(prog.toLowerCase().replace(' ', '_'))
    );
  });
  ```

#### Node 3.3: Is_It_For_Me (LLM)
- **Type**: `@n8n/n8n-nodes-langchain.openAi` (Basic LLM)
- **Purpose**: Ask LLM if grant is relevant for THIS company
- **Prompt**: Include company profile + grant description
- **Output**: "Yes - reason" or "No"

#### Node 3.4: IF_Relevant
- **Type**: `if`
- **Purpose**: Split relevant vs non-relevant
- **Condition**: `output contains "Yes"`

#### Node 3.5: Log_Non_Relevant
- **Type**: `code`
- **Purpose**: Append to non_relevant.csv
- **On**: FALSE branch of IF_Relevant

---

### Stage 4: Extract Details

#### Node 4.1: Extract_Grant_Details (LLM)
- **Type**: `@n8n/n8n-nodes-langchain.openAi`
- **Purpose**: Extract structured information from grant
- **On**: TRUE branch of IF_Relevant
- **Output**: JSON with summary, funding, partners, etc.

#### Node 4.2: Format_Grant_Item
- **Type**: `set` or `code`
- **Purpose**: Combine grant info + company info + extracted details
- **Output**: Flat object with all data needed for digest

---

### Stage 5: Create Digest

#### Node 5.1: Aggregate_By_Company
- **Type**: `aggregate` or `summarize`
- **Purpose**: Group all relevant grants by company_id
- **Config**:
  - Aggregate mode: "All Item Data"
  - Group by: `company_id`
- **Output**: One item per company, with array of their grants

#### Node 5.2: Create_Digest_Message
- **Type**: `code`
- **Purpose**: Format the digest message for Slack
- **Logic**:
  ```javascript
  const company = $json.company_name;
  const grants = $json.grants; // array from aggregation

  let message = `📬 *Daily EU Grants Digest for ${company}*\n\n`;
  message += `Found *${grants.length}* relevant grant(s) today:\n\n`;

  grants.forEach((grant, i) => {
    message += `*${i+1}. ${grant.title}*\n`;
    message += `📝 ${grant.summary}\n`;
    message += `💰 Funding: ${grant.total_funding}\n`;
    message += `🔗 ${grant.link}\n\n`;
  });

  return { json: { ...item.json, digest_message: message } };
  ```

---

### Stage 6: Send to Slack

#### Node 6.1: Send_Digest_To_Slack
- **Type**: `slack`
- **Purpose**: Send ONE message per company with their digest
- **Config**:
  - Channel: `={{ $json.slack_channel_id }}` (DYNAMIC!)
  - Message: `={{ $json.digest_message }}`

---

## Alternative Architecture: Without Loop Node

If you want to avoid the Loop node, you can use a Code node for the cross-join:

```
Extract_Grants → Code: Cross-Join → LLM: Is Relevant? → IF → ...
                    ↑
    Companies_Table─┘
```

The Code node would create `grants × companies` combinations, then the rest of the workflow processes all items in parallel.

**Trade-off**:
- Loop approach: Clearer, easier to debug, per-company processing
- Cross-join approach: Faster (parallel), but harder to track per-company

---

## Key Decisions to Make

1. **Companies Data Storage**:
   - Option A: Code node with inline data (current approach) ✓
   - Option B: Google Sheets (external, easily editable)
   - Option C: JSON file (hidden from n8n UI)

2. **AI Agent vs Basic LLM**:
   - Recommendation: **Basic LLM Chain** for "is it for me?" (simpler, cheaper)
   - AI Agent would be overkill for this deterministic task

3. **Program Filtering**:
   - Pre-filter by `eligible_programs` BEFORE calling LLM (saves API costs)
   - This is a simple string match, no AI needed

4. **Digest Format**:
   - One message per company with all their grants (digest) ✓
   - vs. One message per grant per company (spam)

---

## Sources

- [n8n AI Agentic Workflows Guide](https://blog.n8n.io/ai-agentic-workflows/)
- [Loop Over Items Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/)
- [Aggregate Node Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.aggregate/)
- [Summarize Node Documentation](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.summarize/)
- [Filter vs IF vs Switch Nodes](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.filter/)
- [Basic LLM Chain vs AI Agent](https://docs.n8n.io/advanced-ai/examples/agent-chain-comparison/)
- [Daily Digest Workflow Templates](https://n8n.io/workflows/4709-daily-news-digest-summarize-rss-feeds-with-openai-and-deliver-to-whatsapp/)

---

## Scraper Page Structure Analysis (2025-12-16)

### Background
The EU Funding & Tenders Portal updated their page structure. We analyzed both old and new page types to verify scraper compatibility.

### Page Types Identified

| Type | URL Pattern | Example |
|------|-------------|---------|
| **OLD** | `/competitive-calls-cs/{id}` | Cascade funding calls (ARISE, etc.) |
| **NEW** | `/topic-details/{topic_id}` | Standard topic pages (JUST-2026-JTRA, etc.) |

### Structure Comparison

**OLD Page Sections:**
- General Information
- Submission & evaluation process
- Further information
- Task description

**NEW Page Sections:**
- General information
- Topic description
- Topic updates
- Conditions and documents
- Budget overview
- Partner search announcements
- Topic Q&As
- Get support

### Test Results (2025-12-16)

| Test | OLD Page | NEW Page |
|------|----------|----------|
| CSS Selector `.col-md-9.col-xxl-10` | WORKS | WORKS |
| Content extracted | 7171 chars | 7263 chars |
| Contains "General Information" | YES | YES |
| Contains deadline info | YES | YES |
| Contains budget info | YES | YES |

### Conclusion

**Current scrapers work correctly on both page types.** No immediate updates required.

The CSS selector `.col-md-9.col-xxl-10` successfully extracts content from both page structures.

### Future Enhancement Opportunities

1. **Structured field extraction** - Extract specific fields (budget, deadline, eligibility) separately
2. **Budget overview parsing** - New pages have dedicated budget section
3. **Partner search integration** - New pages show partner search announcements
4. **Q&A section** - Could extract topic-specific Q&As for better context

### Test Scripts Created

- `scrapers/diagnose_page_structure.js` - Analyzes page DOM structure
- `scrapers/test_detail_pages.js` - End-to-end detail page scraping test
