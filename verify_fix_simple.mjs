import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

async function test() {
    if (!SHEET_ID || !CLIENT_EMAIL || !PRIVATE_KEY) {
        console.error('Missing environment variables');
        process.exit(1);
    }

    const auth = new JWT({
        email: CLIENT_EMAIL,
        key: PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Sales'];
    await sheet.loadHeaderRow();

    console.log('Headers:', sheet.headerValues.slice(0, 20));

    const rows = await sheet.getRows();
    const lastRow = rows[rows.length - 1];

    console.log('\n--- Last Row Verification ---');
    console.log('Transaction ID:', lastRow.get('Transaction_ID'));
    console.log('Commission Earned (Col M):', lastRow.get('Commission_Earned'));
    console.log('Audit Log (Col Q):', lastRow.get('Audit Log'));
    console.log('Audit Timestamp (Col R):', lastRow.get('Audit_Log_Timestamp'));
}

test().catch(console.error);
