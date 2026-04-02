// Cleanup script: closes all stale/duplicate open sessions in Staff_&_Commission_Hub
// Marks any open row (E=null) that is older than the NEWEST open session per employee
// Also fixes rows with missing Clock_In_Time by setting a placeholder

import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import { readFileSync } from 'fs';

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
if (!staffHub) { console.error('Sheet not found!'); process.exit(1); }

await staffHub.loadHeaderRow();
const totalRows = staffHub.rowCount;
const scanRows = Math.min(totalRows, 2000);
await staffHub.loadCells(`A1:N${scanRows}`);

// Find the MOST RECENT open row per employee (walking backwards)
const newestOpenRow = {}; // name -> rowIndex
let lastDataRow = 0;

for (let i = scanRows - 1; i >= 1; i--) {
    const name = staffHub.getCell(i, 1).value?.toString().trim();
    if (!name) continue;
    if (!lastDataRow) lastDataRow = i;

    const eVal = staffHub.getCell(i, 4).value;
    const isOpen = eVal === null || eVal === undefined || eVal === '' || eVal === 0;
    if (isOpen && !newestOpenRow[name]) {
        newestOpenRow[name] = i;
    }
}

console.log('Newest open row per employee:', newestOpenRow);

// Now find ALL open rows and close duplicates (any open row that is NOT the newest)
let closedCount = 0;
let fixedDateCount = 0;

for (let i = 1; i <= lastDataRow; i++) {
    const name = staffHub.getCell(i, 1).value?.toString().trim();
    if (!name) continue;

    const eVal = staffHub.getCell(i, 4).value;
    const isOpen = eVal === null || eVal === undefined || eVal === '' || eVal === 0;

    if (isOpen) {
        if (newestOpenRow[name] !== i) {
            // This is a stale duplicate — close it with a note
            console.log(`  Closing stale open row ${i} for ${name} (newest is ${newestOpenRow[name]})`);
            staffHub.getCell(i, 4).value = '[CLEANED]';
            staffHub.getCell(i, 5).value = 'cleanup';
            staffHub.getCell(i, 13).value = '[Auto-closed: duplicate open session]';
            closedCount++;
        } else {
            // This is the valid open row — check if date/time is corrupt
            const dateVal = staffHub.getCell(i, 0).value;
            const timeVal = staffHub.getCell(i, 3).value;
            
            // Fix corrupt date (decimal fraction = Google Sheets serial for time)
            if (typeof dateVal === 'number' && dateVal < 1000) {
                console.log(`  Row ${i} ${name}: corrupt date "${dateVal}" — marking as UNKNOWN`);
                staffHub.getCell(i, 0).value = 'UNKNOWN';
                fixedDateCount++;
            }
            if (!timeVal || timeVal === '') {
                console.log(`  Row ${i} ${name}: missing clock-in time — marking as --:--`);
                staffHub.getCell(i, 3).value = '--:--';
            }
        }
    }
}

await staffHub.saveUpdatedCells();
console.log(`\nDone. Closed ${closedCount} stale sessions, fixed ${fixedDateCount} corrupt dates.`);
console.log('\nFinal state of open sessions:');
for (const [name, rowIdx] of Object.entries(newestOpenRow)) {
    const dateVal = staffHub.getCell(rowIdx, 0).value;
    const timeVal = staffHub.getCell(rowIdx, 3).value;
    console.log(`  ${name}: row ${rowIdx}, date="${dateVal}", time="${timeVal}"`);
}
