import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const gKeyBase64 = process.env.GOOGLE_SERVICE_KEY_BASE64;
if (!gKeyBase64) throw new Error("No KEY");
const creds = JSON.parse(Buffer.from(gKeyBase64, 'base64').toString('utf8'));
const auth = new JWT({
    email: creds.client_email,
    key: creds.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
const doc = new GoogleSpreadsheet(process.env.GOOGLE_SHEET_ID, auth);
await doc.loadInfo();
const sheet = doc.sheetsByTitle['Sales'];
await sheet.loadHeaderRow();
console.log("Sales sheet headers:");
sheet.headerValues.forEach((val, i) => {
    console.log(`Col ${String.fromCharCode(65 + i)}: '${val}'`);
});
