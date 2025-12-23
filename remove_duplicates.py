import csv
import sys

# Set UTF-8 encoding for console output
sys.stdout.reconfigure(encoding='utf-8')

# File paths
input_file = r'C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants\data\grants\eu_portal_grants.csv'
output_file = r'C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants\data\grants\eu_portal_grants_cleaned.csv'
backup_file = r'C:\Users\Korisnik\Desktop\Alicorn\n8n_eu_grants\data\grants\eu_portal_grants_backup.csv'

print("Reading CSV file...")
with open(input_file, 'r', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    fieldnames = reader.fieldnames
    rows = list(reader)

print(f"Total rows before cleaning: {len(rows)}")

# Track unique rows using a signature
seen_signatures = set()
unique_rows = []
duplicate_count = 0

for row in rows:
    # Create a signature from all fields
    signature = f"{row['Title']}|{row['Link']}|{row['Date']}|{row['Description']}"

    if signature not in seen_signatures:
        seen_signatures.add(signature)
        unique_rows.append(row)
    else:
        duplicate_count += 1

print(f"Duplicates found and removed: {duplicate_count}")
print(f"Total rows after cleaning: {len(unique_rows)}")

# Create backup of original file
print(f"\nCreating backup of original file...")
import shutil
shutil.copy2(input_file, backup_file)
print(f"Backup saved to: {backup_file}")

# Write cleaned data to new file
print(f"\nWriting cleaned data to: {output_file}")
with open(output_file, 'w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(unique_rows)

print(f"\nCleaning complete!")
print(f"Original file (backed up): {backup_file}")
print(f"Cleaned file: {output_file}")
print(f"\nSummary:")
print(f"  - Original rows: {len(rows)}")
print(f"  - Duplicates removed: {duplicate_count}")
print(f"  - Final rows: {len(unique_rows)}")
