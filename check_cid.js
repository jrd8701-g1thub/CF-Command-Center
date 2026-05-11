const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const fs = require('fs');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const env = {};
envLocal.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) env[match[1]] = match[2].replace(/^["']|["']$/g, '');
});

const serviceAccountAuth = new JWT({
    email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});
async function run() {
    const doc = new GoogleSpreadsheet(env.GOOGLE_SHEET_ID, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['Customer_Database'];
    const rows = await sheet.getRows();
    rows.forEach(r => {
        const name = r.get('Customer / Company') || r.get('Customer') || r.get('Name') || 'Unknown';
        const cid = r.get('CID');
        if (name.includes('Mary Ann') || name.includes('Leila') || cid === '40') {
            console.log(`CID: ${cid} | Name: ${name}`);
        }
    });
}
run().catch(console.error);
