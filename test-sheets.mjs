import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const envPath = path.resolve(__dirname, '.env.local');
const envFile = fs.readFileSync(envPath, 'utf8');

const envs = {};
envFile.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
        let val = valueParts.join('=');
        if (val.startsWith('"') && val.endsWith('"')) {
            val = val.slice(1, -1);
        }
        envs[key] = val;
    }
});

const { GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY } = envs;

const serviceAccountAuth = new JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

async function run() {
    const doc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();

    const salesSheet = doc.sheetsByTitle['Sales'];
    await salesSheet.loadCells('A1:Z5');
    console.log("\n--- Sales Headers (Row 1) A-Z ---");
    const salesHeaders = [];
    for (let c = 0; c < 26; c++) {
        const val = salesSheet.getCell(0, c).value;
        if (val) salesHeaders.push(`${String.fromCharCode(65 + c)}: ${val}`);
    }
    console.log(salesHeaders.join(' | '));

    const customersSheet = doc.sheetsByTitle['Customers'];
    await customersSheet.loadCells('A1:L5');
    console.log("\n--- Customers Headers (Row 1) A-K ---");
    const headers = [];
    for (let c = 0; c < 11; c++) {
        headers.push(`${String.fromCharCode(65 + c)}: ${customersSheet.getCell(0, c).value}`);
    }
    console.log(headers.join(' | '));
}

run().catch(console.error);
