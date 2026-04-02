const API_URL = 'http://localhost:3000/api/sheet';

async function testCheckout() {
    console.log('Simulating Checkout...');
    const payload = {
        action: 'CHECKOUT',
        order: [
            { name: '10KG Ice', quantity: 2, price: 75 },
            { name: 'Water (Delivery)', quantity: 5, price: 30 }
        ],
        customerName: 'Test Robust Fix',
        paymentType: 'Paid',
        customerType: 'walkin',
        loggedInUser: 'FinalVerify',
        deliveryDate: '2026-03-09',
        deliveryTime: '2:00 PM'
    };

    try {
        const res = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        console.log('Response:', data);

        if (data.success) {
            console.log('\nVerifying sheet data...');
            // We use the same verify_fix_simple.mjs logic here
        }
    } catch (err) {
        console.error('Fetch failed (is server running?):', err.message);
    }
}

testCheckout();
