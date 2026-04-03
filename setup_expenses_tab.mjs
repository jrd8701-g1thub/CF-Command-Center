import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import path from 'path';

// Parse .env.local natively
const envContent = fs.readFileSync(path.resolve(process.cwd(), '.env.local'), 'utf8');
envContent.split('\n').filter(line => line.trim() && !line.startsWith('#')).forEach(line => {
    const i = line.indexOf('=');
    if(i !== -1) {
        const key = line.substring(0, i).trim();
        let val = line.substring(i + 1).trim();
        if(val.startsWith('"') && val.endsWith('"') || val.startsWith("'") && val.endsWith("'")) {
            val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
    }
});

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
    console.error("Missing Google Sheets credentials in environment variables.");
    process.exit(1);
}

const serviceAccountAuth = new JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function main() {
    console.log("Connecting to Google Sheets...");
    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();

    let expensesSheet = doc.sheetsByTitle['Expenses'];
    const opexBudgetSheet = doc.sheetsByTitle['OpEx_Budget'];

    console.log("Analyzing current state...");
    let oldBudgets = [];
    if (opexBudgetSheet) {
        await opexBudgetSheet.loadCells('A1:C500');
        const count = Math.min(opexBudgetSheet.rowCount, 500);
        for (let i = 1; i < count; i++) {
            const desc = opexBudgetSheet.getCell(i, 0).value;
            const amt = opexBudgetSheet.getCell(i, 1).value;
            if (desc && amt !== null) {
                oldBudgets.push({ desc: desc.toString(), category: 'OPEX', amt: Number(amt) });
            }
        }
    }

    let oldExpenses = [];
    if (expensesSheet) {
        const rows = await expensesSheet.getRows();
        for (const row of rows) {
            const date = row.get('Date') || '';
            const staffName = row.get('Staff_Name') || '';
            const category = row.get('Category') || row.get('Description') || '';
            const amount = row.get('Amount') || '';
            if (date && amount) {
                // If it looks like a real expense, save it
                oldExpenses.push({ date, staffName, category, amount });
            }
        }
    }

    if (!expensesSheet) {
        console.log("Creating new Expenses sheet...");
        expensesSheet = await doc.addSheet({ title: 'Expenses', gridProperties: { columnCount: 15, rowCount: 1000 } });
    } else {
        console.log("Clearing old Expenses sheet to apply new format...");
        await expensesSheet.clear();
        await expensesSheet.resize({ rowCount: 1000, columnCount: 15 });
    }

    console.log("Formatting new Expenses sheet layout...");
    // Only load the cells we strictly need, or loading 15 * 1000 is 15,000 cells (can take a moment)
    await expensesSheet.loadCells('A1:M100'); 

    // Setup A1:C1 (Categories)
    expensesSheet.getCell(0, 0).value = 'Description';
    expensesSheet.getCell(0, 1).value = 'Type';
    expensesSheet.getCell(0, 2).value = 'Monthly_Budget';

    // Set A2:C down
    for (let i = 0; i < oldBudgets.length; i++) {
        expensesSheet.getCell(i + 1, 0).value = oldBudgets[i].desc;
        expensesSheet.getCell(i + 1, 1).value = oldBudgets[i].category;
        expensesSheet.getCell(i + 1, 2).value = oldBudgets[i].amt;
    }

    // Default COGS entry for testing
    let cogsIdx = oldBudgets.length + 1;
    expensesSheet.getCell(cogsIdx, 0).value = 'Ice Parts';
    expensesSheet.getCell(cogsIdx, 1).value = 'COGS';
    expensesSheet.getCell(cogsIdx, 2).value = 5000;

    // Setup E1:H1 (OPEX Log)
    expensesSheet.getCell(0, 4).value = 'Date';
    expensesSheet.getCell(0, 5).value = 'Staff_Name';
    expensesSheet.getCell(0, 6).value = 'Description';
    expensesSheet.getCell(0, 7).value = 'Amount';

    // Restore old expenses into OPEX
    for (let i = 0; i < oldExpenses.length; i++) {
        // max bounds protection for our short cell load
        if (i + 1 >= 100) break; 
        expensesSheet.getCell(i + 1, 4).value = oldExpenses[i].date;
        expensesSheet.getCell(i + 1, 5).value = oldExpenses[i].staffName;
        expensesSheet.getCell(i + 1, 6).value = oldExpenses[i].category;
        expensesSheet.getCell(i + 1, 7).value = Number(oldExpenses[i].amount) || 0;
    }

    // Setup J1:M1 (COGS Log)
    expensesSheet.getCell(0, 9).value = 'Date';
    expensesSheet.getCell(0, 10).value = 'Staff_Name';
    expensesSheet.getCell(0, 11).value = 'Description';
    expensesSheet.getCell(0, 12).value = 'Amount';

    await expensesSheet.saveUpdatedCells();
    console.log("Layout created successfully.");
}

main().catch(console.error);
