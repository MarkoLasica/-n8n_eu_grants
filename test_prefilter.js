// Test script for pre-filtering logic
// Run with: node test_prefilter.js

const fs = require('fs');
const path = require('path');

// Programme name mapping: companies.json format → scraper Source format
// Accepts multiple variants of programme names
const programmeMapping = {
  'Horizon Europe': 'horizon_europe',
  'Digital Europe': 'digital_europe',
  'Creative Europe': 'creative_europe',
  'Erasmus+': 'erasmus',
  'Interreg': 'adrion',  // ADRION is an Interreg programme
  'Danube Region Programme': 'danube',
  'Danube Programme': 'danube',  // Alternative spelling
  'Central Europe Program': 'central_europe',
  'Central Europe Programme': 'central_europe',  // Alternative spelling
  'COSME': 'cosme',
  'LIFE': 'life'
};

// Load companies
const companiesPath = path.join(__dirname, 'data', 'companies.json');
const companies = JSON.parse(fs.readFileSync(companiesPath, 'utf8'));

console.log('='.repeat(60));
console.log('COMPANY ELIGIBLE PROGRAMMES ANALYSIS');
console.log('='.repeat(60));

// Show each company's eligible programmes and their mapped sources
for (const company of companies) {
  const eligiblePrograms = company.profile.eligible_programs || [];
  const mappedSources = eligiblePrograms.map(prog => ({
    original: prog,
    mapped: programmeMapping[prog] || 'NOT_MAPPED'
  }));

  console.log(`\n${company.name} (${company.id}):`);
  console.log(`  Slack: ${company.slack_channel_id}`);
  console.log(`  Eligible programmes:`);
  mappedSources.forEach(m => {
    const status = m.mapped === 'NOT_MAPPED' ? '❌' : '✅';
    console.log(`    ${status} ${m.original} → ${m.mapped}`);
  });
}

// Load sample grants (use new_grants.csv if exists, otherwise use a source-specific file)
console.log('\n' + '='.repeat(60));
console.log('LOADING SAMPLE GRANTS');
console.log('='.repeat(60));

let grants = [];
const newGrantsPath = path.join(__dirname, 'data', 'grants', 'new_grants.csv');
const horizonPath = path.join(__dirname, 'data', 'grants', 'horizon_europe_grants.csv');

let grantsFile = '';
if (fs.existsSync(newGrantsPath)) {
  grantsFile = newGrantsPath;
} else if (fs.existsSync(horizonPath)) {
  grantsFile = horizonPath;
}

if (grantsFile) {
  console.log(`\nReading from: ${path.basename(grantsFile)}`);
  const csvContent = fs.readFileSync(grantsFile, 'utf8');
  const lines = csvContent.split('\n').slice(1); // Skip header

  for (const line of lines.slice(0, 10)) { // Only take first 10 grants for testing
    if (!line.trim()) continue;

    // Simple CSV parsing (handles quoted fields)
    const match = line.match(/^"([^"]*)",.*,"([^"]*)"$/);
    if (match) {
      grants.push({
        Title: match[1].substring(0, 50) + '...',
        Source: match[2]
      });
    }
  }

  console.log(`Loaded ${grants.length} sample grants`);
} else {
  // Create mock grants for testing
  console.log('\nNo grants file found, using mock data...');
  grants = [
    { Title: 'Horizon Europe Grant 1', Source: 'horizon_europe' },
    { Title: 'Digital Europe Grant 1', Source: 'digital_europe' },
    { Title: 'Creative Europe Grant 1', Source: 'creative_europe' },
    { Title: 'Erasmus+ Grant 1', Source: 'erasmus' },
    { Title: 'ADRION Grant 1', Source: 'adrion' }
  ];
  console.log(`Created ${grants.length} mock grants`);
}

// Show grants by source
console.log('\nGrants by source:');
const sourceCount = {};
grants.forEach(g => {
  sourceCount[g.Source] = (sourceCount[g.Source] || 0) + 1;
});
Object.entries(sourceCount).forEach(([source, count]) => {
  console.log(`  ${source}: ${count} grants`);
});

// Run pre-filtering simulation
console.log('\n' + '='.repeat(60));
console.log('PRE-FILTERING SIMULATION');
console.log('='.repeat(60));

const combinations = [];
let skippedCount = 0;
const skippedDetails = [];

for (const grant of grants) {
  for (const company of companies) {
    const eligibleSources = (company.profile.eligible_programs || [])
      .map(prog => programmeMapping[prog])
      .filter(Boolean);

    if (!eligibleSources.includes(grant.Source)) {
      skippedCount++;
      skippedDetails.push({
        grant: grant.Title,
        source: grant.Source,
        company: company.name,
        eligible: eligibleSources
      });
      continue;
    }

    combinations.push({
      grant: grant.Title,
      source: grant.Source,
      company: company.name,
      slack: company.slack_channel_id
    });
  }
}

// Results summary
const totalPossible = grants.length * companies.length;
console.log(`\nTotal grants: ${grants.length}`);
console.log(`Total companies: ${companies.length}`);
console.log(`Total possible combinations: ${totalPossible}`);
console.log(`\n✅ Valid combinations (will go to LLM): ${combinations.length}`);
console.log(`❌ Skipped combinations (programme not eligible): ${skippedCount}`);
console.log(`💰 LLM calls saved: ${skippedCount} (${((skippedCount/totalPossible)*100).toFixed(1)}%)`);

// Show valid combinations
console.log('\n' + '='.repeat(60));
console.log('VALID GRANT-COMPANY COMBINATIONS');
console.log('='.repeat(60));

// Group by company
const byCompany = {};
combinations.forEach(c => {
  if (!byCompany[c.company]) {
    byCompany[c.company] = { slack: c.slack, grants: [] };
  }
  byCompany[c.company].grants.push({ title: c.grant, source: c.source });
});

Object.entries(byCompany).forEach(([companyName, data]) => {
  const slackStatus = data.slack.startsWith('PLACEHOLDER') ? '⚠️ NO CHANNEL' : '✅';
  console.log(`\n${companyName} (${data.grants.length} grants) ${slackStatus}`);
  console.log(`  Slack: ${data.slack}`);
  data.grants.forEach(g => {
    console.log(`  - [${g.source}] ${g.title}`);
  });
});

// Show some skipped examples
if (skippedDetails.length > 0) {
  console.log('\n' + '='.repeat(60));
  console.log('EXAMPLE SKIPPED COMBINATIONS (first 5)');
  console.log('='.repeat(60));

  skippedDetails.slice(0, 5).forEach(s => {
    console.log(`\n❌ "${s.grant}" [${s.source}]`);
    console.log(`   Company: ${s.company}`);
    console.log(`   Company eligible for: ${s.eligible.join(', ') || 'NONE'}`);
  });
}

console.log('\n' + '='.repeat(60));
console.log('TEST COMPLETE');
console.log('='.repeat(60));
