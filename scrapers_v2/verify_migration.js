const fs = require('fs');
const content = fs.readFileSync('data/grants/horizon_europe_grants.csv', 'utf-8');
const lines = content.split('\n');

function parseCSVRow(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result;
}

const header = parseCSVRow(lines[0]);
const dataRow = parseCSVRow(lines[1]);

console.log('✅ Header columns:', header.length);
console.log('✅ Data row columns:', dataRow.length);
console.log('\nColumn mapping:');
header.forEach((col, i) => {
  const value = dataRow[i] || '';
  const display = value.length > 50 ? value.substring(0, 47) + '...' : value;
  console.log(`  ${i + 1}. ${col}: ${display || '(empty)'}`);
});
