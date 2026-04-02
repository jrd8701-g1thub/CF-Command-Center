import fetch from 'node-fetch';

async function check() {
  try {
    const res = await fetch('http://localhost:3000/api/sheet?tab=payroll');
    const text = await res.text();
    console.log("PAYROLL RESPONSE:");
    console.log(text.substring(0, 1000));
  } catch(e) {
    console.error(e);
  }
}
check();
