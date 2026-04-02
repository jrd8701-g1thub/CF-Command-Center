import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

const serviceAccountAuth = new JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function run() {
    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();

    const salesSheet = doc.sheetsByTitle['Sales'];
    await salesSheet.loadHeaderRow();
    console.log("HEADERS:");
    console.log(salesSheet.headerValues.map((h, i) => `${i}=${h}`).join(", "));

    await salesSheet.loadCells('A70:T75');
    console.log("--- ROW 73 ---");
    for (let i = 0; i < 20; i++) {
        const cell = salesSheet.getCell(72, i);
        console.log(`Col ${i} (${String.fromCharCode(65 + i)}):`, cell.value);
    }
}
run().catch(console.error);
