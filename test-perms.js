console.log("Node is working in root");
const fs = require('fs');
try {
    const files = fs.readdirSync('.');
    console.log("Root files:", files.slice(0, 5));
} catch (e) {
    console.error("Error reading root:", e.message);
}
try {
    const nm = fs.readdirSync('node_modules');
    console.log("node_modules files:", nm.slice(0, 5));
} catch (e) {
    console.error("Error reading node_modules:", e.message);
}
