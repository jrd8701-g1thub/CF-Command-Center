import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });

const SHEET_ID = process.env.GOOGLE_SHEET_ID;
const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n');

async function verify() {
    if (!SHEET_ID || !GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY) {
        console.error('Missing environment variables');
        process.exit(1);
    }

    const serviceAccountAuth = new JWT({
        email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: GOOGLE_PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const salesSheet = doc.sheetsByTitle['Sales'];

    console.log('Verifying Sales sheet headers...');
    await salesSheet.loadHeaderRow();
    const headers = salesSheet.headerValues;

    // Target indices (0-indexed):
    // L(11) = Driver_Name
    // M(12) = Commission_Earned
    // P(15) = Delivery_Status

    console.log(`Column L (Index 11): ${headers[11]}`);
    console.log(`Column M (Index 12): ${headers[12]}`);
    console.log(`Column P (Index 15): ${headers[15]}`);

    const okL = headers[11] === 'Driver_Name' || headers[11] === 'Driver Name' || headers[11] === 'Driver';
    const okM = headers[12] === 'Commission_Earned' || headers[12] === 'Commission Earned' || headers[12] === 'Commission';
    const okP = headers[15] === 'Delivery_Status' || headers[15] === 'Delivery Status';

    if (okL && okM && okP) {
        console.log('✅ Headers match unified schema.');
    } else {
        console.warn('⚠️ Header mismatch detected. Expected Driver in L, Commission in M, Status in P.');
    }
}

verify().catch(console.error);
