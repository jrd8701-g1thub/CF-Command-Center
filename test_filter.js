const d = {"transactionId":"TXN-20260325-6MJY","customerName":"Chuck","timestamp":"2026-03-25 18:14:13","unplannedDate":""};
const searchQuery = '';
const selectedDate = '2026-03-25';
const selectedMonths = [];
const selectedWeeks = [];
const dateStr = d.unplannedDate || d.timestamp.split(',')[0];
console.log("dateStr:", dateStr);

let dt = new Date(dateStr);
console.log("dt:", dt, "isNaN:", isNaN(dt.getTime()));

if (isNaN(dt.getTime())) {
    const p = dateStr.split('/');
    if (p.length === 3) dt = new Date(`${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}T12:00:00Z`);
}

const iso = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
console.log("iso:", iso);

const dateMatch = !selectedDate || iso === selectedDate;
console.log("dateMatch:", dateMatch);

