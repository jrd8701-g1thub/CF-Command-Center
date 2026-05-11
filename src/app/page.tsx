'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import POSGrid from '@/components/POSGrid';
import { POSItem, Customer } from '@/app/api/sheet/route';

interface TodaySale { timestamp: string; transactionId: string; customerName: string; itemName: string; quantity: string; totalPrice: string; orderType: string; paymentMethod: string; unplannedDate?: string; unplannedTime?: string; }

function POSHome() {
  const [items, setItems] = useState<POSItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [todaySales, setTodaySales] = useState<TodaySale[]>([]);
  const [employeeNames, setEmployeeNames] = useState<string[]>([]);

  // Cart state
  const [cart, setCart] = useState<(POSItem & { quantity: number; cartItemId: string })[]>([]);
  const [customerType, setCustomerType] = useState<'walkin' | 'regular' | 'new'>('regular');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // New Customer State
  const [newCustomerDetails, setNewCustomerDetails] = useState({
    name: '', contactPerson: '', mobile: '', fbName: '', address: '',
    distance: '', deliverySched: '', deliveryTime: ''
  });
  const [selectedProducts, setSelectedProducts] = useState<Record<string, number>>({});

  // Build product list dynamically from POS_System_Control sheet data
  // productTypes = ['ICE PRODUCTS', '1KG Ice', '3KG Ice', '5KG Ice', ...]
  // We map '1KG Ice' → 'Ice - 1KG' to match the display format in the customer modal
  const newCustomerProducts = [
    'Water (Delivery)',
    ...productTypes
      .filter(p => p !== 'ICE PRODUCTS' && p)
      .map(p => {
        // Sheet name format: "1KG Ice", "3KG Ice", etc.
        // Display format: "Ice - 1KG"
        const sizeMatch = p.match(/^(\d+KG)/i);
        return sizeMatch ? `Ice - ${sizeMatch[1].toUpperCase()}` : `Ice - ${p}`;
      })
  ];

  // Global POS State
  const [paymentType, setPaymentType] = useState('Paid');
  const [loggedInUser, setLoggedInUser] = useState('Admin');
  const [staffList, setStaffList] = useState<any[]>([]);
  const [adminPin, setAdminPin] = useState('');
  const [editPin, setEditPin] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const user = localStorage.getItem('loggedInUser');
      if (user) setLoggedInUser(user);
    }
  }, []);

  // Checkout Delivery State
  const [checkoutDeliveryStatus, setCheckoutDeliveryStatus] = useState<'Pickup' | 'Delivery'>('Delivery');
  const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local timezone, not UTC
  const [checkoutDeliveryDate, setCheckoutDeliveryDate] = useState(today);
  const [checkoutDeliveryTime, setCheckoutDeliveryTime] = useState('');

  const deliveryTimes = ['Anytime', '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'];
  const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  const fetchTodaySales = async () => {
    try {
      // Speed up by only fetching the last 200 sales records
      const res = await fetch('/api/sheet?tab=sales&limit=300', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();

      // Get current date in PH time (YYYY-MM-DD)
      const now = new Date();
      const phDate = new Date(now.getTime() + 8 * 60 * 60 * 1000);
      const todayString = phDate.getUTCFullYear() + '-' + String(phDate.getUTCMonth() + 1).padStart(2, '0') + '-' + String(phDate.getUTCDate()).padStart(2, '0');

      const filtered = (data.sales || []).filter((s: TodaySale) => {
        const ts = s.timestamp || '';
        if (!ts) return false;

        // Our API returns YYYY-MM-DD HH:mm:ss in PH time
        // Just extract the first 10 chars (YYYY-MM-DD)
        const datePart = ts.split(' ')[0];
        if (datePart === todayString) return true;

        // Fallback: try parsing if format is different
        try {
          const d = new Date(ts);
          if (!isNaN(d.getTime())) {
            // Adjust to PH if it's ISO/UTC
            const dPH = new Date(d.getTime() + (ts.includes('Z') || ts.includes('+') ? 8 * 60 * 60 * 1000 : 0));
            const ds = dPH.getUTCFullYear() + '-' + String(dPH.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dPH.getUTCDate()).padStart(2, '0');
            return ds === todayString;
          }
        } catch { }

        // Last resort fallback
        return ts.includes(todayString);
      });
      setTodaySales(filtered);
    } catch { /* silent */ }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        const [posRes, staffRes] = await Promise.all([
          fetch('/api/sheet'),
          fetch('/api/sheet?tab=staff', { cache: 'no-store' }),
        ]);
        if (!posRes.ok) throw new Error('Failed to fetch data');
        const data = await posRes.json();
        if (data.error) throw new Error(data.error);
        setItems(data.items || []);
        setCustomers(data.customers || []);
        setProductTypes(data.productTypes || []);
        setAdminPin(data.adminPin || '');
        if (staffRes.ok) {
          const staffData = await staffRes.json();
          setStaffList(staffData.employees || []);
          setEmployeeNames((staffData.employees || []).map((e: { name: string }) => e.name));
        }
      } catch (err: unknown) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
    fetchTodaySales();
  }, []);

  const addToCart = (item: POSItem) => {
    setCart(prev => {
      const existing = prev.find(i => i.id === item.id);
      if (existing) {
        return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      }
      return [...prev, { ...item, quantity: 1, cartItemId: `cart-${Date.now()}-${item.id}` }];
    });
  };

  const updateCartItemQuantity = (cartItemId: string, quantity: number) => {
    setCart(prev => {
      if (quantity <= 0) return prev.filter(i => i.cartItemId !== cartItemId);
      return prev.map(i => i.cartItemId === cartItemId ? { ...i, quantity } : i);
    });
  };

  const handleCustomerTypeChange = (type: 'walkin' | 'regular' | 'new') => {
    setCustomerType(type);
    if (type !== 'regular') {
      setSelectedCustomer(null);
    }
    if (type === 'walkin') {
      setCheckoutDeliveryStatus('Delivery');
      setPaymentType('Paid');
    }
  };

  const handleApplyCustomerOrder = (customer: Customer) => {
    setSelectedCustomer(customer);
    const newCart: (POSItem & { quantity: number; cartItemId: string })[] = [];
    const norm = (s: string) => s.toLowerCase().replace(/[\s\-_]+/g, '');

    customer.standardOrderItems.forEach((soi, soiIdx) => {
      const partLower = soi.name.toLowerCase().trim();
      const qty = soi.quantity || 1;
      // sizeHint e.g. '4KG' comes from the API when the quantity cell contained '4KG'
      const sizeHint = soi.sizeHint || '';

      let inventoryItem: POSItem | undefined;

      // Strategy 1: Ice with a KG size hint → search for 'Ice - {size}'
      if (partLower.includes('ice') && sizeHint) {
        inventoryItem =
          items.find(i => norm(i.name) === norm(`Ice-${sizeHint}`)) ||
          items.find(i => i.name.toLowerCase().includes('ice') && i.name.toLowerCase().includes(sizeHint.toLowerCase()));
      }

      // Strategy 2: 'Water' part → find any water item
      if (!inventoryItem && partLower.includes('water')) {
        inventoryItem = items.find(i => i.name.toLowerCase().includes('water'));
      }

      // Strategy 3: Ice without a size hint, or name is already a size like '3KG'
      if (!inventoryItem && partLower.includes('ice')) {
        inventoryItem = items.find(i => i.name.toLowerCase().includes('ice'));
      }

      // Strategy 4: General fuzzy match — name might BE the size (e.g. '3KG' → 'Ice - 3KG')
      if (!inventoryItem) {
        const soiN = norm(soi.name);
        inventoryItem =
          items.find(i => norm(i.name) === soiN) ||
          items.find(i => norm(i.name).includes(soiN)) ||
          items.find(i => soiN.includes(norm(i.name)) && norm(i.name).length > 2);
      }

      if (inventoryItem) {
        // For 'Ice' split from 'Ice & Water', the count is 1 (size from sizeHint); for size-as-name, qty is count
        newCart.push({ ...inventoryItem, quantity: qty, cartItemId: `cart-${Date.now()}-${soiIdx}-${inventoryItem.id}` });
      }
    });

    setCart(newCart);
  };

  const handleRegisterCustomer = async () => {
    // Only Company / Customer Name is required
    if (!newCustomerDetails.name) {
      alert('Please fill in the Company / Customer Name before registering.');
      return;
    }

    let waterType = ''; let waterQty = '';
    let iceType = ''; let iceQty = '';

    Object.entries(selectedProducts).forEach(([p, q]) => {
      if (p.toLowerCase().includes('water')) {
        waterType = waterType ? `${waterType}, ${p}` : p;
        waterQty = waterQty ? `${waterQty}, ${q}` : String(q);
      } else if (p.toLowerCase().includes('ice')) {
        iceType = iceType ? `${iceType}, ${p}` : p;
        iceQty = iceQty ? `${iceQty}, ${q}` : String(q);
      }
    });

    try {
      const res = await fetch('/api/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'REGISTER_CUSTOMER',
          customerType: 'new',
          newCustomerDetails: {
            ...newCustomerDetails,
            waterType,
            waterQty,
            iceType,
            iceQty
          }
        })
      });

      if (!res.ok) {
        let errMsg = 'Registration failed';
        try { const e = await res.json(); errMsg = e.error || errMsg; } catch {}
        throw new Error(errMsg);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      alert(`Customer registered successfully! CID: ${data.cid}`);
      setNewCustomerDetails({ name: '', contactPerson: '', mobile: '', fbName: '', address: '', distance: '', deliverySched: '', deliveryTime: '' });
      setSelectedProducts({});
      setCustomerType('regular');

      // Reset for regular
      setCheckoutDeliveryStatus('Delivery');
      setPaymentType('Paid');

      // Optionally re-fetch data so they show up in the dropdown
      const getRes = await fetch('/api/sheet');
      const getData = await getRes.json();
      if (!getData.error) setCustomers(getData.customers || []);
    } catch (err: any) {
      alert(`Error during registration: ${err.message}`);
    }
  };

  // State for editing a today's sale row
  interface EditSaleState extends TodaySale { index: number; }
  const [editingSale, setEditingSale] = useState<EditSaleState | null>(null);
  const [editFields, setEditFields] = useState<{ orderType: string; customerName: string; itemName: string; quantity: string; unitPrice: string; paymentMethod: string; deliveryDate: string; deliveryTime: string; }>({ orderType: '', customerName: '', itemName: '', quantity: '', unitPrice: '', paymentMethod: '', deliveryDate: '', deliveryTime: '' });
  const [editSaving, setEditSaving] = useState(false);

  // State for editing/deleting a customer profile
  const [editCustomerModal, setEditCustomerModal] = useState(false);
  const [editCustomerSaving, setEditCustomerSaving] = useState(false);
  const [editCustomerFields, setEditCustomerFields] = useState({
    name: '', contactPerson: '', mobile: '', fbName: '', address: '',
    distance: '', deliverySched: '', deliveryTime: '',
    waterType: '', waterQty: '', iceType: '', iceQty: ''
  });
  const [editCustomerProducts, setEditCustomerProducts] = useState<Record<string, number>>({});

  const openEditCustomerModal = () => {
    if (!selectedCustomer) return;
    const d = selectedCustomer.details || {};
    const g = (keys: string[]) => {
      for (const k of keys) {
        const found = Object.entries(d).find(([dk]) => dk.toLowerCase().replace(/[\s_&/]/g, '') === k.toLowerCase().replace(/[\s_&/]/g, ''));
        if (found && String(found[1]).trim()) return String(found[1]).trim();
      }
      return '';
    };
    const waterType = g(['watertype', 'Water Type']) || '';
    const waterQty = g(['waterqty', 'Water Qty']) || '';
    const iceType = g(['icetype', 'Ice Type']) || '';
    const iceQty = g(['iceqty', 'Ice Qty']) || '';
    setEditCustomerFields({
      name: g(['customer/company', 'customername', 'name']) || selectedCustomer.name,
      contactPerson: g(['contactperson']),
      mobile: g(['mobile']),
      fbName: g(['fbname']),
      address: g(['address']),
      distance: g(['distancefromcf', 'distance']),
      deliverySched: g(['deliverysched']),
      deliveryTime: g(['deliverytime']),
      waterType, waterQty, iceType, iceQty
    });
    // Rebuild product selections from the stored fields
    const prods: Record<string, number> = {};
    if (waterType && waterQty) prods[waterType] = parseFloat(waterQty) || 1;
    if (iceType && iceQty) prods[iceType] = parseFloat(iceQty) || 1;
    setEditCustomerProducts(prods);
    setEditCustomerModal(true);
  };

  const handleEditCustomerSave = async () => {
    if (!selectedCustomer) return;
    setEditCustomerSaving(true);
    // Derive waterType/waterQty and iceType/iceQty from product selections
    let waterType = ''; let waterQty = '';
    let iceType = ''; let iceQty = '';
    Object.entries(editCustomerProducts).forEach(([p, q]) => {
      if (p.toLowerCase().includes('water')) { waterType = p; waterQty = String(q); }
      else if (p.toLowerCase().includes('ice')) { iceType = p; iceQty = String(q); }
    });
    try {
      const res = await fetch('/api/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'EDIT_CUSTOMER',
          cid: selectedCustomer.cid,
          updates: { ...editCustomerFields, waterType, waterQty, iceType, iceQty }
        })
      });
      if (!res.ok) throw new Error('Update failed');
      alert('Customer updated successfully!');
      setEditCustomerModal(false);
      // Refresh customer list
      const getRes = await fetch('/api/sheet');
      const getData = await getRes.json();
      if (!getData.error) setCustomers(getData.customers || []);
    } catch (err: any) {
      alert('Error: ' + err.message);
    } finally { setEditCustomerSaving(false); }
  };

  const handleDeleteCustomer = async () => {
    if (!selectedCustomer) return;
    const confirmed = window.confirm(
      `Are you sure you want to DELETE "${selectedCustomer.name}" (CID: ${selectedCustomer.cid})?\n\nThis will clear their profile from Google Sheets. Past sales records will be unaffected.`
    );
    if (!confirmed) return;
    try {
      const res = await fetch('/api/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'DELETE_CUSTOMER', cid: selectedCustomer.cid })
      });
      if (!res.ok) throw new Error('Delete failed');
      alert('Customer deleted.');
      setSelectedCustomer(null);
      setCustomerType('regular');
      const getRes = await fetch('/api/sheet');
      const getData = await getRes.json();
      if (!getData.error) setCustomers(getData.customers || []);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  };

  const handleSaveEditSale = async () => {
    if (!editingSale) return;

    if (!editPin.trim()) { alert('Please enter a PIN'); return; }
    const user = staffList.find(s => s.pin === editPin);
    if (!user && editPin !== adminPin) { alert('Incorrect PIN'); return; }
    const loggedInUserForEdit = user ? user.name : 'Admin';

    setEditSaving(true);
    try {
      const res = await fetch('/api/sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'UPDATE_SALE_ROW',
          transactionId: editingSale.transactionId,
          itemName: editingSale.itemName, // used to locate specific row among multi-item TXNs
          updates: editFields,
          staffName: loggedInUserForEdit
        })
      });
      if (!res.ok) throw new Error('Failed to update');
      await fetchTodaySales();
      setEditingSale(null);
      setEditPin('');
    } catch (err: unknown) {
      alert('Update failed: ' + (err as Error).message);
    } finally {
      setEditSaving(false);
    }
  };

  const handleCheckout = async () => {
    if (cart.length === 0) return;
    if (customerType === 'regular' && !selectedCustomer) {
      alert('Please select a customer from the dropdown before checking out.');
      return;
    }

    let waterType = ''; let waterQty = '';
    let iceType = ''; let iceQty = '';

    Object.entries(selectedProducts).forEach(([p, q]) => {
      if (p.toLowerCase().includes('water')) {
        waterType = waterType ? `${waterType}, ${p}` : p;
        waterQty = waterQty ? `${waterQty}, ${q}` : String(q);
      } else if (p.toLowerCase().includes('ice')) {
        iceType = iceType ? `${iceType}, ${p}` : p;
        iceQty = iceQty ? `${iceQty}, ${q}` : String(q);
      }
    });

    try {
      const res = await fetch('/api/sheet', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          order: cart,
          customerName: customerType === 'regular' && selectedCustomer ? selectedCustomer.name :
            customerType === 'new' && newCustomerDetails.name ? newCustomerDetails.name : 'Walk-in',
          paymentType: paymentType,
          customerType: customerType,
          loggedInUser: loggedInUser,
          cid: customerType === 'regular' && selectedCustomer ? selectedCustomer.cid : '',
          newCustomerDetails: customerType === 'new' ? {
            ...newCustomerDetails,
            waterType,
            waterQty,
            iceType,
            iceQty
          } : null,
          deliveryDate: checkoutDeliveryStatus === 'Delivery' ? checkoutDeliveryDate : null,
          deliveryTime: checkoutDeliveryStatus === 'Delivery' ? checkoutDeliveryTime : 'Pickup'
        })
      });

      if (!res.ok) throw new Error('Checkout failed');
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      fetchTodaySales(); // Refresh the sales table immediately
      setCart([]);
      alert(`Order successfully completely! TXN ID: ${data.transactionId}`);
      setSelectedCustomer(null);
      setCustomerType('regular');
      setNewCustomerDetails({ name: '', contactPerson: '', mobile: '', fbName: '', address: '', distance: '', deliverySched: '', deliveryTime: '' });
      setSelectedProducts({});
      setSearchQuery('');
      setPaymentType('Paid');
      setCheckoutDeliveryStatus('Delivery');
      setCheckoutDeliveryDate(new Date().toISOString().split('T')[0]); // reset to today
      setCheckoutDeliveryTime('');
    } catch (err: any) {
      alert(`Error during checkout: ${err.message}`);
    }
  };

  const totalPrice = cart.reduce((sum, item) => sum + ((item.price || 0) * item.quantity), 0);
  const hasWaterItem = cart.some(item => item.name.toLowerCase().includes('water'));

  // When fulfillment changes, swap water SKU to match: Refill (pickup) ↔ Delivery SKU
  useEffect(() => {
    if (!hasWaterItem) return;
    setCart(prev => prev.map(cartItem => {
      const nameLow = cartItem.name.toLowerCase();
      if (checkoutDeliveryStatus === 'Delivery' && nameLow.includes('refill')) {
        // Try to find a Water Delivery item in inventory
        const deliveryItem = items.find(i => i.name.toLowerCase().includes('water') && i.name.toLowerCase().includes('delivery'));
        if (deliveryItem) return { ...deliveryItem, quantity: cartItem.quantity, cartItemId: cartItem.cartItemId };
      }
      if (checkoutDeliveryStatus === 'Pickup' && nameLow.includes('water') && nameLow.includes('delivery')) {
        // Swap back to Water Refill
        const refillItem = items.find(i => i.name.toLowerCase().includes('refill'));
        if (refillItem) return { ...refillItem, quantity: cartItem.quantity, cartItemId: cartItem.cartItemId };
      }
      return cartItem;
    }));
  }, [checkoutDeliveryStatus]);

  const searchParams = useSearchParams();

  useEffect(() => {
    if (customers.length > 0 && items.length > 0) {
      const cid = searchParams.get('cid');
      if (cid) {
        const customer = customers.find(c => c.cid === cid);
        if (customer) {
          handleApplyCustomerOrder(customer);
          setCustomerType('regular');
          if (searchParams.get('from') === 'delivery') {
            setCheckoutDeliveryStatus('Delivery');
            const rawTime = searchParams.get('time') || '';
            if (rawTime) {
              // Helper: convert any Google Sheets time representation to "H:MM AM/PM"
              const normaliseTime = (raw: string): string => {
                // Already formatted by API: "6:00 AM"
                if (/^\d+:\d{2}\s*(AM|PM)$/i.test(raw)) return raw.trim();
                // Has seconds: "6:00:00 AM" → "6:00 AM"
                const secMatch = raw.match(/^(\d+:\d{2}):\d{2}(\s*(?:AM|PM))$/i);
                if (secMatch) return `${secMatch[1]}${secMatch[2].trim()}`;
                // Numeric fraction from Sheets: 0.25 = 6:00 AM
                const num = parseFloat(raw);
                if (!isNaN(num) && num >= 0 && num < 1) {
                  const totalMins = Math.round(num * 24 * 60);
                  let h = Math.floor(totalMins / 60) % 24;
                  const m = totalMins % 60;
                  const ampm = h < 12 ? 'AM' : 'PM';
                  if (h === 0) h = 12; else if (h > 12) h -= 12;
                  return `${h}:${String(m).padStart(2, '0')} ${ampm}`;
                }
                return raw.trim();
              };
              const normalised = normaliseTime(rawTime);
              const match = deliveryTimes.find(t => t.toLowerCase() === normalised.toLowerCase());
              if (match) setCheckoutDeliveryTime(match);
            }
          }
        }
      }
    }
  }, [customers, items, searchParams]);

  if (loading) return <div className="p-6 text-center text-xl">Loading POS data...</div>;
  if (error) return <div className="p-6 text-center text-destructive">Error: {error}</div>;

  const todayRevenue = todaySales.reduce((s, t) => s + (parseFloat(t.totalPrice) || 0), 0);
  const todayUnits = todaySales.reduce((s, t) => s + (parseFloat(t.quantity) || 0), 0);
  const todayPaid = todaySales.filter(t => t.paymentMethod === 'Paid').length;
  const todayCredit = todaySales.filter(t => t.paymentMethod !== 'Paid').length;

  return (
    <div className="w-full space-y-6">

      {/* ── Page Header ── */}
      <div className="flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-blue/15 border border-brand-blue/30 flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-blue">
              <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 9h20"/>
            </svg>
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">POS Terminal</h1>
            <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Point of Sale · Order Management</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-500">Logged in as:</span>
          <select
            value={loggedInUser}
            onChange={e => setLoggedInUser(e.target.value)}
            className="px-3 py-2 bg-brand-blue/10 border border-brand-blue/25 rounded-lg text-brand-blue text-sm font-black outline-none cursor-pointer"
            style={{ colorScheme: 'dark' }}
          >
            <option value="Admin">Admin</option>
            {employeeNames.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <button onClick={fetchTodaySales}
            className="px-4 py-2 bg-brand-teal/10 border border-brand-teal/25 rounded-lg text-brand-teal text-xs font-black hover:bg-brand-teal/20 transition-all">
            ↺ Refresh Today
          </button>
        </div>
      </div>

      {/* Top Section: Customer and Item Selection */}
      <div className="flex flex-col gap-6">

        {/* Customer Selection Card */}
        <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl p-5 shadow-lg">
          <h2 className="text-xl font-black text-brand-blue mb-5 flex items-center gap-2">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Customer Details
          </h2>

          {/* Search Bar — hidden/greyed when Regular is the mode (must use dropdown) */}
          <div className="mb-6 relative transition-opacity duration-200" style={{ opacity: customerType === 'regular' ? 0.3 : 1, pointerEvents: customerType === 'regular' ? 'none' : 'auto' }}>
            <input
              type="text"
              placeholder="Search existing customer database... (e.g. John)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-3 bg-charcoal-900 border border-charcoal-700 rounded-lg text-sm font-semibold text-white outline-none focus:border-brand-blue transition-colors"
              style={{ colorScheme: 'dark' }}
            />
            {searchQuery && (
              <div className="absolute top-full left-0 w-full mt-2 bg-charcoal-800 border border-charcoal-700 rounded-lg shadow-xl z-20 max-h-48 overflow-y-auto overflow-hidden divide-y divide-charcoal-700/50">
                {customers.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).length > 0 ?
                  customers.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())).map(c => (
                    <div key={c.id} className="px-4 py-3 hover:bg-charcoal-700/50 cursor-pointer transition-colors" onClick={() => {
                      handleApplyCustomerOrder(c);
                      setCustomerType('regular');
                      setSearchQuery('');
                    }}>
                      <span className="font-bold text-sm text-white block">{c.name}</span>
                      <span className="text-[11px] text-slate-500 font-semibold">{c.details?.['Address'] || 'No address'}</span>
                    </div>
                  )) : (
                    <div className="px-4 py-4 text-center text-sm font-semibold text-slate-500 italic">No customers found matching that name...</div>
                  )}
              </div>
            )}
          </div>

          <div className="flex gap-4 mb-6 flex-wrap items-center">
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="customerType"
                value="walkin"
                checked={customerType === 'walkin'}
                onChange={() => handleCustomerTypeChange('walkin')}
                className="w-4 h-4 accent-brand-blue"
              />
              <span className={`text-sm font-bold transition-colors ${customerType === 'walkin' ? 'text-brand-blue' : 'text-slate-400 group-hover:text-slate-300'}`}>Walk-in</span>
            </label>
            <div className="w-px h-4 bg-charcoal-700"></div>
            <label className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="customerType"
                value="regular"
                checked={customerType === 'regular'}
                onChange={() => handleCustomerTypeChange('regular')}
                className="w-4 h-4 accent-brand-blue"
              />
              <span className={`text-sm font-bold transition-colors ${customerType === 'regular' ? 'text-brand-blue' : 'text-slate-400 group-hover:text-slate-300'}`}>Regular</span>
            </label>
            <div className="flex-1"></div>
            <button
              type="button"
              onClick={() => handleCustomerTypeChange(customerType === 'new' ? 'walkin' : 'new')}
              className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
                customerType === 'new'
                  ? 'bg-brand-blue text-white shadow-[0_0_15px_rgba(58,134,255,0.3)]'
                  : 'bg-brand-blue/10 text-brand-blue border border-brand-blue/30 hover:bg-brand-blue/20'
              }`}
            >
              + Add New Customer
            </button>
          </div>

          {customerType === 'new' && (
            <div className="flex flex-col gap-5 p-5 bg-charcoal-900 border border-brand-blue/20 rounded-xl mt-2 animate-in fade-in zoom-in-95 duration-200">
              <h3 className="text-xs font-black text-brand-blue uppercase tracking-wider mb-1">New Customer Registration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">* Company / Customer Name</label>
                  <input type="text" className="w-full px-3 py-2 bg-charcoal-800 border border-charcoal-700 rounded-lg text-sm text-white font-semibold outline-none focus:border-brand-blue transition-colors" value={newCustomerDetails.name} onChange={(e) => setNewCustomerDetails({ ...newCustomerDetails, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Contact Person</label>
                  <input type="text" className="w-full px-3 py-2 bg-charcoal-800 border border-charcoal-700 rounded-lg text-sm text-white font-semibold outline-none focus:border-brand-blue transition-colors" value={newCustomerDetails.contactPerson} onChange={(e) => setNewCustomerDetails({ ...newCustomerDetails, contactPerson: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Mobile Number</label>
                  <input type="text" className="w-full px-3 py-2 bg-charcoal-800 border border-charcoal-700 rounded-lg text-sm text-white font-semibold outline-none focus:border-brand-blue transition-colors" value={newCustomerDetails.mobile} onChange={(e) => setNewCustomerDetails({ ...newCustomerDetails, mobile: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">FB Name</label>
                  <input type="text" className="w-full px-3 py-2 bg-charcoal-800 border border-charcoal-700 rounded-lg text-sm text-white font-semibold outline-none focus:border-brand-blue transition-colors" value={newCustomerDetails.fbName} onChange={(e) => setNewCustomerDetails({ ...newCustomerDetails, fbName: e.target.value })} />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Address</label>
                  <input type="text" className="w-full px-3 py-2 bg-charcoal-800 border border-charcoal-700 rounded-lg text-sm text-white font-semibold outline-none focus:border-brand-blue transition-colors" value={newCustomerDetails.address} onChange={(e) => setNewCustomerDetails({ ...newCustomerDetails, address: e.target.value })} />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Distance (km)</label>
                  <input type="text" className="w-full px-3 py-2 bg-charcoal-800 border border-charcoal-700 rounded-lg text-sm text-white font-semibold outline-none focus:border-brand-blue transition-colors" value={newCustomerDetails.distance} onChange={(e) => setNewCustomerDetails({ ...newCustomerDetails, distance: e.target.value })} />
                </div>
                
                <div className="md:col-span-2 bg-charcoal-800 border border-charcoal-700 rounded-xl p-4 mt-2">
                  <p className="text-xs font-black text-brand-blue uppercase tracking-wider mb-4">Product Type &amp; Default Quantity</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    {newCustomerProducts.map(product => {
                      const checked = !!selectedProducts[product];
                      return (
                        <div key={product} className={`flex flex-col gap-2 p-3 border rounded-lg transition-colors ${checked ? 'border-brand-blue/30 bg-brand-blue/5' : 'border-charcoal-700 bg-transparent'}`}>
                          <label className="flex items-start gap-2.5 cursor-pointer">
                            <input
                              type="checkbox"
                              className="w-4 h-4 mt-0.5 accent-brand-blue shrink-0"
                              checked={checked}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedProducts(prev => ({ ...prev, [product]: 1 }));
                                } else {
                                  const next = { ...selectedProducts };
                                  delete next[product];
                                  setSelectedProducts(next);
                                }
                              }}
                            />
                            <span className={`text-xs font-bold leading-tight ${checked ? 'text-brand-blue' : 'text-slate-400'}`}>{product}</span>
                          </label>
                          {checked && (
                            <div className="pl-6.5 mt-1">
                              <select
                                className="w-full px-2 py-1.5 rounded bg-charcoal-900 border border-brand-blue/20 text-xs font-bold text-white outline-none"
                                value={selectedProducts[product] || 1}
                                onChange={(e) => setSelectedProducts(prev => ({ ...prev, [product]: parseInt(e.target.value) }))}
                                style={{ colorScheme: 'dark' }}
                              >
                                {[...Array(20)].map((_, i) => (
                                  <option key={i + 1} value={i + 1}>Qty: {i + 1}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="md:col-span-2 bg-charcoal-800 border border-charcoal-700 rounded-xl p-4">
                  <p className="text-xs font-black text-brand-blue uppercase tracking-wider mb-4">Delivery Schedule</p>
                  <div className="flex flex-wrap gap-3">
                    {daysOfWeek.map(day => {
                      const isChecked = newCustomerDetails.deliverySched.includes(day);
                      return (
                        <label key={day} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer transition-colors ${isChecked ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue' : 'bg-transparent border-charcoal-600 text-slate-400 hover:border-slate-500'}`}>
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={isChecked}
                            onChange={(e) => {
                              let currentScheds = newCustomerDetails.deliverySched ? newCustomerDetails.deliverySched.split(', ') : [];
                              if (e.target.checked) {
                                if (!currentScheds.includes(day)) currentScheds.push(day);
                              } else {
                                currentScheds = currentScheds.filter(d => d !== day);
                              }
                              setNewCustomerDetails({ ...newCustomerDetails, deliverySched: currentScheds.join(', ') })
                            }}
                          />
                          <span className="text-xs font-bold">{day.substring(0, 3)}</span>
                        </label>
                      );
                    })}
                  </div>
                  
                  <div className="mt-5 w-full max-w-xs">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Preferred Delivery Time</label>
                    <select 
                      className="w-full px-3 py-2 bg-charcoal-900 border border-charcoal-700 rounded-lg text-sm text-white font-semibold outline-none focus:border-brand-blue transition-colors" 
                      value={newCustomerDetails.deliveryTime} 
                      onChange={(e) => setNewCustomerDetails({ ...newCustomerDetails, deliveryTime: e.target.value })}
                      style={{ colorScheme: 'dark' }}
                    >
                      <option value="">-- Select Delivery Time --</option>
                      {deliveryTimes.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                    </select>
                  </div>
                </div>

              </div>

              <div className="flex justify-between items-center mt-2 border-t border-charcoal-700 pt-5">
                <p className="text-[11px] text-slate-500 font-semibold italic max-w-sm">* Required. Use this button to register a profile without processing an immediate checkout cart.</p>
                <button
                  className="px-6 py-2.5 rounded-xl font-black text-sm text-white bg-brand-blue hover:bg-brand-blue/90 shadow-[0_0_15px_rgba(58,134,255,0.3)] transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
                  onClick={handleRegisterCustomer}
                  disabled={!newCustomerDetails.name}
                >
                  Create New Customer
                </button>
              </div>
            </div>
          )}

          {customerType === 'regular' && (
            <div className="flex flex-col gap-4 animate-in fade-in slide-in-from-top-4 duration-200 mt-2">
              <select
                className="w-full max-w-md px-4 py-3 bg-charcoal-900 border border-brand-blue/50 rounded-lg text-brand-blue font-bold text-sm outline-none focus:border-brand-blue focus:ring-1 focus:ring-brand-blue/50 transition-all shadow-[0_0_10px_rgba(58,134,255,0.1)]"
                value={selectedCustomer?.name || ''}
                onChange={(e) => {
                  const c = customers.find(c => c.name === e.target.value);
                  if (c) handleApplyCustomerOrder(c);
                  else setSelectedCustomer(null);
                }}
                style={{ colorScheme: 'dark' }}
              >
                <option value="">-- Select Regular Customer --</option>
                {[...customers]
                  .sort((a, b) => a.name.trim().localeCompare(b.name.trim()))
                  .map(c => (
                    <option key={`${c.cid}-${c.name}`} value={c.name}>{c.name}</option>
                  ))}
              </select>

              {selectedCustomer && (
                <div className="p-4 bg-charcoal-900 rounded-xl border border-charcoal-700 mt-1">
                  <div className="flex justify-between items-center mb-4 border-b border-charcoal-700 pb-3">
                    <h4 className="font-black text-white flex items-center gap-2">
                       <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01"/><path d="M12 14h.01"/><path d="M16 14h.01"/><path d="M8 18h.01"/><path d="M12 18h.01"/><path d="M16 18h.01"/></svg>
                       Profile Details
                    </h4>
                    <span className="text-[10px] font-black tracking-widest text-slate-500 uppercase">CID: {selectedCustomer.cid}</span>
                  </div>
                  
                  {(() => {
                    // LABEL_MAP order = interleaved left/right per the grid layout
                    // Row1: Customer/Company | CID
                    // Row2: Contact Person   | Product Type
                    // Row3: FB Name          | Quantity
                    // Row4: Address          | Delivery Sched
                    // Row5: Distance         | Delivery Time
                    // Row6: Mobile           | (empty)
                    const LABEL_MAP: [string, string][] = [
                      ['Customer / Company', 'Customer / Company'],
                      ['CID', 'CID'],
                      ['Contact Person', 'Contact Person'],
                      ['Product Type', 'Product Type'],
                      ['FB Name', 'FB Name'],
                      ['Quantity', 'Quantity'],
                      ['Address', 'Address'],
                      ['Delivery Sched', 'Delivery Sched'],
                      ['Distance from C&F', 'Distance'],
                      ['Distance', 'Distance'],
                      ['Delivery Time', 'Delivery Time'],
                      ['Mobile', 'Mobile'],
                    ];
                    const details = selectedCustomer.details || {};
                    const norm = (s: string) => s.toLowerCase().replace(/[\s_&/]/g, '');
                    // Build ordered rows, deduplicating by label
                    const seen = new Set<string>();
                    const rows: [string, string][] = [];
                    for (const [rawKey, label] of LABEL_MAP) {
                      if (seen.has(label)) continue;
                      const match = Object.entries(details).find(([k]) => norm(k) === norm(rawKey));
                      if (match && String(match[1]).trim()) {
                        rows.push([label, String(match[1])]);
                        seen.add(label);
                      }
                    }
                    // Append any unmapped fields
                    const mappedNorms = LABEL_MAP.map(([k]) => norm(k));
                    Object.entries(details).forEach(([k, v]) => {
                      if (!mappedNorms.includes(norm(k)) && String(v).trim()) rows.push([k, String(v)]);
                    });
                    // Push Delivery Time to right column by inserting a spacer if it's on the left
                    const dtIdx = rows.findIndex(([l]) => l === 'Delivery Time');
                    if (dtIdx > 0 && dtIdx % 2 === 0) rows.splice(dtIdx, 0, ['__spacer', '']);
                    return rows.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-0.5">
                        {rows.map(([label, value], idx) => label === '__spacer'
                          ? <div key={`spacer-${idx}`} className="hidden md:block" />
                          : (
                            <div key={label} className="flex justify-between md:justify-start gap-4 py-2 border-b border-charcoal-700/50 last:border-0 md:border-0">
                              <span className="w-32 shrink-0 text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-0.5">{label}</span>
                              <span className="text-xs font-bold text-white max-w-[200px] break-words text-right md:text-left">{value}</span>
                            </div>
                          ))}
                      </div>
                    ) : <p className="text-slate-500 text-xs italic">No additional details available.</p>;
                  })()}

                  {/* Edit / Delete buttons */}
                  <div className="flex gap-3 mt-4 pt-4 border-t border-charcoal-700">
                    <button
                      onClick={openEditCustomerModal}
                      className="flex-1 py-2 bg-charcoal-800 border border-charcoal-600 hover:border-brand-blue/50 rounded-lg text-slate-300 hover:text-brand-blue text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>
                      Edit Profile
                    </button>
                    <button
                      onClick={handleDeleteCustomer}
                      className="py-2 px-4 bg-charcoal-800 border border-charcoal-600 hover:border-red-500/50 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-400 text-xs font-bold transition-all flex items-center justify-center gap-2"
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Item Selection */}
        <POSGrid items={items} onAddToCart={addToCart} />

      </div>

      {/* Bottom Section: Current Order / Checkout */}
      <div>
        <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl p-6 shadow-xl">
          <h2 className="text-xl font-black text-brand-blue mb-5 flex justify-between items-center border-b border-charcoal-700 pb-4">
            <span className="flex items-center gap-2">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
              Current Order
            </span>
            {cart.length > 0 && (
              <span className="text-[11px] font-black tracking-widest uppercase bg-brand-blue/20 text-brand-blue border border-brand-blue/30 px-3 py-1 rounded-full">
                Qty: {cart.reduce((sum, item) => sum + item.quantity, 0)}
              </span>
            )}
          </h2>

          <div className="flex flex-col gap-3 mb-6">
            {cart.length === 0 ? (
              <div className="py-12 flex flex-col items-center justify-center bg-charcoal-900/50 rounded-xl border border-dashed border-charcoal-600">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-600 mb-3"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                <p className="text-sm font-bold text-slate-500 italic">Cart is empty. Select items to begin.</p>
              </div>
            ) : (
              cart.map(item => (
                <div key={item.cartItemId} className="flex flex-col md:flex-row md:justify-between md:items-center bg-charcoal-900 border border-charcoal-700 p-4 rounded-xl gap-4 group hover:border-brand-blue/30 transition-colors">
                  <div className="flex-grow">
                    <h3 className="font-black text-[15px] text-white tracking-wide">{item.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] font-bold tracking-widest uppercase text-slate-500">Unit Price:</span>
                      <span className="text-xs font-black text-brand-blue bg-brand-blue/10 px-2 py-0.5 rounded border border-brand-blue/20">₱{(item.price || 0).toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="flex flex-col md:flex-row items-end md:items-center gap-4 md:gap-8 w-full md:w-auto mt-2 md:mt-0 pt-3 md:pt-0 border-t md:border-t-0 border-charcoal-700/50">
                    <div className="flex items-center gap-1.5 bg-charcoal-800 p-1 rounded-lg border border-charcoal-600">
                      <button className="w-8 h-8 flex items-center justify-center text-lg font-bold text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors pb-0.5" onClick={() => updateCartItemQuantity(item.cartItemId, item.quantity - 1)}>−</button>
                      <input
                        type="number"
                        min={1}
                        value={item.quantity}
                        onFocus={e => e.target.select()}
                        onChange={e => {
                          const v = parseInt(e.target.value);
                          if (!isNaN(v) && v >= 1) updateCartItemQuantity(item.cartItemId, v);
                        }}
                        className="w-10 text-center font-black text-sm bg-transparent border-none outline-none text-white [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      />
                      <button className="w-8 h-8 flex items-center justify-center text-lg font-bold text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-colors pb-0.5" onClick={() => updateCartItemQuantity(item.cartItemId, item.quantity + 1)}>+</button>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-0.5">Subtotal</p>
                      <p className="font-black text-[17px] text-brand-teal">₱{((item.price || 0) * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="border-t border-charcoal-700 pt-5">
            <div className="flex flex-col gap-4 mb-6">

              <div className="flex flex-col md:flex-row gap-4">
                {/* Delivery Status Setup */}
                <div className="flex-1 flex flex-col gap-3 bg-charcoal-900 p-4 rounded-xl border border-charcoal-700">
                  <span className="text-[11px] font-black uppercase tracking-widest text-brand-blue">Fulfillment Method</span>
                  <div className="flex gap-5">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="radio" name="checkoutDeliveryStatus" value="Pickup" checked={checkoutDeliveryStatus === 'Pickup'} onChange={() => setCheckoutDeliveryStatus('Pickup')} className="w-4 h-4 accent-brand-blue" />
                      <span className={`text-sm font-bold transition-colors ${checkoutDeliveryStatus === 'Pickup' ? 'text-brand-blue' : 'text-slate-400 group-hover:text-slate-300'}`}>🏪 Pickup</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input
                        type="radio"
                        name="checkoutDeliveryStatus"
                        value="Delivery"
                        checked={checkoutDeliveryStatus === 'Delivery'}
                        onChange={() => setCheckoutDeliveryStatus('Delivery')}
                        className="w-4 h-4 accent-brand-blue"
                      />
                      <span className={`text-sm font-bold transition-colors ${checkoutDeliveryStatus === 'Delivery' ? 'text-brand-blue' : 'text-slate-400 group-hover:text-slate-300'}`}>🚚 Delivery</span>
                    </label>
                  </div>

                  {checkoutDeliveryStatus === 'Delivery' && (
                    <div className="flex flex-col sm:flex-row gap-3 mt-1 animate-in fade-in slide-in-from-top-2 duration-200">
                      <input
                        type="date"
                        className="px-3 py-2 bg-charcoal-800 border border-brand-blue/30 rounded-lg text-xs font-bold text-white outline-none focus:border-brand-blue flex-1"
                        value={checkoutDeliveryDate}
                        min={today}
                        onChange={(e) => setCheckoutDeliveryDate(e.target.value)}
                        style={{ colorScheme: 'dark' }}
                      />
                      <select
                        className={`px-3 py-2 bg-charcoal-800 border rounded-lg text-xs font-bold outline-none focus:border-brand-blue flex-1 ${checkoutDeliveryTime ? 'border-brand-blue/30 text-white' : 'border-charcoal-600 text-slate-400'}`}
                        value={checkoutDeliveryTime}
                        onChange={(e) => setCheckoutDeliveryTime(e.target.value)}
                        style={{ colorScheme: 'dark' }}
                      >
                        <option value="" className="text-slate-400 bg-charcoal-900">-- Select Time (optional) --</option>
                        {deliveryTimes.map(dt => <option key={dt} value={dt} className="text-white bg-charcoal-900">{dt}</option>)}
                      </select>
                    </div>
                  )}
                </div>

                {/* Payment Setup */}
                <div className="flex-1 flex flex-col gap-3 bg-charcoal-900 p-4 rounded-xl border border-charcoal-700">
                  <span className="text-[11px] font-black uppercase tracking-widest text-brand-teal">Payment Status</span>
                  <div className="flex gap-5">
                    <label className="flex items-center gap-2 cursor-pointer group">
                      <input type="radio" name="paymentType" value="Paid" checked={paymentType === 'Paid'} onChange={() => setPaymentType('Paid')} className="w-4 h-4 accent-brand-teal" />
                      <span className={`text-sm font-bold transition-colors ${paymentType === 'Paid' ? 'text-brand-teal' : 'text-slate-400 group-hover:text-slate-300'}`}>💰 Paid</span>
                    </label>
                    <label className={`flex items-center gap-2 group ${customerType === 'walkin' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}>
                      <input
                        type="radio"
                        name="paymentType"
                        value="Credit"
                        checked={paymentType === 'Credit'}
                        onChange={() => setPaymentType('Credit')}
                        disabled={customerType === 'walkin'}
                        className="w-4 h-4 accent-brand-teal"
                      />
                      <span className={`text-sm font-bold transition-colors ${paymentType === 'Credit' ? 'text-brand-teal' : 'text-slate-400 group-hover:text-slate-300'}`}>⏱ Credit (Terms)</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-between items-end mt-4 px-2">
                <div>
                  <span className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Transaction Total</span>
                  <span className="text-sm font-bold text-slate-400">Total Displayed Amount</span>
                </div>
                <span className="text-[34px] leading-none font-black text-white tracking-tight">₱{totalPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>

            <button
              className="w-full py-5 rounded-xl font-black text-xl tracking-widest uppercase transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 bg-brand-blue hover:bg-brand-blue/90 text-white shadow-[0_0_20px_rgba(58,134,255,0.4)] disabled:shadow-none"
              onClick={handleCheckout}
              disabled={
                cart.length === 0 ||
                (customerType === 'new' && !newCustomerDetails.name)
              }
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              Checkout &amp; Save Order
            </button>
          </div>
        </div>
      </div>

      {/* ══ TODAY'S SALES SUMMARY ══════════════════════════════════════════════ */}
      {/* ══ TODAY'S SALES SUMMARY ══════════════════════════════════════════════ */}
      <div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-4 gap-4">
          <div>
            <h3 className="text-xl font-black text-white m-0">Today&apos;s Sales</h3>
            <p className="text-[10px] font-bold text-slate-500 tracking-widest uppercase mt-1">● {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { l: 'Transactions', v: todaySales.length, c: 'text-brand-blue' },
              { l: 'Revenue', v: `₱${todayRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}`, c: 'text-brand-teal' },
              { l: 'Units', v: todayUnits, c: 'text-brand-violet' },
              { l: 'Paid', v: todayPaid, c: 'text-brand-teal' },
              { l: 'Credit', v: todayCredit, c: 'text-brand-orange' }
            ].map(k => (
              <div key={k.l} className="text-center px-4 py-2 bg-charcoal-800 border border-charcoal-700 rounded-xl shadow-sm min-w-[80px]">
                <div className="text-[9px] font-bold text-slate-500 tracking-widest uppercase mb-1">{k.l}</div>
                <div className={`text-base font-black ${k.c}`}>{k.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl overflow-hidden shadow-xl">
          {todaySales.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-4xl mb-3 opacity-30">🧾</div>
              <p className="text-xs text-slate-500 font-semibold italic">No transactions logged yet today. Completed orders will appear here automatically.</p>
              <button onClick={fetchTodaySales} className="mt-4 px-5 py-2 bg-brand-blue/10 border border-brand-blue/30 rounded-lg text-brand-blue text-xs font-bold hover:bg-brand-blue/20 transition-all">
                ↺ Refresh Data
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="bg-charcoal-900 border-b border-charcoal-700">
                    {['#', 'Time', 'Customer', 'Type', 'Fulfillment', 'SKU', 'Qty', 'Amount', 'Status', ''].map(h => (
                      <th key={h} className={`px-4 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest ${['Qty', 'Amount'].includes(h) ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-700/50">
                  {[...todaySales].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((t, i) => {
                    const timeStr = t.timestamp?.split(',')[1]?.trim() || t.timestamp;
                    return (
                      <tr key={i} className={`hover:bg-brand-blue/5 transition-colors ${i % 2 === 0 ? 'bg-transparent' : 'bg-charcoal-800/50'}`}>
                        <td className="px-4 py-3 text-[10px] text-slate-500 font-mono tracking-tight">{todaySales.length - i}</td>
                        <td className="px-4 py-3 text-[11px] text-slate-400 font-mono whitespace-nowrap">{timeStr}</td>
                        <td className="px-4 py-3 text-xs font-black text-white">{t.customerName}</td>
                        <td className="px-4 py-3">
                          {(() => {
                            const raw = t.orderType || '';
                            const isWalk = raw.toLowerCase().includes('walk') || t.customerName === 'Walk-in';
                            return (
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md ${isWalk ? 'bg-amber-400/10 text-amber-400' : 'bg-brand-blue/10 text-brand-blue'}`}>
                                {isWalk ? 'Walk-in' : 'Regular'}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3">
                          {(() => {
                            const raw = t.orderType || '';
                            const isDelivery = raw.toLowerCase().includes('delivery');
                            return (
                              <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border ${isDelivery ? 'bg-brand-violet/10 text-brand-violet border-brand-violet/30' : 'bg-charcoal-700/50 text-slate-400 border-charcoal-600'}`}>
                                {isDelivery ? '🚚 Delivery' : '🏪 Pickup'}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-300">{t.itemName}</td>
                        <td className="px-4 py-3 text-right text-sm font-black text-white">{t.quantity}</td>
                        <td className="px-4 py-3 text-right text-sm font-black text-brand-teal">₱{parseFloat(t.totalPrice || '0').toFixed(2)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border ${t.paymentMethod === 'Paid' ? 'bg-brand-teal/10 text-brand-teal border-brand-teal/30' : 'bg-brand-orange/10 text-brand-orange border-brand-orange/30'}`}>
                            {t.paymentMethod}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => {
                              const q = parseFloat(t.quantity) || 1;
                              const tp = parseFloat(t.totalPrice) || 0;
                              setEditingSale({ ...t, index: i });
                              const rawDDate = t.unplannedDate || '';
                              let initDDate = '';
                              if (/^\d{4}-\d{2}-\d{2}$/.test(rawDDate)) initDDate = rawDDate;
                              else if (rawDDate) {
                                try { const d = new Date(rawDDate); if (!isNaN(d.getTime())) initDDate = d.toISOString().split('T')[0]; } catch { }
                              }
                              
                              if (!initDDate && t.timestamp) {
                                try {
                                  const datePart = t.timestamp.split(' ')[0];
                                  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
                                    initDDate = datePart;
                                  } else {
                                    const d = new Date(t.timestamp);
                                    if (!isNaN(d.getTime())) {
                                      initDDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                                    }
                                  }
                                } catch { }
                              }
                              
                              if (!initDDate) {
                                initDDate = new Date().toLocaleDateString('en-CA');
                              }

                              const rawDTime = t.unplannedTime || '';
                              let initDTime = '';
                              if (rawDTime && rawDTime.toLowerCase() !== 'pickup') {
                                const normalized = rawDTime.trim().toUpperCase();
                                const matched = deliveryTimes.find(dt => dt.toUpperCase() === normalized) || deliveryTimes.find(dt => dt.toUpperCase().replace(/\s/g, '') === normalized.replace(/\s/g, ''));
                                if (matched) initDTime = matched;
                                else initDTime = rawDTime;
                              }

                              setEditFields({
                                orderType: t.orderType || '',
                                customerName: t.customerName || '',
                                itemName: t.itemName || '',
                                quantity: t.quantity || '',
                                unitPrice: (tp / q).toFixed(2),
                                paymentMethod: t.paymentMethod || 'Paid',
                                deliveryDate: initDDate,
                                deliveryTime: initDTime
                              });
                            }}
                            title="Edit order"
                            className="bg-charcoal-700/50 border border-charcoal-600 hover:border-brand-blue/50 hover:text-brand-blue rounded-md px-2 py-1 text-slate-400 text-[10px] transition-all"
                          >
                            ✎
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-brand-blue/30 bg-brand-blue/5">
                    <td colSpan={7} className="px-4 py-3 text-[10px] font-black text-brand-blue uppercase tracking-widest">
                      Totals · {todaySales.length} transactions today
                    </td>
                    <td className="px-4 py-3 text-right text-[15px] font-black text-white">{todayUnits}</td>
                    <td className="px-4 py-3 text-right text-[15px] font-black text-brand-teal">₱{todayRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ══ EDIT SALE MODAL ══════════════════════════════════════════════════════ */}
      {editingSale && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-charcoal-950/80 backdrop-blur-sm p-4" onClick={() => setEditingSale(null)}>
          <div className="bg-charcoal-900 border border-brand-blue/30 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-6 border-b border-charcoal-700 pb-4">
              <div>
                <h3 className="text-xl font-black text-white">Edit Sale Entry</h3>
                <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-widest">TXN {editingSale.transactionId} · {editingSale.timestamp?.split(',')[1]?.trim()}</p>
              </div>
              <button onClick={() => setEditingSale(null)} className="w-8 h-8 flex items-center justify-center rounded-full bg-charcoal-800 text-slate-400 hover:text-white hover:bg-charcoal-700 transition-colors">✕</button>
            </div>

            <div className="space-y-4">
              {([
                { label: 'Customer Name', key: 'customerName', type: 'text' },
                { label: 'SKU / Item', key: 'itemName', type: 'text' },
                { label: 'Quantity', key: 'quantity', type: 'number' },
                { label: 'Unit Price (₱)', key: 'unitPrice', type: 'number' },
              ] as { label: string; key: keyof typeof editFields; type: string }[]).map(f => (
                <div key={f.key}>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-brand-blue mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    value={editFields[f.key]}
                    onChange={e => setEditFields(prev => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full px-4 py-3 bg-charcoal-800 border border-charcoal-700 focus:border-brand-blue rounded-xl text-sm font-bold text-white outline-none transition-colors"
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-brand-teal mb-1.5">Payment Method</label>
                  <select
                    value={editFields.paymentMethod}
                    onChange={e => setEditFields(prev => ({ ...prev, paymentMethod: e.target.value }))}
                    className="w-full px-4 py-3 bg-charcoal-800 border border-charcoal-700 focus:border-brand-teal rounded-xl text-sm font-bold text-white outline-none transition-colors appearance-none cursor-pointer"
                  >
                    {['Paid', 'Credit'].map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase tracking-widest text-brand-blue mb-1.5">Fulfillment</label>
                  <div className="flex gap-2 h-[46px]">
                    {(['Pickup', 'Delivery'] as const).map(mode => {
                      const isActive = editFields.orderType.toLowerCase().includes(mode.toLowerCase());
                      return (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => {
                            // Preserve the customer-type prefix (Walk-in / Regular / New Regular)
                            const current = editFields.orderType;
                            const prefix = current.replace(/\s*\((Pickup|Delivery)\)\s*/i, '').trim() || 'Regular';
                            setEditFields(prev => ({ ...prev, orderType: `${prefix} (${mode})` }));
                          }}
                          className={`flex-1 rounded-xl text-xs font-black uppercase tracking-wider border transition-all ${
                            isActive
                              ? mode === 'Delivery'
                                ? 'bg-brand-blue/20 border-brand-blue/60 text-brand-blue shadow-[0_0_8px_rgba(58,134,255,0.25)]'
                                : 'bg-brand-teal/20 border-brand-teal/60 text-brand-teal'
                              : 'bg-charcoal-800 border-charcoal-600 text-slate-400 hover:border-slate-500'
                          }`}
                        >
                          {mode === 'Pickup' ? '🏪 Pickup' : '🚚 Delivery'}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {editFields.orderType.toLowerCase().includes('delivery') && (
                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-charcoal-700/50 mt-2">
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-brand-violet mb-1.5">Delivery Date</label>
                    <input
                      type="date"
                      value={editFields.deliveryDate}
                      onChange={e => setEditFields(prev => ({ ...prev, deliveryDate: e.target.value }))}
                      className="w-full px-4 py-3 bg-charcoal-800 border border-brand-violet/30 focus:border-brand-violet rounded-xl text-sm font-bold text-white outline-none transition-colors"
                      style={{ colorScheme: 'dark' }}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-brand-violet mb-1.5">Delivery Time</label>
                    <select
                      value={editFields.deliveryTime}
                      onChange={e => setEditFields(prev => ({ ...prev, deliveryTime: e.target.value }))}
                      className="w-full px-4 py-3 bg-charcoal-800 border border-brand-violet/30 focus:border-brand-violet rounded-xl text-sm font-bold text-white outline-none transition-colors appearance-none cursor-pointer"
                    >
                      <option value="">-- Select Time (optional) --</option>
                      {deliveryTimes.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                    </select>
                  </div>
                </div>
              )}


              <div className="bg-black/20 p-5 rounded-xl border border-white/5 mt-6">
                <p className="block text-[10px] font-black uppercase tracking-widest text-brand-yellow mb-3">⚠️ System Audit Authentication</p>
                <input type="password" value={editPin} onChange={e => setEditPin(e.target.value)}
                  placeholder="● ● ● ● ● ●" maxLength={6}
                  className="w-full px-4 py-3 bg-charcoal-800 text-center text-2xl tracking-[0.6em] border border-brand-yellow/20 focus:border-brand-yellow/50 rounded-xl font-bold text-white outline-none transition-colors" />
              </div>
            </div>

            <div className="flex gap-3 justify-end mt-8">
              <button
                onClick={() => setEditingSale(null)}
                className="px-6 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 border border-charcoal-600 rounded-xl text-xs font-bold text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditSale}
                disabled={editSaving}
                className="px-6 py-2.5 bg-brand-blue hover:bg-brand-blue/90 border border-brand-blue text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(58,134,255,0.3)] disabled:shadow-none"
              >
                {editSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Customer Modal ── */}
      {editCustomerModal && selectedCustomer && (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-charcoal-950/80 backdrop-blur-sm p-4 text-left">
          <div className="bg-charcoal-900 border border-brand-blue/20 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-charcoal-700 flex justify-between items-center shrink-0 bg-charcoal-800/50">
              <div>
                <h3 className="text-xl font-black text-white">Edit Customer Profile</h3>
                <p className="text-xs font-bold text-brand-blue mt-1 uppercase tracking-widest">CID: {selectedCustomer.cid} · {selectedCustomer.name}</p>
              </div>
              <button onClick={() => setEditCustomerModal(false)} className="w-8 h-8 flex items-center justify-center rounded-full bg-charcoal-800 text-slate-400 hover:text-white hover:bg-charcoal-700 border border-charcoal-600 transition-colors">✕</button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Basic Info Fields */}
                {([
                  ['Company / Name *', 'name'],
                  ['Contact Person', 'contactPerson'],
                  ['Mobile', 'mobile'],
                  ['FB Name', 'fbName'],
                ] as [string, keyof typeof editCustomerFields][]).map(([label, field]) => (
                  <div key={field}>
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                    <input
                      type="text"
                      value={editCustomerFields[field]}
                      onChange={e => setEditCustomerFields(prev => ({ ...prev, [field]: e.target.value }))}
                      className="w-full px-4 py-3 bg-charcoal-800 border border-charcoal-700 focus:border-brand-blue rounded-xl text-sm font-bold text-white outline-none transition-colors placeholder:text-slate-600"
                      placeholder={`Enter ${label.replace(' *', '').toLowerCase()}`}
                    />
                  </div>
                ))}

                {/* Full-width fields */}
                {([
                  ['Address', 'address'],
                  ['Distance (km)', 'distance'],
                ] as [string, keyof typeof editCustomerFields][]).map(([label, field]) => (
                  <div key={field} className="md:col-span-2">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1.5">{label}</label>
                    <input
                      type="text"
                      value={editCustomerFields[field]}
                      onChange={e => setEditCustomerFields(prev => ({ ...prev, [field]: e.target.value }))}
                      className="w-full px-4 py-3 bg-charcoal-800 border border-charcoal-700 focus:border-brand-blue rounded-xl text-sm font-bold text-white outline-none transition-colors"
                      placeholder={`Enter ${label.toLowerCase()}`}
                    />
                  </div>
                ))}

                <div className="md:col-span-2 h-px bg-charcoal-700/50 my-2" />

                {/* Delivery Schedule Section */}
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-brand-violet mb-3">Delivery Schedule</label>
                  <div className="flex flex-wrap gap-2 md:gap-3">
                    {daysOfWeek.map(day => {
                      const isChecked = editCustomerFields.deliverySched.includes(day);
                      return (
                        <label key={day} className={`flex items-center justify-center px-4 py-2 rounded-lg border text-xs font-bold cursor-pointer transition-colors ${isChecked ? 'bg-brand-violet/20 border-brand-violet text-brand-violet shadow-[0_0_10px_rgba(167,139,250,0.2)]' : 'bg-charcoal-800 border-charcoal-700 text-slate-400 hover:border-slate-500 hover:text-slate-300'}`}>
                          <input
                            type="checkbox"
                            className="hidden"
                            checked={isChecked}
                            onChange={e => {
                              let scheds = editCustomerFields.deliverySched ? editCustomerFields.deliverySched.split(', ') : [];
                              if (e.target.checked) { if (!scheds.includes(day)) scheds.push(day); }
                              else scheds = scheds.filter(d => d !== day);
                              setEditCustomerFields(prev => ({ ...prev, deliverySched: scheds.join(', ') }));
                            }}
                          />
                          {day.slice(0, 3)}
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Delivery Time Dropdown */}
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-brand-violet mb-1.5">Default Delivery Time</label>
                  <select
                    value={editCustomerFields.deliveryTime}
                    onChange={e => setEditCustomerFields(prev => ({ ...prev, deliveryTime: e.target.value }))}
                    className="w-full px-4 py-3 bg-charcoal-800 border border-charcoal-700 focus:border-brand-violet rounded-xl text-sm font-bold text-white outline-none transition-colors appearance-none cursor-pointer"
                  >
                    <option value="">-- Select Approximate Time --</option>
                    {deliveryTimes.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                  </select>
                </div>

                <div className="md:col-span-2 h-px bg-charcoal-700/50 my-2" />

                {/* Default Products Section */}
                <div className="md:col-span-2">
                  <label className="block text-[10px] font-black uppercase tracking-widest text-brand-teal mb-3">Default Products & Quantities</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {newCustomerProducts.map(product => {
                      const checked = !!editCustomerProducts[product];
                      return (
                        <div key={product} className={`flex flex-col gap-2 p-3 border rounded-xl transition-colors ${checked ? 'bg-brand-teal/5 border-brand-teal/30' : 'bg-charcoal-800 border-charcoal-700'}`}>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${checked ? 'bg-brand-teal border-brand-teal' : 'border-charcoal-500 bg-charcoal-900'}`}>
                              {checked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                            </div>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={checked}
                              onChange={e => {
                                if (e.target.checked) setEditCustomerProducts(prev => ({ ...prev, [product]: 1 }));
                                else { const n = { ...editCustomerProducts }; delete n[product]; setEditCustomerProducts(n); }
                              }}
                            />
                            <span className={`text-xs font-bold ${checked ? 'text-white' : 'text-slate-400'}`}>{product}</span>
                          </label>
                          {checked && (
                            <select
                              value={editCustomerProducts[product] || 1}
                              onChange={e => setEditCustomerProducts(prev => ({ ...prev, [product]: parseInt(e.target.value) }))}
                              className="mx-8 px-2 py-1.5 bg-charcoal-900 border border-brand-teal/30 rounded-lg text-brand-teal text-xs font-bold outline-none cursor-pointer"
                            >
                              {[...Array(10)].map((_, i) => <option key={i + 1} value={i + 1}>Qty: {i + 1}</option>)}
                            </select>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-6 py-4 border-t border-charcoal-700 bg-charcoal-800/50 flex gap-3 justify-end shrink-0">
              <button
                onClick={() => setEditCustomerModal(false)}
                className="px-6 py-2.5 bg-charcoal-800 hover:bg-charcoal-700 border border-charcoal-600 rounded-xl text-xs font-bold text-slate-300 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditCustomerSave}
                disabled={editCustomerSaving}
                className="px-6 py-2.5 bg-brand-blue hover:bg-brand-blue/90 border border-brand-blue text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-[0_0_15px_rgba(58,134,255,0.3)] disabled:shadow-none"
              >
                {editCustomerSaving ? (
                  <>Saving...</>
                ) : (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-cyan animate-pulse">Loading POS...</div>}>
      <POSHome />
    </Suspense>
  );
}
