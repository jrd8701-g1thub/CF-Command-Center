import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

async function checkSheet() {
    const serviceAccountAuth = new JWT({
        email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: GOOGLE_PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Sales'];

    console.log(`Checking Sales Sheet: ${sheet.title}`);
    console.log(`Headers: ${sheet.headerValues.join(', ')}`);

    const rows = await sheet.getRows();
    const lastRow = rows[rows.length - 1];

    if (lastRow) {
        console.log('\n--- Latest Row Data ---');
        console.log(`Timestamp: ${lastRow.get('Timestamp')}`);
        console.log(`Transaction_ID: ${lastRow.get('Transaction_ID')}`);
        console.log(`Item_Name: ${lastRow.get('Item_Name')}`);
        console.log(`Commission_Earned: ${lastRow.get('Commission_Earned')}`);
        console.log(`Audit Log: ${lastRow.get('Audit Log')}`);
        console.log(`Audit_Log_Timestamp: ${lastRow.get('Audit_Log_Timestamp')}`);

        // Check for specific columns indices if needed (though get() is more robust)
        const raw = lastRow._rawData;
        console.log('\n--- Raw Column Audit ---');
        console.log(`Column M (index 12): ${raw[12]}`); // Commission
        console.log(`Column Q (index 16): ${raw[16]}`); // Audit Log
        console.log(`Column R (index 17): ${raw[17]}`); // Audit Log Timestamp
    } else {
        console.log('No rows found.');
    }
}

checkSheet().catch(console.error);
