// Debug script: check Staff_&_Commission_Hub headers and test ADD_EXPENSE logic
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Load .env.local manually
const envPath = path.join(__dirname, '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && vals.length) {
    process.env[key.trim()] = vals.join('=').trim().replace(/^["']|["']$/g, '');
  }
});

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const auth = new JWT({ email: EMAIL, key: KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet(SHEET_ID, auth);
await doc.loadInfo();

const hub = doc.sheetsByTitle['Staff_&_Commission_Hub'];
if (!hub) { console.error('Sheet not found!'); process.exit(1); }

await hub.loadHeaderRow();
const headers = hub.headerValues;
console.log('\n=== Staff_&_Commission_Hub HEADERS ===');
headers.forEach((h, i) => {
  const col = String.fromCharCode(65 + i); // A, B, C...
  console.log(`  ${col} (col ${i}): "${h}"`);
});

// Check which ones match expense patterns
const amtH = headers.find(h => h === 'Expense_Amount' || /^expense.*(amount|amt)/i.test(h));
const descH = headers.find(h => h === 'Expense_Description' || /^expense.*(desc|name)/i.test(h));
const dateH = headers.find(h => /^date$/i.test(h));
const nameH = headers.find(h => /staff.*name/i.test(h));

console.log('\n=== MATCHED COLUMNS ===');
console.log('  Date column    :', dateH || 'NOT FOUND - will default to "Date"');
console.log('  Staff Name col :', nameH || 'NOT FOUND - will default to "Staff_Name"');
console.log('  Expense Desc   :', descH || 'NOT FOUND - will default to "Expense_Description"');
console.log('  Expense Amount :', amtH || 'NOT FOUND - will default to "Expense_Amount"');

// Try a test row
console.log('\n=== TESTING ADD ROW ===');
const today = new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
const testRow = {};
testRow[dateH || 'Date'] = today;
testRow[nameH || 'Staff_Name'] = 'DEBUG_TEST';
testRow[descH || 'Expense_Description'] = 'DEBUG_SNACK';
testRow[amtH || 'Expense_Amount'] = 0.01;

console.log('  Row to insert:', JSON.stringify(testRow, null, 2));
try {
  const added = await hub.addRow(testRow);
  console.log('  ✅ SUCCESS! Row added at rowNumber:', added.rowNumber);
} catch(e) {
  console.error('  ❌ FAILED:', e.message);
}
