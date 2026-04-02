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

async function verify() {
    const serviceAccountAuth = new JWT({
        email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: GOOGLE_PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const salesSheet = doc.sheetsByTitle['Sales'];
    await salesSheet.loadHeaderRow();
    const headers = salesSheet.headerValues;

    console.log('--- Sales Sheet Column Check ---');
    console.log(`Column M (index 12): ${headers[12]}`);
    console.log(`Column Q (index 16): ${headers[16]}`);
    console.log(`Column R (index 17): ${headers[17]}`);

    const rows = await salesSheet.getRows();
    const lastRow = rows[rows.length - 1];

    console.log('\n--- Last Row Data ---');
    console.log(`Timestamp: ${lastRow.get('Timestamp')}`);
    console.log(`Commission: ${lastRow.get('Commission_Earned')}`);
    console.log(`Audit Log: ${lastRow.get('Audit Log')}`);
    console.log(`Audit Timestamp (Col R): ${lastRow.get(headers[17])}`);
}

verify().catch(console.error);
