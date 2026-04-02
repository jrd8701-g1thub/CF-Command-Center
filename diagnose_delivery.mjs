/**
 * diagnose_delivery.mjs  —  Traces commission logic and column writes against the live sheet.
 * Run from project root: node diagnose_delivery.mjs
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

if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error('❌ Missing env vars — check .env.local');
    process.exit(1);
}

const auth = new JWT({ email: CLIENT_EMAIL, key: PRIVATE_KEY, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });

async function fetchCommissionRules(doc) {
    try {
        const sheet = doc.sheetsByTitle['POS_System_Control'];
        await sheet.loadCells('A15:B65');
        const rules = [];
        let current = {};
        for (let r = 14; r < 65; r++) {
            const label = sheet.getCell(r, 0).value?.toString().toLowerCase().trim() || '';
            const val = sheet.getCell(r, 1).value?.toString().trim() || '';
            if (!label || !val) continue;
            if (label.includes('keyword')) {
                if (current.keyword !== undefined) rules.push(current);
                current = { keyword: val.toLowerCase() };
            } else if (label.includes('type')) { current.type = val === 'Weight' ? 'Weight' : 'Fixed'; }
            else if (label.includes('value') || label.includes('divisor')) { current.value = parseFloat(val.replace(/[^0-9.-]+/g, '')) || 0; }
            else if (label.includes('cap') || (label.includes('max') && !label.includes('maximum'))) { current.maxCap = parseFloat(val.replace(/[^0-9.-]+/g, '')) || 0; }
        }
        if (current.keyword !== undefined) rules.push(current);
        return rules;
    } catch (e) { console.error('fetchCommissionRules error:', e.message); return []; }
}

function calculateCommission(itemName, quantity, orderType, rules) {
    if (!orderType.toLowerCase().includes('delivery') || orderType.toLowerCase().includes('walk-in')) return 0;
    let commPerUnit = 0;
    const lowerName = itemName.toLowerCase();
    for (const rule of rules) {
        if (lowerName.includes(rule.keyword)) {
            if (rule.type === 'Fixed') {
                commPerUnit = rule.value;
            } else if (rule.type === 'Weight') {
                const match = lowerName.match(/(\d+)\s*kg/);
                if (match) {
                    const weight = parseFloat(match[1]);
                    let calc = weight / (rule.value || 1);
                    if (rule.maxCap > 0 && calc > rule.maxCap) calc = rule.maxCap;
                    commPerUnit = calc;
                }
            }
            break;
        }
    }
    return commPerUnit * (isNaN(quantity) ? 0 : quantity);
}

async function main() {
    const doc = new GoogleSpreadsheet(SHEET_ID, auth);
    await doc.loadInfo();
    console.log('✅ Connected:', doc.title, '\n');

    // 1. Headers
    const salesSheet = doc.sheetsByTitle['Sales'];
    await salesSheet.loadHeaderRow();
    console.log('=== SALES SHEET HEADERS ===');
    salesSheet.headerValues.forEach((h, i) => {
        const col = String.fromCharCode(65 + i);
        const marker = [12, 13, 14, 15].includes(i) ? ' <<< KEY COLUMN' : '';
        console.log(`  ${col} (${i}): "${h}"${marker}`);
    });

    // 2. Commission rules
    const rules = await fetchCommissionRules(doc);
    console.log('\n=== COMMISSION RULES FROM POS_System_Control (A15:B65) ===');
    if (rules.length === 0) {
        console.warn('  ⚠️  NONE FOUND — commission will always calculate as 0!');
    } else {
        rules.forEach(r => console.log(`  keyword="${r.keyword}" | type=${r.type} | value=${r.value} | maxCap=${r.maxCap}`));
    }

    // 3. Last 5 delivery rows
    const rows = await salesSheet.getRows();
    const deliveryRows = rows.filter(r => (r.get('Order_Type') || '').toLowerCase().includes('delivery')).slice(-5);
    console.log(`\n=== LAST ${deliveryRows.length} DELIVERY ROWS ===`);
    for (const row of deliveryRows) {
        const item = row.get('Item_Name') || '';
        const qty = parseFloat(row.get('Quantity') || '0');
        const ot = row.get('Order_Type') || '';
        const ds = row.get('Delivery Status') || '';
        const commField = row.get('Commission_Earned');
        const colN = row.get(salesSheet.headerValues[13]);  // actual col N header
        const colO = row.get(salesSheet.headerValues[14]);  // actual col O header
        const calcComm = calculateCommission(item, qty, ot, rules);
        const passesCheck = ot.toLowerCase().includes('delivery') && !ot.toLowerCase().includes('walk-in');

        console.log(`\n  TXN: ${row.get('Transaction_ID')}`);
        console.log(`    Item: "${item}"  Qty: ${qty}`);
        console.log(`    Order_Type: "${ot}"`);
        console.log(`    orderType.includes('delivery'): ${passesCheck}  ← must be TRUE for commission`);
        console.log(`    Delivery Status: "${ds}"`);
        console.log(`    Commission_Earned (Col M): raw="${commField}"  parsed="${parseFloat(commField || '0')}"`);
        console.log(`    Calculated commission would be: ${calcComm}`);
        console.log(`    Col N "${salesSheet.headerValues[13]}": "${colN}"`);
        console.log(`    Col O "${salesSheet.headerValues[14]}": "${colO}"`);
    }

    // 4. Live write test on the last row that has 'delivery' and is 'Delivery Completed'
    const testRow = deliveryRows.reverse().find(r =>
        (r.get('Delivery Status') || '').toLowerCase().includes('completed')
    );
    if (testRow) {
        console.log('\n=== LIVE WRITE TEST ===');
        console.log(`  Target TXN: ${testRow.get('Transaction_ID')}`);
        const calcComm = calculateCommission(
            testRow.get('Item_Name') || '',
            parseFloat(testRow.get('Quantity') || '0'),
            testRow.get('Order_Type') || '',
            rules
        );
        console.log(`  Writing Commission_Earned = ${calcComm}`);
        testRow.set('Commission_Earned', calcComm);
        await testRow.save();
        console.log('  ✅ row.save() completed — check Google Sheet col M now!');
    } else {
        console.log('\n  No completed delivery row found. Skipping live write test.');
    }
}

main().catch(e => { console.error('\n❌ Fatal error:', e.message); process.exit(1); });
