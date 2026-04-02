import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';

const keys = JSON.parse(fs.readFileSync('./secrets/service-account.json', 'utf8'));
const jwt = new JWT({ email: keys.client_email, key: keys.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet('1X-Z7pB6m4ZNY7kInF51P3G-C5v3U51D9slyeApxQshk', jwt);
await doc.loadInfo();
const sheet = doc.sheetsByTitle['Sales'];
await sheet.loadHeaderRow();
console.log('Sales Headers:', sheet.headerValues);
