const req1 = {
  order: [{ name: 'WaterRefill', quantity: 2, price: 25 }],
  customerName: 'Adam Smith',
  paymentType: 'Paid',
  customerType: 'regular',
  loggedInUser: 'System Admin',
  cid: '3',
  deliveryDate: '2026-03-15',
  deliveryTime: '11:00 AM'
};

const req2 = {
  order: [{ name: 'WaterRefill', quantity: 3, price: 25 }],
  customerName: 'Adam Smith',
  paymentType: 'Paid',
  customerType: 'regular',
  loggedInUser: 'System Admin',
  cid: '3',
  deliveryDate: '2026-03-15',
  deliveryTime: '6:00 PM'
};

fetch('http://localhost:3000/api/sheet', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(req1)
}).then(r => r.json()).then(d1 => {
  console.log('Order 1:', d1);
  return fetch('http://localhost:3000/api/sheet', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req2)
  });
}).then(r => r.json()).then(d2 => {
  console.log('Order 2:', d2);
  return fetch('http://localhost:3000/api/sheet?tab=delivery&date=2026-03-15');
}).then(r => r.json()).then(deliveryData => {
  const adam = deliveryData.deliveries.filter(d => d.customerName.includes('Adam'));
  console.log('Deliveries for Adam:');
  adam.forEach(a => console.log(`Txn: ${a.transactionId}, Time: ${a.preferredTime}, Items: ${a.itemName}`));
});
