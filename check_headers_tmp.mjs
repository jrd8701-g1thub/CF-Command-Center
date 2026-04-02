import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });

async function run() {
    const auth = new JWT({
        email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Sales'];
    if (!sheet) {
        console.error('Sales sheet not found');
        return;
    }
    await sheet.loadHeaderRow();
    console.log('---HEADERS---');
    console.log(JSON.stringify(sheet.headerValues));

    const rows = await sheet.getRows();
    if (rows.length > 0) {
        const lastRow = rows[rows.length - 1];
        const data = {};
        sheet.headerValues.forEach(h => {
            data[h] = lastRow.get(h);
        });
        console.log('---LAST_ROW---');
        console.log(JSON.stringify(data));
    }
}
run().catch(console.error);
