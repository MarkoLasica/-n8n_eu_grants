import csv
import sys
from collections import defaultdict, Counter

# Set UTF-8 encoding for console output
sys.stdout.reconfigure(encoding='utf-8')

# Read the CSV file
file_path = r'C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants\data\grants\eu_portal_grants.csv'

print("Reading CSV file...")
with open(file_path, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(f"Total rows in CSV: {len(rows)}")
if rows:
    print(f"Columns: {list(rows[0].keys())}\n")

# Data structures for analysis
all_rows = []
title_to_rows = defaultdict(list)
link_to_rows = defaultdict(list)
title_link_to_rows = defaultdict(list)
exact_row_signatures = defaultdict(list)

# Process each row
for idx, row in enumerate(rows):
    title = row.get('Title', '').strip()
    link = row.get('Link', '').strip()
    date = row.get('Date', '').strip()
    description = row.get('Description', '').strip()

    # Create a signature for exact duplicates (all fields)
    row_signature = f"{title}|{link}|{date}|{description}"
    exact_row_signatures[row_signature].append(idx)

    # Track by title
    title_to_rows[title].append({'idx': idx, 'link': link, 'date': date})

    # Track by link
    link_to_rows[link].append({'idx': idx, 'title': title, 'date': date})

    # Track by title+link combination
    title_link_key = f"{title}|||{link}"
    title_link_to_rows[title_link_key].append({'idx': idx, 'date': date})

# Check for duplicates based on different criteria
print("=" * 80)
print("DUPLICATE ANALYSIS")
print("=" * 80)

# 1. Check for exact duplicate rows
exact_duplicates = {k: v for k, v in exact_row_signatures.items() if len(v) > 1}
if exact_duplicates:
    print(f"\n1. EXACT DUPLICATE ROWS: {sum(len(v) for v in exact_duplicates.values())} total rows in {len(exact_duplicates)} groups")
    for sig, indices in list(exact_duplicates.items())[:5]:  # Show first 5 groups
        print(f"\n   Group with {len(indices)} identical rows:")
        print(f"   Title: {rows[indices[0]]['Title'][:80]}...")
        print(f"   Dates: {[rows[i]['Date'] for i in indices]}")
else:
    print("\n1. EXACT DUPLICATE ROWS: None found")

# 2. Check for duplicate titles
print("\n" + "=" * 80)
duplicate_titles = {k: v for k, v in title_to_rows.items() if len(v) > 1}
if duplicate_titles:
    print(f"\n2. DUPLICATE TITLES: {len(duplicate_titles)} unique titles with duplicates")
    print(f"   Total duplicate rows: {sum(len(v) for v in duplicate_titles.values())}")
    print("\nDuplicate titles and their counts (showing first 10):")
    for i, (title, occurrences) in enumerate(list(duplicate_titles.items())[:10]):
        print(f"\n   {i+1}. '{title}': {len(occurrences)} occurrences")
        dates = [occ['date'] for occ in occurrences]
        links = list(set([occ['link'] for occ in occurrences]))
        print(f"      Dates: {dates}")
        print(f"      Unique links: {len(links)}")
        if len(links) <= 3:
            for link in links:
                print(f"        - {link[:100]}...")
else:
    print("\n2. DUPLICATE TITLES: None found")

# 3. Check for duplicate links
print("\n" + "=" * 80)
duplicate_links = {k: v for k, v in link_to_rows.items() if len(v) > 1}
if duplicate_links:
    print(f"\n3. DUPLICATE LINKS: {len(duplicate_links)} unique links with duplicates")
    print(f"   Total duplicate rows: {sum(len(v) for v in duplicate_links.values())}")
    print("\nDuplicate links and their counts (showing first 10):")
    for i, (link, occurrences) in enumerate(list(duplicate_links.items())[:10]):
        print(f"\n   {i+1}. Link appears {len(occurrences)} times:")
        print(f"      {link[:150]}...")
        titles = list(set([occ['title'] for occ in occurrences]))
        dates = [occ['date'] for occ in occurrences]
        print(f"      Unique titles: {len(titles)}")
        if len(titles) <= 3:
            for title in titles:
                print(f"        - {title[:80]}")
        print(f"      Dates: {dates}")
else:
    print("\n3. DUPLICATE LINKS: None found")

# 4. Check for duplicate Title + Link combinations
print("\n" + "=" * 80)
duplicate_title_links = {k: v for k, v in title_link_to_rows.items() if len(v) > 1}
if duplicate_title_links:
    print(f"\n4. DUPLICATE TITLE + LINK COMBINATIONS: {sum(len(v) for v in duplicate_title_links.values())} total rows in {len(duplicate_title_links)} groups")
    print("\nShowing first 10 duplicate combinations:")
    for i, (key, occurrences) in enumerate(list(duplicate_title_links.items())[:10]):
        title, link = key.split('|||')
        print(f"\n   {i+1}. Combination appears {len(occurrences)} times:")
        print(f"      Title: {title[:80]}")
        print(f"      Link: {link[:100]}...")
        dates = [occ['date'] for occ in occurrences]
        print(f"      Dates: {dates}")
else:
    print("\n4. DUPLICATE TITLE + LINK COMBINATIONS: None found")

# Summary
print("\n" + "=" * 80)
print("SUMMARY")
print("=" * 80)
print(f"Total grants in file: {len(rows)}")
print(f"Unique titles: {len(title_to_rows)}")
print(f"Unique links: {len(link_to_rows)}")
print(f"Exact duplicate rows (all fields match): {len(exact_duplicates)} groups, {sum(len(v) for v in exact_duplicates.values())} total rows")
print(f"Titles appearing multiple times: {len(duplicate_titles)}")
print(f"Links appearing multiple times: {len(duplicate_links)}")
print(f"Title+Link combinations appearing multiple times: {len(duplicate_title_links)}")

# Save duplicate details to a file
if duplicate_title_links or duplicate_titles or duplicate_links:
    output_file = r'C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants\duplicates_report.txt'
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("DUPLICATE GRANTS REPORT\n")
        f.write("=" * 80 + "\n\n")

        if duplicate_title_links:
            f.write(f"DUPLICATE TITLE + LINK COMBINATIONS: {len(duplicate_title_links)}\n")
            f.write("-" * 80 + "\n")
            for key, occurrences in duplicate_title_links.items():
                title, link = key.split('|||')
                f.write(f"\nTitle: {title}\n")
                f.write(f"Link: {link}\n")
                f.write(f"Occurrences: {len(occurrences)}\n")
                dates = [occ['date'] for occ in occurrences]
                f.write(f"Dates: {', '.join(dates)}\n")
                f.write("-" * 80 + "\n")

    print(f"\nDetailed report saved to: {output_file}")
