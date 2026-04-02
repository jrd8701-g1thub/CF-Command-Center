import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { readFileSync } from 'fs';

// Load .env.local manually
const envContent = readFileSync('.env.local', 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
    const m = line.match(/^([^=]+)="?(.+?)"?\s*$/);
    if (m) env[m[1].trim()] = m[2].trim();
}

const SHEET_ID = env.GOOGLE_SHEET_ID;
const CLIENT_EMAIL = env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const auth = new JWT({ email: CLIENT_EMAIL, key: PRIVATE_KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet(SHEET_ID, auth);

await doc.loadInfo();
const staffHub = doc.sheetsByTitle['Staff_&_Commission_Hub'];
if (!staffHub) { console.error('Sheet Staff_&_Commission_Hub not found!'); process.exit(1); }

await staffHub.loadHeaderRow();
console.log('=== HEADERS ===');
staffHub.headerValues.forEach((h, i) => console.log(`  Col ${i} (${String.fromCharCode(65+i)}): "${h}"`));

const totalRows = staffHub.rowCount;
const scanRows = Math.min(totalRows, 2000);
await staffHub.loadCells(`A1:N${scanRows}`);

// Find last data row
let lastDataRow = 0;
for (let i = scanRows - 1; i >= 1; i--) {
    if (staffHub.getCell(i, 1).value) { lastDataRow = i; break; }
}

const startRow = Math.max(1, lastDataRow - 20);
console.log(`\n=== RAW CELL DUMP (rows ${startRow}–${lastDataRow}) ===`);
console.log('Row | A_Date         | B_Name         | D_ClockIn      | E_ClockOut           | E_type    | F_LogoutDate');
console.log('----+----------------+----------------+----------------+----------------------+-----------+-------------');

for (let i = startRow; i <= lastDataRow; i++) {
    const A = staffHub.getCell(i, 0).value;
    const B = staffHub.getCell(i, 1).value;
    const D = staffHub.getCell(i, 3).value;
    const cellE = staffHub.getCell(i, 4);
    const E = cellE.value;
    const F = staffHub.getCell(i, 5).value;

    const eIsOpen = E === null || E === undefined || E === '' || E === 0;
    console.log(
        `${String(i).padStart(3)} | ${String(A ?? '').padEnd(14)} | ${String(B ?? '').padEnd(14)} | ${String(D ?? '').padEnd(14)} | ${JSON.stringify(E).padEnd(20)} | ${typeof E} | ${String(F ?? '')} [open=${eIsOpen}]`
    );
}

console.log('\n=== BACKWARD SEARCH — what CLOCK_OUT handler would find per employee ===');
const seen = new Set();
for (let i = lastDataRow; i >= 1; i--) {
    const name = staffHub.getCell(i, 1).value?.toString().trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const E = staffHub.getCell(i, 4).value;
    const EStr = staffHub.getCell(i, 4).value?.toString().trim() ?? '';
    const isOpenOld = EStr === '';                  // OLD logic
    const isOpenNew = E === null || E === undefined || E === '' || E === 0; // NEW logic
    console.log(`  Row ${String(i).padStart(3)} | ${String(name).padEnd(14)} | E=${JSON.stringify(E).padEnd(20)} | OLD_open=${isOpenOld} | NEW_open=${isOpenNew}`);
}
