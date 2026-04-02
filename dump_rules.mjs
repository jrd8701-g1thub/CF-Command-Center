/**
 * dump_rules.mjs
 * Dump the exact contents of POS_System_Control cells A15:B65
 */
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';

const envPath = '/Users/jradmin/Library/Mobile Documents/com~apple~CloudDocs/Anti Gravity/CF-Command-Center/.env.local';
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
    }
    env[key] = val;
}

const auth = new JWT({ email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, key: (env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n'), scopes: ['https://www.googleapis.com/auth/spreadsheets'] });

async function dump() {
    const doc = new GoogleSpreadsheet(env.GOOGLE_SHEET_ID, auth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['POS_System_Control'];
    await sheet.loadCells('A15:B65');
    console.log('=== POS_System_Control (A15:B65) ===');
    for (let r = 14; r < 65; r++) {
        const a = sheet.getCell(r, 0).value;
        const b = sheet.getCell(r, 1).value;
        if (a !== null || b !== null) {
            console.log(`[R${r + 1}] A: "${a}"  |  B: "${b}"`);
        }
    }
}

dump().catch(console.error);
