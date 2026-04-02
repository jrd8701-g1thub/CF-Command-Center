import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

async function check() {
    const serviceAccountAuth = new JWT({
        email: CLIENT_EMAIL,
        key: PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Staff_&_Commission_Hub'];
    console.log(`Sheet: ${sheet.title}`);
    console.log(`Row count: ${sheet.rowCount}`);
    
    // Check first few and last few rows to see if they are empty
    await sheet.loadCells('A1:B10');
    console.log('Top rows:');
    for (let i = 0; i < 5; i++) {
        console.log(`Row ${i}: ${sheet.getCell(i, 0).value}, ${sheet.getCell(i, 1).value}`);
    }

    const lastRow = sheet.rowCount - 1;
    await sheet.loadCells(`A${lastRow-10}:B${lastRow+1}`);
    console.log('Bottom rows:');
    for (let i = lastRow - 5; i <= lastRow; i++) {
        console.log(`Row ${i}: ${sheet.getCell(i, 0).value}, ${sheet.getCell(i, 1).value}`);
    }
}

check().catch(console.error);
