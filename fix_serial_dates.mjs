// Fix corrupt date/time serial numbers in the remaining open sessions
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
await staffHub.loadHeaderRow();
const scanRows = Math.min(staffHub.rowCount, 2000);
await staffHub.loadCells(`A1:N${scanRows}`);

// Convert Excel date serial → YYYY-MM-DD
function serialToDate(val) {
    if (typeof val !== 'number' || val < 1000) return null;
    const msPerDay = 24 * 60 * 60 * 1000;
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + val * msPerDay);
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${mo}-${d}`;
}

// Convert Google Sheets time fraction → "HH:MM AM/PM"
function serialToTime(val) {
    if (typeof val !== 'number' || val <= 0 || val >= 1) return null;
    const totalMins = Math.round(val * 24 * 60);
    const h = Math.floor(totalMins / 60) % 24;
    const m = totalMins % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
}

let fixCount = 0;
for (let i = 1; i < scanRows; i++) {
    const name = staffHub.getCell(i, 1).value?.toString().trim();
    if (!name) continue;

    const dateCell = staffHub.getCell(i, 0);
    const timeCell = staffHub.getCell(i, 3);
    const dateVal = dateCell.value;
    const timeVal = timeCell.value;

    let changed = false;

    // Fix serial date
    if (typeof dateVal === 'number') {
        const fixed = serialToDate(dateVal);
        if (fixed) {
            console.log(`Row ${i} ${name}: date ${dateVal} → "${fixed}"`);
            dateCell.value = fixed;
            changed = true;
        } else {
            console.log(`Row ${i} ${name}: date ${dateVal} is small serial, marking UNKNOWN`);
            dateCell.value = 'UNKNOWN';
            changed = true;
        }
    }

    // Fix serial time
    if (typeof timeVal === 'number') {
        const fixed = serialToTime(timeVal);
        if (fixed) {
            console.log(`Row ${i} ${name}: time ${timeVal} → "${fixed}"`);
            timeCell.value = fixed;
            changed = true;
        }
    }

    if (changed) fixCount++;
}

await staffHub.saveUpdatedCells();
console.log(`\nFixed ${fixCount} rows with serial date/time values.`);
