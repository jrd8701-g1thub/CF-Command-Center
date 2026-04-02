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

async function debugSheet() {
    const serviceAccountAuth = new JWT({
        email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: GOOGLE_PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const salesSheet = doc.sheetsByTitle['Sales'];
    const rows = await salesSheet.getRows();

    if (rows.length === 0) {
        console.log('No rows found in Sales sheet');
        return;
    }

    const lastRow = rows[rows.length - 1];
    console.log('--- Last Row Internal Keys ---');
    console.log(Object.keys(lastRow.toObject()));
    console.log('--- Last Row Data (toObject) ---');
    console.log(lastRow.toObject());
}

debugSheet().catch(console.error);
