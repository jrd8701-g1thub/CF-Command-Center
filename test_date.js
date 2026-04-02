
const dateStr = "2026-02-27";
const targetDate = new Date(dateStr);
console.log("Date Str:", dateStr);
console.log("toLocaleDateString():", targetDate.toLocaleDateString());
console.log("toLocaleDateString(en-US):", targetDate.toLocaleDateString('en-US'));
console.log("Day of Week:", targetDate.toLocaleDateString('en-US', { weekday: 'long' }));
