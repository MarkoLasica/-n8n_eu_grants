// migrate_csv_to_v2.js
// Migrates v1 CSV format to v2 format by adding new columns

const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data', 'grants');

// Files to migrate
const filesToMigrate = [
  'horizon_europe_grants.csv',
  'digital_europe_grants.csv',
  'creative_europe_grants.csv',
  'erasmus_grants.csv',
  'all_unified.csv'
];

// New v2 header
const v2Header = '"Title","Link","Date","Source","URL_Type","Programme","Opening_Date","Deadline_Date","Deadline_Model","Status","Budget_Amount","Budget_Currency","Budget_Year","Type_of_Action","Description","Full_Content"\n';

function migrateCSV(filename) {
  const filePath = path.join(dataDir, filename);

  if (!fs.existsSync(filePath)) {
    console.log(`⚠️  ${filename} does not exist, skipping...`);
    return;
  }

  console.log(`\n📂 Processing: ${filename}`);

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  if (lines.length === 0) {
    console.log(`   ℹ️  File is empty, skipping...`);
    return;
  }

  // Check if already v2 format
  const currentHeader = lines[0].toLowerCase();
  if (currentHeader.includes('url_type') || currentHeader.includes('full_content')) {
    console.log(`   ✅ Already v2 format, skipping...`);
    return;
  }

  // Backup original
  const backupPath = filePath.replace('.csv', '_v1_backup.csv');
  fs.writeFileSync(backupPath, content);
  console.log(`   💾 Backed up to: ${filename.replace('.csv', '_v1_backup.csv')}`);

  // Transform data
  const newLines = [v2Header.trim()];
  let rowCount = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV row (handles quoted values)
    const row = parseCSVRow(line);

    if (row.length < 5) {
      console.log(`   ⚠️  Skipping malformed row ${i}: ${line.substring(0, 50)}...`);
      continue;
    }

    // Old format: Title, Link, Date, Description, Source
    // New format: Title, Link, Date, Source, URL_Type, Programme, Opening_Date, Deadline_Date, Deadline_Model, Status, Budget_Amount, Budget_Currency, Budget_Year, Type_of_Action, Description, Full_Content

    const [title, link, date, description, source] = row;

    const newRow = [
      escapeCSV(title),           // 1. Title
      escapeCSV(link),            // 2. Link
      escapeCSV(date),            // 3. Date
      escapeCSV(source),          // 4. Source (moved from position 5)
      '""',                       // 5. URL_Type (empty)
      '""',                       // 6. Programme (empty)
      '""',                       // 7. Opening_Date (empty)
      '""',                       // 8. Deadline_Date (empty)
      '""',                       // 9. Deadline_Model (empty)
      '""',                       // 10. Status (empty)
      '""',                       // 11. Budget_Amount (empty)
      '""',                       // 12. Budget_Currency (empty)
      '""',                       // 13. Budget_Year (empty)
      '""',                       // 14. Type_of_Action (empty)
      escapeCSV(description),     // 15. Description (moved from position 4)
      '""'                        // 16. Full_Content (empty)
    ].join(',');

    newLines.push(newRow);
    rowCount++;
  }

  // Write migrated file
  fs.writeFileSync(filePath, newLines.join('\n') + '\n');
  console.log(`   ✅ Migrated ${rowCount} rows to v2 format`);
  console.log(`   📊 New format: 16 columns`);
}

function parseCSVRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // End of field
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current); // Last field
  return result;
}

function escapeCSV(value) {
  if (!value) return '""';
  // Already has quotes, return as-is
  if (value.startsWith('"') && value.endsWith('"')) {
    return value;
  }
  // Escape and quote
  return '"' + value.replace(/"/g, '""') + '"';
}

// Run migration
console.log('🔄 Starting CSV Migration to v2 Format...\n');
console.log('=' .repeat(60));

filesToMigrate.forEach(migrateCSV);

console.log('\n' + '='.repeat(60));
console.log('✅ Migration Complete!');
console.log('\nℹ️  Original files backed up with "_v1_backup.csv" suffix');
console.log('ℹ️  New rows from v2 scrapers will have all 16 columns populated');
