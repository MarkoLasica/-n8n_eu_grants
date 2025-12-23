# 🎯 N8N EU GRANTS - PROJECT ANALYSIS & ROADMAP

**Datum analize**: 24. Novembar 2025  
**Status projekta**: MVP Faza 1 - U razvoju  
**Analizirao**: AI Assistant + Tim Alicorn

---

## 📋 SADRŽAJ

1. [Kontekst i Cilj Projekta](#kontekst-i-cilj-projekta)
2. [Trenutno Stanje Projekta](#trenutno-stanje-projekta)
3. [Arhitektura Sistema](#arhitektura-sistema)
4. [Kritični Problemi](#kritični-problemi)
5. [Gap Analysis](#gap-analysis)
6. [Akcioni Plan - Prioriteti](#akcioni-plan---prioriteti)
7. [Tehnički Saveti](#tehnički-saveti)
8. [Roadmap za Fazu 2](#roadmap-za-fazu-2)
9. [Pitanja za Razmatranje](#pitanja-za-razmatranje)

---

## 1. KONTEKST I CILJ PROJEKTA

### 🎯 FAZA 1 - MVP (Trenutni Cilj)

Implementacija automatizovanog sistema za praćenje i filtriranje EU grant poziva sa sledećim koracima:

1. **Daily Scraping** (svakog jutra u 07:00)
   - Scrape-ovanje jednog target websajta za EU grant pozive
   - Ekstrakcija relevantnih podataka o pozivima

2. **Data Storage**
   - Čuvanje scrape-ovanih podataka u CSV fajl
   - Struktura: svi grant pozivi sa svim relevantnim podacima

3. **Filtriranje Novih Poziva**
   - Identifikacija novih grant poziva koji su dodati od poslednjeg scrape-a
   - Poređenje sa prethodnim CSV verzijama

4. **AI Analiza Relevantnosti**
   - Input za OpenAI: Opis firme (Alicorn) + Detalji specifičnog grant poziva
   - LLM odlučuje: Da li je ovaj grant relevantan za ovu firmu?

5. **Notifikacija**
   - Ako je grant relevantan → šalje se obaveštenje na Slack kanal
   - Poruka treba da sadrži ključne informacije o grantu

### 🚀 FAZA 2 - Skaliranje (Budućnost)

Planirani razvoj:
- **~10 različitih websajta** za scraping
- **10+ opisa različitih firmi** (različiti klijenti)
- **Glavni AI Agent** koji:
  - Koordinira LLM pozive za svakog klijenta posebno
  - Šalje personalizovane poruke
  - Svaki klijent ima poseban Slack kanal
  - Matching logika: Grant × Klijent = Relevantnost

### 📊 Client Profil - Alicorn

```
We are a marketing agency and software development company from Montenegro 
working in marketing services, software development, AI development, and 
video game development.

We have 2 startups:
1. One making educational video games and apps for HR, compliance, and SDG.
2. Another creating AI products based on machine learning and large language 
   models in the domain name industry.
```

---

## 2. TRENUTNO STANJE PROJEKTA

### ✅ ŠTA JE IMPLEMENTIRANO

#### A) Scraper (`scraper2.js`)

**Status**: ✅ FUNKCIONALAN

**Tehnologija**: 
- Puppeteer (headless: false - visible mode)
- Node.js
- Cheerio za parsing

**Target URL**: 
```
https://ec.europa.eu/info/funding-tenders/opportunities/portal/screen/opportunities/calls-for-proposals
```

**Funkcionalnosti**:
- ✅ Scraping sa automatskom paginacijom
- ✅ Ekstrakcija: Title, Link, Date
- ✅ Detaljan scraping (ulazi u svaki grant link i uzima description)
- ✅ Limit na 1000 reči za description
- ✅ **Duplikat detekcija**: Proverava `grants2.csv` i skip-uje postojeće grant-ove
- ✅ Error handling sa timeout protection (15 min po grantu)
- ✅ Normalizacija naslova (unicode karakteri, quotes, spaces)
- ✅ Alternative navigation metode (ako paginacija fail-uje)
- ✅ Recovery mehanizmi

**Output fajlovi**:
1. `grants2.csv` - Master lista svih grant-ova (incremental append)
2. `allgrants.csv` - Master lista (incremental append, DUPLIKAT)
3. `scraper_finished.txt` - Marker fajl sa timestamp-om

**Trenutni podaci**: ~327 grant-ova prikupljeno

#### B) n8n Workflow (`N8N_EU_Grants (7).json`)

**Status**: ✅ FUNKCIONALAN (ali sa kritičnim problemima)

**Node struktura** (11 node-ova):

1. **Schedule Trigger** (n8n-nodes-base.scheduleTrigger)
   - Pokreće svaki dan u 07:00 (triggerAtHour: 7)

2. **Read CSV Before** (n8n-nodes-base.code)
   - Čita `allgrants.csv` PRE scraping-a
   - Kreira binary snapshot

3. **Extract from before** (n8n-nodes-base.extractFromFile)
   - Parsira stari CSV u JSON format
   - headerRow: true

4. **Execute Command** (n8n-nodes-base.executeCommand)
   - Komanda: `cd C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants && node scraper2.js`
   - ⚠️ NE ČEKA završetak scraper-a!

5. **Code in JavaScript** (n8n-nodes-base.code)
   - Učitava novi `allgrants.csv` POSLE scraping-a

6. **Extract from File** (n8n-nodes-base.extractFromFile)
   - Parsira novi CSV

7. **Filter NEW** (n8n-nodes-base.code)
   - JavaScript: Poredi before vs after
   - Filtrira SAMO nove grant-ove (koji nisu bili u before set-u)

8. **Company_profile** (n8n-nodes-base.set)
   - Hardcoded opis firme Alicorn

9. **Message a model** (@n8n/n8n-nodes-langchain.openAi)
   - Model: GPT-4o-mini
   - Prompt: Analiza relevantnosti granta
   - Output: "Yes" ili "No"

10. **If** (n8n-nodes-base.if)
    - Condition: Output contains "Yes"

11. **Send a message** (n8n-nodes-base.slack)
    - Šalje na Slack kanal (Channel ID: C09U22T1QDS)
    - Plain text format

**Neaktivni node-ovi**:
- **Delete a message** (node ID: 975ba800) - ❓ Nepovezan, verovatno test node

**Credentials**:
- OpenAI API (ID: 5eZOWb3xv1wrY3rP)
- Slack API (ID: OPl2oluzAL1pxsas)

**Status**: `"active": false` (workflow je trenutno ISKLJUČEN)

---

## 3. ARHITEKTURA SISTEMA

### 📊 Data Flow Dijagram

```
┌─────────────────────────────────────────────────────────────┐
│                    SCHEDULE TRIGGER (07:00)                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              READ CURRENT allgrants.csv (BEFORE)             │
│                    Extract to JSON Array                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           EXECUTE SCRAPER (node scraper2.js)                 │
│              ⚠️ Async - ne čeka završetak!                  │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│              READ UPDATED allgrants.csv (AFTER)              │
│                    Extract to JSON Array                     │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│            FILTER NEW GRANTS (Compare Before/After)          │
│              newGrants = after - before                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                  FOR EACH NEW GRANT
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│           ATTACH COMPANY PROFILE (Alicorn desc.)             │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│        AI ANALYSIS (GPT-4o-mini)                             │
│        Prompt: "Is this grant relevant?"                     │
│        Output: "Yes" or "No"                                 │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                IF Output contains "Yes"                      │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼ (TRUE)
┌─────────────────────────────────────────────────────────────┐
│           SEND SLACK MESSAGE (Relevant Grant Found!)         │
│           Channel: C09U22T1QDS                               │
└─────────────────────────────────────────────────────────────┘
```

### 🗂️ File Structure

```
n8n_eu_grants/
├── scraper2.js              # Puppeteer scraper
├── package.json             # Node dependencies
├── package-lock.json
├── requirements.txt         # Python deps (NEKORIŠĆENO - legacy)
├── N8N_EU_Grants (7).json  # n8n workflow definition
├── allgrants.csv           # Master CSV (326 grants)
├── grants2.csv             # Duplicate CSV (326 grants) ❌
├── scraper_finished.txt    # Completion marker (timestamp)
├── node_modules/           # npm packages
└── venv/                   # Python venv (NEKORIŠĆENO - legacy)
```

---

## 4. KRITIČNI PROBLEMI

### 🔴 PROBLEM #1: Race Condition - Konkurentnost

**Što se dešava**:
1. Workflow **prvo** čita `allgrants.csv` (staro stanje)
2. **Zatim** pokreće scraper koji **APPEND-uje** u isti `allgrants.csv`
3. **Problem**: Workflow NE ČEKA da scraper završi!

**Skenario kvara**:
```
07:00:00 - Workflow startuje
07:00:01 - Čita allgrants.csv (100 redova) → "BEFORE" snapshot
07:00:02 - Scraper startuje (Execute Command)
07:00:03 - Workflow nastavlja ODMAH (ne čeka scraper!)
07:00:04 - Čita allgrants.csv (100 redova) → "AFTER" snapshot
07:00:05 - Filter NEW: 100 - 100 = 0 novih grant-ova ❌

... 10 minuta kasnije...
07:10:00 - Scraper završi, doda 5 novih grant-ova (sada 105 redova)
```

**Rezultat**: Workflow misli da nema novih grant-ova, jer čita CSV PRE nego što scraper dopiše podatke!

**Root Cause**: `Execute Command` node je **asinhron** - ne blokira izvršavanje workflow-a.

---

### 🔴 PROBLEM #2: Scraper Timing - Dugo Trajanje

**Faktori**:
- 100 grant-ova na stranici
- Svaki grant: Open page (2-5s) + Scrape description + Close page
- Timeout: 15 minuta po grantu (worst case)
- **Ukupno vreme**: 3 min (best case) do **25 sati** (worst case)

**Problem**: n8n workflow pretpostavlja da scraper završava brzo, ali to nije realno.

---

### 🔴 PROBLEM #3: Duplicate CSV Files

**Trenutno stanje**:
```javascript
// scraper2.js (linija 264-269)
fs.appendFileSync('grants2.csv', csvContent, 'utf8');   // Fajl #1
fs.appendFileSync('allgrants.csv', csvContent, 'utf8'); // Fajl #2 (identičan sadržaj)
```

**Problem**: 
- Oba fajla dobijaju **identične podatke**
- Duplo storage, dupli I/O
- Confusion: Koji fajl je "source of truth"?

**Workflow koristi**: `allgrants.csv`  
**Scraper proverava duplikate u**: `grants2.csv`

**Rešenje**: Konsoliduj na JEDAN master CSV.

---

### 🟡 PROBLEM #4: AI Prompt je Slab

**Trenutni prompt**:
```
Company information: {{ $json.Alicorn }}

Below is the grant information:
Title: {{ Title }}
Link: {{ Link }}
Date: {{ Date }}
Description: {{ Description }}

Based on the above information, answer only "Yes" if this opportunity is 
relevant for us (including grants, tenders, investment calls, partnerships, 
or other business opportunities).

Answer "No" if it is not relevant.

Also, if this is just a news article or an announcement that does not 
contain any actionable opportunity (such as a call, funding offer, or 
partnership invitation), answer "No".
```

**Problemi**:
1. ❌ **Nestrukturisan output**: AI može vratiti "Yes, this is relevant because..." umesto samo "Yes"
2. ❌ **Nema reasoning**: Ne vidiš ZAŠTO je AI odlučio
3. ❌ **Nema confidence score**: Koliko je AI siguran?
4. ❌ **Binary decision**: Nema "Maybe" opcije
5. ❌ **Parsing issues**: `contains "Yes"` može uhvatiti false positives

---

### 🟡 PROBLEM #5: Slack Formatting - Plain Text

**Trenutna poruka**:
```
Title: {{ Title }}
Link: {{ Link }}
date: {{ Date }}
Description: {{ Description }}
```

**Problemi**:
- Plain text, bez formatiranja
- Ne koristi Slack Block Kit (moderne UI komponente)
- Nema clickable button
- Nema color coding ili visual hierarchy
- Description može biti OGROMAN (1000 reči)

---

### 🟡 PROBLEM #6: Hardcoded Paths

**U scraper-u** (`scraper2.js`):
```javascript
'C:\\Users\\Korisnik\\Desktop\\Alicorn\\n8n_eu_grants\\grants2.csv'
```

**U workflow-u**:
```
cd C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants && node scraper2.js
```

**Problem**: Nije portable. Ako prebaciš projekat na drugi računar ili deploy-uješ na server, MORA da bude ista putanja.

**Rešenje**: Environment variables ili relative paths.

---

### 🟡 PROBLEM #7: Nema Logging & Monitoring

**Što nedostaje**:
- ❌ Koliko grant-ova je scraped?
- ❌ Koliko novih grant-ova je pronađeno?
- ❌ Koliko je AI označio kao relevantno?
- ❌ Koliko vremena je scraper trajao?
- ❌ Da li je bilo error-a?
- ❌ Slack notifikacija u slučaju greške

---

### ⚠️ PROBLEM #8: Marker File (`scraper_finished.txt`) - Neiskorišćen

**Scraper kreira marker**:
```javascript
fs.writeFileSync('scraper_finished.txt', Date.now().toString(), 'utf8');
```

**Ali workflow ga NIKAD NE PROVERAVA!**

**Ideja**: Ovaj marker bi trebao da signalizira n8n-u da je scraper završio.

---

## 5. GAP ANALYSIS

### 🚨 MUST-HAVE (Blokirajući Problemi)

| # | Problem | Impact | Rešenje | Prioritet |
|---|---------|--------|---------|-----------|
| 1 | Race condition (scraper vs workflow) | ❌ **CRITICAL** - Workflow ne detektuje nove grant-ove | Implementiraj Wait/Polling logiku | **P0** |
| 2 | Duplicate CSV files | 🟡 Confusion, dupli I/O | Konsoliduj na jedan CSV | **P1** |
| 3 | Before/After logika nije sigurna | ❌ Može da propusti nove grant-ove | Snapshot mechanism | **P1** |

### 🔧 SHOULD-HAVE (Poboljšanja Kvaliteta)

| # | Problem | Impact | Rešenje | Prioritet |
|---|---------|--------|---------|-----------|
| 4 | AI prompt je slab | 🟡 Nepouzdani rezultati | Strukturiran JSON output + reasoning | **P2** |
| 5 | Slack formatiranje | 🟡 Loš UX | Implementiraj Block Kit | **P2** |
| 6 | Nema logging/monitoring | 🟡 Blind spots | Dodaj logging node | **P3** |
| 7 | Hardcoded paths | 🟡 Ne-portable | Env variables | **P3** |

### 💡 NICE-TO-HAVE (Opciono)

| # | Feature | Impact | Prioritet |
|---|---------|--------|-----------|
| 8 | Error alerting (Slack) | 🟢 Proactive monitoring | **P4** |
| 9 | Progress tracking | 🟢 Real-time visibility | **P4** |
| 10 | Dry-run mode | 🟢 Safe testing | **P4** |

---

## 6. AKCIONI PLAN - PRIORITETI

### 🎯 MILESTONE 1: Ispravi Race Condition (2-3h)

**Cilj**: Osiguraj da workflow ČEKA scraper da završi

#### **Opcija A: Polling Mechanism (PREPORUČENO)**

**Implementacija**:

1. **Dodaj Wait Node** između "Execute Command" i "Code in JavaScript":

```javascript
// Wait Node - Polling Logic
const fs = require('fs');
const path = require('path');

const PROJECT_PATH = 'C:\\Users\\Korisnik\\Desktop\\Alicorn\\n8n_eu_grants';
const MARKER_FILE = path.join(PROJECT_PATH, 'scraper_finished.txt');
const MAX_WAIT_TIME = 6 * 60 * 60 * 1000; // 6 sati
const POLL_INTERVAL = 60 * 1000; // Proveri svakih 60s

const workflowStartTime = Date.now();

async function waitForScraperCompletion() {
  while (Date.now() - workflowStartTime < MAX_WAIT_TIME) {
    // Proveri da li marker fajl postoji
    if (fs.existsSync(MARKER_FILE)) {
      const markerTimestamp = parseInt(fs.readFileSync(MARKER_FILE, 'utf8'));
      
      // Proveri da li je marker kreiran POSLE pokretanja workflow-a
      if (markerTimestamp >= workflowStartTime) {
        console.log(`✅ Scraper finished at ${new Date(markerTimestamp)}`);
        return [{ json: { success: true, duration: Date.now() - workflowStartTime } }];
      }
    }
    
    // Čekaj pre sledeće provere
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));
  }
  
  // Timeout
  throw new Error('⏱️ Scraper timeout - nije završio u roku od 6 sati');
}

return await waitForScraperCompletion();
```

2. **Dodaj Error Handler Node**:
   - Catch timeout error
   - Pošalji Slack alert: "⚠️ Scraper nije završio u roku!"

**Pros**:
- ✅ Jednostavan za implementaciju
- ✅ Ne zahteva izmene u scraper-u
- ✅ Koristi postojeći marker file

**Cons**:
- ❌ Polling svaki minut (overhead)
- ❌ n8n workflow blokiran tokom čekanja

---

#### **Opcija B: Webhook Trigger (Alternativa)**

**Implementacija**:

1. **Razdvoj workflow na 2 dela**:
   - **Workflow 1**: Schedule Trigger → Execute Scraper
   - **Workflow 2**: Webhook Trigger → Filter NEW → AI → Slack

2. **Izmeni scraper** da poziva webhook na kraju:
```javascript
// scraper2.js (kraj fajla)
const axios = require('axios');

const N8N_WEBHOOK_URL = 'https://your-n8n-instance.com/webhook/scraper-done';

axios.post(N8N_WEBHOOK_URL, {
  status: 'completed',
  newGrantsCount: allGrants.length,
  timestamp: Date.now()
}).then(() => {
  console.log('✅ n8n notified via webhook');
}).catch(err => {
  console.error('❌ Failed to notify n8n:', err.message);
});
```

**Pros**:
- ✅ Instant trigger (bez polling-a)
- ✅ Scraper može da prosleđuje metadata

**Cons**:
- ❌ Zahteva izmenu scraper-a
- ❌ Potreban n8n webhook endpoint (additional setup)

---

### 🎯 MILESTONE 2: Refaktoriši CSV Storage (1h)

**Koraci**:

1. **Obriši `grants2.csv` logiku** iz scraper-a:
```javascript
// scraper2.js - BEFORE
fs.appendFileSync('grants2.csv', csvContent, 'utf8');
fs.appendFileSync('allgrants.csv', csvContent, 'utf8');

// scraper2.js - AFTER (samo jedan fajl)
fs.appendFileSync('allgrants.csv', csvContent, 'utf8');
```

2. **Izmeni duplikat detekciju** (trenutno čita `grants2.csv`):
```javascript
// scraper2.js linija 21 - BEFORE
if (fs.existsSync('grants2.csv')) {
  const csvData = fs.readFileSync('grants2.csv', 'utf-8');
  // ...
}

// AFTER
if (fs.existsSync('allgrants.csv')) {
  const csvData = fs.readFileSync('allgrants.csv', 'utf-8');
  // ...
}
```

3. **Cleanup**: Obriši stari `grants2.csv` fajl.

---

### 🎯 MILESTONE 3: Before/After Snapshot Logic (30min)

**Koncept**: Umesto da čitaš isti fajl dva puta, kreiraj snapshot.

**Implementacija u n8n**:

1. **Pre Execute Command**: Kopiraj `allgrants.csv` → `allgrants_before.csv`

```javascript
// Code Node: Create Snapshot
const fs = require('fs');
const srcPath = 'C:\\Users\\Korisnik\\Desktop\\Alicorn\\n8n_eu_grants\\allgrants.csv';
const backupPath = 'C:\\Users\\Korisnik\\Desktop\\Alicorn\\n8n_eu_grants\\allgrants_before.csv';

if (fs.existsSync(srcPath)) {
  fs.copyFileSync(srcPath, backupPath);
  console.log('✅ Snapshot created');
} else {
  console.log('⚠️ allgrants.csv does not exist yet');
}

return [{ json: { snapshotCreated: true } }];
```

2. **Posle scraper-a**: Uporedi `allgrants_before.csv` (old) sa `allgrants.csv` (new)

---

### 🎯 MILESTONE 4: Poboljšaj AI Prompt (30min)

**Novi prompt** (strukturiran output):

```
You are an EU grants matching expert for a technology company.

COMPANY PROFILE:
Name: Alicorn
Industry: Marketing agency, Software development, AI, Video games
Location: Montenegro
Focus Areas:
- Educational video games (HR, compliance, SDG)
- AI/ML products (domain name industry)
- Marketing services
- Software development

GRANT OPPORTUNITY:
Title: {{ Title }}
Deadline: {{ Date }}
Description: {{ Description }}
Link: {{ Link }}

TASK:
Analyze if this grant/tender/opportunity is relevant for Alicorn.

EVALUATION CRITERIA:
1. Geographic eligibility (Montenegro, Western Balkans, EU programs)
2. Industry match (tech, AI, games, marketing, software)
3. Company size (SME, startup-friendly)
4. Topic alignment (innovation, digital, education, sustainability)
5. Actionable opportunity (not just news/announcements)

OUTPUT FORMAT (strict JSON):
{
  "relevant": true or false,
  "confidence": 0-100 (integer),
  "reasoning": "2-3 sentences explaining the decision",
  "category": "grant|tender|partnership|investment|other",
  "keyTags": ["tag1", "tag2", "tag3"]
}

RULES:
- Be strict: only recommend high-potential matches (confidence > 70%)
- Reject if: news articles, wrong geography, wrong industry
- Consider Alicorn's dual focus: B2B services + B2C startups
```

**Update n8n OpenAI node**:
- Response format: `{ type: "json_object" }`
- Temperature: 0.3 (less creative, more consistent)

---

### 🎯 MILESTONE 5: Slack Block Kit Formatting (30min)

**Implementacija**:

```json
{
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "🎯 New Relevant Grant Opportunity",
        "emoji": true
      }
    },
    {
      "type": "section",
      "fields": [
        {
          "type": "mrkdwn",
          "text": "*Title:*\n{{ $('Filter NEW').item.json.Title }}"
        },
        {
          "type": "mrkdwn",
          "text": "*Deadline:*\n{{ $('Filter NEW').item.json.Date }}"
        }
      ]
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*AI Analysis:*\n{{ $('Message a model').item.json.output[0].content[0].text.reasoning }}"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Confidence Score:* {{ $('Message a model').item.json.output[0].content[0].text.confidence }}%"
      }
    },
    {
      "type": "divider"
    },
    {
      "type": "actions",
      "elements": [
        {
          "type": "button",
          "text": {
            "type": "plain_text",
            "text": "📄 View Grant Details",
            "emoji": true
          },
          "url": "{{ $('Filter NEW').item.json.Link }}",
          "style": "primary"
        }
      ]
    }
  ]
}
```

---

### 🎯 MILESTONE 6: Dodaj Logging (1h)

**Kreiraj Log Node** (posle "Send a message"):

```javascript
// Logging Node
const fs = require('fs');
const logData = {
  timestamp: new Date().toISOString(),
  totalGrantsScraped: $items("Extract from File").length,
  newGrants: $items("Filter NEW").length,
  relevantGrants: $items("Send a message").length,
  duration: '{{ duration from Wait node }}'
};

// Append to logs.csv
const csvLine = `"${logData.timestamp}",${logData.totalGrantsScraped},${logData.newGrants},${logData.relevantGrants},"${logData.duration}"\n`;
fs.appendFileSync('logs.csv', csvLine, 'utf8');

// Optional: Send summary to monitoring Slack channel
return [{ json: logData }];
```

---

## 7. TEHNIČKI SAVETI

### 🏗️ Arhitektura - Best Practices

#### **Za Fazu 1** (Zadržati):
- ✅ CSV storage (dovoljan za 1 source, 1 client)
- ✅ Jedan scraper process (ne treba paralelizacija)
- ✅ GPT-4o-mini (cost-effective: $0.15/1M input tokens)
- ✅ n8n kao orchestrator (no-code flexibility)

#### **Za Fazu 2** (Pripremi sada):
- ⚠️ **Database migration** (PostgreSQL ili SQLite):
  ```sql
  CREATE TABLE grants (
    id SERIAL PRIMARY KEY,
    title VARCHAR(500),
    link VARCHAR(500) UNIQUE,
    date VARCHAR(50),
    description TEXT,
    source VARCHAR(100),
    scraped_at TIMESTAMP
  );
  
  CREATE TABLE companies (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    description TEXT,
    slack_channel VARCHAR(50)
  );
  
  CREATE TABLE matches (
    id SERIAL PRIMARY KEY,
    grant_id INT REFERENCES grants(id),
    company_id INT REFERENCES companies(id),
    relevance_score INT,
    reasoning TEXT,
    created_at TIMESTAMP
  );
  ```

- ⚠️ **Separate workflows per source**:
  - 10 scraper-a → 10 n8n workflows (parallel execution)
  - Svi pišu u istu DB

- ⚠️ **Master Matching Workflow**:
  - Query new grants from DB
  - Loop kroz 10+ companies
  - Batch AI processing (reduce API calls)

---

### 🔐 Security & Environment Variables

**Problem**: Hardcoded paths

**Rešenje**: Koristi `.env` fajl

```bash
# .env
PROJECT_PATH=C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/scraper-done
OPENAI_API_KEY=sk-...
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

**U scraper-u**:
```javascript
require('dotenv').config();
const projectPath = process.env.PROJECT_PATH || __dirname;
```

**U n8n**:
- Use Environment Variables node
- Reference: `{{ $env.PROJECT_PATH }}`

---

### ⚡ Performance Optimizations

#### **Current Bottlenecks**:

1. **Scraper Speed**:
   - Puppeteer page loads: ~2-5s per grant
   - 100 grants = 200-500 seconds = **3-8 minutes**
   - Sa timeout-ima: može biti satima

2. **AI Processing**:
   - GPT-4o-mini: ~0.5-1s per request
   - 100 grants = 50-100 seconds

**Total**: ~5-10 minuta (best case), više ako ima error-a

#### **Optimizations for Faza 2**:

1. **Scraper**:
   - ✅ `headless: true` (brže, ali može biti blocked)
   - ✅ Scrape-uj samo listing page (ne ulazi u svaki link)
   - ✅ Description fetch on-demand (lazy loading)
   - ✅ Use scraping API (ScraperAPI, Bright Data) - avoid blocks

2. **AI**:
   - ✅ Pre-filter grant-ove (regex, keyword matching) pre AI
   - ✅ Batch processing (grupiši 10 grant-ova u jedan prompt)
   - ✅ Cache AI decisions (grant X + company Y = score Z)
   - ✅ Use cheaper model za initial filter, GPT-4 za final check

3. **n8n**:
   - ✅ Parallel execution (multiple workflows running simultaneously)
   - ✅ Queue system (Redis) za long-running tasks

---

### 🧪 Testing Strategy

**Levels of Testing**:

1. **Unit Test - Scraper** (standalone):
```bash
node scraper2.js
```
- ✅ Proveri da li piše u CSV
- ✅ Proveri duplikat detekciju
- ✅ Test sa malim sample-om (1 stranica)

2. **Integration Test - n8n Workflow**:
- ✅ Disable Schedule Trigger
- ✅ Add Manual Trigger node
- ✅ Execute step-by-step
- ✅ Inspect output of each node

3. **End-to-End Test**:
- ✅ Test sa production-like data
- ✅ Verify Slack message delivery
- ✅ Check logs

4. **Dry-Run Mode**:
```javascript
// Environment variable
const DRY_RUN = process.env.DRY_RUN === 'true';

// In Slack node
if (DRY_RUN) {
  console.log('DRY RUN: Would send message:', message);
  return [{ json: { dryRun: true } }];
}
```

---

### 📊 Monitoring & Alerting

**Daily Summary** (novi Slack channel: `#grant-monitoring`):

```
📊 Daily Grant Report - Nov 24, 2025
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Scraper Status: Completed
⏰ Started: 07:00:15 AM
⏱️ Duration: 8 minutes 42 seconds
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📥 Total Grants in DB: 327
🆕 New Grants Added: 5
🎯 Relevant for Alicorn: 2
🤖 AI Analysis Time: 4.2 seconds
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔗 View Logs: [link]
```

**Error Alerting**:
```
🚨 ALERT: Grant Scraper Failed
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Time: 07:15:32 AM
Error: Timeout after 6 hours
Last successful run: Nov 23, 07:00 AM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Action Required: Check scraper logs
```

---

## 8. ROADMAP ZA FAZU 2

### 🚀 Skaliranje na 10 Sources × 10 Clients

#### **Architecture for Scale**:

```
┌──────────────────────────────────────────────────────────┐
│                    SCHEDULER (CRON)                       │
│        Pokreće različite scraper-e u različito vreme     │
└────────────────────┬─────────────────────────────────────┘
                     │
      ┌──────────────┴──────────────┐
      │                             │
      ▼                             ▼
┌─────────────┐              ┌─────────────┐
│  Scraper 1  │              │  Scraper 10 │
│  (Source A) │     ...      │  (Source J) │
└──────┬──────┘              └──────┬──────┘
       │                            │
       │    All write to DB         │
       ▼                            ▼
┌────────────────────────────────────────────────────────┐
│                  POSTGRESQL DATABASE                    │
│  Tables: grants | companies | matches | logs           │
└────────────────────┬───────────────────────────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│              MASTER MATCHING WORKFLOW                   │
│  1. Query new grants (WHERE analyzed = false)          │
│  2. FOR EACH company:                                   │
│     - AI analysis (grant × company)                     │
│     - Store match in DB                                 │
│  3. Send personalized Slack messages                    │
└────────────────────────────────────────────────────────┘
```

#### **Multi-Source Scraper Strategy**:

**Option 1**: Separate scraper files
```
scrapers/
├── eu_portal.js       # Current scraper
├── horizon_europe.js
├── erasmus_plus.js
├── eic_accelerator.js
├── ...
└── config.json        # Centralized config
```

**Option 2**: Parametrizovan scraper
```javascript
// generic_scraper.js
const config = require('./scraper_config.json');

async function scrape(sourceName) {
  const sourceConfig = config[sourceName];
  // Use sourceConfig.url, sourceConfig.selectors, etc.
}

// Run: node generic_scraper.js eu_portal
```

#### **Multi-Client Matching Strategy**:

**Company Profiles** (stored in DB):
```json
{
  "companies": [
    {
      "id": 1,
      "name": "Alicorn",
      "description": "...",
      "slack_channel": "C09U22T1QDS",
      "keywords": ["AI", "video games", "education", "SDG"],
      "geography": ["Montenegro", "Western Balkans", "EU"]
    },
    {
      "id": 2,
      "name": "Client B",
      "description": "...",
      "slack_channel": "C12345678",
      "keywords": ["biotech", "healthcare"],
      "geography": ["Germany", "EU"]
    }
  ]
}
```

**Matching Loop** (n8n workflow):
```javascript
// FOR EACH new grant
const newGrants = $items("DB Query - New Grants");

for (const grant of newGrants) {
  const companies = $items("DB Query - Companies");
  
  for (const company of companies) {
    // AI analysis: Is this grant relevant for THIS company?
    const prompt = `
      Company: ${company.name}
      Grant: ${grant.title}
      ...
    `;
    
    const aiResult = await callOpenAI(prompt);
    
    if (aiResult.relevant && aiResult.confidence > 70) {
      // Store match
      await db.insert('matches', {
        grant_id: grant.id,
        company_id: company.id,
        score: aiResult.confidence,
        reasoning: aiResult.reasoning
      });
      
      // Send Slack notification
      await sendSlackMessage(company.slack_channel, grant, aiResult);
    }
  }
}
```

---

### ⚠️ Rizici za Fazu 2

#### **1. OpenAI Cost Explosion** 💸

**Calculation**:
- 10 sources × 100 grants/dan = **1,000 grant-ova**
- 10 companies = **10,000 AI calls/dan**
- @ $0.15/1M input tokens × 500 tokens avg = **~$0.75/dan** = **$22.5/mesec**

**Optimizacije**:
1. ✅ **Pre-filtering** (regex, keywords) → Reduce AI calls by 50-70%
2. ✅ **Caching** → Same grant × same company = reuse result
3. ✅ **Batch processing** → Multiple grants in one prompt
4. ✅ **Cheaper model** → gpt-3.5-turbo ($0.0005/1K tokens)

#### **2. Slack Rate Limits** ⏱️

**Limit**: 1 poruka/sekund (Tier 1)

**Problem**: 10 companies × 10 relevant grants = 100 poruka = **100 sekundi**

**Rešenje**:
1. ✅ **Batch messages** → Jedna poruka sa listom grant-ova
2. ✅ **Daily digest** → Umesto realtime, šalji jednom dnevno
3. ✅ **Slack Apps** (instead of webhooks) → Higher rate limits

#### **3. Scraper Blocking** 🚫

**Rizik**: 10 scraper-a simultano → IP block

**Mitigacija**:
1. ✅ **Stagger execution** → Pokreni scraper-e u različito vreme
2. ✅ **Proxy rotation** → Use rotating proxies
3. ✅ **User-agent rotation**
4. ✅ **Scraping API service** (ScraperAPI, Bright Data) → $50-100/mesec

#### **4. Database Performance** 🗄️

**Volume**: 
- 10 sources × 100 grants/dan × 30 dana = **30,000 grant-ova/mesec**
- 10 companies × 30,000 = **300,000 matches/mesec** (worst case)

**Optimizacije**:
1. ✅ Index na `grants.link` (UNIQUE)
2. ✅ Index na `matches (grant_id, company_id)`
3. ✅ Pagination u query-ima
4. ✅ Archive old data (> 6 meseci)

---

## 9. PITANJA ZA RAZMATRANJE

### 🔹 Kratkoročne Odluke (Faza 1)

1. **Da li želiš da odmah implementiramo fix-ove ili prvo da diskutujemo pristup?**
   - Preporuka: Implementiraj Milestone 1-3 odmah (critical)

2. **Koji je realan vremenski okvir za završetak Faze 1?**
   - Optimistički: 1-2 dana (ako radimo full-time)
   - Realistički: 3-5 dana (sa testiranjem)

3. **Da li scraper treba da radi u `headless: false` (visible) ili `headless: true`?**
   - Visible: Sporije, ali vidiš šta se dešava (good for debugging)
   - Headless: Brže, ali može biti blocked
   - Preporuka: Headless za production, visible za development

4. **Da li treba odmah da radimo na Slack Block Kit ili je plain text OK za MVP?**
   - Preporuka: Implementiraj Block Kit (30 min, značajno bolji UX)

---

### 🔹 Dugoročne Odluke (Faza 2)

5. **Kada planiraš da dodaješ nove company profile-e?**
   - Ako uskoro (< 1 mesec): Treba odmah da pravimo DB strukturu
   - Ako kasnije (> 3 meseca): Može hardcode za sada

6. **Preference za bazu podataka?**
   - **PostgreSQL**: Industry standard, skalabilan, cloud-ready (AWS RDS, DigitalOcean)
   - **SQLite**: Jednostavan, file-based, no setup (good for MVP)
   - **MySQL**: Široko podržan, ali manje features od PostgreSQL
   - Preporuka: **PostgreSQL** (future-proof)

7. **Hosting strategy?**
   - **n8n Cloud** ($20-50/mesec): Managed, no maintenance
   - **Self-hosted** (DigitalOcean, AWS): Jeftinije long-term, ali treba održavanje
   - Preporuka: n8n Cloud za MVP, self-hosted ako skaliraš

8. **Budget za AI calls?**
   - $10/mesec: OK za MVP (1-2 company)
   - $50/mesec: OK za 5-10 companies
   - $100+/mesec: Potreban za 10+ companies sa 10+ sources
   - Treba li da implementiramo cost tracking?

9. **SLA expectations?**
   - Daily scraping: Prihvatljivo da ponekad fail-uje (manual retry)?
   - Real-time: Mora UVEK da radi (need redundancy, monitoring)?

---

## 10. APPENDIX

### 📝 Korisne Komande

**Scraper**:
```bash
# Run scraper manually
node scraper2.js

# Check CSV line count
powershell -Command "(Get-Content allgrants.csv | Measure-Object -Line).Lines"

# View last 10 grants
powershell -Command "Get-Content allgrants.csv -Tail 10"
```

**n8n**:
```bash
# Import workflow
n8n import:workflow --input="N8N_EU_Grants (7).json"

# Export workflow
n8n export:workflow --id=8hnFj87GBMWcstyc --output=backup.json

# Start n8n
n8n start
```

---

### 📚 Resursi

**Dokumentacija**:
- [n8n Documentation](https://docs.n8n.io/)
- [Puppeteer Docs](https://pptr.dev/)
- [OpenAI API](https://platform.openai.com/docs/api-reference)
- [Slack Block Kit](https://api.slack.com/block-kit)

**Tools**:
- [Slack Block Kit Builder](https://app.slack.com/block-kit-builder)
- [Regex Tester](https://regex101.com/)
- [CSV Validator](https://csvlint.io/)

---

### 🎯 Success Metrics (KPIs)

**Faza 1**:
- ✅ Scraper uptime: > 95%
- ✅ New grants detected: 100% accuracy
- ✅ AI relevance precision: > 80% (manual validation)
- ✅ False positive rate: < 20%
- ✅ Slack delivery: 100%

**Faza 2**:
- ✅ Multi-source scraping: 10 sources daily
- ✅ Multi-client matching: 10+ companies
- ✅ AI cost: < $100/mesec
- ✅ Response time: < 30 min (scrape → Slack)

---

## ✅ ZAVRŠNA REKAPITULACIJA

### Što Radi (Green Light):
1. ✅ Scraper je funkcionalan i robustan
2. ✅ n8n workflow ima logički ispravan flow
3. ✅ AI analiza (GPT-4o-mini) radi
4. ✅ Slack integracija funkcioniše
5. ✅ CSV storage (dovoljan za MVP)

### Što Mora da se Ispravi (Red Alert):
1. ❌ Race condition: n8n ne čeka scraper
2. ❌ Duplicate CSV fajlovi (grants2.csv vs allgrants.csv)
3. ⚠️ AI prompt treba strukturiran output
4. ⚠️ Slack formatting (Block Kit)

### Sledeći Koraci:
1. **ODMAH**: Implementiraj Wait/Polling logic (Milestone 1)
2. **DANAS**: Konsoliduj CSV storage (Milestone 2)
3. **SUTRA**: Poboljšaj AI prompt i Slack formatting (Milestone 4-5)
4. **OVE NEDELJE**: Testiranje i production deploy

---

**End of Document**  
**Verzija**: 1.0  
**Datum**: 24. Novembar 2025  
**Sledeći Review**: Posle implementacije Milestone 1-3

