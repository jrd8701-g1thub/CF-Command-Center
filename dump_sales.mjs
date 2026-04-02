import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

async function dump() {
    const auth = new JWT({
        email: CLIENT_EMAIL,
        key: PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Sales'];
    const rows = await sheet.getRows();

    console.log('Last 10 Sales:');
    rows.slice(-10).forEach(row => {
        console.log(`${row.get('Timestamp')} | ${row.get('Item_Name')} | Qty: ${row.get('Quantity')} | Order: ${row.get('Order_Type')} | Comm: ${row.get('Commission_Earned')}`);
    });
}

dump().catch(console.error);
