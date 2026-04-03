'use client';

import { useState, useEffect, useRef, useMemo } from 'react';

interface Delivery {
    transactionId: string;
    mapKey?: string;
    cid: string;
    customerName: string;
    contactPerson: string;
    mobile: string;
    address: string;
    distance: string;
    schedule: string;
    preferredTime: string;
    displayItemName: string;
    itemName: string;
    quantity: number;
    totalPrice: number;
    paymentStatus: string;
    deliveryStatus: string;
    driver: string;
    helper?: string;
    timestamp: string;
    orderType?: string;
    unplannedDate?: string;
    unplannedTime?: string;
    isScheduledToday?: boolean;
    items?: { name: string; quantity: number }[];
}

import CalendarFilter, { getTodayISO, getWorkWeeks } from '@/components/CalendarFilter';

export default function DeliveryPage() {
    const todayISO = getTodayISO();
    const [selectedDate, setSelectedDate] = useState<string>(todayISO);
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
    const [deliveries, setDeliveries] = useState<Delivery[]>([]);
    
    const allWeeks = useMemo(() => getWorkWeeks(), []);
    const availableDates = useMemo(() => {
        return Array.from(new Set(deliveries.map(d => {
            const dateStr = d.unplannedDate || d.timestamp.split(',')[0];
            if (!dateStr) return '';
            try {
                const dt = new Date(dateStr);
                if (isNaN(dt.getTime())) return '';
                return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
            } catch { return ''; }
        }).filter(Boolean)));
    }, [deliveries]);
    const [drivers, setDrivers] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [updating, setUpdating] = useState<string | null>(null);
    const [bulkDriver, setBulkDriver] = useState('');
    const [bulkApplying, setBulkApplying] = useState(false);
    const [bulkHelper, setBulkHelper] = useState('');
    const [bulkApplyingHelper, setBulkApplyingHelper] = useState(false);
    const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
    const [editDeliveryFields, setEditDeliveryFields] = useState<Partial<Delivery>>({});
    const [editDeliverySaving, setEditDeliverySaving] = useState(false);
    const [statusFilter, setStatusFilter] = useState<'ALL' | 'Delivery Pending' | 'Delivery Completed' | 'Missing Order'>('ALL');
    const dropdownRef = useRef<HTMLDivElement>(null);
    const deliveryTimes = ['Anytime', '6:00 AM', '7:00 AM', '8:00 AM', '9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM', '5:00 PM', '6:00 PM', '7:00 PM', '8:00 PM', '9:00 PM', '10:00 PM', '11:00 PM'];

    useEffect(() => { fetchDeliveries(); }, [selectedDate]);

    async function fetchDeliveries() {
        setLoading(true);
        try {
            const url = selectedDate ? `/api/sheet?tab=delivery&date=${encodeURIComponent(selectedDate)}` : `/api/sheet?tab=delivery`;
            const res = await fetch(url);
            if (res.ok) { const data = await res.json(); setDeliveries(data.deliveries || []); setDrivers(data.drivers || []); }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    const handleUpdate = async (transactionId: string, updates: Partial<Delivery>) => {
        // Block completing a delivery if no driver assigned
        if (updates.deliveryStatus === 'Delivery Completed') {
            const current = deliveries.find(d => d.transactionId === transactionId);
            const effectiveDriver = updates.driver ?? current?.driver ?? '';
            if (!effectiveDriver) {
                alert('⚠️ Please assign a driver before marking this delivery as Completed.');
                return;
            }
        }
        setUpdating(transactionId);

        try {
            const delivery = deliveries.find(d => d.transactionId === transactionId);
            if (!delivery) return;

            const newDriver = updates.driver !== undefined ? updates.driver : delivery.driver;
            const newHelper = updates.helper !== undefined ? updates.helper : delivery.helper;
            if (newDriver && newHelper && newDriver === newHelper) {
                alert('Driver and Helper cannot be the same person.');
                setUpdating(null);
                return;
            }

            const finalDelivery = { ...delivery, ...updates };

            if (transactionId.startsWith('ASSUMED-')) {
                // For assumed orders, create a real record first
                const res = await fetch('/api/sheet', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'CREATE_ASSUMED_DELIVERY', delivery: finalDelivery, selectedDate })
                });
                const data = await res.json();
                if (data.success && data.transactionId) {
                    setDeliveries(prev => prev.map(d => d.transactionId === transactionId ? { ...finalDelivery, transactionId: data.transactionId } : d));
                }
            } else {
                // Optimistic update for normal records
                setDeliveries(prev => prev.map(d => d.transactionId === transactionId ? finalDelivery : d));
                await fetch('/api/sheet', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'UPDATE_DELIVERY', transactionId, deliveryStatus: updates.deliveryStatus ?? delivery.deliveryStatus, driver: updates.driver ?? delivery.driver, helper: updates.helper ?? delivery.helper, paymentStatus: updates.paymentStatus ?? delivery.paymentStatus })
                });
            }
        } catch (e) { console.error(e); }
        finally { setUpdating(null); }
    };

    // Save all edited delivery fields back to the sheet
    const handleSaveDeliveryEdit = async () => {
        if (!editingDelivery) return;

        // Validation: If it's a delivery order, it must have a valid date and time
        const currentOrderType = String(editDeliveryFields.orderType ?? editingDelivery.orderType ?? '');
        if (currentOrderType.toLowerCase().includes('delivery')) {
            const dDate = editDeliveryFields.unplannedDate ?? editingDelivery.unplannedDate;
            const dTime = editDeliveryFields.preferredTime ?? editingDelivery.preferredTime;
            if (!dDate || !dTime || dTime.toLowerCase() === 'pickup') {
                alert('Please provide a valid Delivery Date and Delivery Time for this Delivery order.');
                return;
            }
        }

        // Validation: Driver and Helper cannot be the same person
        const currentDriver = editDeliveryFields.driver !== undefined ? editDeliveryFields.driver : editingDelivery.driver;
        const currentHelper = editDeliveryFields.helper !== undefined ? editDeliveryFields.helper : editingDelivery.helper;
        if (currentDriver && currentHelper && currentDriver === currentHelper) {
            alert('Driver and Helper cannot be the same person.');
            return;
        }

        setEditDeliverySaving(true);
        try {
            const delivery = deliveries.find(d => d.transactionId === editingDelivery.transactionId);
            if (!delivery) return;
            const finalDelivery = { ...delivery, ...editDeliveryFields };
            if (editingDelivery.transactionId.startsWith('ASSUMED-')) {
                const res = await fetch('/api/sheet', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'CREATE_ASSUMED_DELIVERY', delivery: finalDelivery, selectedDate })
                });
                const data = await res.json();
                if (data.success && data.transactionId) {
                    setDeliveries(prev => prev.map(d => d.transactionId === editingDelivery.transactionId ? { ...finalDelivery, transactionId: data.transactionId } : d));
                }
            } else {
                const res = await fetch('/api/sheet', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'UPDATE_DELIVERY_ROW',
                        transactionId: editingDelivery.transactionId,
                        updates: editDeliveryFields,
                        currentDate: editingDelivery.unplannedDate,
                        currentTime: editingDelivery.preferredTime
                    })
                });
                if (res.ok) {
                    setDeliveries(prev => prev.map(d => d.mapKey === editingDelivery.mapKey ? finalDelivery : d));
                }
            }
            setEditingDelivery(null);
        } catch (e) { console.error(e); alert('Failed to save changes.'); }
        finally { setEditDeliverySaving(false); }
    };

    // Bulk-assign selected driver to all unassigned delivery rows
    const handleBulkAssign = async () => {
        if (!bulkDriver) return;
        setBulkApplying(true);
        const unassigned = filtered.filter(d => !d.driver && d.itemName !== '(No Order Yet)');
        for (const d of unassigned) {
            if (d.helper !== bulkDriver) {
                await handleUpdate(d.transactionId, { driver: bulkDriver });
            }
        }
        setBulkApplying(false);
    };

    // Bulk-assign selected helper to all unassigned delivery rows
    const handleBulkAssignHelper = async () => {
        if (!bulkHelper) return;
        setBulkApplyingHelper(true);
        const unassigned = filtered.filter(d => !d.helper && d.itemName !== '(No Order Yet)');
        for (const d of unassigned) {
            if (d.driver !== bulkHelper) {
                await handleUpdate(d.transactionId, { helper: bulkHelper });
            }
        }
        setBulkApplyingHelper(false);
    };

    // Sort by delivery time (ascending) then by distance (ascending)
    const parseTime = (t: string) => {
        if (!t) return 9999;
        const m = t.match(/(\d+):(\d+)(?::\d+)?\s*(AM|PM)/i);
        if (!m) return 9999;
        let h = parseInt(m[1]); const mn = parseInt(m[2]); const ampm = m[3].toUpperCase();
        if (ampm === 'PM' && h !== 12) h += 12;
        if (ampm === 'AM' && h === 12) h = 0;
        return h * 60 + mn;
    };
    const parseDist = (d: string) => parseFloat((d || '0').replace(/[^\d.]/g, '')) || 9999;

    const filtered = deliveries
        .filter(d => {
            if (!d.customerName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
            
            // If the backend specifically scheduled this customer/order for the selected date, bypass standard timestamp checking
            if (d.isScheduledToday) return true;
            
            const dateStr = d.unplannedDate || (d.timestamp ? String(d.timestamp).split(',')[0] : '');
            if (!dateStr) return false;
            
            // Note: dateStr from API is either 'YYYY-MM-DD' or 'M/D/YYYY' or timestamp string
            let dt = new Date(dateStr);
            if (isNaN(dt.getTime())) {
                const p = dateStr.split('/');
                if (p.length === 3) dt = new Date(`${p[2]}-${p[0].padStart(2,'0')}-${p[1].padStart(2,'0')}T12:00:00Z`);
            }
            if (isNaN(dt.getTime())) return false;
            
            const iso = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
            const m = dt.toLocaleString('default', { month: 'long', year: 'numeric' });

            const periodFilterActive = selectedMonths.length > 0 || selectedWeeks.length > 0;
            let periodMatch = !periodFilterActive;
            if (!periodMatch) {
               periodMatch = selectedMonths.includes(m) || selectedWeeks.some(wi => {
                  try { return dt.getTime() >= allWeeks[wi].start.getTime() && dt.getTime() <= allWeeks[wi].end.getTime(); } catch { return false; }
               });
            }
            const dateMatch = !selectedDate || iso === selectedDate;
            return periodMatch && dateMatch;
        })
        .sort((a, b) => {
            const tDiff = parseTime(a.preferredTime) - parseTime(b.preferredTime);
            if (tDiff !== 0) return tDiff;
            return parseDist(a.distance) - parseDist(b.distance);
        });

    const statusFiltered = filtered.filter(d => {
        if (statusFilter === 'ALL') return true;
        if (statusFilter === 'Missing Order') return d.itemName === '(No Order Yet)';
        const isDone = d.deliveryStatus === 'Delivery Completed' || d.deliveryStatus === 'Completed';
        if (statusFilter === 'Delivery Completed') return isDone;
        if (statusFilter === 'Delivery Pending') return !isDone && d.itemName !== '(No Order Yet)';
        return true;
    });

    // KPI derived values
    const total = filtered.length;
    const completed = filtered.filter(d => d.deliveryStatus === 'Delivery Completed' || d.deliveryStatus === 'Completed').length;
    const pending = filtered.filter(d => !['Delivery Completed', 'Completed'].includes(d.deliveryStatus) && d.itemName !== '(No Order Yet)').length;
    const noOrder = filtered.filter(d => d.itemName === '(No Order Yet)').length;
    const totalRevenue = filtered.reduce((s, d) => s + (Number(d.totalPrice) || 0), 0);
    const paidCount = filtered.filter(d => d.paymentStatus === 'Paid').length;
    const paidRevenue = filtered.filter(d => d.paymentStatus === 'Paid').reduce((s, d) => s + (Number(d.totalPrice) || 0), 0);
    const creditCount = filtered.filter(d => d.paymentStatus !== 'Paid' && d.itemName !== '(No Order Yet)').length;
    const creditRevenue = filtered.filter(d => d.paymentStatus !== 'Paid' && d.itemName !== '(No Order Yet)').reduce((s, d) => s + (Number(d.totalPrice) || 0), 0);

    // Styles
    const card: React.CSSProperties = { background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(15,30,55,0.95) 100%)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden' };
    // No inline styles needed anymore

    return (
        <div className="max-w-[1400px] mx-auto pb-12">
            <style>{`
                @keyframes fadeUp { from { opacity:0; transform:translateY(12px) } to { opacity:1; transform:translateY(0) } }
                @keyframes spin { to { transform: rotate(360deg) } }
                .pbi-card { animation: fadeUp 0.4s ease-out both; }
                .del-row:hover { background-color: rgba(58,134,255,0.05) !important; }
                .del-row { transition: background 0.15s; }
                .custom-scrollbar::-webkit-scrollbar { width: 8px; height: 8px; }
                .custom-scrollbar::-webkit-scrollbar-track { background: rgba(15,23,42,0.5); border-radius: 8px; }
                .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(58,134,255,0.3); border-radius: 8px; }
                .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(58,134,255,0.5); }
            `}</style>

            {/* ═══ HEADER ═══ */}
            <div className="flex justify-between items-start mb-7 gap-4">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tight m-0">Delivery Operations</h2>
                    <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mt-1.5 flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-brand-teal animate-pulse"></span>
                        Live Operations · {selectedDate ? selectedDate : (selectedMonths.length > 0 || selectedWeeks.length > 0 ? `${selectedMonths.length + selectedWeeks.length} Periods Selected` : 'All Time')}
                    </p>
                </div>
                
                <div className="flex-1 flex justify-end">
                  <div className="w-64 z-50 mr-4">
                    <CalendarFilter
                        availableDates={availableDates}
                        selectedDate={selectedDate}
                        setSelectedDate={setSelectedDate}
                        selectedMonths={selectedMonths}
                        setSelectedMonths={setSelectedMonths}
                        selectedWeeks={selectedWeeks}
                        setSelectedWeeks={setSelectedWeeks}
                    />
                  </div>
                </div>
                <button
                    onClick={fetchDeliveries}
                    className="flex items-center gap-2 bg-charcoal-800 hover:bg-charcoal-700 border border-charcoal-600 text-brand-blue font-black text-xs px-5 py-2.5 rounded-xl cursor-pointer tracking-widest transition-all shadow-lg active:scale-95"
                >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 2v6h6M21.5 22v-6h-6"/><path d="M22 11.5A10 10 0 0 0 3.2 7.2M2 12.5a10 10 0 0 0 18.8 4.2"/></svg>
                    REFRESH
                </button>
            </div>

            {/* ═══ KPI ROW ═══ */}
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
                {[
                    { label: 'Total Routes', value: total, borderColor: 'border-brand-blue', textColor: 'text-brand-blue', icon: '🚚' },
                    { label: 'Completed', value: completed, borderColor: 'border-brand-teal', textColor: 'text-brand-teal', icon: '✅' },
                    { label: 'Pending', value: pending, borderColor: 'border-[#FFD93D]', textColor: 'text-[#FFD93D]', icon: '⏳' },
                    { label: 'Missing Order', value: noOrder, borderColor: 'border-brand-orange', textColor: 'text-brand-orange', icon: '⚠️' },
                ].map((kpi) => (
                    <div key={kpi.label} className={`pbi-card bg-charcoal-800 border ${kpi.borderColor}/30 rounded-2xl p-5 relative overflow-hidden shadow-lg`}>
                        <div className={`absolute top-0 left-0 right-0 h-1 bg-current ${kpi.textColor}`}></div>
                        <div className="flex justify-between items-start">
                            <div className="flex-1">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{kpi.label}</p>
                                <p className={`text-3xl font-black mt-1 tabular-nums ${kpi.textColor}`}>
                                    {kpi.value?.toLocaleString()}
                                </p>
                            </div>
                            <span className="text-2xl opacity-60 ml-2">{kpi.icon}</span>
                        </div>
                    </div>
                ))}

                {/* Revenue card — custom layout */}
                <div className="pbi-card bg-charcoal-800 border border-brand-violet/30 rounded-2xl p-5 relative overflow-hidden shadow-lg lg:col-span-1">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-brand-violet"></div>
                    <div className="flex justify-between items-start mb-2">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Revenue Today</p>
                        <span className="text-xl opacity-60">💰</span>
                    </div>
                    <p className="text-2xl font-black text-brand-violet tabular-nums tracking-tight mb-2.5">
                        ₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                    </p>
                    <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center px-2 py-1 bg-brand-blue/10 rounded-lg">
                            <span className="text-[9px] font-extrabold text-brand-blue uppercase tracking-wider">✓ Paid ({paidCount})</span>
                            <span className="text-[10px] font-black text-brand-blue">₱{paidRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex justify-between items-center px-2 py-1 bg-brand-orange/10 rounded-lg">
                            <span className="text-[9px] font-extrabold text-brand-orange uppercase tracking-wider">⊘ Credit ({creditCount})</span>
                            <span className="text-[10px] font-black text-brand-orange">₱{creditRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ FILTER BAR ═══ */}
            <div className="bg-charcoal-800 border border-charcoal-700/50 rounded-2xl p-5 mb-6 shadow-lg">
                <div className="flex flex-wrap items-end gap-5">

                    {/* Date picker */}
                    <div className="flex-none">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Delivery Date</p>
                        <input
                            type="date"
                            value={selectedDate}
                            min={todayISO}
                            onChange={e => setSelectedDate(e.target.value)}
                            className="px-4 py-2 bg-charcoal-900 border border-charcoal-600 focus:border-brand-blue rounded-xl text-brand-blue font-bold text-sm outline-none cursor-pointer transition-colors w-full"
                            style={{ colorScheme: 'dark' }}
                        />
                    </div>

                    {/* Search */}
                    <div className="flex-1 min-w-[200px]">
                        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Search Client</p>
                        <div className="relative">
                            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
                            <input
                                type="text"
                                placeholder="Filter by name..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-charcoal-900 border border-charcoal-600 focus:border-brand-blue rounded-xl text-white font-bold text-sm outline-none placeholder:text-slate-500 transition-colors"
                            />
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-4 px-5 py-2 bg-brand-blue/5 border border-brand-blue/20 rounded-xl h-[42px]">
                        <div className="text-center">
                            <div className="text-lg font-black text-brand-blue tabular-nums leading-none mb-0.5">{filtered.length}</div>
                            <div className="text-[8px] font-black text-brand-blue/70 uppercase tracking-widest">Routes</div>
                        </div>
                        <div className="w-px h-8 bg-brand-blue/20"></div>
                        <div className="text-center">
                            <div className="text-lg font-black text-brand-teal tabular-nums leading-none mb-0.5">{Math.round(completed / Math.max(total, 1) * 100)}%</div>
                            <div className="text-[8px] font-black text-brand-teal/70 uppercase tracking-widest">Done</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ═══ TABLE ═══ */}
            <div className="bg-charcoal-800 border border-charcoal-700/50 rounded-2xl overflow-hidden shadow-lg">
                {/* Bulk driver and helper assignment bar */}
                <div className="px-5 py-3 border-b border-charcoal-700/50 flex items-center justify-between flex-wrap gap-3 bg-charcoal-800/80">
                    <span className="text-[10px] font-bold text-slate-500 tracking-wide">{filtered.length} records · sorted by time → distance</span>
                    
                    <div className="flex items-center gap-4 flex-wrap">
                        {/* Driver Bulk */}
                        <div className="flex items-center gap-2.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest m-0">Driver:</p>
                            <select
                                value={bulkDriver}
                                onChange={e => setBulkDriver(e.target.value)}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg outline-none cursor-pointer border transition-colors ${bulkDriver ? 'bg-brand-violet/10 border-brand-violet/30 text-brand-violet' : 'bg-charcoal-900 border-charcoal-600 text-slate-400'}`}
                            >
                                <option value="">— Select Driver —</option>
                                {drivers.map(dr => <option key={dr} value={dr}>{dr}</option>)}
                            </select>
                            <button
                                onClick={handleBulkAssign}
                                disabled={!bulkDriver || bulkApplying}
                                className={`text-[11px] font-black px-4 py-1.5 rounded-lg tracking-wider transition-all border-none ${bulkDriver ? 'bg-brand-violet text-white cursor-pointer hover:bg-brand-violet/90 shadow-[0_0_10px_rgba(167,139,250,0.3)]' : 'bg-charcoal-700 text-slate-500 cursor-not-allowed'}`}
                            >
                                {bulkApplying ? 'Assigning…' : '✓ Bulk Assign'}
                            </button>
                        </div>
                        <div className="w-px h-6 bg-charcoal-600"></div>
                        {/* Helper Bulk */}
                        <div className="flex items-center gap-2.5">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest m-0">Helper:</p>
                            <select
                                value={bulkHelper}
                                onChange={e => setBulkHelper(e.target.value)}
                                className={`text-xs font-bold px-3 py-1.5 rounded-lg outline-none cursor-pointer border transition-colors ${bulkHelper ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue' : 'bg-charcoal-900 border-charcoal-600 text-slate-400'}`}
                            >
                                <option value="">— Select Helper —</option>
                                {drivers.map(dr => <option key={dr} value={dr}>{dr}</option>)}
                            </select>
                            <button
                                onClick={handleBulkAssignHelper}
                                disabled={!bulkHelper || bulkApplyingHelper}
                                className={`text-[11px] font-black px-4 py-1.5 rounded-lg tracking-wider transition-all border-none ${bulkHelper ? 'bg-brand-blue text-white cursor-pointer hover:bg-brand-blue/90 shadow-[0_0_10px_rgba(58,134,255,0.3)]' : 'bg-charcoal-700 text-slate-500 cursor-not-allowed'}`}
                            >
                                {bulkApplyingHelper ? 'Assigning…' : '✓ Bulk Assign'}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Status filter tabs */}
                <div className="px-5 py-2.5 border-b border-charcoal-700/50 flex items-center gap-2 flex-wrap bg-charcoal-800/80">
                    {([
                        { key: 'ALL', label: 'All', count: filtered.length, colorClass: 'border-brand-blue text-brand-blue bg-brand-blue/10', idleClass: 'border-charcoal-600 text-slate-400 hover:border-slate-500' },
                        { key: 'Delivery Pending', label: 'Pending', count: pending, colorClass: 'border-[#FFD93D] text-[#FFD93D] bg-[#FFD93D]/10', idleClass: 'border-charcoal-600 text-slate-400 hover:border-slate-500' },
                        { key: 'Delivery Completed', label: 'Completed', count: completed, colorClass: 'border-brand-teal text-brand-teal bg-brand-teal/10', idleClass: 'border-charcoal-600 text-slate-400 hover:border-slate-500' },
                        { key: 'Missing Order', label: 'Missing Order', count: noOrder, colorClass: 'border-brand-orange text-brand-orange bg-brand-orange/10', idleClass: 'border-charcoal-600 text-slate-400 hover:border-slate-500' },
                    ] as { key: typeof statusFilter; label: string; count: number; colorClass: string; idleClass: string }[]).map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setStatusFilter(tab.key)}
                            className={`text-[11px] font-black px-3.5 py-1.5 rounded-lg border cursor-pointer transition-all whitespace-nowrap tracking-wide ${statusFilter === tab.key ? tab.colorClass : tab.idleClass}`}
                        >
                            {tab.label} <span className="opacity-80 ml-1">({tab.count})</span>
                        </button>
                    ))}
                </div>

                {/* Table header */}
                <div className="px-5 py-2.5 border-b border-charcoal-700/50 flex items-center justify-between bg-charcoal-800/80">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest m-0">Delivery Routes</p>
                </div>

                <div className="overflow-x-auto max-h-[60vh] overflow-y-auto custom-scrollbar">
                    <table className="w-full border-collapse min-w-[1200px] text-left">
                        <thead>
                            <tr className="bg-charcoal-900 sticky top-0 z-10">
                                {[
                                    { h: 'Client', w: undefined },
                                    { h: 'Contact', w: 110 },
                                    { h: 'Address', w: 180 },
                                    { h: 'Dist', w: 60 },
                                    { h: 'Time', w: 80 },
                                    { h: 'Order Details', w: 200 },
                                    { h: 'Amount', w: 90 },
                                    { h: 'Delivery Status', w: 130 },
                                    { h: 'Payment', w: 130 },
                                    { h: 'Driver', w: 130 },
                                    { h: 'Helper', w: 130 },
                                    { h: '', w: 50 },
                                ].map(({ h, w }) => (
                                    <th key={h} style={{ width: w }} className="px-3.5 py-3 text-[9px] font-black text-slate-500 uppercase tracking-widest border-b border-charcoal-700 whitespace-nowrap">
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-charcoal-700/50">
                            {loading ? (
                                <tr><td colSpan={11} className="p-16 text-center">
                                    <div className="inline-flex flex-col items-center gap-3">
                                        <div className="w-8 h-8 rounded-full border-2 border-brand-blue/20 border-t-brand-blue animate-spin"></div>
                                        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Loading routes...</span>
                                    </div>
                                </td></tr>
                            ) : statusFiltered.length === 0 ? (
                                <tr><td colSpan={11} className="p-16 text-center text-slate-500 text-sm italic font-bold">No deliveries found for the selected criteria.</td></tr>
                            ) : statusFiltered.map((d, idx) => {
                                const noOrderYet = d.itemName === '(No Order Yet)';
                                
                                const isDone = d.deliveryStatus === 'Delivery Completed' || d.deliveryStatus === 'Completed';
                                const statusClass = isDone 
                                    ? 'bg-[#4ECB71]/10 border-[#4ECB71]/30 text-[#4ECB71]' 
                                    : 'bg-[#FFD93D]/10 border-[#FFD93D]/30 text-[#FFD93D]';
                                
                                const isPaid = d.paymentStatus === 'Paid';
                                const payClass = isPaid 
                                    ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue' 
                                    : 'bg-brand-orange/10 border-brand-orange/30 text-brand-orange';

                                const selectedDayName = selectedDate ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(selectedDate + 'T00:00:00').getDay()].toLowerCase() : '';
                                const matchedDays = d.schedule?.split(',').map((s: string) => s.trim()).filter((s: string) => s.toLowerCase().includes(selectedDayName));

                                return (
                                    <tr key={d.mapKey || d.transactionId} className={`del-row transition-colors ${idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.01]'} ${updating === d.transactionId ? 'opacity-50' : 'opacity-100'}`}>
                                        {/* Client */}
                                        <td className="px-3.5 py-3">
                                            <div className="font-black text-brand-blue text-xs">{d.customerName}</div>
                                            <div className="text-[9px] text-slate-500 font-mono mt-0.5 tracking-wider">CID: {d.cid}</div>
                                        </td>
                                        {/* Contact */}
                                        <td className="px-3.5 py-3 text-[11px] text-slate-400 font-bold">{d.mobile || '—'}</td>
                                        {/* Address */}
                                        <td className="px-3.5 py-3 text-[10px] text-slate-400 max-w-[180px] break-words leading-tight" title={d.address}>{d.address}</td>
                                        {/* Distance */}
                                        <td className="px-3.5 py-3 text-[11px] text-slate-400 font-mono">{d.distance || '—'}</td>
                                        {/* Time */}
                                        <td className="px-3.5 py-3">
                                            <span className="text-[11px] font-black text-brand-blue uppercase tracking-wider">{d.preferredTime || '—'}</span>
                                        </td>
                                        {/* Order Details */}
                                        <td className="px-3.5 py-3">
                                            {noOrderYet ? (
                                                <div>
                                                    <span className="text-[10px] text-slate-500 italic font-bold">No Order Yet</span>
                                                    <a href={`/?cid=${d.cid}&from=delivery&time=${encodeURIComponent(d.preferredTime || '')}`} className="block text-[9px] text-brand-blue font-black uppercase tracking-widest mt-1 hover:text-brand-blue/80 transition-colors">Punch In ➡</a>
                                                </div>
                                            ) : (
                                                <div className="flex flex-col gap-1.5">
                                                    {(d.items && d.items.length > 0) ? d.items.map((item, i) => (
                                                        <div key={i} className="flex items-center gap-2">
                                                            <span className="text-xs text-white font-bold">{item.name}</span>
                                                            <span className="text-[10px] font-black text-brand-blue bg-brand-blue/10 px-1.5 py-0.5 rounded-md">×{item.quantity}</span>
                                                        </div>
                                                    )) : (
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-xs text-white font-bold">{d.displayItemName || d.itemName}</span>
                                                            <span className="text-[10px] font-black text-brand-blue bg-brand-blue/10 px-1.5 py-0.5 rounded-md">×{d.quantity}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                        {/* Amount */}
                                        <td className="px-3.5 py-3">
                                            <span className="text-xs font-black text-brand-violet tracking-wider">
                                                {Number(d.totalPrice) > 0 ? `₱${Number(d.totalPrice).toLocaleString('en-PH', { minimumFractionDigits: 0 })}` : '—'}
                                            </span>
                                        </td>
                                        {/* Delivery Status */}
                                        <td className="px-3.5 py-3">
                                            <select
                                                value={d.deliveryStatus}
                                                onChange={e => handleUpdate(d.transactionId, { deliveryStatus: e.target.value })}
                                                disabled={updating === d.transactionId || noOrderYet}
                                                className={`text-[10px] font-black px-2 py-1.5 rounded-lg border outline-none w-full cursor-pointer uppercase tracking-wider ${statusClass} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                                            >
                                                <option value="Delivery Pending">Pending</option>
                                                <option value="Delivery Completed">Completed</option>
                                            </select>
                                        </td>
                                        {/* Payment */}
                                        <td className="px-3.5 py-3">
                                            <select
                                                value={d.paymentStatus}
                                                onChange={e => handleUpdate(d.transactionId, { paymentStatus: e.target.value })}
                                                disabled={updating === d.transactionId || noOrderYet}
                                                className={`text-[10px] font-black px-2 py-1.5 rounded-lg border outline-none w-full cursor-pointer uppercase tracking-wider ${payClass} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                                            >
                                                <option value="Paid">Paid</option>
                                                <option value="Credit">Credit/Unpaid</option>
                                            </select>
                                        </td>
                                        {/* Driver */}
                                        <td className="px-3.5 py-3">
                                            <select
                                                value={d.driver}
                                                onChange={e => handleUpdate(d.transactionId, { driver: e.target.value })}
                                                disabled={updating === d.transactionId || noOrderYet}
                                                className={`text-[10px] font-black px-2 py-1.5 rounded-lg border outline-none w-full cursor-pointer uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${d.driver ? 'bg-brand-violet/10 border-brand-violet/30 text-brand-violet' : 'bg-charcoal-900 border-charcoal-600 text-slate-500'}`}
                                            >
                                                <option value="">— Driver —</option>
                                                {drivers.map(dr => <option key={dr} value={dr}>{dr}</option>)}
                                            </select>
                                        </td>
                                        {/* Helper */}
                                        <td className="px-3.5 py-3">
                                            <select
                                                value={d.helper ?? ''}
                                                onChange={e => handleUpdate(d.transactionId, { helper: e.target.value })}
                                                disabled={updating === d.transactionId || noOrderYet}
                                                className={`text-[10px] font-black px-2 py-1.5 rounded-lg border outline-none w-full cursor-pointer uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${d.helper ? 'bg-brand-blue/10 border-brand-blue/30 text-brand-blue' : 'bg-charcoal-900 border-charcoal-600 text-slate-500'}`}
                                            >
                                                <option value="">— Helper —</option>
                                                {drivers.map(dr => <option key={dr} value={dr}>{dr}</option>)}
                                            </select>
                                        </td>
                                        {/* Edit button */}
                                        <td className="px-3.5 py-3">
                                            <button
                                                onClick={() => { setEditingDelivery(d); setEditDeliveryFields({ ...d }); }}
                                                className="text-[10px] font-black px-2.5 py-1.5 rounded-lg bg-brand-blue/10 border border-brand-blue/30 text-brand-blue cursor-pointer uppercase tracking-wider hover:bg-brand-blue/20 transition-colors shadow-sm"
                                            >Edit</button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer summary */}
                {filtered.length > 0 && (
                    <div className="px-5 py-3 border-t border-charcoal-700/50 flex items-center justify-between gap-4 flex-wrap bg-charcoal-800/80">
                        <div className="flex gap-4">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{filtered.length} routes</span>
                            <span className="text-[10px] font-black text-brand-teal uppercase tracking-widest">✓ Completed: {completed}</span>
                            <span className="text-[10px] font-black text-[#FFD93D] uppercase tracking-widest">⏳ Pending: {pending}</span>
                            <span className="text-[10px] font-black text-brand-blue uppercase tracking-widest">Paid: {paidCount}</span>
                            <span className="text-[10px] font-black text-brand-orange uppercase tracking-widest">Credit: {creditCount}</span>
                        </div>
                        <span className="text-[11px] font-black text-brand-violet tracking-widest">Total: ₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span>
                    </div>
                )}
            </div>

            {/* ═══ EDIT MODAL ═══ */}
            {editingDelivery && (
                <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[999] flex items-center justify-center p-5" onClick={() => setEditingDelivery(null)}>
                    <div className="bg-charcoal-900 border border-brand-blue/30 rounded-2xl p-7 w-full max-w-[620px] max-h-[90vh] overflow-y-auto shadow-2xl custom-scrollbar" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-6 border-b border-charcoal-700/50 pb-4">
                            <h3 className="m-0 text-lg font-black text-white tracking-wide">Edit Delivery — <span className="text-brand-blue">{editingDelivery.customerName}</span></h3>
                            <button onClick={() => setEditingDelivery(null)} className="bg-transparent border-none text-slate-400 text-2xl cursor-pointer hover:text-white transition-colors flex items-center justify-center w-8 h-8 rounded-full hover:bg-charcoal-800">×</button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {([
                                { label: 'Customer Name', key: 'customerName' },
                                { label: 'Mobile', key: 'mobile' },
                                { label: 'Address', key: 'address', span: 2 },
                                { label: 'Distance', key: 'distance' },
                                { label: 'Item Name', key: 'itemName' },
                                { label: 'Quantity', key: 'quantity' },
                                { label: 'Total Amount (₱)', key: 'totalPrice' },
                            ] as { label: string; key: keyof Delivery; span?: number }[]).map(({ label, key, span }) => (
                                <div key={key} className={span === 2 ? 'sm:col-span-2' : ''}>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">{label}</p>
                                    <input
                                        type={key === 'quantity' || key === 'totalPrice' ? 'number' : 'text'}
                                        value={(editDeliveryFields[key] as string | number) ?? ''}
                                        onChange={e => setEditDeliveryFields(prev => ({ ...prev, [key]: e.target.value }))}
                                        className="w-full px-3 py-2.5 bg-charcoal-950 border border-charcoal-700 focus:border-brand-blue rounded-xl text-white font-bold text-sm outline-none transition-colors"
                                    />
                                </div>
                            ))}
                            {/* Order Type — lets user switch Pickup ↔ Delivery */}
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Order Type</p>
                                <select
                                    value={(editDeliveryFields.orderType ?? editingDelivery?.orderType ?? '') as string}
                                    onChange={e => setEditDeliveryFields(p => ({ ...p, orderType: e.target.value }))}
                                    className="w-full px-3 py-2.5 bg-charcoal-950 border border-charcoal-700 focus:border-brand-blue rounded-xl text-white font-bold text-sm outline-none cursor-pointer transition-colors"
                                    style={{ colorScheme: 'dark' }}
                                >
                                    <option value="Regular (Delivery)">Regular (Delivery)</option>
                                    <option value="Regular (Pickup)">Regular (Pickup)</option>
                                    <option value="Walk-in">Walk-in</option>
                                </select>
                            </div>
                            {/* Delivery Date — column N in the sheet */}
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Delivery Date <span className="text-brand-blue/50">(Col N)</span></p>
                                <input
                                    type="date"
                                    value={(editDeliveryFields.unplannedDate ?? editingDelivery?.unplannedDate ?? '') as string}
                                    onChange={e => setEditDeliveryFields(p => ({ ...p, unplannedDate: e.target.value }))}
                                    className="w-full px-3 py-2.5 bg-charcoal-950 border border-brand-blue/30 focus:border-brand-blue rounded-xl text-brand-blue font-bold text-sm outline-none cursor-pointer transition-colors"
                                    style={{ colorScheme: 'dark' }}
                                />
                            </div>
                            {/* Delivery Time — column O in the sheet */}
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Delivery Time <span className="text-brand-blue/50">(Col O)</span></p>
                                <select
                                    value={(editDeliveryFields.preferredTime ?? editingDelivery?.preferredTime ?? '') as string}
                                    onChange={e => setEditDeliveryFields(p => ({ ...p, preferredTime: e.target.value }))}
                                    className="w-full px-3 py-2.5 bg-charcoal-950 border border-brand-blue/30 focus:border-brand-blue rounded-xl text-brand-blue font-bold text-sm outline-none cursor-pointer transition-colors"
                                    style={{ colorScheme: 'dark' }}
                                >
                                    <option value="">* Select Time (required)</option>
                                    <option value="Pickup">Pickup</option>
                                    {deliveryTimes.map(dt => <option key={dt} value={dt}>{dt}</option>)}
                                </select>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Delivery Status</p>
                                <select 
                                    value={(editDeliveryFields.deliveryStatus ?? '') as string} 
                                    onChange={e => setEditDeliveryFields(p => ({ ...p, deliveryStatus: e.target.value }))} 
                                    className="w-full px-3 py-2.5 bg-charcoal-950 border border-charcoal-700 focus:border-brand-blue rounded-xl text-white font-bold text-sm outline-none cursor-pointer transition-colors"
                                    style={{ colorScheme: 'dark' }}
                                >
                                    <option value="Delivery Pending">Pending</option>
                                    <option value="Delivery Completed">Completed</option>
                                </select>
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Payment</p>
                                <select 
                                    value={(editDeliveryFields.paymentStatus ?? '') as string} 
                                    onChange={e => setEditDeliveryFields(p => ({ ...p, paymentStatus: e.target.value }))} 
                                    className="w-full px-3 py-2.5 bg-charcoal-950 border border-charcoal-700 focus:border-brand-blue rounded-xl text-white font-bold text-sm outline-none cursor-pointer transition-colors"
                                    style={{ colorScheme: 'dark' }}
                                >
                                    <option value="Paid">Paid</option>
                                    <option value="Credit">Credit / Unpaid</option>
                                </select>
                            </div>
                            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Driver</p>
                                    <select 
                                        value={(editDeliveryFields.driver ?? '') as string} 
                                        onChange={e => setEditDeliveryFields(p => ({ ...p, driver: e.target.value }))} 
                                        className="w-full px-3 py-2.5 bg-charcoal-950 border border-charcoal-700 focus:border-brand-blue rounded-xl text-white font-bold text-sm outline-none cursor-pointer transition-colors"
                                        style={{ colorScheme: 'dark' }}
                                    >
                                        <option value="">— Assign Driver —</option>
                                        {drivers.map(dr => <option key={dr} value={dr}>{dr}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1.5">Helper</p>
                                    <select 
                                        value={(editDeliveryFields.helper ?? '') as string} 
                                        onChange={e => setEditDeliveryFields(p => ({ ...p, helper: e.target.value }))} 
                                        className="w-full px-3 py-2.5 bg-charcoal-950 border border-charcoal-700 focus:border-brand-blue rounded-xl text-white font-bold text-sm outline-none cursor-pointer transition-colors"
                                        style={{ colorScheme: 'dark' }}
                                    >
                                        <option value="">— Assign Helper —</option>
                                        {drivers.map(dr => <option key={dr} value={dr}>{dr}</option>)}
                                    </select>
                                </div>
                            </div>
                        </div>
                        <div className="flex justify-end gap-3 mt-6 pt-5 border-t border-charcoal-700/50">
                            <button onClick={() => setEditingDelivery(null)} className="px-5 py-2.5 rounded-xl bg-charcoal-800 hover:bg-charcoal-700 border border-charcoal-600 text-slate-400 hover:text-white font-bold text-xs cursor-pointer tracking-wider transition-colors">Cancel</button>
                            <button onClick={handleSaveDeliveryEdit} disabled={editDeliverySaving} className={`px-6 py-2.5 rounded-xl bg-brand-blue hover:bg-brand-blue/90 text-white font-black text-xs cursor-pointer tracking-wider transition-all shadow-[0_0_15px_rgba(58,134,255,0.4)] ${editDeliverySaving ? 'opacity-60 cursor-not-allowed' : 'active:scale-95'}`}>{editDeliverySaving ? 'Saving…' : 'Save Changes'}</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
