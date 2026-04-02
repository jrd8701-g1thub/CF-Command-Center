const res = await fetch('http://localhost:3000/api/sheet?tab=delivery&date=2026-03-15');
const data = await res.json();
const adamRows = (data.deliveries || []).filter(d => d.customerName.toLowerCase().includes('adam'));
console.log(JSON.stringify(adamRows, null, 2));
