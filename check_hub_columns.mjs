// Prints every column header in Staff_&_Commission_Hub with its letter and index
// Also shows the last 5 rows to confirm what's actually being written
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const eqIdx = line.indexOf('=');
  if (eqIdx > 0) {
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) process.env[key] = val;
  }
});

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const EMAIL    = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const KEY      = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const auth = new JWT({ email: EMAIL, key: KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc  = new GoogleSpreadsheet(SHEET_ID, auth);
await doc.loadInfo();

const hub = doc.sheetsByTitle['Staff_&_Commission_Hub'];
if (!hub) { console.error('❌ Sheet "Staff_&_Commission_Hub" not found!'); process.exit(1); }

// Load first row as headers
await hub.loadCells('A1:Z2');

console.log('\n=== Staff_&_Commission_Hub — Column Map ===');
const colLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
for (let c = 0; c < 26; c++) {
  const header = hub.getCell(0, c).value;
  if (!header) continue;
  console.log(`  ${colLetters[c]} (index ${c}): "${header}"`);
}

// Show last 5 data rows to see if anything is being written at the bottom
await hub.loadCells();
let lastRow = 0;
for (let r = hub.rowCount - 1; r >= 1; r--) {
  if (hub.getCell(r, 0).value || hub.getCell(r, 1).value) { lastRow = r; break; }
}

console.log(`\n=== Last row with data: row ${lastRow + 1} (0-indexed: ${lastRow}) ===`);
console.log('  (Showing last 5 rows)');
for (let r = Math.max(1, lastRow - 4); r <= lastRow; r++) {
  const rowData: Record<string, string> = {};
  for (let c = 0; c < 16; c++) {
    const val = hub.getCell(r, c).value;
    if (val !== null && val !== undefined && val !== '') {
      rowData[colLetters[c]] = String(val);
    }
  }
  console.log(`  Row ${r + 1}: ${JSON.stringify(rowData)}`);
}
