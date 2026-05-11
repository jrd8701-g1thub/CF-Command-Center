'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
    ResponsiveContainer, PieChart, Pie, Cell,
    BarChart as ReBarChart, Bar, XAxis, YAxis, Tooltip,
    AreaChart, Area, CartesianGrid
} from 'recharts';

interface Sale {
    timestamp: string; transactionId: string; cid: string;
    customerName: string; itemName: string; quantity: string;
    unitPrice: string; totalPrice: string; orderType: string;
    paymentMethod: string; staffName: string;
    unplannedDate?: string; unplannedTime?: string;
}

function getWorkWeeks() {
    const weeks: { label: string; start: Date; end: Date }[] = [];
    const now = new Date();
    const base = new Date(now);
    base.setDate(now.getDate() - now.getDay() + 1 - 12 * 7);
    for (let w = 0; w < 24; w++) {
        const start = new Date(base); start.setDate(base.getDate() + w * 7);
        const end = new Date(start); end.setDate(start.getDate() + 6);
        const jan1 = new Date(start.getFullYear(), 0, 1);
        const wn = Math.ceil(((start.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
        const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        weeks.push({ label: `WW${wn} · ${f(start)} – ${f(end)}`, start, end });
    }
    return weeks;
}


const ICE_PACKAGING = ['1KG', '3KG', '5KG', '10KG', '25KG', '30KG', '45KG', 'Water'];
const deliveryTimes = ['06:00 AM', '07:00 AM', '08:00 AM', '09:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '01:00 PM', '02:00 PM', '03:00 PM', '04:00 PM', '05:00 PM', '06:00 PM', '07:00 PM', '08:00 PM', '09:00 PM', '10:00 PM', '11:00 PM'];
const COLORS = ['#00D2FF', '#7B61FF', '#FF6B6B', '#FFD93D', '#4ECB71', '#FF8A5C', '#A78BFA', '#00CEC9'];
const SKU_COLORS = ['#00D2FF', '#4ECB71', '#A78BFA', '#FFD93D', '#FF9500', '#FF4757', '#00CEC9', '#FDCB6E'];

// Returns today's date as YYYY-MM-DD in PH time (UTC+8)
function getTodayISO(): string {
    const d = new Date();
    const ph = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const y = ph.getUTCFullYear();
    const m = String(ph.getUTCMonth() + 1).padStart(2, '0');
    const day = String(ph.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function getPHDateISO(ts: string): string {
    if (!ts) return '';
    // Our API returns YYYY-MM-DD HH:mm:ss in PH time
    const datePart = ts.split(' ')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;

    // Fallback: Try parsing
    try {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
            // Adjust to PH if it's ISO/UTC
            const dPH = new Date(d.getTime() + (ts.includes('Z') || ts.includes('+') ? 8 * 60 * 60 * 1000 : 0));
            return dPH.getUTCFullYear() + '-' + String(dPH.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dPH.getUTCDate()).padStart(2, '0');
        }
    } catch { }
    return datePart;
}

// Simple inline bar chart (pure CSS, no external library needed)
function StackedBar({ items }: { items: { label: string; value: number; color: string }[] }) {
    const total = items.reduce((s, i) => s + Math.abs(i.value), 0);
    if (total === 0) return <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }} />;
    return (
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', gap: 1 }}>
            {items.filter(i => i.value > 0).map(i => (
                <div key={i.label} title={`${i.label}: ${i.value}`}
                    style={{ flex: i.value / total, background: i.color, minWidth: 3, transition: 'flex 0.6s ease' }} />
            ))}
        </div>
    );
}

export default function SalesHistoryPage() {
    const [sales, setSales] = useState<Sale[]>([]);
    const [customers, setCustomers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [selectedStatus, setSelectedStatus] = useState('');
    const [selectedSKU, setSelectedSKU] = useState('');
    const allWeeks = useMemo(() => getWorkWeeks(), []);
    const currentWeekIdx = useMemo(() => { const n = new Date(); return allWeeks.findIndex(w => n >= w.start && n <= w.end); }, [allWeeks]);
    const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
    const [periodOpen, setPeriodOpen] = useState(false);
    const periodRef = useRef<HTMLDivElement>(null);
    const [selectedDate, setSelectedDate] = useState<string>(() => getTodayISO());
    const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
    const [activeTab, setActiveTab] = useState<'table' | 'charts'>('table');
    const [skuSortConfig, setSkuSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null);
    const [heatmapMode, setHeatmapMode] = useState<'scheduled' | 'unscheduled' | 'both'>('both');
    const [editingSale, setEditingSale] = useState<Sale | null>(null);
    const [editFields, setEditFields] = useState({
        customerName: '', itemName: '', quantity: '', unitPrice: '',
        orderType: '', paymentMethod: '', deliveryDate: '', deliveryTime: ''
    });
    const [editSaving, setEditSaving] = useState(false);
    const [staffList, setStaffList] = useState<any[]>([]);
    const [adminPin, setAdminPin] = useState('');
    const [editPin, setEditPin] = useState('');

    const handleSaveEditSale = async () => {
        if (!editingSale) return;
        
        if (!editPin.trim()) { alert('Please enter a PIN'); return; }
        const user = staffList.find(s => s.pin === editPin);
        if (!user && editPin !== adminPin) { alert('Incorrect PIN'); return; }
        const loggedInUserForEdit = user ? user.name : 'Admin';

        setEditSaving(true);
        try {
            const body = {
                action: 'UPDATE_SALE_ROW',
                transactionId: editingSale.transactionId,
                itemName: editingSale.itemName,
                updates: editFields,
                staffName: loggedInUserForEdit
            };
            const res = await fetch('/api/sheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to update sale');
            }

            // Re-fetch sales
            const freshRes = await fetch('/api/sheet?tab=sales');
            const data = await freshRes.json();
            setSales(data.sales || []);
            setEditingSale(null);
        } catch (err: any) {
            alert('Error updating sale: ' + err.message);
        } finally {
            setEditSaving(false);
        }
    };


    useEffect(() => {
        async function fetchSales() {
            try {
                const [salesRes, custRes, staffRes, posRes] = await Promise.all([
                    fetch('/api/sheet?tab=sales'),
                    fetch('/api/sheet'),
                    fetch('/api/sheet?tab=staff'),
                    fetch('/api/sheet?tab=pos')
                ]);
                if (!salesRes.ok || !custRes.ok) throw new Error('Failed to fetch data');
                const salesData = await salesRes.json();
                const custData = await custRes.json();
                const staffData = await staffRes.json().catch(() => ({}));
                const posData = await posRes.json().catch(() => ({}));
                setSales(salesData.sales || []);
                setCustomers(custData.customers || []);
                setStaffList(staffData.employees || []);
                setAdminPin(posData.adminPin || '');
            } catch (err: unknown) { setError((err as Error).message); }
            finally { setLoading(false); }
        }
        fetchSales();
    }, []);

    useEffect(() => {
        const h = (e: MouseEvent) => { if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const months = Array.from(new Set(sales.map(s => {
        try {
            const ds = getPHDateISO(s.timestamp);
            const date = new Date(ds + 'T12:00:00Z');
            return date.toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        } catch { return 'Unknown'; }
    }))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    const clients = Array.from(new Set(sales.map(s => s.customerName).filter(Boolean))).sort();
    const statuses = Array.from(new Set(sales.map(s => s.paymentMethod).filter(Boolean))).sort();
    const skus = Array.from(new Set(sales.map(s => s.itemName).filter(Boolean))).sort();

    const weeksWithSales = useMemo(() => {
        return [...allWeeks.map((w, i) => ({ w, i }))]
            .filter(({ i }) => sales.some(sale => {
                try {
                    const ds = getPHDateISO(sale.timestamp);
                    const d = new Date(ds + 'T12:00:00Z').getTime();
                    return d >= allWeeks[i].start.getTime() && d <= allWeeks[i].end.getTime();
                } catch { return false; }
            }))
            .reverse();
    }, [sales, allWeeks]);

    const groupedPeriods = useMemo(() => {
        return months.map(mStr => {
            const weeksInMonth = weeksWithSales.filter(({ w }) => {
                const mst = w.start.toLocaleString('default', { month: 'long', year: 'numeric' });
                const men = w.end.toLocaleString('default', { month: 'long', year: 'numeric' });
                return mst === mStr || men === mStr;
            });
            const uniqueWeeks = Array.from(new Map(weeksInMonth.map(item => [item.i, item])).values());
            return { month: mStr, weeks: uniqueWeeks };
        });
    }, [months, weeksWithSales]);

    const filteredSales = sales.filter(s => {
        let date: Date;
        try { date = new Date(s.timestamp.split(',')[0] || s.timestamp.split(' ')[0]); }
        catch { date = new Date(); }
        const m = date.toLocaleString('default', { month: 'long', year: 'numeric' });
        const y = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const isoDate = `${y}-${mm}-${dd}`;

        const periodFilterActive = selectedMonths.length > 0 || selectedWeeks.length > 0;
        const periodMatch = !periodFilterActive || selectedMonths.includes(m) || selectedWeeks.some(wi => {
            try { return date >= allWeeks[wi].start && date <= allWeeks[wi].end; } catch { return false; }
        });

        const dateMatch = !selectedDate || isoDate === selectedDate;
        const clientMatch = !selectedClient || s.customerName === selectedClient;
        const statusMatch = !selectedStatus || s.paymentMethod === selectedStatus;
        const skuMatch = !selectedSKU || s.itemName === selectedSKU;

        return periodMatch && dateMatch && clientMatch && statusMatch && skuMatch;
    });

    const totalUnits = filteredSales.reduce((sum, s) => sum + (parseFloat(s.quantity) || 0), 0);
    const totalRevenue = filteredSales.reduce((sum, s) => sum + (parseFloat(s.totalPrice) || 0), 0);
    const paidCount = filteredSales.filter(s => s.paymentMethod === 'Paid').length;
    const paidRevenue = filteredSales.filter(s => s.paymentMethod === 'Paid').reduce((sum, s) => sum + (parseFloat(s.totalPrice) || 0), 0);
    const creditCount = filteredSales.filter(s => s.paymentMethod !== 'Paid').length;
    const creditRevenue = filteredSales.filter(s => s.paymentMethod !== 'Paid').reduce((sum, s) => sum + (parseFloat(s.totalPrice) || 0), 0);
    const hasFilters = !!selectedDate || selectedMonths.length > 0 || !!selectedClient || !!selectedStatus || !!selectedSKU || selectedWeeks.length > 0;

    const salesMix = useMemo(() => {
        const counts: Record<string, number> = {};
        ICE_PACKAGING.forEach(p => counts[p] = 0);
        filteredSales.forEach((s: Sale) => {
            const item = s.itemName || '';
            const qty = parseFloat(s.quantity?.toString()) || 0;
            ICE_PACKAGING.forEach(p => {
                if (item.toLowerCase().includes(p.toLowerCase())) {
                    counts[p] += qty;
                }
            });
        });
        return counts;
    }, [filteredSales]);

    const totalSalesMix = useMemo(() => Object.values(salesMix).reduce((a, b) => a + b, 0), [salesMix]);

    // SKU breakdown for charts
    const skuBreakdown = useMemo(() => {
        const map: Record<string, { units: number; revenue: number }> = {};
        filteredSales.forEach(s => {
            if (!map[s.itemName]) map[s.itemName] = { units: 0, revenue: 0 };
            map[s.itemName].units += parseFloat(s.quantity) || 0;
            map[s.itemName].revenue += parseFloat(s.totalPrice) || 0;
        });
        return Object.entries(map)
            .map(([sku, d], i) => ({ label: sku, value: Math.round(d.units), revenue: Math.round(d.revenue), color: SKU_COLORS[i % SKU_COLORS.length] }))
            .sort((a, b) => b.value - a.value);
    }, [filteredSales]);

    const topCustomers = useMemo(() => {
        const map: Record<string, number> = {};
        filteredSales.forEach(s => {
            const name = s.customerName?.trim() || 'Unknown';
            map[name] = (map[name] || 0) + (parseFloat(s.totalPrice) || 0);
        });
        return Object.entries(map)
            .map(([label, revenue], i) => ({ label, value: Math.round(revenue), revenue, color: SKU_COLORS[i % SKU_COLORS.length] }))
            .sort((a, b) => b.revenue - a.revenue)
            .slice(0, 10); // Top 10
    }, [filteredSales]);

    const revenueTrend = useMemo(() => {
        const map: Record<string, number> = {};
        filteredSales.forEach(s => {
            const date = getPHDateISO(s.timestamp);
            if (!date) return;
            map[date] = (map[date] || 0) + (parseFloat(s.totalPrice) || 0);
        });
        return Object.entries(map)
            .map(([date, revenue]) => ({ date, revenue: Math.round(revenue) }))
            .sort((a, b) => a.date.localeCompare(b.date));
    }, [filteredSales]);

    const deliveryHeatmap = useMemo(() => {
        const parseHourFromTimeStr = (timeStr: string): number => {
            // Parses "10:00 AM", "8:00 PM", "6:00:00 AM" etc.
            const m = timeStr.match(/(\d{1,2}):\d{2}(?::\d{2})?\s*([AP]M)/i);
            if (!m) return -1;
            let h = parseInt(m[1]);
            const ampm = m[2].toUpperCase();
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            return h;
        };

        const dayMap: Record<string, number> = { 'sun': 0, 'mon': 1, 'tue': 2, 'wed': 3, 'thu': 4, 'fri': 5, 'sat': 6 };

        const buildMap = (filter: 'scheduled' | 'unscheduled' | 'both') => {
            const map = new Map<string, number>();
            let maxVal = 0;

            const incrementMap = (day: number, hour: number) => {
                if (hour >= 6 && hour <= 21 && day >= 0 && day <= 6) {
                    const key = `${day}-${hour}`;
                    const next = (map.get(key) || 0) + 1;
                    map.set(key, next);
                    if (next > maxVal) maxVal = next;
                }
            };

            // 1. Calculate SCHEDULED load from permanent customer database (Baseline)
            if (filter === 'scheduled' || filter === 'both') {
                customers.forEach(c => {
                    const days = String(c.details?.['Delivery Sched'] || c.details?.['deliverysched'] || '').toLowerCase();
                    const rawTime = String(c.details?.['Delivery Time'] || c.details?.['deliverytime'] || '').toLowerCase();
                    if (!days || !rawTime) return;

                    const hour = parseHourFromTimeStr(rawTime);
                    if (hour === -1) return;

                    Object.keys(dayMap).forEach(d => {
                        if (days.includes(d)) incrementMap(dayMap[d], hour);
                    });
                });
            }

            // 2. Calculate WALK-IN / UNSCHEDULED load from historical Sales transactions
            if (filter === 'unscheduled' || filter === 'both') {
                filteredSales.forEach(s => {
                    const ot = s.orderType.toLowerCase();
                    if (!ot.includes('delivery')) return;

                    const isScheduled = ot.includes('regular') || ot.includes('scheduled');
                    // Skip scheduled orders in sales so we don't double count if 'both' is selected
                    if (isScheduled) return;

                    let date: Date;
                    try { date = new Date(s.timestamp.split(',')[0] || s.timestamp.split(' ')[0]); }
                    catch { return; }

                    let day = date.getDay();
                    if (s.unplannedDate && s.unplannedDate.match(/\d{4}-\d{2}-\d{2}/)) {
                        try { day = new Date(s.unplannedDate + 'T12:00:00').getDay(); } catch { }
                    } else {
                        const dayMatch = s.orderType.match(/Delivery:\s*(\d{4}-\d{2}-\d{2})/i);
                        if (dayMatch) {
                            try { day = new Date(dayMatch[1] + 'T12:00:00').getDay(); } catch { }
                        }
                    }

                    let hour = -1;
                    if (s.unplannedTime && s.unplannedTime.trim()) {
                        hour = parseHourFromTimeStr(s.unplannedTime.trim());
                    }
                    if (hour === -1) {
                        const timeMatch = s.orderType.match(/@\s*(\d{1,2}):\d{2}\s*([AP]M)/i);
                        if (timeMatch) {
                            let h = parseInt(timeMatch[1]);
                            const ampm = timeMatch[2].toUpperCase();
                            if (ampm === 'PM' && h < 12) h += 12;
                            if (ampm === 'AM' && h === 12) h = 0;
                            hour = h;
                        }
                    }
                    if (hour === -1) {
                        try { hour = new Date(s.timestamp).getHours(); } catch { hour = 12; }
                    }

                    incrementMap(day, hour);
                });
            }
            return { map, maxVal: Math.max(maxVal, 1) };
        };
        return buildMap(heatmapMode);
    }, [filteredSales, customers, heatmapMode]);

    const cardClass = "bg-charcoal-800 border border-white/5 rounded-2xl shadow-xl";
    const lblClass = "text-slate-400 text-[10px] font-bold tracking-widest uppercase";
    const inpClass = "px-3 py-2 bg-charcoal-900 border border-white/10 rounded-lg text-white text-sm font-semibold outline-none focus:border-brand-blue appearance-none transition-colors";

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-[50vh] gap-4">
            <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            <div className="w-10 h-10 rounded-full border-4 border-brand-blue/20 border-t-brand-blue animate-[spin_1s_linear_infinite]" />
            <span className={lblClass}>Loading Sales Records...</span>
        </div>
    );
    if (error) return <div style={{ padding: '2rem', color: '#FF6B6B', textAlign: 'center', fontWeight: 'bold' }}>ERROR: {error}</div>;

    return (
        <div className="max-w-[1400px] mx-auto animate-in fade-in duration-300">
            {/* Header */}
            <div className="flex justify-between items-start mb-6">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tight m-0 bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Sales Records</h2>
                    <p className={`${lblClass} mt-1 text-[11px] text-brand-blue`}>● Transaction Ledger & History</p>
                </div>
                <div className="flex gap-3 items-center">
                    {/* Tab switcher */}
                    <div className="flex bg-charcoal-900 rounded-lg p-1 border border-white/5">
                        {(['table', 'charts'] as const).map(t => (
                            <button key={t} onClick={() => setActiveTab(t)}
                                className={`px-4 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-all duration-200 ${activeTab === t ? 'bg-brand-blue/15 text-brand-blue' : 'text-slate-400 hover:text-white'}`}>
                                {t === 'table' ? '☰ Table' : '📊 Charts'}
                            </button>
                        ))}
                    </div>
                    {hasFilters && (
                        <button onClick={() => { setSelectedDate(''); setSelectedMonths([]); setSelectedClient(''); setSelectedStatus(''); setSelectedSKU(''); setSelectedWeeks([]); }}
                            className="px-4 py-1.5 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-[11px] font-bold hover:bg-red-500/20 transition-colors">
                            ✕ Reset
                        </button>
                    )}
                </div>
            </div>

            {/* Sales Mix Card */}
            <div className={`${cardClass} p-4 sm:p-5 mb-5`}>
                <div className="flex justify-between items-center mb-3">
                    <p className={lblClass}>Sales Mix Breakdown</p>
                    <span className="text-[10px] text-slate-400 font-bold">{filteredSales.length} Total Records</span>
                </div>
                <div className="mb-4">
                    <StackedBar items={ICE_PACKAGING.map((p, i) => ({ label: p, value: salesMix[p], color: COLORS[i] }))} />
                </div>
                <div className="flex gap-y-3 gap-x-6 flex-wrap">
                    {ICE_PACKAGING.map((p, i) => {
                        const val = salesMix[p];
                        const pct = totalSalesMix > 0 ? (val / totalSalesMix) * 100 : 0;
                        if (val === 0) return null;
                        return (
                            <div key={p} className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-sm" style={{ background: COLORS[i] }} />
                                <span className="text-[11px] text-slate-300 font-semibold">{p}:</span>
                                <span className="text-[11px] text-white font-bold">{val}</span>
                                <span className="text-[10px] text-slate-500 font-semibold">({pct.toFixed(1)}%)</span>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                    { label: 'Transactions', value: filteredSales.length, color: '#00D2FF', icon: '📋' },
                    { label: 'Total Units', value: totalUnits, color: '#A78BFA', icon: '📦' },
                ].map((kpi) => (
                    <div key={kpi.label} className={`${cardClass} p-5 relative overflow-hidden group`}>
                        <div className="absolute top-0 left-0 right-0 h-1 transition-all duration-300 group-hover:h-1.5" style={{ background: kpi.color }} />
                        <div className="flex justify-between items-start">
                            <div className="flex-1">
                                <p className={lblClass}>{kpi.label}</p>
                                <p className="font-black text-3xl leading-tight mt-1 tabular-nums" style={{ color: kpi.color }}>
                                    {kpi.value.toLocaleString()}
                                </p>
                            </div>
                            <span className="text-2xl opacity-60 grayscale group-hover:grayscale-0 transition-all">{kpi.icon}</span>
                        </div>
                    </div>
                ))}
                {/* Revenue card — custom layout */}
                <div className={`${cardClass} p-5 relative overflow-hidden group`}>
                    <div className="absolute top-0 left-0 right-0 h-1 bg-brand-green transition-all duration-300 group-hover:h-1.5" />
                    <div className="flex justify-between items-start mb-2">
                        <p className={lblClass}>Revenue</p>
                        <span className="text-2xl opacity-60 grayscale group-hover:grayscale-0 transition-all">💰</span>
                    </div>
                    <p className="font-black text-2xl text-brand-green tabular-nums mb-2">
                        ₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}
                    </p>
                    <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center px-2 py-1 rounded bg-brand-blue/10">
                            <span className="text-[9px] font-bold text-brand-blue">✓ Paid ({paidCount})</span>
                            <span className="text-[10px] font-black text-brand-blue">₱{paidRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span>
                        </div>
                        <div className="flex justify-between items-center px-2 py-1 rounded bg-red-500/10">
                            <span className="text-[9px] font-bold text-red-500">⊘ Credit ({creditCount})</span>
                            <span className="text-[10px] font-black text-red-500">₱{creditRevenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Filter Panel */}
            <div className={`${cardClass} p-5 mb-5 relative z-20`}>
                <p className={`${lblClass} mb-4`}>Filters</p>
                <div className="grid grid-cols-4 gap-4 items-end">

                    {/* Date & Period Dropdown (Moved to Layer 1 / Leftmost) */}
                    <div ref={periodRef} className="relative">
                        <p className={`${lblClass} mb-2`}>Calendar</p>
                        <button onClick={() => setPeriodOpen(o => !o)} className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-bold outline-none w-full transition-all duration-150 ${selectedDate ? 'bg-brand-blue/10 border border-brand-blue/30 text-brand-blue' : 'bg-charcoal-900 border border-white/5 text-white hover:bg-charcoal-800'}`}>
                            {selectedDate ? selectedDate : (selectedMonths.length === 0 && selectedWeeks.length === 0 ? 'All Periods' : `${selectedMonths.length + selectedWeeks.length} Selected`)}
                            <span className={`ml-auto text-[10px] transition-transform duration-200 ${periodOpen ? 'rotate-180' : ''}`}>▾</span>
                        </button>
                        {periodOpen && (
                            <div className="absolute left-0 top-[100%] mt-2 z-50 bg-charcoal-900 border border-white/10 rounded-xl p-3 w-[280px] max-h-[380px] overflow-y-auto shadow-2xl animate-in slide-in-from-top-2 duration-200">
                                <div className="flex gap-2 mb-3 pb-2 border-b border-white/10">
                                    <button onClick={() => { setSelectedMonths(months); setSelectedWeeks([]); setSelectedDate(''); }} className="text-[11px] text-brand-blue font-bold hover:underline">Select All</button>
                                    <span className="text-white/20">|</span>
                                    <button onClick={() => { setSelectedMonths([]); setSelectedWeeks([]); setExpandedMonths([]); setSelectedDate(''); }} className="text-[11px] font-bold text-red-400 hover:text-red-300">Clear</button>
                                </div>

                                {/* Specific Date Selection inside Dropdown */}
                                <div className="mb-3 pb-3 border-b border-white/10 border-dashed">
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setExpandedMonths(prev => prev.includes('specific_date') ? prev.filter(m => m !== 'specific_date') : [...prev, 'specific_date'])} className="text-white/50 hover:text-white transition-colors w-5 text-center">
                                            {expandedMonths.includes('specific_date') ? '▾' : '▸'}
                                        </button>
                                        <span onClick={() => {
                                            setExpandedMonths(prev => prev.includes('specific_date') ? prev.filter(m => m !== 'specific_date') : [...prev, 'specific_date']);
                                            if (!selectedDate) setSelectedDate(getTodayISO());
                                        }} className={`text-sm font-bold cursor-pointer ${selectedDate ? 'text-white' : 'text-slate-400 hover:text-slate-300'}`}>
                                            Specific Date
                                        </span>
                                    </div>
                                    {expandedMonths.includes('specific_date') && (
                                        <div className="pl-9 mt-2">
                                            <input
                                                type="date"
                                                value={selectedDate}
                                                onChange={e => { setSelectedDate(e.target.value); setSelectedMonths([]); setSelectedWeeks([]); }}
                                                className="w-full px-3 py-2 bg-charcoal-800 border border-brand-blue/30 rounded-lg text-brand-blue font-bold text-sm outline-none cursor-pointer"
                                                style={{ colorScheme: 'dark' }}
                                            />
                                        </div>
                                    )}
                                </div>

                                {groupedPeriods.map(g => {
                                    const isMonthSelected = selectedMonths.includes(g.month) && !selectedDate;
                                    const monthWeeks = g.weeks;
                                    const selectedCount = !selectedDate ? monthWeeks.filter(w => selectedWeeks.includes(w.i)).length : 0;
                                    const isPartiallySelected = !isMonthSelected && selectedCount > 0 && selectedCount < monthWeeks.length;
                                    const isFullySelected = isMonthSelected || (selectedCount === monthWeeks.length && monthWeeks.length > 0);
                                    const isExpanded = expandedMonths.includes(g.month);

                                    return (
                                        <div key={g.month} className="mb-2">
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => setExpandedMonths(prev => prev.includes(g.month) ? prev.filter(m => m !== g.month) : [...prev, g.month])} className="text-white/50 hover:text-white transition-colors w-5 text-center">
                                                    {isExpanded ? '▾' : '▸'}
                                                </button>
                                                <input
                                                    type="checkbox"
                                                    checked={isFullySelected}
                                                    ref={el => { if (el) el.indeterminate = isPartiallySelected; }}
                                                    onChange={() => {
                                                        setSelectedDate('');
                                                        if (isFullySelected) {
                                                            setSelectedMonths(m => m.filter(x => x !== g.month));
                                                            setSelectedWeeks(w => w.filter(x => !monthWeeks.some(mw => mw.i === x)));
                                                        } else {
                                                            setSelectedMonths(m => Array.from(new Set([...m, g.month])));
                                                            setSelectedWeeks(w => w.filter(x => !monthWeeks.some(mw => mw.i === x)));
                                                        }
                                                    }}
                                                    className="w-3.5 h-3.5 accent-brand-blue cursor-pointer"
                                                />
                                                <span onClick={() => setExpandedMonths(prev => prev.includes(g.month) ? prev.filter(m => m !== g.month) : [...prev, g.month])} className={`text-sm font-bold cursor-pointer transition-colors ${isFullySelected || isPartiallySelected ? 'text-white' : 'text-slate-400 hover:text-slate-300'}`}>
                                                    {g.month}
                                                </span>
                                            </div>

                                            {isExpanded && (
                                                <div className="pl-9 mt-1.5 flex flex-col gap-1.5 border-l border-white/10 border-dashed ml-2.5 pb-1">
                                                    {monthWeeks.map(({ w, i }) => {
                                                        const isWeekSelected = isFullySelected || selectedWeeks.includes(i);
                                                        return (
                                                            <label key={i} className={`flex items-center gap-2 ${isFullySelected ? 'cursor-default' : 'cursor-pointer hover:bg-white/5'} px-1 py-0.5 rounded`}>
                                                                <input
                                                                    type="checkbox"
                                                                    checked={isWeekSelected}
                                                                    disabled={isFullySelected}
                                                                    onChange={() => {
                                                                        setSelectedDate('');
                                                                        if (isFullySelected) return;
                                                                        setSelectedWeeks(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);
                                                                    }}
                                                                    className="w-3 h-3 accent-brand-blue"
                                                                />
                                                                <span className={`text-[11px] ${isWeekSelected ? 'font-bold text-brand-blue' : 'font-medium text-slate-400'}`}>
                                                                    {w.label} {i === currentWeekIdx ? ' ← current' : ''}
                                                                </span>
                                                            </label>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Client Selection */}
                    <div>
                        <p className={`${lblClass} mb-2`}>Client</p>
                        <select value={selectedClient} onChange={e => setSelectedClient(e.target.value)} className={inpClass} style={{ colorScheme: 'dark' }}>
                            <option value="" className="text-slate-400 bg-charcoal-900">All Clients</option>
                            {clients.map(c => <option key={c} value={c} className="text-white bg-charcoal-900">{c}</option>)}
                        </select>
                    </div>

                    {/* Payment Status Selection */}
                    <div>
                        <p className={`${lblClass} mb-2`}>Payment Status</p>
                        <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className={inpClass} style={{ colorScheme: 'dark' }}>
                            <option value="" className="text-slate-400 bg-charcoal-900">All Statuses</option>
                            {statuses.map(s => <option key={s} value={s} className="text-white bg-charcoal-900">{s}</option>)}
                        </select>
                    </div>

                    {/* SKU Selection */}
                    <div>
                        <p className={`text-[10px] font-bold tracking-widest uppercase mb-2 ${selectedSKU ? 'text-brand-purple' : 'text-slate-400'}`}>SKU / Product</p>
                        <select value={selectedSKU} onChange={e => setSelectedSKU(e.target.value)} className={`${inpClass} ${selectedSKU ? 'border-brand-purple/40 text-brand-purple' : ''}`} style={{ colorScheme: 'dark' }}>
                            <option value="" className="text-slate-400 bg-charcoal-900">All SKUs</option>
                            {skus.map(s => <option key={s} value={s} className="text-white bg-charcoal-900">{s}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* ── CHARTS VIEW ── */}
            {activeTab === 'charts' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-5 animate-in slide-in-from-bottom-4 duration-300">
                    {/* Revenue Trend - Full Width on Top */}
                    <div className={`${cardClass} p-5 lg:col-span-3 min-h-[300px]`}>
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <p className={`${lblClass} text-[10px]`}>Revenue Performance Trend</p>
                                <p className="text-[10px] text-slate-500 italic">Financial trajectory over the selected period</p>
                            </div>
                            <div className="text-right">
                                <p className="text-sm font-black text-brand-green">₱{totalRevenue.toLocaleString()}</p>
                                <p className="text-[8px] text-slate-500 uppercase tracking-tighter">Total Period Revenue</p>
                            </div>
                        </div>
                        <div className="h-[180px] w-full">
                            {revenueTrend.length < 2 ? (
                                <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">Insufficient data for trend line</div>
                            ) : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={revenueTrend}>
                                        <defs>
                                            <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#4ECB71" stopOpacity={0.3} />
                                                <stop offset="95%" stopColor="#4ECB71" stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                                        <XAxis
                                            dataKey="date"
                                            stroke="rgba(255,255,255,0.3)"
                                            fontSize={9}
                                            tickFormatter={(str) => {
                                                const d = new Date(str);
                                                return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                                            }}
                                        />
                                        <YAxis stroke="rgba(255,255,255,0.3)" fontSize={9} tickFormatter={(val) => `₱${val >= 1000 ? (val / 1000).toFixed(0) + 'k' : val}`} />
                                        <Tooltip
                                            contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                                            itemStyle={{ color: '#4ECB71', fontWeight: 'bold' }}
                                        />
                                        <Area type="monotone" dataKey="revenue" stroke="#4ECB71" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                        {/* Units Breakdown - Donut */}
                        <div className={`${cardClass} p-4 flex flex-col h-[360px]`}>
                            <p className={`${lblClass} text-[10px] mb-1`}>Sales Mix (Units)</p>
                            <p className="text-[9px] text-slate-500 mb-4 italic">Volume distribution by SKU</p>
                            <div className="flex flex-row items-center gap-4 flex-1 overflow-hidden">
                                <div className="h-[200px] w-[200px] shrink-0">
                            {skuBreakdown.length === 0 ? <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">No data</div> : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={skuBreakdown}
                                            innerRadius={45}
                                            outerRadius={65}
                                            paddingAngle={5}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {skuBreakdown.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip
                                            contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                                        />
                                    </PieChart>
                                </ResponsiveContainer>
                            )}
                                </div>
                                <div className="flex-1 overflow-y-auto pr-1 max-h-[260px] custom-scrollbar">
                                    {skuBreakdown.map(d => (
                                        <div key={d.label} className="flex items-center gap-2 mb-2 last:mb-0">
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                                            <div className="flex-1">
                                                <p className="text-[10px] text-slate-300 font-bold truncate leading-tight">{d.label}</p>
                                                <p className="text-[10px] font-black text-white">{d.value.toLocaleString()} units</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Top Customers - Horizontal Bar */}
                        <div className={`${cardClass} p-4 flex flex-col h-[360px]`}>
                            <p className={`${lblClass} text-[10px] mb-1`}>Top 10 Customers</p>
                            <p className="text-[9px] text-slate-500 mb-3 italic">Highest revenue contributors</p>
                            <div className="flex-1 min-h-[240px]">
                            {topCustomers.length === 0 ? <div className="h-full flex items-center justify-center text-slate-500 text-xs italic">No data</div> : (
                                <ResponsiveContainer width="100%" height="100%">
                                    <ReBarChart data={topCustomers} layout="vertical" margin={{ left: -10, right: 20 }}>
                                        <XAxis type="number" hide />
                                        <YAxis
                                            dataKey="label"
                                            type="category"
                                            width={80}
                                            fontSize={9}
                                            stroke="rgba(255,255,255,0.3)"
                                            tickFormatter={(str) => str.length > 10 ? str.substring(0, 8) + '..' : str}
                                        />
                                        <Tooltip
                                            cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                            contentStyle={{ background: '#1a1f2e', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px', fontSize: '10px' }}
                                            formatter={(val: number) => [`₱${val.toLocaleString()}`, 'Revenue']}
                                        />
                                        <Bar dataKey="revenue" radius={[0, 4, 4, 0]} barSize={20}>
                                            {topCustomers.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Bar>
                                    </ReBarChart>
                                </ResponsiveContainer>
                            )}
                        </div>
                    </div>

                        {/* Delivery Heatmap */}
                        <div className={`${cardClass} p-4 pb-4 flex flex-col h-[360px]`}>
                            <p className={`${lblClass} text-[10px] mb-1`}>Delivery Heatmap</p>
                            <p className="text-[9px] text-slate-500 mb-4 italic">Load distribution by time and day</p>
                            <div className="flex-1 flex flex-col min-h-[240px] overflow-y-auto pr-1 custom-scrollbar">
                                {deliveryHeatmap.maxVal === 1 && deliveryHeatmap.map.size === 0 ? <p className="text-slate-500 italic text-center p-5">No delivery data</p> : (
                                <div className="flex flex-col gap-1.5">
                                    {/* 3-way toggle */}
                                    <div className="flex gap-1.5 mb-2.5 bg-black/20 p-1 rounded-lg self-start">
                                        {(['both', 'scheduled', 'unscheduled'] as const).map(mode => (
                                            <button key={mode} onClick={() => setHeatmapMode(mode)}
                                                className={`px-3.5 py-1 rounded-md text-[10px] font-bold tracking-wider uppercase transition-all duration-150 ${heatmapMode === mode ? (mode === 'scheduled' ? 'bg-brand-blue/20 text-brand-blue' : mode === 'unscheduled' ? 'bg-brand-purple/20 text-brand-purple' : 'bg-brand-yellow/20 text-brand-yellow') : 'bg-transparent text-slate-500 hover:text-slate-300'}`}>
                                                {mode === 'both' ? '⦿ All' : mode === 'scheduled' ? '📅 Scheduled' : '🚚 Walk-in'}
                                            </button>
                                        ))}
                                    </div>

                                    <div className="grid grid-cols-[36px_repeat(7,1fr)] gap-1 items-center border-b border-white/5 pb-1.5">
                                        <div />
                                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => <div key={d} className="text-[9px] text-slate-400 text-center font-bold">{d}</div>)}
                                    </div>

                                    {Array.from({ length: 16 }).map((_, i) => {
                                        const h = i + 6;
                                        const label = h > 12 ? `${h - 12} PM` : h === 12 ? '12 PM' : `${h} AM`;
                                        return (
                                            <div key={h} className="grid grid-cols-[36px_repeat(7,1fr)] gap-1 items-center h-[18px]">
                                                <div className="text-[9px] text-slate-400 text-right pr-1 font-bold">{label}</div>
                                                {Array.from({ length: 7 }).map((_, d) => {
                                                    const val = deliveryHeatmap.map.get(`${d}-${h}`) || 0;
                                                    const ratio = val / deliveryHeatmap.maxVal;
                                                    const isBad = ratio >= 0.6;
                                                    const isMid = ratio >= 0.2;
                                                    // Yellow=Good (low), Blue=Average (mid), Red=Bad (high)
                                                    const bg = val === 0 ? 'rgba(255,255,255,0.03)'
                                                        : isBad ? `rgba(255, 65, 87, ${0.4 + ratio * 0.6})`
                                                            : isMid ? `rgba(58, 130, 247, ${0.4 + ratio * 0.5})`
                                                                : `rgba(255, 217, 61, ${0.5 + ratio * 0.5})`;

                                                    return (
                                                        <div
                                                            key={`${d}-${h}`}
                                                            title={`${val} deliveries on ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]} at ${label}`}
                                                            className="h-full rounded flex items-center justify-center text-[9px] font-black cursor-pointer hover:scale-110 transition-transform duration-150"
                                                            style={{ background: bg, color: val > 0 ? '#fff' : 'transparent' }}>
                                                            {val > 0 ? val : ''}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })}
                                    <div className="mt-3 flex gap-4 justify-center text-[9px] font-bold text-slate-400 bg-black/20 px-3 py-1.5 rounded-full self-center">
                                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-[rgba(255,217,61,0.9)] rounded-sm" /> Good (available)</div>
                                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-[rgba(58,130,247,0.9)] rounded-sm" /> Average</div>
                                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 bg-[rgba(255,65,87,0.9)] rounded-sm" /> Bad (crowded)</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>


                {/* SKU Summary table - Full Width */}
                <div className={`${cardClass} overflow-hidden lg:col-span-3`}>
                    <div className="px-5 py-3 border-b border-white/5 bg-charcoal-900/50">
                            <span className={lblClass}>SKU Performance Summary</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse min-w-[500px]">
                                <thead>
                                    <tr className="bg-black/25">
                                        {['SKU', 'Units Sold', 'Revenue', '% of Units', '% of Revenue'].map(h => (
                                            <th key={h}
                                                onClick={() => {
                                                    const key = h === 'SKU' ? 'label' : h === 'Units Sold' ? 'value' : h === 'Revenue' ? 'revenue' : h === '% of Units' ? 'pctUnits' : 'pctRev';
                                                    if (skuSortConfig?.key === key) setSkuSortConfig({ key, direction: skuSortConfig.direction === 'asc' ? 'desc' : 'asc' });
                                                    else setSkuSortConfig({ key, direction: 'desc' });
                                                }}
                                                className={`${lblClass} text-[8px] px-4 py-2 ${h === 'SKU' ? 'text-left' : 'text-right'} border-b border-white/5 cursor-pointer whitespace-nowrap hover:bg-white/5 transition-colors`}>
                                                {h}
                                                {skuSortConfig?.key === (h === 'SKU' ? 'label' : h === 'Units Sold' ? 'value' : h === 'Revenue' ? 'revenue' : h === '% of Units' ? 'pctUnits' : 'pctRev') && (
                                                    <span className="ml-1 text-brand-blue">{skuSortConfig.direction === 'asc' ? '▲' : '▼'}</span>
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[...skuBreakdown]
                                        .map(d => ({
                                            ...d,
                                            pctUnits: totalUnits > 0 ? (d.value / totalUnits * 100) : 0,
                                            pctRev: totalRevenue > 0 ? (d.revenue / totalRevenue * 100) : 0,
                                            avgPrice: d.value > 0 ? d.revenue / d.value : 0
                                        }))
                                        .sort((a, b: any) => {
                                            if (!skuSortConfig) return 0;
                                            const { key, direction } = skuSortConfig;
                                            if ((a as any)[key] < b[key]) return direction === 'asc' ? -1 : 1;
                                            if ((a as any)[key] > b[key]) return direction === 'asc' ? 1 : -1;
                                            return 0;
                                        })
                                        .map((d) => (
                                            <tr key={d.label} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-2 h-2 rounded-sm" style={{ background: d.color }} />
                                                        <span className="font-bold text-white text-xs whitespace-nowrap">{d.label}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5 text-right font-black text-sm" style={{ color: d.color }}>{d.value.toLocaleString()}</td>
                                                <td className="px-4 py-2.5 text-right font-black text-sm text-brand-green">₱{d.revenue.toLocaleString('en-PH', { minimumFractionDigits: 0 })}</td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-1.5 justify-end">
                                                        <div className="w-12 bg-white/5 rounded h-1.5 overflow-hidden">
                                                            <div className="h-full rounded" style={{ width: `${d.pctUnits}%`, background: d.color }} />
                                                        </div>
                                                        <span className="text-[10px] font-bold w-8 text-right" style={{ color: d.color }}>{d.pctUnits.toFixed(1)}%</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <div className="flex items-center gap-1.5 justify-end">
                                                        <div className="w-12 bg-white/5 rounded h-1.5 overflow-hidden">
                                                            <div className="h-full rounded bg-brand-green" style={{ width: `${d.pctRev}%` }} />
                                                        </div>
                                                        <span className="text-[10px] font-bold w-8 text-right text-brand-green">{d.pctRev.toFixed(1)}%</span>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ── TABLE VIEW ── */}
            {activeTab === 'table' && (
                <div className={`${cardClass} overflow-hidden animate-in slide-in-from-bottom-4 duration-300`}>
                    <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-charcoal-900/50">
                        <p className={lblClass}>Transaction Ledger</p>
                        <span className="text-[10px] text-white/25">{filteredSales.length} records</span>
                    </div>
                    <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
                        <table className="w-full border-collapse min-w-[900px]">
                            <thead>
                                <tr className="bg-black/30 sticky top-0 z-10 backdrop-blur-sm">
                                    {['WW', 'Timestamp', 'Reference', 'Client', 'Type', 'Fulfillment', 'SKU', 'Units', 'Revenue', 'Status'].map(h => (
                                        <th key={h} className={`${lblClass} text-[8px] px-4 py-3 ${['WW', 'Units', 'Revenue', 'Status'].includes(h) ? 'text-center' : 'text-left'} border-b border-white/5 whitespace-nowrap`}>{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredSales.length === 0 ? (
                                    <tr><td colSpan={10} className="p-16 text-center text-white/20 italic text-sm">No transactions matching filters.</td></tr>
                                ) : filteredSales.map((sale, idx) => {
                                    const saleDate = new Date(sale.timestamp.split(',')[0]);
                                    const jan1 = new Date(saleDate.getFullYear(), 0, 1);
                                    const ww = Math.ceil(((saleDate.getTime() - jan1.getTime()) / 86400000 + jan1.getDay() + 1) / 7);
                                    const isCurrentWW = allWeeks[currentWeekIdx] && saleDate >= allWeeks[currentWeekIdx].start && saleDate <= allWeeks[currentWeekIdx].end;
                                    const skuColor = SKU_COLORS[skus.indexOf(sale.itemName) % SKU_COLORS.length];
                                    return (
                                        <tr key={idx} className={`border-b border-white/5 transition-colors duration-150 ${idx % 2 === 0 ? 'bg-transparent' : 'bg-white/[0.01] hover:bg-white/[0.03]'}`}>
                                            <td className="px-4 py-2.5 text-center">
                                                <span className={`inline-block px-2 py-1 rounded-lg text-[9px] font-black font-mono border ${isCurrentWW ? 'bg-brand-blue/15 text-brand-blue border-brand-blue/30' : 'bg-white/5 text-white/45 border-white/10'}`}>WW{ww}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-[11px] text-white/50 font-mono whitespace-nowrap">{sale.timestamp}</td>
                                            <td className="px-4 py-2.5 text-[10px] font-mono text-brand-blue/50">{sale.transactionId}</td>
                                            <td className="px-4 py-2.5 min-w-[120px]">
                                                <div className="font-bold text-white text-xs">{sale.customerName}</div>
                                                <div className="text-[9px] text-white/30 font-mono">ID: {sale.cid}</div>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md ${sale.orderType.toLowerCase().includes('walk') || sale.customerName === 'Walk-in' ? 'bg-amber-400/10 text-amber-400' : 'bg-brand-blue/10 text-brand-blue'}`}>
                                                    {sale.orderType.split(' (')[0] || sale.orderType}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2.5">
                                                {sale.orderType.includes('(') ? (
                                                    <span className={`text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md border ${sale.orderType.toLowerCase().includes('delivery') ? 'bg-brand-violet/10 text-brand-violet border-brand-violet/30' : 'bg-charcoal-700/50 text-slate-400 border-charcoal-600'}`}>
                                                        {sale.orderType.toLowerCase().includes('delivery') ? '🚚 Delivery' : '🏪 Pickup'}
                                                    </span>
                                                ) : <span className="text-white/20">—</span>}
                                            </td>
                                            <td className="px-4 py-2.5">
                                                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap" style={{ color: skuColor, background: `${skuColor}18` }}>{sale.itemName}</span>
                                            </td>
                                            <td className="px-4 py-2.5 text-center font-black text-sm text-white">{sale.quantity}</td>
                                            <td className="px-4 py-2.5 text-center font-black text-brand-green text-sm whitespace-nowrap">₱{sale.totalPrice}</td>
                                            <td className="px-4 py-2.5 text-center">
                                                <div className="flex flex-col gap-1 items-center justify-center">
                                                    <div className="flex items-center gap-1.5 justify-center">
                                                        {sale.paymentMethod === 'Paid' ? (
                                                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-brand-green/10 text-brand-green border border-brand-green/30">
                                                                Paid
                                                            </span>
                                                        ) : (
                                                            <span className="px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/30">
                                                                {sale.paymentMethod}
                                                            </span>
                                                        )}
                                                        <button
                                                            onClick={() => {
                                                                setEditingSale(sale);
                                                                setEditFields({
                                                                    customerName: sale.customerName,
                                                                    itemName: sale.itemName,
                                                                    quantity: sale.quantity,
                                                                    unitPrice: sale.unitPrice,
                                                                    orderType: sale.orderType,
                                                                    paymentMethod: sale.paymentMethod,
                                                                    deliveryDate: sale.unplannedDate || '',
                                                                    deliveryTime: sale.unplannedTime || ''
                                                                });
                                                            }}
                                                            className="px-2 py-1 bg-white/5 border border-white/20 rounded-md text-white text-[9px] font-bold cursor-pointer hover:bg-white/10 transition-colors whitespace-nowrap">
                                                            ✎ Edit
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                            {filteredSales.length > 0 && (
                                <tfoot>
                                    <tr className="border-t-2 border-brand-blue/30 bg-brand-blue/5">
                                        <td colSpan={5} className="px-4 py-3 text-[10px] font-bold text-brand-blue uppercase tracking-widest whitespace-nowrap">Totals · {filteredSales.length} transactions</td>
                                        <td className="px-4 py-3 text-center font-black text-base text-white">{totalUnits.toLocaleString()}</td>
                                        <td className="px-4 py-3 text-center font-black text-base text-brand-green whitespace-nowrap">₱{totalRevenue.toLocaleString('en-PH', { minimumFractionDigits: 2 })}</td>
                                        <td />
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </div>
            )}

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
                                        value={(editFields as any)[f.key]}
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
        </div>
    );
}
