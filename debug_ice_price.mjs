/**
 * debug_ice_price.mjs — Check Ice Type values in Customers sheet vs POS price map
 */
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const auth = new JWT({ email: CLIENT_EMAIL, key: PRIVATE_KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet(SHEET_ID, auth);
await doc.loadInfo();
console.log('✅ Connected:', doc.title, '\n');

// 1. Build price map from POS Control
const pos = doc.sheetsByTitle['POS_System_Control'];
await pos.loadCells('A1:C50');
console.log('=== POS Price Map (rows 5-11 in sheet, 0-indexed 4-10) ===');
const priceMap = {
    'water (refill)': 25,
    'water (delivery)': 30,
    'water': 30
};
for (let i = 4; i < 16; i++) {
    const name = pos.getCell(i, 0).value;
    const price = pos.getCell(i, 1).value;
    if (name) {
        const key = name.toString().toLowerCase();
        const numPrice = typeof price === 'number' ? price : parseFloat(price?.toString() || '0');
        priceMap[key] = numPrice;
        console.log(`  Row ${i+1}: key="${key}" => ₱${numPrice}`);
    }
}

// 2. Check Customers sheet
const cust = doc.sheetsByTitle['Customers'];
await cust.loadCells('A1:N200');
const custRows = await cust.getRows();

console.log('\n=== Customers sheet headers (cols A-N) ===');
cust.headerValues.slice(0, 14).forEach((h, i) => {
    const col = String.fromCharCode(65 + i);
    console.log(`  ${col}: "${h}"`);
});

console.log('\n=== Customers with Ice Type set ===');
custRows.forEach(row => {
    const cid = row.get('CID');
    const name = row.get('Customer / Company');
    const iceType = row.get('Ice Type');
    const iceQty = row.get('Ice Qty');
    if (cid && iceType) {
        const iNameRaw = iceType.toString().trim();
        const matchMatch = iNameRaw.match(/(\d+)\s*kg/i);
        const size = matchMatch ? matchMatch[1] + 'KG' : '';
        const normName = size ? `${size} Ice` : iNameRaw;

        const p1 = priceMap[normName.toLowerCase()] || 0;
        const p2 = size ? (priceMap[`ice - ${size}`.toLowerCase()] || 0) : 0;
        const p3 = size ? (priceMap[size.toLowerCase()] || 0) : 0;
        const finalPrice = p1 || p2 || p3;
        const status = finalPrice > 0 ? '✅' : '❌ PRICE NOT FOUND';

        console.log(`  CID=${cid} "${name}"`);
        console.log(`    Raw IceType="${iNameRaw}" | IceQty="${iceQty}"`);
        console.log(`    normName="${normName}" | p1=${p1} p2=${p2} p3=${p3} | FINAL=₱${finalPrice} ${status}`);
    }
});
