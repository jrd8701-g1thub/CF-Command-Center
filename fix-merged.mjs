import { GoogleSpreadsheet } from 'google-spreadsheet';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const creds = require('./cf-service-account.json');

const SHEET_ID = '1Iq9jVl1Nf916eY2gG7TquQG-S2qZ9o8b2zI-CstT284';

async function fixMergedSales() {
    const doc = new GoogleSpreadsheet(SHEET_ID, creds);
    await doc.loadInfo();
    const salesSheet = doc.sheetsByTitle['Sales'];
    const custSheet = doc.sheetsByTitle['Customers'];
    if (!salesSheet || !custSheet) { console.log('Missing sheets'); return; }
    
    await custSheet.loadCells('A1:K100');
    const custRows = await custSheet.getRows();
    const custMap = {};
    for (const r of custRows) {
        custMap[r.get('CID')] = r;
    }
    
    await salesSheet.loadCells('A1:P5000');
    const salesRows = await salesSheet.getRows();
    
    let deletedCount = 0;
    let newRowsToAdd = [];
    
    for (let i = 0; i < salesRows.length; i++) {
        const row = salesRows[i];
        const itemName = row.get('Item_Name') || '';
        const orderType = row.get('Order_Type') || '';
        // Skip rows that aren't merged or don't have quantities
        if (itemName.includes(',') && Number(row.get('Quantity')) > 0) {
            console.log('Found merged row:', itemName, 'Qty:', row.get('Quantity'));
            
            const cid = row.get('CID');
            const profile = custMap[cid];
            let profileQtys = [];
            // Assuming profile has raw Quantity mapped to 'Quantity' header or similar 
            if (profile && profile.get('Quantity')) {
               profileQtys = profile.get('Quantity').toString().split(',').map(s => parseFloat(s.trim()) || 1);
            }
            
            const items = itemName.split(',').map(s => s.trim());
            const totalStrQty = Number(row.get('Quantity'));
            const unitPrice = parseFloat(row.get('Unit_Price')) || 0;
            const totalPrice = parseFloat(row.get('Total_Price')) || 0;
            
            // Generate split rows
            const splits = items.map((name, idx) => {
                const q = profileQtys[idx] !== undefined ? profileQtys[idx] : (idx === 0 && profileQtys.length === 1 ? profileQtys[0] : 1);
                
                // Distribute total price proportionally
                const unitTotal = totalPrice > 0 && totalStrQty > 0 
                    ? (totalPrice / totalStrQty) * q 
                    : 0;

                return {
                    'Timestamp': row.get('Timestamp'),
                    'Transaction_ID': row.get('Transaction_ID'),
                    'CID': cid,
                    'Customer_Name': row.get('Customer_Name'),
                    'Item_Name': name,
                    'Quantity': q,
                    'Unit_Price': unitTotal > 0 && q > 0 ? (unitTotal / q) : 0,
                    'Total_Price': unitTotal,
                    'Order_Type': orderType,
                    'Payment_Method': row.get('Payment_Method'),
                    'Staff_Name': row.get('Staff_Name'),
                    'Driver_Name': row.get('Driver_Name') || '',
                    'Delivery_Status': row.get('Delivery_Status') || row.get('Delivery Status') || '',
                    'Unplanned_Delivery_Date': row.get('Unplanned_Delivery_Date') || '',
                    'Unplanned_Delivery_Time': row.get('Unplanned_Delivery_Time') || ''
                };
            });
            
            newRowsToAdd.push(...splits);
            
            // Clear original row values instead of deleteRow to prevent index shifting while looping
            for(let col=0; col<15; col++) {
                const cell = salesSheet.getCell(row.rowNumber - 1, col);
                cell.value = '';
            }
            deletedCount++;
        }
    }
    
    if (deletedCount > 0) {
        console.log(`Clearing ${deletedCount} merged rows...`);
        await salesSheet.saveUpdatedCells();
        console.log(`Appending ${newRowsToAdd.length} split rows...`);
        await salesSheet.addRows(newRowsToAdd);
        console.log('Done! (Note: You may have blank rows in the middle where merged rows used to be. You can highlight them and right-click -> Delete rows in Google Sheets)');
    } else {
        console.log('No merged rows found!');
    }
}

fixMergedSales().catch(console.error);
