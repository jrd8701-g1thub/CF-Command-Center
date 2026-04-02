import { GoogleSpreadsheet } from 'google-spreadsheet';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const creds = require('./cf-service-account.json');

const SHEET_ID = '1Iq9jVl1Nf916eY2gG7TquQG-S2qZ9o8b2zI-CstT284';

async function checkHeaders() {
    const doc = new GoogleSpreadsheet(SHEET_ID, creds);
    await doc.loadInfo();
    const custSheet = doc.sheetsByTitle['Customers'];
    await custSheet.loadCells('A1:M1');
    
    const headers = [];
    for(let i=0; i<13; i++) {
        headers.push(custSheet.getCell(0, i).value);
    }
    console.log("Current Headers:", headers);
}
checkHeaders().catch(console.error);
