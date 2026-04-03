import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';

const creds = JSON.parse(fs.readFileSync('./JSON Key/cf-command-center-b2a745bb2fe5.json', 'utf8'));
const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet('15AOU_ur7mWhnoAFmf_qOVQ87OaXb36W8z4FbPgbxK60', auth);

async function test() {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Staff_&_Commission_Hub'];
    // We will clear out the bad rows starting from row index 124 (Row 125 in google sheets)
    await sheet.loadCells('A120:Z200');
    
    let cleared = 0;
    for (let r = 124; r <= 150; r++) {
        const d = sheet.getCell(r, 0).value;
        if (typeof d === 'number' && d > 0 && d < 1) {
            console.log("Clearing row", r + 1, "Name:", sheet.getCell(r, 1).value);
            for (let c = 0; c < 15; c++) {
                sheet.getCell(r, c).value = null;
            }
            cleared++;
        }
    }
    
    if (cleared > 0) {
        await sheet.saveUpdatedCells();
        console.log(`Saved ${cleared} cleared rows.`);
    }
}
test();
