# 🚀 QUICK START GUIDE - n8n EU Grants

**Ažurirano**: 24. Novembar 2025

---

## 🎯 CILJ PROJEKTA (FAZA 1)

Automatizovan sistem koji:
1. Svako jutro (07:00) scrape-uje EU grant pozive
2. Filtrira NOVE grant-ove
3. AI analizira relevantnost za Alicorn
4. Šalje Slack notifikaciju za relevantne grant-ove

---

## 📁 STRUKTURA PROJEKTA

```
n8n_eu_grants/
├── scraper2.js                         # Puppeteer scraper (GLAVNI)
├── allgrants.csv                       # Master CSV (326 grants)
├── N8N_EU_Grants (7).json             # n8n workflow
├── scraper_finished.txt                # Completion marker
├── PROJECT_ANALYSIS_AND_ROADMAP.md    # FULL DOKUMENTACIJA
└── QUICK_START.md                      # Ovaj fajl
```

---

## 🔴 TOP 3 KRITIČNA PROBLEMA

### 1. RACE CONDITION ⚠️
**Problem**: n8n workflow NE ČEKA da scraper završi!
```
Workflow čita CSV → Pokrene scraper → Odmah čita CSV ponovo
(Scraper još nije završio! CSV je isti!)
```

**Rešenje**: Dodaj Wait/Polling node koji čeka `scraper_finished.txt`

---

### 2. DUPLICATE CSV FILES ⚠️
**Problem**: `grants2.csv` i `allgrants.csv` - identični podaci!

**Rešenje**: Koristi SAMO `allgrants.csv`

---

### 3. AI PROMPT JE SLAB ⚠️
**Problem**: Vraća plain text "Yes/No", nema reasoning

**Rešenje**: Strukturiran JSON output sa confidence score

---

## ⚡ BRZI FIX - PRIORITY ACTIONS

### P0: Ispravi Race Condition (2h)
```javascript
// Dodaj Wait Node u n8n (između Execute Command i Code)
const fs = require('fs');
const MARKER = 'scraper_finished.txt';
const startTime = Date.now();

while (Date.now() - startTime < 6*60*60*1000) { // 6h max
  if (fs.existsSync(MARKER)) {
    const timestamp = parseInt(fs.readFileSync(MARKER, 'utf8'));
    if (timestamp >= startTime) {
      return [{ json: { success: true } }];
    }
  }
  await new Promise(r => setTimeout(r, 60000)); // Check every 1 min
}
throw new Error('Scraper timeout');
```

### P1: Konsoliduj CSV (30min)
```javascript
// scraper2.js - Obriši ovu liniju:
// fs.appendFileSync('grants2.csv', csvContent, 'utf8'); ❌

// Linija 21 - Izmeni:
if (fs.existsSync('allgrants.csv')) { // ✅ (ne grants2.csv)
  const csvData = fs.readFileSync('allgrants.csv', 'utf-8');
```

### P2: Bolji AI Prompt (30min)
```
Output JSON:
{
  "relevant": true/false,
  "confidence": 0-100,
  "reasoning": "..."
}
```

---

## 🧪 KAKO TESTIRATI

### 1. Testiraj Scraper
```bash
cd C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants
node scraper2.js
```
**Očekivano**: Dodaje nove grant-ove u `allgrants.csv`

### 2. Testiraj n8n Workflow
- Otvori n8n
- Dodaj Manual Trigger (umesto Schedule)
- Pokreni step-by-step
- Proveri output svakog node-a

---

## 📊 KAKO PROVERITI STANJE

### Broj grant-ova:
```powershell
(Get-Content allgrants.csv | Measure-Object -Line).Lines
```

### Poslednji scraping:
```powershell
Get-Content scraper_finished.txt
# Output: timestamp (npr. 1763735124193)
```

### Zadnjih 5 grant-ova:
```powershell
Get-Content allgrants.csv -Tail 5
```

---

## 🎯 WORKFLOW LOGIKA (Trenutno)

```
Schedule (07:00)
    ↓
Read CSV BEFORE
    ↓
Execute Scraper ⚠️ (ne čeka!)
    ↓
Read CSV AFTER
    ↓
Filter NEW
    ↓
AI Analysis
    ↓
IF Relevant → Slack
```

---

## 📞 SLACK CHANNEL

**ID**: C09U22T1QDS  
**Tip poruke**: Plain text (treba Block Kit upgrade)

---

## 🚀 SLEDEĆI KORACI (Priority Order)

1. ✅ Implementiraj Wait logic (HITNO)
2. ✅ Konsoliduj CSV fajlove
3. ✅ Poboljšaj AI prompt
4. ✅ Dodaj Slack Block Kit
5. ✅ Testiranje end-to-end
6. ✅ Deploy u production (active: true)

---

## 🔗 EKSTERNI RESURSI

- **Target URL**: https://ec.europa.eu/info/funding-tenders/opportunities/portal/
- **Full Docs**: PROJECT_ANALYSIS_AND_ROADMAP.md
- **n8n Workflow ID**: 8hnFj87GBMWcstyc

---

## 📞 KONTAKT INFO

**Projekat**: n8n_eu_grants  
**Klijent**: Alicorn (Montenegro)  
**Status**: MVP Development - Faza 1  
**Next Review**: Nakon implementacije fix-ova

---

**TL;DR**: Sistem radi, ali ima race condition. Prvo implementiraj Wait logic, pa deploy.

