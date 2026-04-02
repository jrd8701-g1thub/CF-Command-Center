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

async function fixHeaders() {
    const serviceAccountAuth = new JWT({
        email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
        key: GOOGLE_PRIVATE_KEY,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Sales'];

    // Explicitly set the headers to correct values
    const newHeaders = [
        'Timestamp',            // A
        'Transaction_ID',       // B
        'CID',                  // C
        'Customer_Name',        // D
        'Item_Name',            // E
        'Quantity',             // F
        'Unit_Price',           // G
        'Total_Price',          // H
        'Order_Type',           // I
        'Payment_Method',       // J
        'Staff_Name',           // K
        'Driver_Name',          // L
        'Commission_Earned',     // M
        'Unplanned_Delivery_Date', // N
        'Unplanned_Delivery_Time', // O
        'Delivery Status',       // P
        'Audit Log',            // Q
        'Audit_Log_Timestamp'    // R
    ];

    await sheet.setHeaderRow(newHeaders);
    console.log('Headers updated successfully:', newHeaders);
}

fixHeaders().catch(console.error);
