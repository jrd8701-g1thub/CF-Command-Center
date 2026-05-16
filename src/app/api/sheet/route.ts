import { NextResponse } from 'next/server';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';

// --- ROW LIMIT CONSTANTS ---
// These are safety caps used with Math.min(sheet.rowCount, LIMIT_*).
// Google Sheets max is 10,000,000 rows but we cap to avoid scanning huge empty sheets.
// Increase these if any sheet grows beyond the limit.
const LIMIT_STAFF_HUB  = 50000;  // ~136 years of daily shifts at 1/day
const LIMIT_EMPLOYEE   = 500;    // Max staff members (unlikely to exceed this)
const LIMIT_CUSTOMERS  = 5000;   // Max customer records
const LIMIT_SALES      = 100000; // Max sales rows (~274 sales/day for 1 year)
const LIMIT_PRODUCTION = 5000;   // Max production log entries
const LIMIT_AUDIT      = 5000;   // Max inventory audit entries
const LIMIT_BUDGET     = 500;    // Max expense budget categories

// Define the shape of our data
export interface POSItem {
    id: string; // Internal ID like 'item-1'
    name: string;
    category: string;
    price: number;
}

export interface Customer {
    id: string;
    cid: string; // Raw CID value from column A of the Customers sheet
    name: string;
    details: Record<string, string>;
    standardOrderItems: { name: string, quantity: number, sizeHint?: string }[];
}
interface CommissionRule {
    keyword: string;
    type: 'Fixed' | 'Weight';
    value: number;
    maxCap: number;
}

// Helper: Convert Excel Serial Date/Time to ISO or Readable String
const excelDateToJS = (serial: any, type: 'date' | 'time' | 'datetime' = 'datetime'): string => {
    if (!serial && serial !== 0) return '';
    if (typeof serial !== 'number') return String(serial);

    // Excel dates are days since 1899-12-30. JS matches this with a 2-day offset usually, 
    // but the library/GSheet usually gives a clean serial.
    const date = new Date(Math.round((serial - 25569) * 86400 * 1000));

    // Adjust for UTC/Local mismatch if needed, but for GHsheets serials, 
    // we can often treat them as UTC and format locally.
    const f = (d: Date) => d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' });
    const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    if (type === 'date') return f(date);
    if (type === 'time') return t(date);
    return `${f(date)} ${t(date)}`;
};

export async function fetchCommissionRules(doc: any): Promise<CommissionRule[]> {
    try {
        const sheet = doc.sheetsByTitle['POS_System_Control'];
        // Commission rules live anywhere from row 15 onward (below the product/machine data section).
        // Scanning A15:B65 so the user can place them anywhere in that range.
        await sheet.loadCells('A15:B65');
        const rules: CommissionRule[] = [];
        let current: Partial<CommissionRule> = {};

        for (let r = 14; r < 65; r++) {
            const label = sheet.getCell(r, 0).value?.toString().toLowerCase().trim() || '';
            const val = sheet.getCell(r, 1).value?.toString().trim() || '';

            if (!label || !val) continue;

            // Use stricter startsWith matching to avoid descriptive words triggering wrong fields
            if (label.startsWith('sku keyword')) {
                if (current.keyword !== undefined) rules.push(current as CommissionRule);
                current = { keyword: val.toLowerCase(), value: 0, type: 'Fixed', maxCap: 0 };
            } else if (label.startsWith('value') || label.startsWith('divisor') || label.startsWith('amount') || label.startsWith('rate')) {
                const n = parseFloat(val.replace(/[^0-9.-]+/g, ''));
                current.value = isNaN(n) ? 0 : n;
            } else if (label.startsWith('commission type') || label.startsWith('type')) {
                current.type = val === 'Weight' ? 'Weight' : 'Fixed';
            } else if (label.startsWith('max cap') || (label.startsWith('max') && !label.startsWith('maximum'))) {
                const n = parseFloat(val.replace(/[^0-9.-]+/g, ''));
                current.maxCap = isNaN(n) ? 0 : n;
            }
        }
        if (current.keyword !== undefined) rules.push(current as CommissionRule);
        return rules;
    } catch (e) {
        return [];
    }
}

// Calculate Commission: Dynamically loaded from POS_System_Control rows 35-62. Only for Deliveries.
export function calculateCommission(itemName: string, quantity: number, orderType: string, rules: CommissionRule[]): number {
    // Only 'Delivery' or 'Scheduled' orders earn commission regardless of Walk-in/Regular/New Customer prefix
    const type = orderType.toLowerCase();
    if ((!type.includes('delivery') && !type.includes('scheduled')) || type.includes('pickup')) return 0;

    let commPerUnit = 0;
    const lowerName = itemName.toLowerCase();

    for (const rule of rules) {
        if (lowerName.includes(rule.keyword)) {
            if (rule.type === 'Fixed') {
                commPerUnit = rule.value ?? 0;
            } else if (rule.type === 'Weight') {
                const match = lowerName.match(/(\d+)\s*kg/);
                if (match) {
                    const weight = parseFloat(match[1]);
                    const divisor = rule.value || 1;
                    let calculated = weight / divisor;
                    if (rule.maxCap > 0 && calculated > rule.maxCap) {
                        calculated = rule.maxCap;
                    }
                    commPerUnit = calculated;
                }
            }
            break;
        }
    }

    const qty = isNaN(quantity) ? 0 : quantity;
    const finalComm = commPerUnit * qty;
    // CRITICAL FIX: Ensure we never return NaN, as NaN breaks Google Sheet row.save()
    return isNaN(finalComm) ? 0 : finalComm;
}

export function getPHTime(): string {
    const now = new Date();
    return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().replace('T', ' ').slice(0, 19);
}
// Ensure credentials exist
const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const CLIENT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
// Ultimate Hybrid Key Parser: Automatically handles Base64, raw text, and formatting glitches
let rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
let processedKey = rawKey.trim().replace(/^["']|["']$/g, '').trim();

// If it's the Base64 encoded payload, unpack it into text first
if (processedKey.startsWith('LS0t')) {
    processedKey = Buffer.from(processedKey, 'base64').toString('utf8');
}

// Clean up the underlying private key body completely
let keyBody = processedKey
    .replace('-----BEGIN PRIVATE KEY-----', '')
    .replace('-----END PRIVATE KEY-----', '')
    .replace(/\\n/g, '')
    .replace(/\\r/g, '')
    .replace(/[^a-zA-Z0-9+/=]/g, '');

// Reconstruct into a mathematically flawless 64-character block PEM structure
const chunks = keyBody.match(/.{1,64}/g) || [];
const PRIVATE_KEY = `-----BEGIN PRIVATE KEY-----\n${chunks.join('\n')}\n-----END PRIVATE KEY-----\n`;

const serviceAccountAuth = new JWT({
    email: CLIENT_EMAIL,
    key: PRIVATE_KEY,
    scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
    ],
});
export async function GET(request: Request) {
    try {
        const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
        await doc.loadInfo(); // loads document properties and worksheets

        const { searchParams } = new URL(request.url);
        const tab = searchParams.get('tab') || 'pos';

        const posControlSheet = doc.sheetsByTitle['POS_System_Control'];
        const customersSheet = doc.sheetsByTitle['Customers'];
        const salesSheet = doc.sheetsByTitle['Sales'];

        if (!posControlSheet || !customersSheet || !salesSheet) {
            return NextResponse.json({ error: 'Required sheets (POS_System_Control, Customers, or Sales) not found.' }, { status: 500 });
        }

        // ---- DEBUG TAB (temporary diagnostic) ----
        if (tab === 'debug_staff') {
            const staffHubSheet = doc.sheetsByTitle['Staff_&_Commission_Hub'];
            if (!staffHubSheet) return NextResponse.json({ error: 'sheet not found' }, { status: 500 });
            await staffHubSheet.loadHeaderRow();
            const realRowCount = staffHubSheet.rowCount;
            await staffHubSheet.loadCells(`A1:N${Math.min(realRowCount, LIMIT_STAFF_HUB)}`);
            
            let lastDataRow = 0;
            for (let i = Math.min(realRowCount, LIMIT_STAFF_HUB) - 1; i >= 1; i--) {
                if (staffHubSheet.getCell(i, 1).value) {
                    lastDataRow = i;
                    break;
                }
            }

            const startRow = Math.max(1, lastDataRow - 5);
            const endRow = Math.min(realRowCount, lastDataRow + 5);
            
            const rows = [];
            for (let i = startRow; i <= endRow; i++) {
                const b = staffHubSheet.getCell(i, 1);
                const d = staffHubSheet.getCell(i, 3);
                const e = staffHubSheet.getCell(i, 4);
                rows.push({
                    row: i,
                    B_name: b.value,
                    D_clock_in: d.value,
                    E_clock_out: e.value,
                    E_type: typeof e.value,
                    E_formula: e.formula || null,
                    E_is_null: e.value === null,
                    E_is_empty: e.value === '',
                });
            }
            return NextResponse.json({ realRowCount, lastDataRow, rows });
        }

        // ---- EXPENSES TAB (Unified dynamic fetch from side-by-side tables) ----
        if (tab === 'expenses') {
            const expenses: any[] = [];
            let budgets: any[] = [];
            let categories: string[] = [];

            const expSheet = doc.sheetsByTitle['Expenses'];
            if (!expSheet) return NextResponse.json({ error: 'Expenses sheet not found' }, { status: 500 });
            
            const maxRows = Math.max(expSheet.rowCount, 50);
            await expSheet.loadCells(`A1:M${maxRows}`);

            for (let i = 1; i < maxRows; i++) {
                const desc = expSheet.getCell(i, 0).value;
                if (!desc) continue;
                const type = expSheet.getCell(i, 1).value || 'OPEX';
                const amtRaw = expSheet.getCell(i, 2).value;
                const amtNum = typeof amtRaw === 'number' ? amtRaw : parseFloat(amtRaw?.toString().replace(/[^0-9.-]+/g, '') || '0');
                budgets.push({ description: desc.toString(), category: type.toString(), amount: amtNum });
                if (!categories.includes(desc.toString())) categories.push(desc.toString());
            }

            for (let i = 1; i < maxRows; i++) {
                const date = expSheet.getCell(i, 4).value;
                const amtRaw = expSheet.getCell(i, 7).value;
                if (!date && (!amtRaw && amtRaw !== 0)) continue;
                const amtNum = typeof amtRaw === 'number' ? amtRaw : parseFloat(amtRaw?.toString().replace(/[^0-9.-]+/g, '') || '0');
                expenses.push({ rowIndex: i, date: date?.toString() || '', staffName: expSheet.getCell(i, 5).value?.toString() || '', description: expSheet.getCell(i, 6).value?.toString() || '', amount: amtNum, source: 'Dashboard', isCOGS: false });
            }

            for (let i = 1; i < maxRows; i++) {
                const date = expSheet.getCell(i, 9).value;
                const amtRaw = expSheet.getCell(i, 12).value;
                if (!date && (!amtRaw && amtRaw !== 0)) continue;
                const amtNum = typeof amtRaw === 'number' ? amtRaw : parseFloat(amtRaw?.toString().replace(/[^0-9.-]+/g, '') || '0');
                expenses.push({ rowIndex: i, date: date?.toString() || '', staffName: expSheet.getCell(i, 10).value?.toString() || '', description: expSheet.getCell(i, 11).value?.toString() || '', amount: amtNum, source: 'Dashboard', isCOGS: true });
            }

            console.log(`[GET expenses] Returning ${expenses.length} total expenses, ${budgets.length} budgets/categories`);
            return NextResponse.json({ expenses, budgets, categories });
        }


        if (tab === 'staff' || tab === 'timekeeper') {
            // Try Employee sheet first — that's where PINs live in this workbook
            const employeeSheet = 
                doc.sheetsByTitle['Employee'] ||
                doc.sheetsByTitle['employee'] ||
                doc.sheetsByTitle['Employees'] ||
                doc.sheetsByTitle['Staff'] ||
                doc.sheetsByTitle['staff'] ||
                doc.sheetsByIndex.find(s => /^(staff|employee)$/i.test(s.title));
            const staffHubSheet = doc.sheetsByTitle['Staff_&_Commission_Hub'];

            if (!employeeSheet || !staffHubSheet) {
                return NextResponse.json({ error: 'Required sheets (Employee/Staff or Staff_&_Commission_Hub) not found.' }, { status: 500 });
            }

            // Use getRows() which maps headers → values automatically, avoiding column index bugs
            const rawRows = await employeeSheet.getRows();
            const employees = [];
            for (const row of rawRows) {
                // Try multiple possible header names for the staff name column
                const name = row.get('Staff') || row.get('Name') || row.get('staff') || row.get('name');
                if (!name || !name.toString().trim()) continue;
              // Force reading from Column G (index 6) to bypass header name mismatch issues
const pin = row.get('PIN') || row.get('Pin') || row.get('pin') || row.get('Password') || row._rawData[6] || '';
                const role = row.get('Role') || row.get('Position') || row.get('role') || '';
                const salary = row.get('Salary') || row.get('Base Pay') || row.get('salary') || row.get('Hourly') || '0';
                console.log(`[API] Staff: name="${name}", pin="${pin}" (${typeof pin})`);
                employees.push({
                    name: name.toString().trim(),
                    role: role.toString().trim(),
                    basePay: typeof salary === 'number' ? salary : parseFloat(salary?.toString() || '0') || 0,
                    pin: pin !== null && pin !== undefined ? pin.toString().trim() : ''
                });
            }

            // Fetch current clock status (find rows with empty Clock_Out in col E)
            // Use actual rowCount so we don't request millions of empty cells
            await staffHubSheet.loadHeaderRow();
            const actualStaffRows = Math.min(staffHubSheet.rowCount, LIMIT_STAFF_HUB);
            if (actualStaffRows > 1) {
                await staffHubSheet.loadCells(`A1:K${actualStaffRows}`);
            }

            // Helper: convert Google Sheets time serial (fraction of a day) → "HH:MM AM/PM"
            const serialToTimeStr = (val: unknown): string => {
                if (val === null || val === undefined || val === '') return '';
                if (typeof val === 'number' && val > 0 && val < 1) {
                    const totalMins = Math.round(val * 24 * 60);
                    const h = Math.floor(totalMins / 60) % 24;
                    const m = totalMins % 60;
                    const ampm = h >= 12 ? 'PM' : 'AM';
                    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                    return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${ampm}`;
                }
                return val.toString();
            };

            // Helper: convert Google Sheets date serial (days since 1899-12-30) → "YYYY-MM-DD"
            const serialToDateStr = (val: unknown): string => {
                if (val === null || val === undefined || val === '') return '';
                if (typeof val === 'number' && val > 1000) {
                    // Excel epoch: Jan 1 1900 = serial 1 (with leap year bug: 1900-02-29 = serial 60 never existed)
                    const msPerDay = 24 * 60 * 60 * 1000;
                    const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899
                    const date = new Date(excelEpoch.getTime() + val * msPerDay);
                    const y = date.getFullYear();
                    const mo = String(date.getMonth() + 1).padStart(2, '0');
                    const d = String(date.getDate()).padStart(2, '0');
                    return `${y}-${mo}-${d}`;
                }
                return val.toString();
            };

            const clockStatus: Record<string, any> = {};
            const seenStaff = new Set<string>();
            let emptyStreak = 0;
            let foundData = false;
            
            console.log(`[GET staff] Scanning ${actualStaffRows} rows backwards for recent sessions...`);
            for (let i = actualStaffRows - 1; i >= 1; i--) {
                const nameCell = staffHubSheet.getCell(i, 1);    // B = Staff_Name
                const name = nameCell.value?.toString().trim();
                
                if (!name) {
                    if (foundData) {
                        emptyStreak++;
                        if (emptyStreak > 50) break; // Stop only after we've seen data and then found 50 empty rows above it
                    }
                    continue;
                }
                
                foundData = true;
                emptyStreak = 0;

                // Only process the most recent entry for each person
                if (seenStaff.has(name)) continue;
                seenStaff.add(name);

                const cellE = staffHubSheet.getCell(i, 4); // E = Clock_Out
                const clockOut = cellE.value;
                // Treat null, undefined, '', and numeric 0 (formula residue) all as "no clock-out"
                const isClockOutEmpty = clockOut === null || clockOut === undefined || clockOut === '' || clockOut === 0;

                if (isClockOutEmpty) {
                    const rawTime = staffHubSheet.getCell(i, 3).value; // D = Clock_In
                    const rawDate = staffHubSheet.getCell(i, 0).value; // A = Date
                    clockStatus[name] = {
                        clockedIn: true,
                        clockInTime: serialToTimeStr(rawTime),
                        clockInDate: serialToDateStr(rawDate),
                        rowIndex: i
                    };
                }
            }
 
            return NextResponse.json({ employees, clockStatus });
        }

        if (tab === 'sales') {
            const limit = parseInt(searchParams.get('limit') || '5000');
            const sheet = doc.sheetsByTitle['Sales'];
            if (!sheet) return NextResponse.json({ error: 'Sales sheet not found' }, { status: 500 });

            // Fetch rows and then take the last 'limit' records
            const rows = await sheet.getRows();
            const recentRows = rows.slice(-limit);

            const sales = recentRows.map(row => {
                const rowData: any = {};
                sheet.headerValues.forEach(header => {
                    rowData[header] = row.get(header);
                });

                return {
                    timestamp: row.get('Timestamp') || '',
                    transactionId: row.get('Transaction_ID') || '',
                    cid: row.get('CID') || '',
                    customerName: row.get('Customer_Name') || '',
                    itemName: row.get('Item_Name') || '',
                    quantity: row.get('Quantity') || '',
                    unitPrice: row.get('Unit_Price') || '',
                    totalPrice: row.get('Total_Price') || '',
                    orderType: row.get('Order_Type') || '',
                    paymentMethod: row.get('Payment_Method') || '',
                    staffName: row.get('Staff_Name') || '',
                    driverName: row.get('Driver_Name') || '',
                    helperName: row.get('Helper_Name') || '',
                    commission: row.get('Commission_Earned') || '0',
                    deliveryStatus: row.get('Delivery Status') || '',
                    unplannedDate: row.get('Unplanned_Delivery_Date') || '',
                    unplannedTime: row.get('Unplanned_Delivery_Time') || '',
                    auditLog: row.get('Audit Log') || '',
                    auditTimestamp: row.get('Audit_Log_Timestamp') || ''
                };
            });
            return NextResponse.json({ sales });
        }

        if (tab === 'production') {
            const productionSheet = doc.sheetsByTitle['Production'];
            if (!productionSheet) {
                return NextResponse.json({ error: 'Production sheet not found' }, { status: 500 });
            }
            await productionSheet.loadCells(`A1:Q${LIMIT_PRODUCTION}`);
            const rows = await productionSheet.getRows();
            const productionHistory = rows.map(row => ({
                date: row.get('Log_Date'),
                startTime: row.get('Machine_Start_Time'),
                endTime: row.get('Machine_End_Time'),
                totalHours: row.get('Total_Run_Hours'),
                units_1KG: row.get('Units_1KG'),
                units_3KG: row.get('Units_3KG'),
                units_5KG: row.get('Units_5KG'),
                units_10KG: row.get('Units_10KG'),
                units_25KG: row.get('Units_25KG'),
                units_30KG: row.get('Units_30KG'),
                units_45KG: row.get('Units_45KG'),
                totalWeight: row.get('Total_KG_Produced'),
                expectedYield: row.get('Expected_Yield_KG'),
                variance: row.get('Variance_%'),
                elecCost: row.get('Elec_Cost'),
                staffName: row.get('Staff'),
                auditLog: row.get('Audit Log')
            })).reverse();

            return NextResponse.json({ productionHistory });
        }

        if (tab === 'audit') {
            const auditSheet = doc.sheetsByTitle['Inventory_Audit'];
            if (!auditSheet) {
                return NextResponse.json({ audits: [] });
            }
            await auditSheet.loadCells(`A1:J${LIMIT_AUDIT}`);
            const rows = await auditSheet.getRows();
            const audits = rows.map(row => ({
                date: row.get('Date'),
                status: row.get('Status'),
                missing_1KG: row.get('Missing_1KG') || 0,
                missing_3KG: row.get('Missing_3KG') || 0,
                missing_5KG: row.get('Missing_5KG') || 0,
                missing_10KG: row.get('Missing_10KG') || 0,
                missing_25KG: row.get('Missing_25KG') || 0,
                missing_30KG: row.get('Missing_30KG') || 0,
                missing_45KG: row.get('Missing_45KG') || 0,
                staff: row.get('Staff') || 'Admin'
            })).reverse();
            return NextResponse.json({ audits });
        }

        if (tab === 'delivery') {
            // Accept comma-separated days e.g. 'monday,tuesday' OR a single date for backward compat
            const daysParam = searchParams.get('days'); // e.g. 'monday,tuesday'
            const dateParam = searchParams.get('date'); // legacy single-date
            const fetchAll = !daysParam && !dateParam;

            let targetDays: string[] = [];
            let filterDateISO = ''; // For precise date matching of sales records

            if (daysParam) {
                targetDays = daysParam.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
            } else if (dateParam) {
                // Parse as UTC to avoid off-by-one day in UTC+8 timezone
                const d = new Date(dateParam + 'T00:00:00Z');
                const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                targetDays = [daysOfWeek[d.getUTCDay()]];

                // Use UTC date parts to build ISO string — avoids local timezone shift
                const tYear = d.getUTCFullYear();
                const tMonth = String(d.getUTCMonth() + 1).padStart(2, '0');
                const tDay = String(d.getUTCDate()).padStart(2, '0');
                filterDateISO = `${tYear}-${tMonth}-${tDay}`;
            }

            if (!fetchAll && targetDays.length === 0) {
                return NextResponse.json({ error: 'days or date param required' }, { status: 400 });
            }

            console.log(`[Delivery API] Filtering for days: ${targetDays.join(', ')} fetchAll: ${fetchAll}`);

            // Helper: Google Sheets may store time as a decimal fraction (0.25 = 6:00 AM)
            // or as a string like "6:00:00 AM". Normalise both to "H:MM AM/PM".
            const formatSheetTime = (rawVal: unknown): string => {
                if (!rawVal && rawVal !== 0) return '';
                if (typeof rawVal === 'number') {
                    const totalMins = Math.round(rawVal * 24 * 60);
                    let h = Math.floor(totalMins / 60) % 24;
                    const m = totalMins % 60;
                    const ampm = h < 12 ? 'AM' : 'PM';
                    if (h === 0) h = 12;
                    else if (h > 12) h -= 12;
                    return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
                }
                const str = String(rawVal);
                return str.replace(/^(\d+:\d{2}):\d{2}(\s*[APap][Mm])$/, '$1$2').trim();
            };

            // Load POS Prices for assumed orders
            await posControlSheet.loadCells('A1:C50');
            const priceMap: Record<string, number> = {
                'water (refill)': 25,
                'water (delivery)': 30,
                'water': 30
            };
            for (let i = 4; i < 20; i++) { // Extended range to cover all POS items
                const nameCell = posControlSheet.getCell(i, 0);
                const priceCell = posControlSheet.getCell(i, 1);
                if (nameCell.value) {
                    let price = 0;
                    if (typeof priceCell.value === 'number') price = priceCell.value;
                    else if (typeof priceCell.numberValue === 'number') price = priceCell.numberValue;
                    else if (priceCell.value) price = parseFloat(priceCell.value.toString().replace(/[^0-9.-]+/g, "")) || 0;
                    const itemName = nameCell.value.toString();
                    priceMap[itemName.toLowerCase()] = price;

                    // Also register ice items under the "Ice - XXKG" format used in the Customers sheet
                    // e.g. POS item "30KG Ice" → also stored as "ice - 30kg"
                    const sizeMatch = itemName.match(/(\d+)\s*kg/i);
                    if (sizeMatch && itemName.toLowerCase().includes('ice')) {
                        const altKey = `ice - ${sizeMatch[1]}kg`;
                        priceMap[altKey] = price;
                    }
                }
            }

            // 1. Fetch Customers: build two maps
            //    - scheduledCustomers: only those whose delivery schedule matches today (used to know who should have ordered)
            //    - allCustomers: every customer, used as fallback for contact/address when a new punch-in order comes in
            await customersSheet.loadCells(`A1:N${LIMIT_CUSTOMERS}`); // Extended to col N to include Delivery Time (col M) and Delivery Sched (col L)
            const customerRows = await customersSheet.getRows();
            const scheduledCustomers: Record<string, any> = {};
            const allCustomers: Record<string, any> = {};

            customerRows.forEach(row => {
                const schedule = row.get('Delivery Sched')?.toString().toLowerCase() || '';
                const cid = row.get('CID');
                if (!cid) return;

                const profile = {
                    cid,
                    customerName: row.get('Customer / Company') || '',
                    contactPerson: row.get('Contact Person') || '',
                    mobile: row.get('Mobile') || '',
                    address: row.get('Address') || '',
                    distance: row.get('Distance') || row.get('Distance From C&F') || '',
                    schedule: row.get('Delivery Sched') || '',
                    preferredTime: formatSheetTime(row.get('Delivery Time')),
                    isScheduledToday: true,
                    waterType: row.get('Water Type') || '',
                    waterQty: row.get('Water Qty') || '',
                    iceType: row.get('Ice Type') || '',
                    iceQty: row.get('Ice Qty') || ''
                };
                allCustomers[cid] = profile;

                const matchesDay = targetDays.some(day => schedule.includes(day) || schedule.includes('daily'));
                if (matchesDay) {
                    console.log(`[Delivery API] Scheduled Customer: CID=${cid}, Schedule=${schedule}`);
                    scheduledCustomers[cid] = profile;
                }
            });

            console.log(`[Delivery API] Scheduled count: ${Object.keys(scheduledCustomers).length}`);

            // 2. Fetch ONLY on-shift staff as assignable drivers
            // Staff_&_Commission_Hub: B=Staff_Name, D=Clock_In, E=Clock_Out (empty = still on shift)
            const staffHubForDrivers = doc.sheetsByTitle['Staff_&_Commission_Hub'];
            const drivers: string[] = [];
            if (staffHubForDrivers) {
                await staffHubForDrivers.loadCells(`A1:F${LIMIT_STAFF_HUB}`);
                for (let i = 1; i < LIMIT_STAFF_HUB; i++) {
                    const nameCell = staffHubForDrivers.getCell(i, 1); // B = Staff_Name
                    if (!nameCell.value) break;
                    const nameStr = nameCell.value.toString().trim();
                    const clockOutCell = staffHubForDrivers.getCell(i, 4); // E = Clock_Out
                    const clockOut = clockOutCell.value;
                    const clockOutStr = (clockOut !== null && clockOut !== undefined) ? clockOut.toString().trim() : '';
                    if (clockOutStr === '' && nameStr) {
                        // Still on shift — include as assignable driver
                        if (!drivers.includes(nameStr)) drivers.push(nameStr);
                    }
                }
            }
            console.log(`[Delivery API] On-shift drivers: ${drivers.join(', ')}`);

            // 3. Fetch sales records for deliveries (we scan all sales and filter by order type)
            await salesSheet.loadCells(`A1:T${LIMIT_SALES}`); // Ensure all columns including Unplanned Date/Time (Q,R) are loaded
            const salesRows = await salesSheet.getRows();
            const deliveriesMap: Record<string, any> = {};

            salesRows.forEach(row => {
                const orderType = row.get('Order_Type') || '';
                const isDelivery = orderType.toLowerCase().includes('delivery');
                if (!isDelivery) return;

                const cid = row.get('CID') || `Walk-in-${row.rowNumber}`;
                const txnId = row.get('Transaction_ID');

                // Precise date matching: Check if the transaction actually happened on the selected date
                const timestampStr = row.get('Timestamp') || '';
                const unplannedDate = row.get('Unplanned_Delivery_Date') || '';

                let matchesExactDate = false;

                if (fetchAll) {
                    matchesExactDate = true;
                } else if (filterDateISO) {
                    // Try to extract exact delivery date from Order_Type (e.g. "Regular (Delivery: 2026-03-11 @ 10:00 AM)")
                    let dispatchDateStr = '';
                    const dtMatch = orderType.match(/Delivery:\s*(\d{4}-\d{2}-\d{2})/i);
                    if (dtMatch && dtMatch[1]) {
                        dispatchDateStr = dtMatch[1];
                    }

                    if (dispatchDateStr && dispatchDateStr === filterDateISO) {
                        matchesExactDate = true;
                    }

                    // Otherwise Try to match against Unplanned Delivery Date
                    if (!matchesExactDate && unplannedDate) {
                        let udStr = '';
                        if (typeof unplannedDate === 'number') {
                            // Handle Google Sheets serial date number
                            const d = new Date((unplannedDate - 25569) * 86400 * 1000);
                            udStr = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
                        } else {
                            // String like "2026-03-22" — parse as UTC to avoid tz shift
                            const ud = new Date(String(unplannedDate).includes('T') ? unplannedDate : unplannedDate + 'T00:00:00Z');
                            if (!isNaN(ud.getTime())) {
                                udStr = `${ud.getUTCFullYear()}-${String(ud.getUTCMonth() + 1).padStart(2, '0')}-${String(ud.getUTCDate()).padStart(2, '0')}`;
                            }
                        }
                        if (udStr === filterDateISO) matchesExactDate = true;
                    }

                    // If not matched, try the primary Timestamp
                    if (!matchesExactDate && !dispatchDateStr && timestampStr) {
                        // Timestamps from getPHTime() are PH-locale strings — parse carefully
                        const rawTs = String(timestampStr).split(',')[0].trim();
                        // Try ISO first, then locale string
                        const td = new Date(rawTs);
                        if (!isNaN(td.getTime())) {
                            // Timestamps are already in PH time (stored as local string)
                            // Use UTC methods since PH strings get parsed as local on the server
                            const tdStr = `${td.getUTCFullYear()}-${String(td.getUTCMonth() + 1).padStart(2, '0')}-${String(td.getUTCDate()).padStart(2, '0')}`;
                            if (tdStr === filterDateISO) matchesExactDate = true;
                            // Also try local in case server is in PH timezone
                            if (!matchesExactDate) {
                                const tdLocStr = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`;
                                if (tdLocStr === filterDateISO) matchesExactDate = true;
                            }
                        }
                    }

                    // Last resort for recurring/scheduled customers: if the customer is
                    // scheduled for delivery today AND their Sales row has no explicit
                    // delivery date set, treat a recent order (placed within 3 days of
                    // today's delivery date) as a match for this date.
                    // IMPORTANT: Skip already-completed deliveries — a completed order
                    // from a prior day must not bleed into today's delivery list.
                    const rowDeliveryStatus = row.get('Delivery Status') || '';
                    const isAlreadyCompleted = rowDeliveryStatus === 'Delivery Completed' || rowDeliveryStatus === 'Completed';
                    if (!matchesExactDate && !dispatchDateStr && !unplannedDate && !isAlreadyCompleted && scheduledCustomers[cid] && timestampStr) {
                        const txnDate = new Date(timestampStr.split(',')[0]);
                        const filterDate = new Date(filterDateISO);
                        if (!isNaN(txnDate.getTime()) && !isNaN(filterDate.getTime())) {
                            const diffMs = filterDate.getTime() - txnDate.getTime();
                            const diffDays = diffMs / (1000 * 60 * 60 * 24);
                            // Accept orders placed 0–3 days before the delivery date
                            if (diffDays >= 0 && diffDays <= 3) {
                                matchesExactDate = true;
                                console.log(`[Delivery API] Recurring customer CID=${cid} matched via schedule fallback (order ${diffDays.toFixed(1)} days before delivery date)`);
                            }
                        }
                    }
                }
                else {
                    // Fallback to legacy day-of-week matching if only `days` param was provided
                    const txnDate = new Date(timestampStr.split(',')[0]);
                    const txnDayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][txnDate.getDay()];
                    if (targetDays.includes(txnDayOfWeek)) matchesExactDate = true;

                    if (!matchesExactDate && unplannedDate) {
                        const upd = new Date(unplannedDate);
                        const updDay = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][upd.getDay()];
                        if (targetDays.includes(updDay)) matchesExactDate = true;
                    }
                }
                if (matchesExactDate) {
                    // Prefer customer profile data for contact/address fields; sales row has name
                    const cProfile = scheduledCustomers[cid] || allCustomers[cid] || {};
                    const itemNameRaw = row.get('Item_Name') || '';
                    const itemQty = Number(row.get('Quantity') || 1);
                    const itemTotal = Number(row.get('Total_Price') || 0);

                    // Handle legacy merged rows (e.g., "Water, 10KG Ice") vs new split rows (e.g., "Water")
                    let parsedItems = [{ name: itemNameRaw, quantity: itemQty }];
                    if (itemNameRaw.includes(',')) {
                        const names = itemNameRaw.split(',').map((s: string) => s.trim()).filter(Boolean);
                        let profileQtys: number[] = [];
                        if (cProfile.rawQuantity) {
                            profileQtys = cProfile.rawQuantity.toString().split(',').map((q: string) => parseFloat(q.trim()) || 1);
                        }
                        parsedItems = names.map((name: string, idx: number) => {
                            // Recover true quantities from profile if available, else sum
                            const q = profileQtys[idx] !== undefined ? profileQtys[idx] : (idx === 0 && profileQtys.length === 1 ? profileQtys[0] : itemQty);
                            return { name, quantity: q };
                        });
                    }

                    // FIX: Group by Transaction ID AND Delivery Time/Date.
                    // If a user checks out multiple items in one go, but later edits one
                    // item's delivery time to be different (e.g. 11am vs 6pm), they must
                    // be split into completely separate delivery routing cards.
                    const exactRowTime = formatSheetTime(row.get('Unplanned_Delivery_Time')) || cProfile.preferredTime || '';
                    const exactRowDate = row.get('Unplanned_Delivery_Date') || '';
                    const mapKey = `${txnId}-${exactRowDate}-${exactRowTime}`;

                    if (deliveriesMap[mapKey]) {
                        // Merge parsed items into existing entry for the exact same transaction + time combo
                        parsedItems.forEach(newItem => {
                            const existing = (deliveriesMap[mapKey].items as any[]).find(it => it.name === newItem.name);
                            if (existing) {
                                existing.quantity += newItem.quantity;
                            } else {
                                deliveriesMap[mapKey].items.push(newItem);
                            }
                        });

                        // Re-generate displayItemName and totals
                        deliveriesMap[mapKey].displayItemName = (deliveriesMap[mapKey].items as any[])
                            .map(it => `${it.name} x${it.quantity}`)
                            .join(', ');
                        deliveriesMap[mapKey].itemName = (deliveriesMap[mapKey].items as any[])
                            .map(it => it.name)
                            .join(', ');
                        deliveriesMap[mapKey].quantity = (deliveriesMap[mapKey].items as any[])
                            .reduce((sum, it) => sum + it.quantity, 0);
                        deliveriesMap[mapKey].totalPrice += itemTotal;

                        // Update Status/Driver if the newer row has more info
                        const rowStatus = row.get('Delivery Status') || 'Delivery Pending';
                        const rowDriver = row.get('Driver_Name') || '';

                        // Prioritize "Completed" status within the same transaction combo
                        if (rowStatus === 'Delivery Completed' || rowStatus === 'Completed') {
                            deliveriesMap[mapKey].deliveryStatus = 'Delivery Completed';
                        }
                        // Use any non-empty driver
                        if (rowDriver && !deliveriesMap[mapKey].driver) {
                            deliveriesMap[mapKey].driver = rowDriver;
                        }
                    } else {
                        deliveriesMap[mapKey] = {
                            transactionId: txnId,  // Maintains real txnId for back-syncing updates
                            mapKey: mapKey,        // Store unique mapKey for UI distinction if needed
                            cid: cid,
                            customerName: row.get('Customer_Name') || cProfile.customerName || 'Walk-in Delivery',
                            contactPerson: cProfile.contactPerson || '',
                            mobile: cProfile.mobile || '',
                            address: cProfile.address || '',
                            distance: cProfile.distance || '',
                            schedule: cProfile.schedule || '',
                            preferredTime: exactRowTime,
                            displayItemName: parsedItems.map(it => `${it.name} x${it.quantity}`).join(', '),
                            itemName: parsedItems.map(it => it.name).join(', '),
                            items: parsedItems,
                            quantity: itemQty,
                            totalPrice: itemTotal,
                            orderType: orderType,
                            paymentStatus: row.get('Payment_Method') || 'Credit',
                            deliveryStatus: row.get('Delivery Status') || 'Delivery Pending',
                            driver: row.get('Driver_Name') || '',
                            helper: row.get('Helper_Name') || '',
                            timestamp: timestampStr,
                            isScheduledToday: !!scheduledCustomers[cid]
                        };
                    }

                    // Remove from scheduled list once any real order for this customer is found
                    if (scheduledCustomers[cid]) {
                        delete scheduledCustomers[cid];
                    }
                }
            });

            // 4. Add remaining scheduled customers who haven't ordered yet (ASSUMED ORDERS)
            if (!fetchAll) {
                Object.values(scheduledCustomers).forEach(cust => {
                if (cust.waterType && cust.waterQty) {
                    const wName = cust.waterType.toString().trim();
                    const wQty = parseFloat(cust.waterQty.toString()) || 1;
                    const unitPrice = priceMap[wName.toLowerCase()] || 0;
                    
                    deliveriesMap[`no-order-w-${cust.cid}`] = {
                        transactionId: `ASSUMED-W-${cust.cid}`,
                        cid: cust.cid,
                        customerName: cust.customerName,
                        contactPerson: cust.contactPerson,
                        mobile: cust.mobile,
                        address: cust.address,
                        distance: cust.distance,
                        schedule: cust.schedule,
                        preferredTime: cust.preferredTime,
                        displayItemName: wName,
                        itemName: wName,
                        items: [{ name: wName, quantity: wQty }],
                        quantity: wQty,
                        totalPrice: unitPrice * wQty,
                        orderType: 'Scheduled (Assumed)',
                        paymentStatus: 'Credit',
                        deliveryStatus: 'Delivery Pending',
                        driver: '',
                        timestamp: '',
                        isScheduledToday: true
                    };
                }

                if (cust.iceType && cust.iceQty) {
                    const iNameRaw = cust.iceType.toString().trim();
                    const iQty = parseFloat(cust.iceQty.toString()) || 1;

                    const matchMatch = iNameRaw.match(/(\d+)\s*kg/i);
                    let size = matchMatch ? matchMatch[1] + 'KG' : '';
                    let normName = size ? `${size} Ice` : iNameRaw;

                    let unitPrice = priceMap[normName.toLowerCase()] || 0;
                    if (unitPrice === 0 && size) {
                        unitPrice = priceMap[`ice - ${size}`.toLowerCase()] || 0;
                    }
                    if (unitPrice === 0 && size) {
                        unitPrice = priceMap[size.toLowerCase()] || 0;
                    }

                    deliveriesMap[`no-order-i-${cust.cid}`] = {
                        transactionId: `ASSUMED-I-${cust.cid}`,
                        cid: cust.cid,
                        customerName: cust.customerName,
                        contactPerson: cust.contactPerson,
                        mobile: cust.mobile,
                        address: cust.address,
                        distance: cust.distance,
                        schedule: cust.schedule,
                        preferredTime: cust.preferredTime,
                        displayItemName: normName,
                        itemName: normName,
                        items: [{ name: normName, quantity: iQty }],
                        quantity: iQty,
                        totalPrice: unitPrice * iQty,
                        orderType: 'Scheduled (Assumed)',
                        paymentStatus: 'Credit',
                        deliveryStatus: 'Delivery Pending',
                        driver: '',
                        timestamp: '',
                        isScheduledToday: true
                    };
                }
            });
            }

            return NextResponse.json({
                deliveries: Object.values(deliveriesMap),
                drivers
            });
        }

        // Helper function to convert Excel serial date to JS Date object and format
        const excelDateToJS = (excelSerial: any, type: 'date' | 'time' | 'datetime'): string => {
            if (typeof excelSerial !== 'number' || isNaN(excelSerial)) {
                return excelSerial?.toString() || '';
            }

            // Excel's epoch is Jan 1, 1900. JS epoch is Jan 1, 1970.
            // Excel serial date 1 is Jan 1, 1900.
            // Excel serial date 25569 is Jan 1, 1970.
            // Adjust for Excel's 1900 leap year bug (Excel treats 1900 as a leap year, but it wasn't)
            const MS_PER_DAY = 24 * 60 * 60 * 1000;
            let jsDate;
            if (excelSerial < 60) { // Dates before March 1, 1900 (Excel's leap year bug)
                jsDate = new Date(Math.round((excelSerial - 25569) * MS_PER_DAY));
            } else { // Dates after March 1, 1900
                jsDate = new Date(Math.round((excelSerial - 25569 - 1) * MS_PER_DAY)); // Subtract 1 day for the bug
            }

            if (type === 'date') {
                return jsDate.toISOString().split('T')[0];
            } else if (type === 'time') {
                const hours = jsDate.getHours();
                const minutes = jsDate.getMinutes();
                const ampm = hours >= 12 ? 'PM' : 'AM';
                const displayHours = hours % 12 || 12;
                const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
                return `${displayHours}:${displayMinutes} ${ampm}`;
            } else if (type === 'datetime') {
                return jsDate.toLocaleString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
            }
            return jsDate.toString();
        };

        if (tab === 'payroll') {
            const startDate = searchParams.get('startDate');
            const endDate = searchParams.get('endDate');
            const start = startDate ? new Date(startDate) : null;
            const end = endDate ? new Date(endDate) : null;
            if (end) end.setHours(23, 59, 59, 999);

            const staffHubSheet2 = doc.sheetsByTitle['Staff_&_Commission_Hub'];
            if (!staffHubSheet2) return NextResponse.json({ error: 'Staff_&_Commission_Hub sheet not found' }, { status: 500 });

            // ── 1. Load shift data ──
            await staffHubSheet2.loadCells('A1:N10000');
            interface ShiftRow {
                date: string; staffName: string; role: string;
                clockIn: string; clockOut: string; logoutDate: string;
                hours: number; basePay: number; netPay: number; auditNote: string;
                id: number;
            }
            const shifts: ShiftRow[] = [];
            for (let i = 1; i < 10000; i++) {
                const name = staffHubSheet2.getCell(i, 1).value; // B
                if (!name) break;

                const rawDate = staffHubSheet2.getCell(i, 0).value; // A
                const jsDate = typeof rawDate === 'number' ? new Date(Math.round((rawDate - 25569) * 86400 * 1000)) : new Date(rawDate?.toString() || '');

                // Ensure date is valid; skip row if we cannot parse the login date
                if (isNaN(jsDate.getTime())) continue;

                // Filter by period if provided
                if (start && jsDate < start) continue;
                if (end && jsDate > end) continue;

                const clockOut = staffHubSheet2.getCell(i, 4).value; // E
                if (!clockOut) continue; // skip open sessions

                const hoursRaw = staffHubSheet2.getCell(i, 6).value; // G
                const basePayRaw = staffHubSheet2.getCell(i, 9).value; // J
                const netPayRaw = staffHubSheet2.getCell(i, 10).value; // K

                shifts.push({
                    date: jsDate.toISOString().split('T')[0],     // Standard YYYY-MM-DD
                    staffName: name.toString().trim(),
                    role: staffHubSheet2.getCell(i, 2).value?.toString() || '',      // C
                    clockIn: excelDateToJS(staffHubSheet2.getCell(i, 3).value, 'time'),   // D
                    clockOut: excelDateToJS(clockOut, 'time'),
                    logoutDate: excelDateToJS(staffHubSheet2.getCell(i, 5).value, 'date'), // F
                    hours: typeof hoursRaw === 'number' ? Math.round(hoursRaw * 100) / 100 : parseFloat(hoursRaw?.toString() || '0'),
                    basePay: typeof basePayRaw === 'number' ? basePayRaw : parseFloat(basePayRaw?.toString() || '0'),
                    netPay: typeof netPayRaw === 'number' ? Math.round(netPayRaw * 100) / 100 : parseFloat(netPayRaw?.toString() || '0'),
                    auditNote: staffHubSheet2.getCell(i, 13).value?.toString() || '', // N
                    id: i + 1
                });
            }

            // ── 2. Load sales for commission calculation ──
            const salesRows2 = await salesSheet.getRows();

            // Per-employee commission accumulator
            interface CommissionLine {
                type: 'water' | 'ice';
                itemName: string; qty: number; kgEach?: number; commission: number;
                date: string; customer: string; row: number;
            }
            interface EmpCommission {
                totalWaterContainers: number;
                waterCommission: number;
                totalIceKg: number;
                iceCommission: number;
                lines: CommissionLine[];
            }
            const commMap: Record<string, EmpCommission> = {};

            const getKgFromName = (item: string): number => {
                const m = item.match(/(\d+)\s*kg/i);
                return m ? parseInt(m[1], 10) : 0;
            };

            for (const row of salesRows2) {
                const timestamp = (row.get('Timestamp') || '').toString().trim();
                if (!timestamp) continue;
                const jsDate = new Date(timestamp.split(',')[0]);
                if (isNaN(jsDate.getTime())) continue;

                // Filter sales by same period as shifts
                if (start && jsDate < start) continue;
                if (end && jsDate > end) continue;

                const staff = (row.get('Staff_Name') || '').toString().trim();
                const itemName = (row.get('Item_Name') || '').toString().trim();
                const qty = parseFloat(row.get('Quantity') || '0') || 0;
                const orderType = (row.get('Order_Type') || '').toString().toLowerCase();
                const customerName = (row.get('Customer_Name') || '').toString().trim();
                const driver = (row.get('Driver_Name') || '').toString().trim();
                const helper = (row.get('Helper_Name') || '').toString().trim();
                const commissionEarned = parseFloat(row.get('Commission_Earned') || '0') || 0;

                if (qty <= 0) continue;

                // Helper to add contribution to a staff member
                const addComm = (staffName: string, type: 'water' | 'ice', amount: number, kg: number = 0) => {
                    if (!staffName) return;
                    if (!commMap[staffName]) {
                        commMap[staffName] = { totalWaterContainers: 0, waterCommission: 0, totalIceKg: 0, iceCommission: 0, lines: [] };
                    }
                    if (type === 'water') {
                        commMap[staffName].totalWaterContainers += qty;
                        commMap[staffName].waterCommission += amount;
                    } else {
                        commMap[staffName].totalIceKg += kg;
                    }
                    commMap[staffName].lines.push({
                        type,
                        itemName,
                        qty,
                        kgEach: kg > 0 ? kg / qty : undefined,
                        commission: amount,
                        date: jsDate.toISOString().split('T')[0],
                        customer: customerName,
                        row: row.rowNumber
                    });
                };

                const lowerItem = itemName.toLowerCase();
                const isIce = lowerItem.includes('ice') || lowerItem.includes('kg');

                // Simply use the recorded commission from the row
                if (lowerItem.includes('water')) {
                    addComm(staff, 'water', commissionEarned);
                    if (driver && driver !== staff) {
                        // For dual-credit roles, we assume the commission stored on row 
                        // is already correct for the primary staff. 
                        // Usually water commission is 1:1, so we credit both.
                        addComm(driver, 'water', commissionEarned);
                    }
                    if (helper && helper !== staff) {
                        addComm(helper, 'water', commissionEarned);
                    }
                } else if (isIce) {
                    const kgEach = getKgFromName(itemName);
                    const totalKg = kgEach * qty;
                    addComm(staff, 'ice', commissionEarned, totalKg);
                    if (driver && driver !== staff) {
                        addComm(driver, 'ice', commissionEarned, totalKg);
                    }
                    if (helper && helper !== staff) {
                        addComm(helper, 'ice', commissionEarned, totalKg);
                    }
                }
                // Commission is now handled by the streamlined check above that uses commissionEarned directly
            }

            // The iceCommission is already totalized per employee in the loop above because we used the direct Commission_Earned column. 
            for (const emp of Object.values(commMap)) {
                const totalCommFromLines = emp.lines.reduce((s, l) => s + l.commission, 0);
                emp.iceCommission = emp.lines.filter(l => l.type === 'ice').reduce((s, l) => s + l.commission, 0);
                emp.waterCommission = emp.lines.filter(l => l.type === 'water').reduce((s, l) => s + l.commission, 0);
            }

            // ── 3. Group shifts per employee ──
            const employees2: string[] = [...new Set(shifts.map(s => s.staffName))];
            const payroll = employees2.map(name => {
                const empShifts = shifts.filter(s => s.staffName === name);
                const totalHours = empShifts.reduce((a, s) => a + s.hours, 0);
                const totalBasePay = empShifts.reduce((a, s) => a + s.netPay, 0);

                const cData = commMap[name] || { totalWaterContainers: 0, waterCommission: 0, totalIceKg: 0, iceCommission: 0, lines: [] };
                const totalCommission = cData.waterCommission + cData.iceCommission;

                return {
                    name,
                    role: empShifts[0]?.role || '',
                    shifts: empShifts,
                    totalHours: Math.round(totalHours * 100) / 100,
                    totalBasePay: Math.round(totalBasePay * 100) / 100,
                    commission: {
                        ...cData,
                        totalCommission: Math.round(totalCommission * 100) / 100
                    },
                    grandTotal: Math.round((totalBasePay + totalCommission) * 100) / 100,
                };
            }).filter(p => p.shifts.length > 0 || p.commission.lines.length > 0);

            return NextResponse.json({ payroll });
        }

        // Read POS Items & Config based on new user layout
        await posControlSheet.loadCells('A1:C65');

        // Extract Admin PIN (Row 2 -> index 1)
        const adminPin = posControlSheet.getCell(1, 1).value?.toString() || '615007';

        const items: POSItem[] = [];

        // Helper to extract a product safely
        const extractProduct = (rowIndex: number, category: string, id: string) => {
            const nameCell = posControlSheet.getCell(rowIndex, 0);
            const priceCell = posControlSheet.getCell(rowIndex, 1);
            if (nameCell.value) {
                let price = 0;
                if (typeof priceCell.value === 'number') price = priceCell.value;
                else if (typeof priceCell.numberValue === 'number') price = priceCell.numberValue;
                else if (priceCell.value) price = parseFloat(priceCell.value.toString().replace(/[^0-9.-]+/g, "")) || 0;

                items.push({
                    id: id,
                    name: nameCell.value.toString(),
                    category: category,
                    price: price
                });
            }
        };

        // Extract Water Products (Row 4 & 5 -> index 3 & 4)
        extractProduct(3, 'Water', 'item-water-refill');
        extractProduct(4, 'Water', 'item-water-delivery');

        // Extract Ice Products (Row 7 to 13 -> index 6 to 12)
        for (let i = 6; i <= 12; i++) {
            extractProduct(i, 'Ice', `item-${i}`);
        }

        // Read Customers
        await customersSheet.loadCells(`A1:M${LIMIT_CUSTOMERS}`);

        // Extract Headers from Row 1
        const headers: string[] = [];
        for (let c = 0; c < 13; c++) { // A-M
            headers.push(customersSheet.getCell(0, c).value?.toString() || `Header ${c}`);
        }

        const customers: Customer[] = [];
        for (let i = 1; i < LIMIT_CUSTOMERS; i++) {
            const nameCell = customersSheet.getCell(i, 1); // Column B is the Customer Name
            if (nameCell.value) {
                const details: Record<string, string> = {};
                for (let c = 0; c < 13; c++) {
                    const val = customersSheet.getCell(i, c).value;
                    let strVal = val ? val.toString() : '';

                    // Google Sheets returns time (like 10:00 AM) as a decimal fraction of a day (e.g. 0.41666)
                    if (headers[c].includes('Time') && val && typeof val === 'number' && val > 0 && val < 1) {
                        const totalMinutes = Math.round(val * 24 * 60);
                        const hours = Math.floor(totalMinutes / 60);
                        const minutes = totalMinutes % 60;
                        const ampm = hours >= 12 ? 'PM' : 'AM';
                        const displayHours = hours % 12 || 12;
                        const displayMinutes = minutes < 10 ? `0${minutes}` : minutes;
                        strVal = `${displayHours}:${displayMinutes} ${ampm}`;
                    }

                    if (headers[c].includes('Distance') && strVal.length > 5) {
                        // Keep distance strings clean if they get weirdly parsed
                    }
                    details[headers[c]] = strVal;
                }

                const custItems: { name: string, quantity: number, sizeHint?: string }[] = [];
                const waterTypeVal = customersSheet.getCell(i, 7).value;
                const waterQtyVal = customersSheet.getCell(i, 8).value;
                const iceTypeVal = customersSheet.getCell(i, 9).value;
                const iceQtyVal = customersSheet.getCell(i, 10).value;

                if (waterTypeVal && waterQtyVal) {
                    custItems.push({
                        name: waterTypeVal.toString().trim(),
                        quantity: parseFloat(waterQtyVal.toString()) || 1,
                        sizeHint: ''
                    });
                }

                if (iceTypeVal && iceQtyVal) {
                    const iceName = iceTypeVal.toString().trim();
                    const iceQtyStr = iceQtyVal.toString();
                    const m = iceName.match(/(\d+)\s*kg/i) || iceQtyStr.match(/(\d+)\s*kg/i);
                    custItems.push({
                        name: iceName,
                        quantity: parseFloat(iceQtyStr) || 1,
                        sizeHint: m ? m[1] + 'KG' : ''
                    });
                }

                const rawCid = customersSheet.getCell(i, 0).value?.toString() || '';
                customers.push({
                    id: `cust-${rawCid || i}`, // Composite ID for internal use
                    cid: rawCid,               // Raw CID from column A
                    name: nameCell.value.toString().trim(),
                    details: details,
                    standardOrderItems: custItems
                });
            } else {
                // If Column B (Name) is empty, but maybe Column A has ID, we stop only if both are empty.
                const idCell = customersSheet.getCell(i, 0);
                if (!idCell.value && !nameCell.value) {
                    break;
                }
            }
        }

        // Read Employees - robustly search all sheets for a name exactly matching "Employee" or "Staff"
        const employeesSheet = doc.sheetsByIndex.find(s =>
            s.title.toLowerCase() === 'employee' ||
            s.title.toLowerCase() === 'staff'
        );
        let employees: string[] = [];
        if (employeesSheet) {
            await employeesSheet.loadCells(`A1:A${LIMIT_EMPLOYEE}`);
            for (let i = 1; i < LIMIT_EMPLOYEE; i++) {
                const name = employeesSheet.getCell(i, 0).value;
                if (name) employees.push(name.toString());
            }
        }

        // Read Product Types specifically from the Ice items we just parsed
        const productTypes = ['ICE PRODUCTS', ...items.filter(i => i.category === 'Ice').map(i => i.name)];

        // Read Machine Config from POS_System_Control
        // Row 21 (index 20): Machine Power / kWh Rating (e.g. 5.2)
        // Row 22 (index 21): KG Output per Hour (e.g. 41.67)
        const machinePower = parseFloat(posControlSheet.getCell(20, 1).value?.toString() || '5.2');
        const kgPerHour = parseFloat(posControlSheet.getCell(21, 1).value?.toString() || '41.67');

        return NextResponse.json({ items, customers, productTypes, machinePower, kgPerHour, employees, adminPin });
    } catch (error: any) {
        console.error('Error fetching sheet data:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { action, order, customerName, paymentType, loggedInUser, customerType, cid, newCustomerDetails, deliveryDate, deliveryTime } = body;

        const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        const salesSheet = doc.sheetsByTitle['Sales'];
        const customersSheet = doc.sheetsByTitle['Customers'];
        const productionSheet = doc.sheetsByTitle['Production'];
        const posControlSheet = doc.sheetsByTitle['POS_System_Control'];
        const employeeSheet = doc.sheetsByIndex.find(s => s.title.toLowerCase() === 'employee' || s.title.toLowerCase() === 'staff');
        const staffHubSheet = doc.sheetsByTitle['Staff_&_Commission_Hub'];

        if (!posControlSheet) return NextResponse.json({ error: 'POS Control sheet not found' }, { status: 500 });

        if (action === 'LOG_PRODUCTION') {
            if (!productionSheet) return NextResponse.json({ error: 'Production sheet not found' }, { status: 500 });
            const { log, loggedInUser } = body;

            const rowValues = {
                'Log_Date': log.date,
                'Machine_Start_Time': log.startTime,
                'Machine_End_Time': log.endTime,
                'Total_Run_Hours': parseFloat(log.totalHours),
                'Units_1KG': parseInt(log.units_1KG || 0, 10),
                'Units_3KG': parseInt(log.units_3KG || 0, 10),
                'Units_5KG': parseInt(log.units_5KG || 0, 10),
                'Units_10KG': parseInt(log.units_10KG || 0, 10),
                'Units_25KG': parseInt(log.units_25KG || 0, 10),
                'Units_30KG': parseInt(log.units_30KG || 0, 10),
                'Units_45KG': parseInt(log.units_45KG || 0, 10),
                'Total_KG_Produced': parseFloat(log.totalWeight),
                'Expected_Yield_KG': parseFloat(log.expectedYield),
                'Variance_KG': parseFloat((parseFloat(log.totalWeight) - parseFloat(log.expectedYield)).toFixed(2)),
                'Variance_%': log.variance,
                'Elec_Cost': parseFloat(log.elecCost),
                'Staff': log.staffName || 'Admin',
                'Audit Log': `Added by ${loggedInUser || 'Unknown'} at ${getPHTime()}`
            };

            await productionSheet.addRow(rowValues);
            return NextResponse.json({ success: true });
        }

        if (action === 'LOG_AUDIT') {
            let auditSheet = doc.sheetsByTitle['Inventory_Audit'];

            // Create sheet if it doesn't exist
            if (!auditSheet) {
                auditSheet = await doc.addSheet({
                    title: 'Inventory_Audit',
                    headerValues: ['Date', 'Status', 'Missing_1KG', 'Missing_3KG', 'Missing_5KG', 'Missing_10KG', 'Missing_25KG', 'Missing_30KG', 'Missing_45KG', 'Staff']
                });
            }

            const { audit } = body;
            const rowValues = {
                'Date': audit.date,
                'Status': audit.status,
                'Missing_1KG': audit.missing_1KG || 0,
                'Missing_3KG': audit.missing_3KG || 0,
                'Missing_5KG': audit.missing_5KG || 0,
                'Missing_10KG': audit.missing_10KG || 0,
                'Missing_25KG': audit.missing_25KG || 0,
                'Missing_30KG': audit.missing_30KG || 0,
                'Missing_45KG': audit.missing_45KG || 0,
                'Staff': audit.staff || 'Admin'
            };
            await auditSheet.addRow(rowValues);
            return NextResponse.json({ success: true });
        }
 
        if (action === 'ADD_EMPLOYEE') {
            if (!employeeSheet) return NextResponse.json({ error: 'Employee sheet not found' }, { status: 500 });

            const { staffName, role, basePay } = body;
            await employeeSheet.loadCells(`A1:J${LIMIT_EMPLOYEE}`);

            // Find columns dynamically
            let nameCol = 0, roleCol = 3, salaryCol = 4;
            for (let c = 0; c < 10; c++) {
                const h = (employeeSheet.getCell(0, c).value?.toString() || '').toLowerCase();
                if (h.includes('name')) nameCol = c;
                if (h.includes('role') || h.includes('position')) roleCol = c;
                if (h.includes('salary') || h.includes('base pay') || h.includes('rate')) salaryCol = c;
            }

            // Find empty row
            let targetRow = -1;
            for (let r = 1; r < LIMIT_EMPLOYEE; r++) {
                if (!employeeSheet.getCell(r, nameCol).value) {
                    targetRow = r;
                    break;
                }
            }

            if (targetRow === -1) return NextResponse.json({ error: 'Employee list is full (100 rows limit)' }, { status: 500 });

            employeeSheet.getCell(targetRow, nameCol).value = staffName;
            employeeSheet.getCell(targetRow, roleCol).value = role;
            employeeSheet.getCell(targetRow, salaryCol).value = Number(basePay) || 0;
            await employeeSheet.saveUpdatedCells();

            return NextResponse.json({ success: true });
        }

        if (action === 'REMOVE_EMPLOYEE') {
            if (!employeeSheet) return NextResponse.json({ error: 'Employee sheet not found' }, { status: 500 });

            const { staffName } = body;
            await employeeSheet.loadCells(`A1:J${LIMIT_EMPLOYEE}`);

            let nameCol = 0;
            for (let c = 0; c < 10; c++) {
                const h = (employeeSheet.getCell(0, c).value?.toString() || '').toLowerCase();
                if (h.includes('name')) nameCol = c;
            }

            let found = false;
            for (let r = 1; r < LIMIT_EMPLOYEE; r++) {
                if (employeeSheet.getCell(r, nameCol).value?.toString() === staffName) {
                    // Clear the entire row bounds
                    for (let c = 0; c < 10; c++) {
                        employeeSheet.getCell(r, c).value = null;
                    }
                    found = true;
                    break;
                }
            }

            if (!found) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

            await employeeSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }

        if (action === 'EDIT_EMPLOYEE') {
            if (!employeeSheet) return NextResponse.json({ error: 'Employee sheet not found' }, { status: 500 });

            const { oldStaffName, newStaffName, role, basePay } = body;
            await employeeSheet.loadCells(`A1:J${LIMIT_EMPLOYEE}`);

            let nameCol = 0, roleCol = 3, salaryCol = 4;
            for (let c = 0; c < 10; c++) {
                const h = (employeeSheet.getCell(0, c).value?.toString() || '').toLowerCase();
                if (h.includes('name')) nameCol = c;
                if (h.includes('role') || h.includes('position')) roleCol = c;
                if (h.includes('salary') || h.includes('base pay') || h.includes('rate')) salaryCol = c;
            }

            let found = false;
            for (let r = 1; r < LIMIT_EMPLOYEE; r++) {
                if (employeeSheet.getCell(r, nameCol).value?.toString() === oldStaffName) {
                    employeeSheet.getCell(r, nameCol).value = newStaffName;
                    employeeSheet.getCell(r, roleCol).value = role;
                    employeeSheet.getCell(r, salaryCol).value = Number(basePay) || 0;
                    found = true;
                    break;
                }
            }

            if (!found) return NextResponse.json({ error: 'Employee not found' }, { status: 404 });

            await employeeSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }

        if (action === 'CLOCK_IN') {
            if (!staffHubSheet) return NextResponse.json({ error: 'Staff Hub sheet not found' }, { status: 500 });
            const { staffName, role, basePay } = body;

            // Use SERVER-SIDE PH time for both date and time — prevents locale/serial issues
            const phNow = getPHTime(); // "YYYY-MM-DD HH:MM:SS"
            const date = phNow.split(' ')[0]; // YYYY-MM-DD
            // Format time as "HH:MM AM/PM" from 24h server time
            const [hhStr, mmStr] = phNow.split(' ')[1].split(':');
            const hh = parseInt(hhStr, 10);
            const ampm = hh >= 12 ? 'PM' : 'AM';
            const h12 = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
            const time = `${h12.toString().padStart(2, '0')}:${mmStr} ${ampm}`;

            console.log(`[CLOCK_IN] Saving: ${staffName}, Date: ${date}, Time: ${time}, Role: ${role}, BasePay: ${basePay}`);

            await staffHubSheet.loadHeaderRow();
            const staffRowCount = Math.min(staffHubSheet.rowCount, LIMIT_STAFF_HUB);
            await staffHubSheet.loadCells(`A1:N${Math.min(staffRowCount + 10, staffHubSheet.rowCount)}`);
            
            // Find the true end of the dataset by searching backwards
            let lastDataRow = 0;
            for (let i = staffRowCount - 1; i >= 1; i--) {
                const cellB = staffHubSheet.getCell(i, 1);
                if (cellB.value) {
                    lastDataRow = i;
                    break;
                }
            }

            // PREVENT DUPLICATE: check if this employee already has an open session
            for (let i = lastDataRow; i >= 1; i--) {
                const name = staffHubSheet.getCell(i, 1).value?.toString().trim();
                if (!name) continue;
                if (name !== staffName.trim()) continue;
                const eVal = staffHubSheet.getCell(i, 4).value;
                const isAlreadyOpen = eVal === null || eVal === undefined || eVal === '' || eVal === 0;
                if (isAlreadyOpen) {
                    console.log(`[CLOCK_IN] ${staffName} already has open session at row ${i} — skipping duplicate`);
                    return NextResponse.json({ error: `${staffName} is already clocked in. Please log out first.` }, { status: 409 });
                }
                break; // Only need to check the most recent row for this employee
            }
            
            const targetRow = lastDataRow + 1;
            if (targetRow >= LIMIT_STAFF_HUB) {
                return NextResponse.json({ error: 'Staff Hub list is full. Please contact administrator.' }, { status: 500 });
            }

            // Prepended apostrophe forces Google Sheets to treat the cell as literal text 
            // instead of auto-converting times to serial numbers
            staffHubSheet.getCell(targetRow, 0).value = `'${date}`;       // A: Clock_In_Date
            staffHubSheet.getCell(targetRow, 1).value = staffName;        // B: Staff_Name
            staffHubSheet.getCell(targetRow, 2).value = role || '';       // C: Role
            staffHubSheet.getCell(targetRow, 3).value = `'${time}`;       // D: Clock_In_Time (stored as text)
            staffHubSheet.getCell(targetRow, 9).value = basePay || 0;    // J: Base_Pay

            await staffHubSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }

        if (action === 'CLOCK_OUT') {
            if (!staffHubSheet) return NextResponse.json({ error: 'Staff Hub sheet not found' }, { status: 500 });
            const { staffName, overrideDate, overrideTime, isOverride } = body;

            // Helper: parse "HH:MM AM/PM" → decimal hours since midnight
            const parseTime12hr = (t: string): number => {
                const cleanT = (t || '').toString().replace(/^'/, '');
                const m = cleanT.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
                if (!m) return 0;
                let h = parseInt(m[1], 10);
                const min = parseInt(m[2], 10);
                if (m[3].toUpperCase() === 'PM' && h !== 12) h += 12;
                if (m[3].toUpperCase() === 'AM' && h === 12) h = 0;
                return h + min / 60;
            };

            // Helper: parse "YYYY-MM-DD" → day serial relative to 1899-12-30 (for cross-day calc)
            const parseDateDays = (d: string): number => {
                const cleanD = (d || '').toString().replace(/^'/, '');
                const parts = cleanD.split('-');
                if (parts.length < 3) return 0;
                const dt = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
                return dt.getTime() / (24 * 3600 * 1000);
            };

            // Convert HH:MM (from <input type="time">) to 12-hr format
            const formatTime12hr = (t: string) => {
                const [hStr, mStr] = t.split(':');
                const h = parseInt(hStr, 10);
                const suffix = h >= 12 ? 'PM' : 'AM';
                const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                return `${h12.toString().padStart(2, '0')}:${mStr} ${suffix}`;
            };

            // Use server-side PH time for clock-out (consistent, no locale issues)
            const phNow = getPHTime();
            const phDateStr = phNow.split(' ')[0];
            const [phHh, phMm] = phNow.split(' ')[1].split(':');
            const phH = parseInt(phHh, 10);
            const phAmpm = phH >= 12 ? 'PM' : 'AM';
            const phH12 = phH === 0 ? 12 : phH > 12 ? phH - 12 : phH;
            const serverTimeStr = `${phH12.toString().padStart(2, '0')}:${phMm} ${phAmpm}`;

            const clockOutTime = isOverride && overrideTime ? formatTime12hr(overrideTime) : serverTimeStr;
            const clockOutDate = isOverride && overrideDate ? overrideDate : phDateStr;

            // Search for the active row
            await staffHubSheet.loadHeaderRow();
            const staffRowCount = Math.min(staffHubSheet.rowCount, LIMIT_STAFF_HUB);
            await staffHubSheet.loadCells(`A1:N${staffRowCount}`);
            let targetRowIndex = -1;
            for (let i = staffRowCount - 1; i >= 1; i--) {
                const cellB = staffHubSheet.getCell(i, 1);
                const name = cellB.value ? cellB.value.toString().trim() : null;
                if (!name) continue;
                const clockOutVal = staffHubSheet.getCell(i, 4).value;
                const isOpenSession = clockOutVal === null || clockOutVal === undefined || clockOutVal === '' || clockOutVal === 0;
                if (name === staffName.trim() && isOpenSession) {
                    targetRowIndex = i;
                    break;
                }
            }

            if (targetRowIndex === -1) {
                return NextResponse.json({ error: 'No active session found to check out.' }, { status: 400 });
            }

            // Prepended apostrophe to prevent serial number auto-conversion
            staffHubSheet.getCell(targetRowIndex, 4).value = `'${clockOutTime}`;  // E: Clock_Out_Time
            staffHubSheet.getCell(targetRowIndex, 5).value = `'${clockOutDate}`;  // F: Clock_Out_Date

            // Calculate hours server-side (avoids formula breaking on text values in A/D/E/F)
            const clockInTimeStr = staffHubSheet.getCell(targetRowIndex, 3).value?.toString() || '';
            const clockInDateStr = staffHubSheet.getCell(targetRowIndex, 0).value?.toString() || '';
            let hoursWorked = 0;
            if (clockInTimeStr && clockInDateStr && clockInDateStr.includes('-')) {
                const inDays = parseDateDays(clockInDateStr) + parseTime12hr(clockInTimeStr) / 24;
                const outDays = parseDateDays(clockOutDate) + parseTime12hr(clockOutTime) / 24;
                hoursWorked = Math.max(0, (outDays - inDays) * 24);
            }
            staffHubSheet.getCell(targetRowIndex, 6).value = Math.round(hoursWorked * 1000) / 1000; // G: Actual_Hours

            // Calculate net pay: (basePay / 10) * hours + commission
            const basePay = staffHubSheet.getCell(targetRowIndex, 9).value;
            const commission = staffHubSheet.getCell(targetRowIndex, 8).value;
            const basePayNum = typeof basePay === 'number' ? basePay : parseFloat(basePay?.toString() || '0') || 0;
            const commNum = typeof commission === 'number' ? commission : parseFloat(commission?.toString() || '0') || 0;
            const netPay = (basePayNum / 10) * hoursWorked + commNum;
            staffHubSheet.getCell(targetRowIndex, 10).value = Math.round(netPay * 100) / 100; // K: Net_Pay

            // Audit trail — col N (index 13)
            if (isOverride) {
                const existingNote = staffHubSheet.getCell(targetRowIndex, 13).value?.toString() || '';
                const stamp = `Logout overridden: ${clockOutDate} ${clockOutTime}`;
                staffHubSheet.getCell(targetRowIndex, 13).value = existingNote ? existingNote + ' | ' + stamp : stamp;
            }


            await staffHubSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }

        if (action === 'OVERRIDE_CLOCK') {
            // Override login time, logout time, or both for an existing row
            if (!staffHubSheet) return NextResponse.json({ error: 'Staff Hub sheet not found' }, { status: 500 });
            const { staffName, overrideLoginDate, overrideLoginTime, overrideLogoutDate, overrideLogoutTime } = body;

 
            const formatTime12hr = (t: string) => {
                if (!t) return '';
                const [hStr, mStr] = t.split(':');
                const h = parseInt(hStr, 10);
                const suffix = h >= 12 ? 'PM' : 'AM';
                const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                return `${h12.toString().padStart(2, '0')}:${mStr} ${suffix}`;
            };
 
            await staffHubSheet.loadHeaderRow();
            const overrideRowCount = Math.min(staffHubSheet.rowCount, LIMIT_STAFF_HUB);
            await staffHubSheet.loadCells(`A1:N${overrideRowCount}`);
 
            // Find the active (no clock-out) row for this employee — search backwards
            let targetRowIndex = -1;
            for (let i = overrideRowCount - 1; i >= 1; i--) {
                const nameCell = staffHubSheet.getCell(i, 1);
                const name = nameCell.value?.toString().trim();
                if (!name) continue;
                const clockOutVal = staffHubSheet.getCell(i, 4).value;
                // Treat null, undefined, '', and 0 (formula residue) as "no clock-out"
                const isOpenSession = clockOutVal === null || clockOutVal === undefined || clockOutVal === '' || clockOutVal === 0;
                if (name === staffName.trim() && isOpenSession) {
                    targetRowIndex = i;
                    break;
                }
            }
 
            if (targetRowIndex === -1) {
                return NextResponse.json({ error: 'No active (open) session found for this employee.' }, { status: 400 });
            }
 
            const auditParts: string[] = [];
 
            if (overrideLoginDate || overrideLoginTime) {
                if (overrideLoginDate) {
                    const newDate = overrideLoginDate; // Standardized to YYYY-MM-DD
                    staffHubSheet.getCell(targetRowIndex, 0).value = `'${newDate}`;  // A: Date (text)
                    auditParts.push(`Login date overridden to ${newDate}`);
                }
                if (overrideLoginTime) {
                    const newTime = formatTime12hr(overrideLoginTime);
                    staffHubSheet.getCell(targetRowIndex, 3).value = `'${newTime}`;  // D: Clock_In (text)
                    auditParts.push(`Login time overridden to ${newTime}`);
                }
            }
 
            if (overrideLogoutDate || overrideLogoutTime) {
                // Get current login values for hours calculation
                const loginDateStr = (overrideLoginDate || staffHubSheet.getCell(targetRowIndex, 0).value?.toString() || '');
                const loginTimeStr = (overrideLoginTime ? formatTime12hr(overrideLoginTime) : staffHubSheet.getCell(targetRowIndex, 3).value?.toString() || '');

                if (overrideLogoutTime) {
                    const newTime = formatTime12hr(overrideLogoutTime);
                    staffHubSheet.getCell(targetRowIndex, 4).value = `'${newTime}`;  // E: Clock_Out (text)
                    auditParts.push(`Logout time overridden to ${newTime}`);
                }
                if (overrideLogoutDate) {
                    const newDate = overrideLogoutDate; // Standardized to YYYY-MM-DD
                    staffHubSheet.getCell(targetRowIndex, 5).value = `'${newDate}`;  // F: Logout_Date (text)
                    auditParts.push(`Logout date overridden to ${newDate}`);
                }

                // Recalculate hours server-side (text cells can't use arithmetic formula)
                const outTimeStr = overrideLogoutTime ? formatTime12hr(overrideLogoutTime) : staffHubSheet.getCell(targetRowIndex, 4).value?.toString() || '';
                const outDateStr = overrideLogoutDate || staffHubSheet.getCell(targetRowIndex, 5).value?.toString() || '';
                const parseT = (t: string) => { const cleanT = (t||'').toString().replace(/^'/, ''); const m = cleanT.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i); if(!m) return 0; let h=parseInt(m[1]); const min=parseInt(m[2]); if(m[3].toUpperCase()==='PM'&&h!==12) h+=12; if(m[3].toUpperCase()==='AM'&&h===12) h=0; return h+min/60; };
                const parseD = (d: string) => { const cleanD = (d||'').toString().replace(/^'/, ''); const p=cleanD.split('-'); if(p.length<3) return 0; return new Date(+p[0],+p[1]-1,+p[2]).getTime()/(24*3600*1000); };
                let hrs = 0;
                if (loginTimeStr && loginDateStr && loginDateStr.includes('-') && outDateStr.includes('-')) {
                    hrs = Math.max(0, (parseD(outDateStr) + parseT(outTimeStr)/24 - parseD(loginDateStr) - parseT(loginTimeStr)/24) * 24);
                }
                staffHubSheet.getCell(targetRowIndex, 6).value = Math.round(hrs * 1000) / 1000; // G: Actual_Hours
                const bp = staffHubSheet.getCell(targetRowIndex, 9).value;
                const cm = staffHubSheet.getCell(targetRowIndex, 8).value;
                const bpN = typeof bp==='number' ? bp : parseFloat(bp?.toString()||'0')||0;
                const cmN = typeof cm==='number' ? cm : parseFloat(cm?.toString()||'0')||0;
                staffHubSheet.getCell(targetRowIndex, 10).value = Math.round(((bpN/10)*hrs + cmN)*100)/100; // K: Net_Pay
            }
 
            // Write audit trail to col N (index 13)
            if (auditParts.length > 0) {
                const existingNote = staffHubSheet.getCell(targetRowIndex, 13).value?.toString() || '';
                const stamp = `[OVERRIDE ${getPHTime()}] ` + auditParts.join(', ');
                staffHubSheet.getCell(targetRowIndex, 13).value = existingNote ? existingNote + '\n' + stamp : stamp;
            }
 
            await staffHubSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }

        if (action === 'UPDATE_SALE_ROW') {
            const { transactionId, itemName, updates, staffName } = body;
            if (!transactionId || !updates) {
                return NextResponse.json({ error: 'Missing transactionId or updates' }, { status: 400 });
            }
            const salesSheet = doc.sheetsByTitle['Sales'];
            if (!salesSheet) return NextResponse.json({ error: 'Sales sheet not found' }, { status: 500 });

            // Load headers first
            await salesSheet.loadHeaderRow();
            const headersArr = salesSheet.headerValues;

            // Find target row
            const rows = await salesSheet.getRows();
            let targetRowIdx = -1;
            for (let ri = 0; ri < rows.length; ri++) {
                if (rows[ri].get('Transaction_ID') === transactionId && (!itemName || rows[ri].get('Item_Name') === itemName)) {
                    targetRowIdx = rows[ri].rowNumber - 1;
                    break;
                }
            }

            if (targetRowIdx === -1) {
                return NextResponse.json({ error: 'Sale row not found' }, { status: 404 });
            }

            // Load cells for that row
            await salesSheet.loadCells({
                startRowIndex: targetRowIdx, endRowIndex: targetRowIdx + 1,
                startColumnIndex: 0, endColumnIndex: 20
            });

            const getIdx = (name: string, fallback: number) => {
                const i = headersArr.indexOf(name);
                return i !== -1 ? i : fallback;
            };

            const qtyIdx = getIdx('Quantity', 5);
            const unitIdx = getIdx('Unit_Price', 6);
            const totalIdx = getIdx('Total_Price', 7);
            const commIdx = getIdx('Commission_Earned', 11);
            const auditIdx = getIdx('Audit Log', 16);
            const auditTsIdx = getIdx('Audit_Log_Timestamp', 17);

            const oldQty = parseFloat(salesSheet.getCell(targetRowIdx, qtyIdx).value?.toString() || '0');
            const newQty = updates.quantity !== undefined ? (parseFloat(updates.quantity) || 0) : oldQty;
            const newUnitP = updates.unitPrice !== undefined ? (parseFloat(updates.unitPrice) || 0) : parseFloat(salesSheet.getCell(targetRowIdx, unitIdx).value?.toString() || '0');
            const newTotalP = updates.unitPrice !== undefined || updates.quantity !== undefined ? (newQty * newUnitP) : parseFloat(salesSheet.getCell(targetRowIdx, totalIdx).value?.toString() || '0');

            if (updates.customerName) salesSheet.getCell(targetRowIdx, getIdx('Customer_Name', 3)).value = updates.customerName;
            if (updates.itemName) salesSheet.getCell(targetRowIdx, getIdx('Item_Name', 4)).value = updates.itemName;
            salesSheet.getCell(targetRowIdx, qtyIdx).value = newQty;
            salesSheet.getCell(targetRowIdx, unitIdx).value = newUnitP;
            salesSheet.getCell(targetRowIdx, totalIdx).value = newTotalP;
            if (updates.orderType) salesSheet.getCell(targetRowIdx, getIdx('Order_Type', 8)).value = updates.orderType;
            if (updates.paymentMethod) salesSheet.getCell(targetRowIdx, getIdx('Payment_Method', 9)).value = updates.paymentMethod;

            if (updates.deliveryDate !== undefined) salesSheet.getCell(targetRowIdx, getIdx('Unplanned_Delivery_Date', 13)).value = updates.deliveryDate;
            if (updates.deliveryTime !== undefined) salesSheet.getCell(targetRowIdx, getIdx('Unplanned_Delivery_Time', 14)).value = updates.deliveryTime;

            // Recalculate commission if orderType or quantity changed
            if (updates.orderType !== undefined || updates.quantity !== undefined) {
                const effectiveOrderType = updates.orderType !== undefined
                    ? updates.orderType
                    : (salesSheet.getCell(targetRowIdx, getIdx('Order_Type', 8)).value?.toString() || '');
                const effectiveItemName = updates.itemName !== undefined
                    ? updates.itemName
                    : (salesSheet.getCell(targetRowIdx, getIdx('Item_Name', 4)).value?.toString() || '');
                const commRules = await fetchCommissionRules(doc);
                const newCommission = calculateCommission(effectiveItemName, newQty, effectiveOrderType, commRules);
                salesSheet.getCell(targetRowIdx, commIdx).value = newCommission;
            }

            // Audit
            const phTime = getPHTime();
            const changeLog = `Edited by ${staffName || 'Unknown'} at ${phTime}`;
            const currentLog = salesSheet.getCell(targetRowIdx, auditIdx).value?.toString() || '';
            salesSheet.getCell(targetRowIdx, auditIdx).value = currentLog ? `${currentLog}\n${changeLog}` : changeLog;
            salesSheet.getCell(targetRowIdx, auditTsIdx).value = phTime;

            await salesSheet.saveUpdatedCells();
            return NextResponse.json({ success: true, updated: 1 });
        }

        if (action === 'TOGGLE_SALE_STATUS') {
            const { transactionId, itemName, staffName, newStatus, rowIdx } = body;
            if ((!transactionId && rowIdx === undefined) || !newStatus) {
                return NextResponse.json({ error: 'Missing identifier or newStatus' }, { status: 400 });
            }
            const salesSheet = doc.sheetsByTitle['Sales'];
            if (!salesSheet) return NextResponse.json({ error: 'Sales sheet not found' }, { status: 500 });

            // Load headers first
            await salesSheet.loadHeaderRow();
            const headersArr = salesSheet.headerValues;

            let targetRowIdx = rowIdx;
            if (targetRowIdx === undefined) {
                const rows = await salesSheet.getRows();
                for (let i = 0; i < rows.length; i++) {
                    if (rows[i].get('Transaction_ID') === transactionId && (!itemName || rows[i].get('Item_Name') === itemName)) {
                        targetRowIdx = rows[i].rowNumber - 1;
                        break;
                    }
                }
            }

            if (targetRowIdx === undefined || targetRowIdx === -1) {
                return NextResponse.json({ success: false, message: 'No matching sale row found.' });
            }

            const phTime = getPHTime();
            const auditNote = `Marked ${newStatus} by ${staffName || 'Unknown'} at ${phTime}`;

            // Load specifically this row to modify
            await salesSheet.loadCells({
                startRowIndex: targetRowIdx, endRowIndex: targetRowIdx + 1,
                startColumnIndex: 0, endColumnIndex: 20
            });

            const getIdx = (name: string, fallback: number) => {
                const i = headersArr.indexOf(name);
                return i !== -1 ? i : fallback;
            };

            const payIdx = getIdx('Payment_Method', 9);
            const auditIdx = getIdx('Audit Log', 16);
            const auditTsIdx = getIdx('Audit_Log_Timestamp', 17);

            // Update cells
            salesSheet.getCell(targetRowIdx, payIdx).value = newStatus;
            const currentLog = salesSheet.getCell(targetRowIdx, auditIdx).value?.toString() || '';
            salesSheet.getCell(targetRowIdx, auditIdx).value = currentLog ? `${currentLog}\n${auditNote}` : auditNote;
            salesSheet.getCell(targetRowIdx, auditTsIdx).value = phTime;

            await salesSheet.saveUpdatedCells();
            return NextResponse.json({ success: true, updated: 1 });
        }

        if (action === 'UPDATE_PRODUCTION_ROW') {
            const { date, startTime, updates, loggedInUser } = body;
            const prodSheet = doc.sheetsByTitle['Production'];
            if (!prodSheet) return NextResponse.json({ error: 'Production sheet not found' }, { status: 500 });
            await prodSheet.loadCells(`A1:S${LIMIT_PRODUCTION}`);
            const rows = await prodSheet.getRows();
            let updated = false;
            for (let ri = 0; ri < rows.length; ri++) {
                const row = rows[ri];
                // Match by date and start time (unique enough for a run)
                if (row.get('Log_Date') === date && row.get('Machine_Start_Time') === startTime) {
                    const sheetRow = ri + 1;
                    if (updates.units_1KG !== undefined) prodSheet.getCell(sheetRow, 4).value = updates.units_1KG;
                    if (updates.units_3KG !== undefined) prodSheet.getCell(sheetRow, 5).value = updates.units_3KG;
                    if (updates.units_5KG !== undefined) prodSheet.getCell(sheetRow, 6).value = updates.units_5KG;
                    if (updates.units_10KG !== undefined) prodSheet.getCell(sheetRow, 7).value = updates.units_10KG;
                    if (updates.units_25KG !== undefined) prodSheet.getCell(sheetRow, 8).value = updates.units_25KG;
                    if (updates.units_30KG !== undefined) prodSheet.getCell(sheetRow, 9).value = updates.units_30KG;
                    if (updates.units_45KG !== undefined) prodSheet.getCell(sheetRow, 10).value = updates.units_45KG;
                    if (updates.totalWeight !== undefined) prodSheet.getCell(sheetRow, 11).value = updates.totalWeight;
                    if (updates.staffName !== undefined) prodSheet.getCell(sheetRow, 16).value = updates.staffName;
                    
                    const phTime = getPHTime();
                    const changeLog = `Edited by ${loggedInUser || 'Unknown'} at ${phTime}`;
                    const currentLog = prodSheet.getCell(sheetRow, 17).value?.toString() || '';
                    prodSheet.getCell(sheetRow, 17).value = currentLog ? `${currentLog} | ${changeLog}` : changeLog;

                    updated = true;
                    break;
                }
            }
            if (updated) await prodSheet.saveUpdatedCells();
            return NextResponse.json({ success: updated });
        }

        // Legacy single-field order type update
        if (action === 'UPDATE_ORDER_TYPE') {
            const { transactionId, newOrderType } = body;
            if (!transactionId || !newOrderType) {
                return NextResponse.json({ error: 'Missing transactionId or newOrderType' }, { status: 400 });
            }
            const salesSheet = doc.sheetsByTitle['Sales'];
            if (!salesSheet) return NextResponse.json({ error: 'Sales sheet not found' }, { status: 500 });
            await salesSheet.loadCells(`A1:P${LIMIT_SALES}`);
            const rows = await salesSheet.getRows();
            let updated = 0;
            for (let ri = 0; ri < rows.length; ri++) {
                const row = rows[ri];
                if (row.get('Transaction_ID') === transactionId) {
                    const cell = salesSheet.getCell(ri + 1, 8); // col I = Order_Type
                    cell.value = newOrderType;
                    updated++;
                }
            }
            if (updated > 0) await salesSheet.saveUpdatedCells();
            return NextResponse.json({ success: true, updated });
        }


        if (action === 'GET_EXPENSES') { return NextResponse.json({ error: 'Deprecated. Use GET ?tab=expenses' }, { status: 400 }); }

        if (action === 'ADD_EXPENSE' || action === 'LOG_EXPENSE') {
            const { staffName, description, amount, date, loggedInUser } = body;
            const expSheet = doc.sheetsByTitle['Expenses'];
            if (!expSheet) return NextResponse.json({ error: 'Expenses sheet not found' }, { status: 500 });
            
            const maxRows = Math.max(expSheet.rowCount, 50);
            await expSheet.loadCells(`A1:O${maxRows + 50}`);
            
            let isCogs = false;
            for (let i = 1; i < maxRows; i++) {
                const desc = expSheet.getCell(i, 0).value?.toString() || '';
                if (desc === description && expSheet.getCell(i, 1).value === 'COGS') {
                    isCogs = true; break;
                }
            }
            
            let targetRow = 1;
            const colOffset = isCogs ? 9 : 4; // 4=E, 9=J
            for (let i = 1; i < maxRows + 50; i++) {
                if (!expSheet.getCell(i, colOffset).value && !expSheet.getCell(i, colOffset+3).value) {
                    targetRow = i; break;
                }
            }
            
            const expDate = date || new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
            expSheet.getCell(targetRow, colOffset).value = expDate;
            expSheet.getCell(targetRow, colOffset + 1).value = staffName || (action === 'LOG_EXPENSE' ? 'Staff' : 'Admin (Dashboard)');
            expSheet.getCell(targetRow, colOffset + 2).value = description;
            expSheet.getCell(targetRow, colOffset + 3).value = parseFloat(amount || '0');
            const phTime = getPHTime();
            expSheet.getCell(targetRow, colOffset + 4).value = `Added by ${loggedInUser || 'Unknown'} at ${phTime}`;
            await expSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }

        if (action === 'UPDATE_EXPENSE') {
            const { rowIndex, description, amount, staffName, isCOGS, loggedInUser } = body;
            if (rowIndex === undefined || rowIndex === null) return NextResponse.json({ error: 'Missing rowIndex' }, { status: 400 });

            const expSheet = doc.sheetsByTitle['Expenses'];
            if (!expSheet) return NextResponse.json({ error: 'Expenses sheet not found' }, { status: 500 });
            await expSheet.loadCells(`A1:O${rowIndex + 10}`);

            const colOffset = isCOGS ? 9 : 4;
            if (description !== undefined) expSheet.getCell(rowIndex, colOffset + 2).value = description;
            if (amount !== undefined) expSheet.getCell(rowIndex, colOffset + 3).value = parseFloat(String(amount));
            if (staffName !== undefined) expSheet.getCell(rowIndex, colOffset + 1).value = staffName;
            
            const phTime = getPHTime();
            const changeLog = `Edited by ${loggedInUser || 'Unknown'} at ${phTime}`;
            const currentLog = expSheet.getCell(rowIndex, colOffset + 4).value?.toString() || '';
            expSheet.getCell(rowIndex, colOffset + 4).value = currentLog ? `${currentLog} | ${changeLog}` : changeLog;

            await expSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }

        if (action === 'DELETE_EXPENSE') {
            const { rowIndex, isCOGS, loggedInUser } = body;
            if (rowIndex === undefined || rowIndex === null) return NextResponse.json({ error: 'Missing rowIndex' }, { status: 400 });

            const expSheet = doc.sheetsByTitle['Expenses'];
            if (!expSheet) return NextResponse.json({ error: 'Expenses sheet not found' }, { status: 500 });
            await expSheet.loadCells(`A1:O${rowIndex + 10}`);

            const colOffset = isCOGS ? 9 : 4;
            // Mark as VOIDED instead of clearing data to preserve audit trail
            expSheet.getCell(rowIndex, colOffset + 2).value = 'VOIDED';
            expSheet.getCell(rowIndex, colOffset + 3).value = 0;
            
            const phTime = getPHTime();
            const changeLog = `Deleted by ${loggedInUser || 'Unknown'} at ${phTime}`;
            const currentLog = expSheet.getCell(rowIndex, colOffset + 4).value?.toString() || '';
            expSheet.getCell(rowIndex, colOffset + 4).value = currentLog ? `${currentLog} | ${changeLog}` : changeLog;

            await expSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }

        if (action === 'ADD_CATEGORY') {
            const { categoryName, budgetAmount, isCOGS } = body;
            if (!categoryName) return NextResponse.json({ error: 'Missing categoryName' }, { status: 400 });
            const expSheet = doc.sheetsByTitle['Expenses'];
            if (!expSheet) return NextResponse.json({ error: 'Expenses sheet not found' }, { status: 500 });

            const maxRows = Math.max(expSheet.rowCount, 50);
            await expSheet.loadCells(`A1:C${maxRows + 50}`);
            
            let nextRow = 1;
            for (let i = 1; i < maxRows + 50; i++) {
                if (!expSheet.getCell(i, 0).value) { nextRow = i; break; }
            }
            
            expSheet.getCell(nextRow, 0).value = categoryName;
            expSheet.getCell(nextRow, 1).value = isCOGS ? 'COGS' : 'OPEX';
            expSheet.getCell(nextRow, 2).value = parseFloat(budgetAmount || '0');
            await expSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }

        /* LOG_EXPENSE merged with ADD_EXPENSE */

        if (action === 'CREATE_ASSUMED_DELIVERY') {
            const { delivery, selectedDate } = body;
            const salesSheet = doc.sheetsByTitle['Sales'];
            if (!salesSheet) return NextResponse.json({ error: 'Sales sheet not found' }, { status: 500 });

            const rules = await fetchCommissionRules(doc);

            const timestamp = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' });
            const shortDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
            const realTxnId = `TXN-${shortDate}-${randSuffix}`;

            // A=0 Timestamp, B=1 TXN, C=2 CID, D=3 Name, E=4 Item, F=5 Qty, G=6 UnitPrice, H=7 Total, I=8 Type, J=9 Payment, K=10 Staff, N=13 DeliveryStatus, O=14 Driver
            // Do not pollute Order_Type with dates/times for reporting cleanliness
            const orderTypeStr = 'Regular (Delivery)';
            const delvDate = selectedDate || new Date().toISOString().slice(0, 10);
            const delvTime = delivery.preferredTime || '12:00 PM';

            // Replicate POS behavior: one row per parsed item
            const itemsToSave = delivery.items && delivery.items.length > 0
                ? delivery.items
                : [{ name: delivery.itemName, quantity: delivery.quantity }];

            const newRows = itemsToSave.map((item: any) => {
                const itemQty = Number(item.quantity) || 1;
                const unitTotal = delivery.totalPrice > 0 && delivery.quantity > 0
                    ? Math.round(((delivery.totalPrice / delivery.quantity) * itemQty) * 100) / 100
                    : 0;

                const commission = calculateCommission(item.name, itemQty, orderTypeStr, rules);

                return {
                    'Timestamp': timestamp,
                    'Transaction_ID': realTxnId,
                    'CID': String(delivery.cid),
                    'Customer_Name': delivery.customerName,
                    'Item_Name': item.name,
                    'Quantity': itemQty,
                    'Unit_Price': unitTotal > 0 && itemQty > 0 ? (unitTotal / itemQty) : 0,
                    'Total_Price': unitTotal,
                    'Order_Type': orderTypeStr,
                    'Payment_Method': delivery.paymentStatus || 'Credit',
                    'Staff_Name': 'Admin',
                    'Driver_Name': delivery.driver || '',
                    'Helper_Name': delivery.helper || '',
                    'Commission_Earned': commission,
                    'Delivery Status': delivery.deliveryStatus || 'Delivery Pending',
                    'Unplanned_Delivery_Date': delvDate,
                    'Unplanned_Delivery_Time': delvTime,
                    'Audit Log': ''
                };
            });

            await salesSheet.addRows(newRows);
            return NextResponse.json({ success: true, transactionId: realTxnId });
        }

        if (action === 'MIGRATE_CUSTOMERS') {
            const customersSheet = doc.sheetsByTitle['Customers'];
            if (!customersSheet) return NextResponse.json({ error: 'Missing sheets' }, { status: 500 });

            await customersSheet.loadCells('A1:N1000');
            const custRows = await customersSheet.getRows();

            // 1. Rewrite headers
            customersSheet.getCell(0, 7).value = 'Water Type';
            customersSheet.getCell(0, 8).value = 'Water Qty';
            customersSheet.getCell(0, 9).value = 'Ice Type';
            customersSheet.getCell(0, 10).value = 'Ice Qty';
            customersSheet.getCell(0, 11).value = 'Delivery Sched';
            customersSheet.getCell(0, 12).value = 'Delivery Time';

            let updatedCount = 0;

            // 2. Process rows
            for (let i = 0; i < custRows.length; i++) {
                const row = custRows[i];
                const rowIndex = row.rowNumber - 1;

                // Get old values before we overwrite anything
                const oldProductType = row.get('Product Type') || '';
                const oldQuantity = row.get('Quantity') || '';
                const oldSched = row.get('Delivery Sched') || '';
                const oldTime = row.get('Delivery Time') || '';

                // Parse old products and quantities
                let waterType = ''; let waterQty = '';
                let iceType = ''; let iceQty = '';

                if (oldProductType) {
                    const products = oldProductType.toString().split(/,|&|\+|\band\b/i).map((s: string) => s.trim()).filter(Boolean);
                    const rawQtys = oldQuantity ? oldQuantity.toString().split(',').map((s: string) => s.trim()) : [];

                    products.forEach((p: string, idx: number) => {
                        const q = rawQtys[idx] || rawQtys[0] || '1';
                        if (p.toLowerCase().includes('water')) {
                            waterType = p;
                            waterQty = q;
                        } else if (p.toLowerCase().includes('ice')) {
                            iceType = p;
                            iceQty = q;
                        } else {
                            // default fallback
                            if (!waterType) { waterType = p; waterQty = q; }
                            else { iceType = p; iceQty = q; }
                        }
                    });
                }

                // Shift sched/time to L(11) and M(12)
                customersSheet.getCell(rowIndex, 11).value = oldSched || '';
                customersSheet.getCell(rowIndex, 12).value = oldTime || '';

                // Write new product/qty to H(7), I(8), J(9), K(10)
                customersSheet.getCell(rowIndex, 7).value = waterType || '';
                customersSheet.getCell(rowIndex, 8).value = waterQty || '';
                customersSheet.getCell(rowIndex, 9).value = iceType || '';
                customersSheet.getCell(rowIndex, 10).value = iceQty || '';

                updatedCount++;
            }

            await customersSheet.saveUpdatedCells();
            return NextResponse.json({ success: true, message: `Migrated ${updatedCount} customers to new 4-column schema.` });
        }

        if (action === 'GET_POS_CONTROL') {
            const posControlSheet = doc.sheetsByTitle['POS_System_Control'];
            await posControlSheet.loadCells('A1:J20');
            const data: any[][] = [];
            for (let r = 0; r < 20; r++) {
                const row = [];
                for (let c = 0; c < 10; c++) {
                    row.push(posControlSheet.getCell(r, c).value);
                }
                data.push(row);
            }
            return NextResponse.json({ success: true, data });
        }

        if (action === 'SETUP_COMMISSION_CONFIG') {
            const posControlSheet = doc.sheetsByTitle['POS_System_Control'];
            await posControlSheet.loadCells('A1:B35');

            // Helper to write a row with optional bold formatting
            const wr = (row: number, a: string, b: string | number | null, bold = false) => {
                const cA = posControlSheet.getCell(row, 0);
                const cB = posControlSheet.getCell(row, 1);
                cA.value = a;
                if (bold) cA.textFormat = { bold: true };
                if (b !== null) { cB.value = b; }
            };

            // ── Title & instructions ────────────────────────────────────────────
            wr(0, '📋 COMMISSION RULES CONFIGURATION', null, true);
            wr(1, 'Read this before editing:', null, true);
            wr(2, '• Commission is only earned on DELIVERY orders. Walk-in / pick-up = ₱0 always.', null);
            wr(3, '• Each RULE BLOCK below covers one product group (e.g. all ice, all water).', null);
            wr(4, '• The system matches the "SKU Keyword" row against the product name (not case-sensitive).', null);
            wr(5, '• Two commission types: Fixed = flat ₱ per unit | Weight = divide KG by a divisor.', null);
            wr(6, '• To add a new rule: copy a block below, paste it underneath, and update column B values.', null);
            wr(7, '• Changes here take effect immediately on the NEXT sale — no code change needed.', null);
            wr(8, '', null);

            // ── Column headers ──────────────────────────────────────────────────
            wr(9, 'SETTING / DESCRIPTION', 'VALUE ← Edit this column only', true);
            wr(10, '', null);

            // ── Rule 1: Water ───────────────────────────────────────────────────
            wr(11, '▶ RULE 1 — Water Delivery', null, true);
            wr(12, 'SKU Keyword — Word that must appear in the product name to trigger this rule (e.g. "water")', 'water');
            wr(13, 'Commission Type — "Fixed" means a flat ₱ amount per unit sold', 'Fixed');
            wr(14, 'Value — ₱ amount earned per unit when Type = Fixed (e.g. 1 = ₱1 per bag)', 1.00);
            wr(15, 'Max Cap — Maximum ₱ per unit (set to 0 for no cap). Fixed types usually match this to Value.', 1.00);
            wr(16, '', null);

            // ── Rule 2: Ice ─────────────────────────────────────────────────────
            wr(17, '▶ RULE 2 — Ice Delivery', null, true);
            wr(18, 'SKU Keyword — Word that must appear in the product name to trigger this rule (e.g. "ice")', 'ice');
            wr(19, 'Commission Type — "Weight" means commission is calculated from the KG in the product name', 'Weight');
            wr(20, 'Value / Divisor — For Weight type: divide the KG by this number (e.g. 25 → 25KG Ice = 25÷25 = ₱1)', 25);
            wr(21, 'Max Cap — Maximum ₱ per unit (e.g. 1 = never earn more than ₱1 even for very large bags)', 1.00);
            wr(22, '', null);

            // ── Blank slots for future rules ────────────────────────────────────
            wr(23, '▶ RULE 3 — (Add a new product rule here if needed)', null, true);
            wr(24, 'SKU Keyword — Enter the keyword for the new product', '');
            wr(25, 'Commission Type — Enter "Fixed" or "Weight"', '');
            wr(26, 'Value — Enter the ₱ amount (Fixed) or divisor number (Weight)', '');
            wr(27, 'Max Cap — Enter the maximum ₱ per unit (0 = no cap)', '');

            await posControlSheet.saveUpdatedCells();
            return NextResponse.json({ success: true, message: 'Commission config written to POS_System_Control A1:B28' });
        }

        if (action === 'READ_POS_CONTROL') {
            const posControlSheet = doc.sheetsByTitle['POS_System_Control'];
            await posControlSheet.loadCells('A1:C30');
            const rows: { row: number; A: string; B: string; C: string }[] = [];
            for (let r = 0; r < 30; r++) {
                const a = posControlSheet.getCell(r, 0).value?.toString() || '';
                const b = posControlSheet.getCell(r, 1).value?.toString() || '';
                const c = posControlSheet.getCell(r, 2).value?.toString() || '';
                rows.push({ row: r + 1, A: a, B: b, C: c });
            }
            return NextResponse.json({ rows });
        }

        if (action === 'WRITE_ICE_PRICES') {
            const posControlSheet = doc.sheetsByTitle['POS_System_Control'];
            await posControlSheet.loadCells('B5:B11');
            // Confirmed prices from sales history data
            const prices = [10, 25, 40, 75, 110, 130, 180]; // 1KG, 3KG, 5KG, 10KG, 25KG, 30KG, 45KG
            prices.forEach((price, idx) => {
                posControlSheet.getCell(4 + idx, 1).value = price;
            });
            await posControlSheet.saveUpdatedCells();
            return NextResponse.json({ success: true, message: 'Ice prices restored: 1KG=₱10, 3KG=₱25, 5KG=₱40, 10KG=₱75, 25KG=₱110, 30KG=₱130, 45KG=₱180' });
        }

        if (action === 'RESTORE_POS_CONTROL') {
            const posControlSheet = doc.sheetsByTitle['POS_System_Control'];

            // ── Step 1: Clear the accidentally overwritten rows 1-34 in col A & B ──
            await posControlSheet.loadCells('A1:B34');
            for (let r = 0; r < 34; r++) {
                posControlSheet.getCell(r, 0).value = '';
                posControlSheet.getCell(r, 1).value = '';
            }
            await posControlSheet.saveUpdatedCells();

            // ── Step 2: Restore the original POS_System_Control layout ─────────
            await posControlSheet.loadCells('A1:C34');

            // Row 1 (index 0): Section label
            posControlSheet.getCell(0, 0).value = 'POS System Control';
            posControlSheet.getCell(0, 0).textFormat = { bold: true };

            // Rows 2-4: Leave as buffer / could hold admin PIN etc.
            // Row 2 (index 1): Admin PIN label + value (admin code)
            posControlSheet.getCell(1, 0).value = 'Admin PIN';
            posControlSheet.getCell(1, 1).value = '615007'; // PIN used throughout the app

            // Row 3 (index 2): spacer
            posControlSheet.getCell(2, 0).value = '';

            // Row 4 (index 3): Ice products header
            posControlSheet.getCell(3, 0).value = 'ICE PRODUCTS';
            posControlSheet.getCell(3, 0).textFormat = { bold: true };

            // Rows 5-11 (indices 4-10): Product name | Price | Packaging cost
            // Prices in col B are already correct — only A needs restoring
            const iceProducts = [
                '1KG Ice',
                '3KG Ice',
                '5KG Ice',
                '10KG Ice',
                '25KG Ice',
                '30KG Ice',
                '45KG Ice',
            ];
            iceProducts.forEach((name, idx) => {
                posControlSheet.getCell(4 + idx, 0).value = name;
                // Prices were in col B and survived — they are still there. We do NOT overwrite B here.
            });

            // Row 12 (index 11): spacer
            posControlSheet.getCell(11, 0).value = '';

            // Row 13 (index 12): Machine config header
            posControlSheet.getCell(12, 0).value = 'Machine Power (kW)';

            // Row 14 (index 13): Electricity rate
            posControlSheet.getCell(13, 0).value = 'Electricity Rate (₱/kWh)';

            await posControlSheet.saveUpdatedCells();

            // ── Step 3: Write commission config to safe zone (rows 35+, index 34+) ──
            await posControlSheet.loadCells('A35:B65');

            const wr2 = (row: number, a: string, b: string | number | null, bold = false) => {
                const cA = posControlSheet.getCell(row, 0);
                const cB = posControlSheet.getCell(row, 1);
                cA.value = a;
                if (bold) cA.textFormat = { bold: true };
                if (b !== null) cB.value = b;
            };

            wr2(34, '📋 COMMISSION RULES CONFIGURATION', null, true);
            wr2(35, 'Read this before editing:', null, true);
            wr2(36, '• Commission is only earned on DELIVERY orders. Walk-in / pick-up = ₱0 always.', null);
            wr2(37, '• Each RULE BLOCK below covers one product group (e.g. all ice, all water).', null);
            wr2(38, '• The system matches the "SKU Keyword" row against the product name (not case-sensitive).', null);
            wr2(39, '• Two types: Fixed = flat ₱ per unit | Weight = divide KG by a divisor.', null);
            wr2(40, '• To add a new rule: copy a block below and update column B values.', null);
            wr2(41, '• Changes take effect immediately on the NEXT sale — no code change needed.', null);
            wr2(42, '', null);
            wr2(43, 'SETTING / DESCRIPTION', 'VALUE ← Edit this column only', true);
            wr2(44, '', null);
            wr2(45, '▶ RULE 1 — Water Delivery', null, true);
            wr2(46, 'SKU Keyword — Word that must appear in the product name to trigger this rule (e.g. "water")', 'water');
            wr2(47, 'Commission Type — "Fixed" means a flat ₱ amount per unit sold', 'Fixed');
            wr2(48, 'Value — ₱ amount earned per unit when Type = Fixed (e.g. 1 = ₱1 per bag)', 1.00);
            wr2(49, 'Max Cap — Maximum ₱ per unit (set to 0 for no cap)', 1.00);
            wr2(50, '', null);
            wr2(51, '▶ RULE 2 — Ice Delivery', null, true);
            wr2(52, 'SKU Keyword — Word that must appear in the product name to trigger this rule (e.g. "ice")', 'ice');
            wr2(53, 'Commission Type — "Weight" means commission is calculated from the KG in the product name', 'Weight');
            wr2(54, 'Value / Divisor — For Weight type: divide the KG by this number (e.g. 25 → 25KG Ice = 25÷25 = ₱1)', 25);
            wr2(55, 'Max Cap — Maximum ₱ per unit (e.g. 1 = never earn more than ₱1 even for large bags)', 1.00);
            wr2(56, '', null);
            wr2(57, '▶ RULE 3 — (Add a new product rule here if needed)', null, true);
            wr2(58, 'SKU Keyword — Enter the keyword for the new product', '');
            wr2(59, 'Commission Type — Enter "Fixed" or "Weight"', '');
            wr2(60, 'Value — Enter the ₱ amount (Fixed) or divisor number (Weight)', '');
            wr2(61, 'Max Cap — Enter the maximum ₱ per unit (0 = no cap)', '');

            await posControlSheet.saveUpdatedCells();

            return NextResponse.json({ success: true, message: 'POS_System_Control restored. Commission config moved to rows 35-62. Please verify prices in col B rows 5-11 and set Machine Power/Elec Rate in rows 13-14 col B.' });
        }

        if (action === 'MIGRATE_WATER_SKU') {

            const salesSheet = doc.sheetsByTitle['Sales'];
            await salesSheet.loadHeaderRow();
            const headers = salesSheet.headerValues;
            const itemCol = headers.indexOf('Item_Name');

            await salesSheet.loadCells('A1:R5000');
            const rows = await salesSheet.getRows();

            let updated = 0;
            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const itemName = row.get('Item_Name')?.toString() || '';

                if (itemName.toLowerCase().trim() === 'water') {
                    const rowIndex = row.rowNumber - 1;
                    salesSheet.getCell(rowIndex, itemCol).value = 'Water (Delivery)';
                    updated++;
                }
            }
            if (updated > 0) await salesSheet.saveUpdatedCells();

            // Replace "Water" row in POS_System_Control if it exists
            const posControlSheet = doc.sheetsByTitle['POS_System_Control'];
            await posControlSheet.loadCells('A1:C50');
            for (let i = 4; i < 20; i++) {
                const nameCell = posControlSheet.getCell(i, 0);
                if (nameCell.value?.toString().toLowerCase().trim() === 'water') {
                    nameCell.value = 'Water (Delivery)';
                }
            }
            await posControlSheet.saveUpdatedCells();

            return NextResponse.json({ success: true, updatedSales: updated });
        }

        if (action === 'MIGRATE_CLEAN_SKUS') {
            const salesSheet = doc.sheetsByTitle['Sales'];
            await salesSheet.loadHeaderRow();
            const headers = salesSheet.headerValues;
            const itemCol = headers.indexOf('Item_Name');
            if (itemCol === -1) return NextResponse.json({ error: 'Item_Name column not found' }, { status: 500 });

            await salesSheet.loadCells('A1:R10000');
            const rows = await salesSheet.getRows();

            let updatedCount = 0;
            const log: string[] = [];

            for (const row of rows) {
                const originalName = row.get('Item_Name')?.toString() || '';
                // Regex to find " x2", " x3", " x2 x3", etc. at the end of the string
                const cleanedName = originalName.replace(/\s+x\d+(\s+x\d+)*$/i, '').trim();

                if (originalName !== cleanedName) {
                    const rowIndex = row.rowNumber - 1;
                    salesSheet.getCell(rowIndex, itemCol).value = cleanedName;
                    updatedCount++;
                    log.push(`Row ${row.rowNumber}: "${originalName}" -> "${cleanedName}"`);
                }
            }

            if (updatedCount > 0) {
                await salesSheet.saveUpdatedCells();
            }

            return NextResponse.json({ success: true, updatedCount, log });
        }

        if (action === 'MIGRATE_COMMISSION') {
            const rules = await fetchCommissionRules(doc);
            const salesSheet = doc.sheetsByTitle['Sales'];
            await salesSheet.loadHeaderRow();
            const headers = salesSheet.headerValues;

            await salesSheet.loadCells('A1:R5000');
            const rows = await salesSheet.getRows();

            let updated = 0;
            const log: any[] = [];

            for (let i = 0; i < rows.length; i++) {
                const row = rows[i];
                const orderType = row.get('Order_Type') || '';
                const itemName = row.get('Item_Name') || '';
                const qtyStr = String(row.get('Quantity') || '0');
                const qty = parseFloat(qtyStr.replace(/,/g, ''));

                const actualQty = isNaN(qty) ? 0 : qty;
                const commission = calculateCommission(itemName, actualQty, orderType, rules);

                const colIndex = headers.indexOf('Commission_Earned');
                if (colIndex !== -1) {
                    const rowIndex = row.rowNumber - 1;
                    const current = row.get('Commission_Earned');
                    if (String(current) !== String(commission) && String(current) !== String(commission.toFixed(2))) {
                        salesSheet.getCell(rowIndex, colIndex).value = commission;
                        updated++;
                        log.push({ txn: row.get('Transaction_ID'), item: itemName, qty: actualQty, orderType, old: current, new: commission });
                    }
                }
            }

            if (updated > 0) await salesSheet.saveUpdatedCells();
            return NextResponse.json({ success: true, updated, headers, log });
        }

        if (action === 'UPDATE_DELIVERY') {
            const { transactionId, deliveryStatus, driver, helper, paymentStatus } = body;
            const salesSheet = doc.sheetsByTitle['Sales'];

            // Load commission rules once — needed when marking delivery as Completed
            const isCompleting = deliveryStatus === 'Delivery Completed';
            const rules = isCompleting ? await fetchCommissionRules(doc) : [];

            const rows = await salesSheet.getRows();
            const txnIds = String(transactionId).split(',').map((id: string) => id.trim()).filter(Boolean);
            let updatedCount = 0;

            for (const id of txnIds) {
                // Use filter instead of find to catch ALL rows for a multi-item order (which share the same TXN ID)
                const matchingRows = rows.filter(r => String(r.get('Transaction_ID')) === String(id));
                for (const row of matchingRows) {
                    if (paymentStatus !== undefined) row.set('Payment_Method', paymentStatus);
                    if (driver !== undefined) row.set('Driver_Name', driver);
                    if (helper !== undefined) row.set('Helper_Name', helper);
                    if (deliveryStatus !== undefined) row.set('Delivery Status', deliveryStatus);

                    // Always recalculate and write Commission_Earned when completing a delivery.
                    // This ensures commission is set correctly even if it was 0 at checkout time.
                    if (isCompleting) {
                        const itemName = row.get('Item_Name') || '';
                        const qty = parseFloat(row.get('Quantity') || '0') || 0;
                        const orderType = row.get('Order_Type') || '';
                        const newComm = calculateCommission(itemName, qty, orderType, rules);
                        row.set('Commission_Earned', newComm);
                    }

                    const phTime = getPHTime();
                    const changeLog = `Delivery updated by ${body.loggedInUser || 'Unknown'} at ${phTime}`;
                    const currentLog = row.get('Audit Log') || '';
                    row.set('Audit Log', currentLog ? `${currentLog} | ${changeLog}` : changeLog);

                    await row.save();
                    updatedCount++;
                }
            }

            if (updatedCount === 0) return NextResponse.json({ error: 'No matching transactions found' }, { status: 404 });
            return NextResponse.json({ success: true, updatedCount });
        }

        if (action === 'UPDATE_DELIVERY_ROW') {
            const { transactionId, updates, currentDate, currentTime } = body;
            const salesSheet = doc.sheetsByTitle['Sales'];

            const rows = await salesSheet.getRows();
            const txnIds = String(transactionId).split(',').map((id: string) => id.trim()).filter(Boolean);
            const rules = await fetchCommissionRules(doc);
            let updatedCount = 0;

            const fieldColMap: Record<string, string> = {
                customerName: 'Customer_Name',
                itemName: 'Item_Name',
                quantity: 'Quantity',
                totalPrice: 'Total_Price',
                deliveryStatus: 'Delivery Status',
                paymentStatus: 'Payment_Method',
                driver: 'Driver_Name',
                helper: 'Helper_Name',
                // FIX: Include delivery date/time and order type so
                // editing a pickup into a delivery updates columns N, O, and Order_Type
                orderType: 'Order_Type',
                unplannedDate: 'Unplanned_Delivery_Date',
                unplannedTime: 'Unplanned_Delivery_Time',
                preferredTime: 'Unplanned_Delivery_Time'
            };

            for (const id of txnIds) {
                const matchingRows = rows.filter(r => {
                    const matchesTxn = String(r.get('Transaction_ID')) === String(id);
                    if (!matchesTxn) return false;

                    // If we have date/time filters, apply them to distinguish between cards in the SAME transaction
                    if (currentDate) {
                        const rowDate = r.get('Unplanned_Delivery_Date') || '';
                        if (String(rowDate) !== String(currentDate)) return false;
                    }
                    if (currentTime) {
                        const rowTime = r.get('Unplanned_Delivery_Time') || '';
                        // Basic comparison; could normalise but usually they match exactly from formatSheetTime
                        if (String(rowTime) !== String(currentTime)) return false;
                    }
                    return true;
                });

                for (const row of matchingRows) {
                    for (const [key, val] of Object.entries(updates)) {
                        const headerName = fieldColMap[key];
                        if (headerName) {
                            row.set(headerName, val);
                        }
                    }

                    // Recalculate Commission using the updated Order_Type (in case pickup→delivery change)
                    const newItemName = (updates as any).itemName || row.get('Item_Name');
                    const newQty = parseFloat(String((updates as any).quantity || row.get('Quantity') || '0'));
                    const effectiveOrderType = (updates as any).orderType || row.get('Order_Type') || '';
                    const newComm = calculateCommission(newItemName, newQty, effectiveOrderType, rules);

                    row.set('Commission_Earned', newComm);
                    
                    const phTime = getPHTime();
                    const changeLog = `Delivery updated by ${body.loggedInUser || 'Unknown'} at ${phTime}`;
                    const currentLog = row.get('Audit Log') || '';
                    row.set('Audit Log', currentLog ? `${currentLog} | ${changeLog}` : changeLog);

                    await row.save();
                    updatedCount++;
                }
            }

            if (updatedCount === 0) return NextResponse.json({ error: 'No matching transactions found' }, { status: 404 });
            return NextResponse.json({ success: true, updatedCount });
        }


        if (action === 'EDIT_CUSTOMER') {
            // Updates customer profile fields for a given CID in the Customers sheet.
            // Columns (0-indexed): A=CID, B=Name, C=ContactPerson, D=Mobile, E=FB, F=Address
            //                      G=Distance, H=WaterType, I=WaterQty, J=IceType, K=IceQty
            //                      L=DeliverySched, M=DeliveryTime
            const { cid: editCid, updates: custUpdates } = body;
            if (!editCid) return NextResponse.json({ error: 'cid is required' }, { status: 400 });

            const custSheet = doc.sheetsByTitle['Customers'];
            if (!custSheet) return NextResponse.json({ error: 'Customers sheet not found' }, { status: 500 });
            await custSheet.loadCells(`A1:M${LIMIT_CUSTOMERS}`);

            let targetRowIdx = -1;
            for (let i = 1; i < LIMIT_CUSTOMERS; i++) {
                const cell = custSheet.getCell(i, 0);
                if (!cell.value) continue;
                if (String(cell.value).trim() === String(editCid).trim()) {
                    targetRowIdx = i;
                    break;
                }
            }
            if (targetRowIdx === -1) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

            const colMap: Record<string, number> = {
                name: 1, contactPerson: 2, mobile: 3, fbName: 4, address: 5,
                distance: 6, waterType: 7, waterQty: 8, iceType: 9, iceQty: 10,
                deliverySched: 11, deliveryTime: 12
            };
            for (const [field, col] of Object.entries(colMap)) {
                if (custUpdates[field] !== undefined) {
                    custSheet.getCell(targetRowIdx, col).value = custUpdates[field];
                }
            }
            await custSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }

        if (action === 'DELETE_CUSTOMER') {
            // Clears all cells in the customer's row (makes it logically empty).
            const { cid: delCid } = body;
            if (!delCid) return NextResponse.json({ error: 'cid is required' }, { status: 400 });

            const custSheet = doc.sheetsByTitle['Customers'];
            if (!custSheet) return NextResponse.json({ error: 'Customers sheet not found' }, { status: 500 });
            await custSheet.loadCells(`A1:M${LIMIT_CUSTOMERS}`);

            let targetRowIdx = -1;
            for (let i = 1; i < LIMIT_CUSTOMERS; i++) {
                const cell = custSheet.getCell(i, 0);
                if (!cell.value) continue;
                if (String(cell.value).trim() === String(delCid).trim()) {
                    targetRowIdx = i;
                    break;
                }
            }
            if (targetRowIdx === -1) return NextResponse.json({ error: 'Customer not found' }, { status: 404 });

            for (let c = 0; c < 13; c++) {
                custSheet.getCell(targetRowIdx, c).value = '';
            }
            await custSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }

        if (!action || action === 'CHECKOUT' || action === 'REGISTER_CUSTOMER') {
            if (!salesSheet || !customersSheet) {
                return NextResponse.json({ error: 'Sales or Customers sheet not found' }, { status: 500 });
            }

            let assignedCid = cid || '';
            let goto_sales = false;

            if (customerType === 'new' || action === 'REGISTER_CUSTOMER') {
                // Cap to actual sheet size — sheet may have fewer rows than LIMIT_CUSTOMERS
                const custRowCount = Math.min(LIMIT_CUSTOMERS, customersSheet.rowCount);
                // Load all 13 columns (A:M) so we can both scan for duplicates AND write new rows
                await customersSheet.loadCells(`A1:M${custRowCount}`);
                let maxCid = 0;
                let firstEmptyRow = 0;
                const incomingName = (customerName || newCustomerDetails?.name || '').trim().toLowerCase();

                for (let i = 1; i < custRowCount; i++) {
                    const cidCell = customersSheet.getCell(i, 0);
                    if (!cidCell.value) {
                        if (firstEmptyRow === 0) firstEmptyRow = i;
                        continue;
                    }
                    const existingName = String(customersSheet.getCell(i, 1).value || '').trim().toLowerCase();
                    if (incomingName && existingName === incomingName) {
                        assignedCid = String(cidCell.value);
                        if (action === 'REGISTER_CUSTOMER') {
                            return NextResponse.json({ success: true, cid: assignedCid, message: 'Customer already registered', duplicate: true });
                        }
                        goto_sales = true;
                        break;
                    }
                    const num = parseInt(String(cidCell.value), 10);
                    if (!isNaN(num) && num > maxCid) maxCid = num;
                }
                
                if (firstEmptyRow === 0) {
                    // Sheet is full — add 100 more rows so we can append
                    await customersSheet.resize({ rowCount: custRowCount + 100, columnCount: customersSheet.columnCount });
                    await customersSheet.loadCells(`A${custRowCount + 1}:M${custRowCount + 100}`);
                    firstEmptyRow = custRowCount; // first new empty row (0-indexed = old rowCount)
                }

                if (!goto_sales) {
                    assignedCid = (maxCid + 1).toString();
                    // Cells already loaded — no separate loadCells needed
                    const newRowCells = [
                        assignedCid,
                        customerName || newCustomerDetails?.name || '',
                        newCustomerDetails?.contactPerson || '',
                        newCustomerDetails?.mobile || '',
                        newCustomerDetails?.fbName || '',
                        newCustomerDetails?.address || '',
                        newCustomerDetails?.distance || '',
                        newCustomerDetails?.waterType || '',
                        newCustomerDetails?.waterQty || '',
                        newCustomerDetails?.iceType || '',
                        newCustomerDetails?.iceQty || '',
                        newCustomerDetails?.deliverySched || '',
                        newCustomerDetails?.deliveryTime || ''
                    ];
                    for (let c = 0; c < 13; c++) {
                        customersSheet.getCell(firstEmptyRow, c).value = newRowCells[c];
                    }
                    await customersSheet.saveUpdatedCells();
                    if (action === 'REGISTER_CUSTOMER') {
                        return NextResponse.json({ success: true, cid: assignedCid, message: 'Customer registered successfully' });
                    }
                }
            }

            const txnDateStr = new Date().toISOString().split('T')[0].replace(/-/g, '');
            const randomString = Math.random().toString(36).substring(2, 6).toUpperCase();
            const transactionId = `TXN-${txnDateStr}-${randomString}`;
            const timestamp = getPHTime();

            let finalOrderType = customerType === 'new' ? 'New Regular' : (customerType === 'regular' ? 'Regular' : 'Walk-in');
            // Delivery is signaled by a deliveryDate being provided (time is optional)
            // When Pickup is selected the frontend sends deliveryTime='Pickup' and no deliveryDate
            const isDelivery = !!deliveryDate || (deliveryTime && deliveryTime !== 'Pickup');
            if (isDelivery) finalOrderType += ` (Delivery)`;
            else finalOrderType += ` (Pickup)`;

            // SECURE PRICING: Load prices from POS_System_Control instead of trusting frontend
            await posControlSheet.loadCells('A1:B30');
            const securePriceMap: Record<string, number> = {};
            for (let r = 3; r < 20; r++) { // Product rows
                const name = posControlSheet.getCell(r, 0).value?.toString().toLowerCase().trim();
                const price = parseFloat(posControlSheet.getCell(r, 1).value?.toString() || '0');
                if (name) securePriceMap[name] = isNaN(price) ? 0 : price;
            }

            const rules = await fetchCommissionRules(doc);
            const rowsToAdd = order.map((item: any) => {
                const itemName = item.name.toString().trim();
                const securePrice = securePriceMap[itemName.toLowerCase()] ?? item.price; // Fallback to frontend if not found
                const commission = calculateCommission(itemName, item.quantity, finalOrderType, rules);
                return {
                    'Timestamp': timestamp,
                    'Transaction_ID': transactionId,
                    'CID': String(assignedCid),
                    'Customer_Name': customerName || newCustomerDetails?.name || 'Walk-in',
                    'Item_Name': itemName,
                    'Quantity': item.quantity,
                    'Unit_Price': securePrice,
                    'Total_Price': securePrice * item.quantity,
                    'Order_Type': finalOrderType,
                    'Payment_Method': paymentType || 'Paid',
                    'Staff_Name': loggedInUser || 'System Admin',
                    'Driver_Name': '',
                    'Helper_Name': '',
                    'Commission_Earned': commission,
                    'Delivery Status': (finalOrderType.includes('Delivery')) ? 'Delivery Pending' : '',
                    'Unplanned_Delivery_Date': deliveryDate || '',
                    'Unplanned_Delivery_Time': deliveryTime || '',
                    'Audit Log': '',
                    'Audit_Log_Timestamp': ''
                };
            });

            await salesSheet.addRows(rowsToAdd);
            return NextResponse.json({ success: true, count: rowsToAdd.length, transactionId });
        }
    } catch (error: any) {
        console.error('Error processing checkout:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
