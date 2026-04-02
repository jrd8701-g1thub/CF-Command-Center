// Creates a clean 'Expenses' sheet in Google Sheets with proper headers
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

let expSheet = doc.sheetsByTitle['Expenses'];
if (expSheet) {
  console.log('✅ Expenses sheet already exists.');
} else {
  expSheet = await doc.addSheet({
    title: 'Expenses',
    headerValues: ['Date', 'Staff_Name', 'Category', 'Amount', 'Notes'],
  });
  console.log('✅ Created Expenses sheet with headers: Date, Staff_Name, Category, Amount, Notes');
}

await expSheet.loadHeaderRow();
console.log('  Headers:', expSheet.headerValues.join(', '));
console.log('\nDone! Dashboard expenses will now write to the "Expenses" tab.');
