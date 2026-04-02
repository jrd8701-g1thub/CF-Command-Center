'use client';

import { useState, useEffect, useMemo, useRef } from 'react';

const ICE_PRODUCTS = [
    { name: '1KG', weight: 1 }, { name: '3KG', weight: 3 }, { name: '5KG', weight: 5 },
    { name: '10KG', weight: 10 }, { name: '25KG', weight: 25 }, { name: '30KG', weight: 30 }, { name: '45KG', weight: 45 },
];

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

interface ProductionEntry {
    date: string; startTime: string; endTime: string; totalHours: number;
    units_1KG: number; units_3KG: number; units_5KG: number; units_10KG: number;
    units_25KG: number; units_30KG: number; units_45KG: number;
    totalWeight: number; expectedYield: number; variance: string;
    elecCost: number; staffName: string;
}

function StatBar({ value, max, color }: { value: number; max: number; color: string }) {
    return (
        <div className="bg-white/5 rounded-full h-1.5 overflow-hidden flex-1 shadow-inner">
            <div 
                className="h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_10px_rgba(255,255,255,0.1)]"
                style={{ width: `${Math.min((value / Math.max(max, 1)) * 100, 100)}%`, background: color }} 
            />
        </div>
    );
}

export default function ProductionPage() {
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [startTime, setStartTime] = useState('08:00');
    const [endTime, setEndTime] = useState('17:00');
    const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
    const [staffName, setStaffName] = useState('');
    const [employees, setEmployees] = useState<string[]>([]);
    const [history, setHistory] = useState<ProductionEntry[]>([]);
    const [adminPin, setAdminPin] = useState('');
    const [editingRun, setEditingRun] = useState<ProductionEntry | null>(null);
    const [editPin, setEditPin] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    // Period Selection State
    const allWeeks = useMemo(() => getWorkWeeks(), []);
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [periodOpen, setPeriodOpen] = useState(false);
    const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
    const periodRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const n = (v: unknown) => parseFloat(v as string) || 0;
        Promise.all([
            fetch('/api/sheet?tab=pos').then(r => r.json()).catch(() => ({})),
            fetch('/api/sheet?tab=staff').then(r => r.json()).catch(() => ({})),
            fetch('/api/sheet?tab=production').then(r => r.json()).catch(() => ({})),
        ]).then(([posData, staffData, prod]) => {
            if (posData?.adminPin) setAdminPin(posData.adminPin);
            // tab=staff returns { employees: [{name, role, basePay}] }
            if (Array.isArray(staffData?.employees)) {
                setEmployees(staffData.employees.map((e: { name: string }) => e.name).filter(Boolean));
            }
            // API already reverses the array, so use as-is; parse all numeric fields
            if (Array.isArray(prod?.productionHistory)) {
                setHistory(prod.productionHistory.map((h: Record<string, unknown>) => ({
                    ...h,
                    totalHours: n(h.totalHours),
                    totalWeight: n(h.totalWeight),
                    expectedYield: n(h.expectedYield),
                    elecCost: n(h.elecCost),
                    units_1KG: n(h.units_1KG),
                    units_3KG: n(h.units_3KG),
                    units_5KG: n(h.units_5KG),
                    units_10KG: n(h.units_10KG),
                    units_25KG: n(h.units_25KG),
                    units_30KG: n(h.units_30KG),
                    units_45KG: n(h.units_45KG),
                    variance: h.variance?.toString() || '0%',
                    date: h.date?.toString() || '',
                    staffName: h.staffName?.toString() || '',
                })));
            }
        }).finally(() => setLoading(false));
    }, []);

    const TIME_OPTIONS: { value: string; label: string }[] = [];
    for (let h = 6; h <= 23; h++) {
        for (const m of ['00', '30']) {
            if (h === 23 && m === '30') break;
            TIME_OPTIONS.push({ value: `${h.toString().padStart(2, '0')}:${m}`, label: `${h === 0 ? 12 : h > 12 ? h - 12 : h}:${m} ${h >= 12 ? 'PM' : 'AM'}` });
        }
    }

    const startMs = new Date(`2000-01-01T${startTime}:00`).getTime();
    const endMs = new Date(`2000-01-01T${endTime}:00`).getTime();
    let hours = (endMs - startMs) / 3600000;
    if (hours < 0) hours += 24;
    const totalWeight = Object.entries(selectedQuantities).reduce((s, [n, q]) => s + (ICE_PRODUCTS.find(p => p.name === n)?.weight || 0) * q, 0);
    const expectedYield = +(hours * 42).toFixed(2);
    const variance = expectedYield > 0 ? ((totalWeight - expectedYield) / expectedYield) * 100 : 0;
    const isCritical = variance < -10;

    const months = useMemo(() => {
        return Array.from(new Set(history.map(h => {
            const date = new Date(h.date);
            return date.toLocaleString('default', { month: 'long', year: 'numeric' });
        }))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [history]);

    const weeksWithData = useMemo(() => {
        return [...allWeeks.map((w, i) => ({ w, i }))]
            .filter(({ w }) => history.some(h => {
                const d = new Date(h.date);
                return d >= w.start && d <= w.end;
            }))
            .reverse();
    }, [history, allWeeks]);

    const groupedPeriods = useMemo(() => {
        return months.map(mStr => {
            const weeksInMonth = weeksWithData.filter(({ w }) => {
                const mst = w.start.toLocaleString('default', { month: 'long', year: 'numeric' });
                const men = w.end.toLocaleString('default', { month: 'long', year: 'numeric' });
                return mst === mStr || men === mStr;
            });
            return { month: mStr, weeks: weeksInMonth };
        });
    }, [months, weeksWithData]);

    const filteredHistory = useMemo(() => {
        return history.filter(h => {
            const d = new Date(h.date);
            const m = d.toLocaleString('default', { month: 'long', year: 'numeric' });

            const periodFilterActive = selectedMonths.length > 0 || selectedWeeks.length > 0;
            const periodMatch = !periodFilterActive || selectedMonths.includes(m) || selectedWeeks.some(wi => {
                return d >= allWeeks[wi].start && d <= allWeeks[wi].end;
            });

            const dateMatch = !selectedDate || h.date === selectedDate;
            return periodMatch && dateMatch;
        });
    }, [history, selectedMonths, selectedWeeks, selectedDate, allWeeks]);

    // ── Insights from history ──────────────────────────────────────────────────
    const insights = useMemo(() => {
        if (filteredHistory.length === 0) return null;
        const totalRuns = filteredHistory.length;
        const avgHours = filteredHistory.reduce((s, h) => s + h.totalHours, 0) / totalRuns;
        const avgOutput = filteredHistory.reduce((s, h) => s + h.totalWeight, 0) / totalRuns;
        const totalKgProduced = filteredHistory.reduce((s, h) => s + h.totalWeight, 0);
        const totalElec = filteredHistory.reduce((s, h) => s + h.elecCost, 0);
        const variances = filteredHistory.map(h => parseFloat(h.variance?.replace('%', '') || '0'));
        const avgVariance = variances.reduce((a, v) => a + v, 0) / totalRuns;
        const criticalRuns = variances.filter(v => v < -10).length;
        // SKU breakdown across all history
        const skuTotals: Record<string, number> = { '1KG': 0, '3KG': 0, '5KG': 0, '10KG': 0, '25KG': 0, '30KG': 0, '45KG': 0 };
        filteredHistory.forEach(h => {
            skuTotals['1KG'] += h.units_1KG || 0;
            skuTotals['3KG'] += h.units_3KG || 0;
            skuTotals['5KG'] += h.units_5KG || 0;
            skuTotals['10KG'] += h.units_10KG || 0;
            skuTotals['25KG'] += h.units_25KG || 0;
            skuTotals['30KG'] += h.units_30KG || 0;
            skuTotals['45KG'] += h.units_45KG || 0;
        });
        const topSKU = Object.entries(skuTotals).sort((a, b) => b[1] - a[1])[0];
        return { totalRuns, avgHours, avgOutput, totalKgProduced, totalElec, avgVariance, criticalRuns, skuTotals, topSKU };
    }, [filteredHistory]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (totalWeight === 0) { alert('Please enter at least one packed unit.'); return; }
        if (!staffName) { alert('Please select a Staff Name.'); return; }
        setSubmitting(true);
        try {
            const res = await fetch('/api/sheet', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'LOG_PRODUCTION',
                    log: {
                        date: new Date().toLocaleDateString('en-CA'), startTime, endTime,
                        totalHours: hours.toFixed(2),
                        units_1KG: selectedQuantities['1KG'] || 0, units_3KG: selectedQuantities['3KG'] || 0,
                        units_5KG: selectedQuantities['5KG'] || 0, units_10KG: selectedQuantities['10KG'] || 0,
                        units_25KG: selectedQuantities['25KG'] || 0, units_30KG: selectedQuantities['30KG'] || 0,
                        units_45KG: selectedQuantities['45KG'] || 0,
                        totalWeight, expectedYield, variance: variance.toFixed(2) + '%', staffName
                    }
                })
            });
            if (res.ok) {
                setSubmitted(true);
                setSelectedQuantities({});
                setStaffName('');
                // re-fetch history
                fetch('/api/sheet?tab=production').then(r => r.json()).then(d => {
                    if (d.productionHistory) {
                        const n = (v: unknown) => parseFloat(v as string) || 0;
                        setHistory(d.productionHistory.map((h: any) => ({
                            ...h,
                            totalHours: n(h.totalHours), totalWeight: n(h.totalWeight), expectedYield: n(h.expectedYield), elecCost: n(h.elecCost),
                            units_1KG: n(h.units_1KG), units_3KG: n(h.units_3KG), units_5KG: n(h.units_5KG), units_10KG: n(h.units_10KG),
                            units_25KG: n(h.units_25KG), units_30KG: n(h.units_30KG), units_45KG: n(h.units_45KG),
                            variance: h.variance?.toString() || '0%', date: h.date?.toString() || '', staffName: h.staffName?.toString() || '',
                        })));
                    }
                });
                setTimeout(() => setSubmitted(false), 3000);
            } else throw new Error();
        } catch { alert('Failed to save log'); }
        finally { setSubmitting(false); }
    };

    const handleUpdateRun = async () => {
        if (!editingRun) return;
        if (editPin !== adminPin) { alert('Incorrect Admin PIN'); return; }
        setIsSaving(true);
        try {
            const res = await fetch('/api/sheet', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'UPDATE_PRODUCTION_ROW',
                    date: editingRun.date,
                    startTime: editingRun.startTime,
                    updates: {
                        units_1KG: editingRun.units_1KG,
                        units_3KG: editingRun.units_3KG,
                        units_5KG: editingRun.units_5KG,
                        units_10KG: editingRun.units_10KG,
                        units_25KG: editingRun.units_25KG,
                        units_30KG: editingRun.units_30KG,
                        units_45KG: editingRun.units_45KG,
                        totalWeight: Object.entries(editingRun).reduce((s, [k, v]) => {
                            if (!k.startsWith('units_')) return s;
                            const sku = k.split('_')[1];
                            const weight = ICE_PRODUCTS.find(p => p.name === sku)?.weight || 0;
                            return s + weight * (v as number);
                        }, 0),
                        staffName: editingRun.staffName
                    }
                })
            });
            if (res.ok) {
                setEditingRun(null);
                setEditPin('');
                // re-fetch history
                const pRes = await fetch('/api/sheet?tab=production');
                const pData = await pRes.json();
                if (pData.productionHistory) {
                    const n = (v: unknown) => parseFloat(v as string) || 0;
                    setHistory(pData.productionHistory.map((h: any) => ({
                        ...h,
                        totalHours: n(h.totalHours), totalWeight: n(h.totalWeight), expectedYield: n(h.expectedYield), elecCost: n(h.elecCost),
                        units_1KG: n(h.units_1KG), units_3KG: n(h.units_3KG), units_5KG: n(h.units_5KG), units_10KG: n(h.units_10KG),
                        units_25KG: n(h.units_25KG), units_30KG: n(h.units_30KG), units_45KG: n(h.units_45KG),
                        variance: h.variance?.toString() || '0%', date: h.date?.toString() || '', staffName: h.staffName?.toString() || '',
                    })));
                }
            } else throw new Error();
        } catch { alert('Failed to update run'); }
        finally { setIsSaving(false); }
    };

    const cardClass = "bg-charcoal-800 border border-white/5 rounded-2xl shadow-xl transition-all duration-300";
    const lblClass = "text-slate-400 text-[10px] font-bold tracking-widest uppercase";
    const inpClass = "px-3 py-2.5 bg-charcoal-900 border border-white/10 rounded-xl text-white text-sm font-semibold outline-none focus:border-brand-blue appearance-none transition-all duration-200 box-border w-full cursor-pointer";

    if (loading) return (
        <div className="flex flex-col items-center justify-center h-[60vh] gap-6 animate-pulse">
            <div className="w-12 h-12 rounded-full border-4 border-brand-blue/20 border-t-brand-blue animate-spin shadow-[0_0_20px_rgba(0,210,255,0.2)]" />
            <span className={lblClass}>Initializing Production Engine...</span>
        </div>
    );

    const skuColors: Record<string, string> = { '1KG': '#00D2FF', '3KG': '#4ECB71', '5KG': '#A78BFA', '10KG': '#FFD93D', '25KG': '#FF9500', '30KG': '#FF4757', '45KG': '#00CEC9' };
    const maxSKU = insights ? Math.max(...Object.values(insights.skuTotals)) : 1;

    return (
        <div className="max-w-[1200px] mx-auto animate-in fade-in duration-300">
            <div className="flex justify-between items-start mb-8">
                <div>
                    <h2 className="text-3xl font-black text-white tracking-tight m-0 bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">Production Logger</h2>
                    <p className={`${lblClass} mt-1 text-[11px] text-brand-blue`}>● Real-Time Operational Monitoring & Insights</p>
                </div>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-xl border transition-all duration-300 ${isCritical ? 'bg-red-500/10 border-red-500/30' : 'bg-brand-green/10 border-brand-green/30'}`}>
                    <div className={`w-2 h-2 rounded-full animate-pulse ${isCritical ? 'bg-red-500 shadow-[0_0_8px_#FF4757]' : 'bg-brand-green shadow-[0_0_8px_#4ECB71]'}`} />
                    <span className={`text-[10px] font-black uppercase tracking-widest ${isCritical ? 'text-red-500' : 'text-brand-green'}`}>
                        Monitor {isCritical ? 'Alert' : 'Active'}
                    </span>
                </div>
            </div>

            {/* ── KPI Row ── */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                {[
                    { label: 'Run Duration', value: `${hours.toFixed(1)}h`, color: '#00D2FF', sub: '@ 42kg/h rate', icon: '⏱' },
                    { label: 'Expected Yield', value: `${expectedYield} KG`, color: '#A78BFA', sub: 'Theoretical output', icon: '📉' },
                    { label: 'Actual Output', value: totalWeight > 0 ? `${totalWeight.toFixed(1)} KG` : '—', color: '#4ECB71', sub: 'Aggregated units', icon: '📦' },
                    { label: 'Variance', value: totalWeight > 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}%` : '—', color: isCritical ? '#FF4757' : variance < 0 ? '#FFD93D' : '#4ECB71', sub: isCritical ? 'Critical shortage' : variance < 0 ? 'Below expected' : 'Surplus', icon: '⚠️' },
                ].map(k => (
                    <div key={k.label} className={`${cardClass} p-5 relative overflow-hidden group`}>
                        <div className="absolute top-0 left-0 right-0 h-1 transition-all duration-300 group-hover:h-1.5" style={{ background: k.color }} />
                        <div className="flex justify-between items-start">
                            <div>
                                <p className={lblClass}>{k.label}</p>
                                <p className="text-2xl font-black mt-1 tabular-nums" style={{ color: k.color }}>{k.value}</p>
                                <p className="text-[9px] text-slate-500 font-bold mt-1 uppercase tracking-tighter">{k.sub}</p>
                            </div>
                            <span className="text-xl opacity-20 group-hover:opacity-60 transition-opacity grayscale group-hover:grayscale-0">{k.icon}</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* ── Logger Form ── */}
                <div className={`${cardClass} p-6 lg:col-span-2 shadow-2xl relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <span className="text-8xl font-black">⚡</span>
                    </div>
                    <form onSubmit={handleSubmit} className="relative z-10">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                            <div>
                                <p className={`${lblClass} mb-2`}>Staff In-Charge</p>
                                <div className="relative">
                                    <select value={staffName} onChange={e => setStaffName(e.target.value)} required className={inpClass}>
                                        <option value="" className="bg-charcoal-900 italic">Select Staff</option>
                                        {employees.map(emp => <option key={emp} value={emp} className="bg-charcoal-900">{emp}</option>)}
                                    </select>
                                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-500 text-[10px]">▼</div>
                                </div>
                            </div>
                            <div>
                                <p className={`${lblClass} mb-2 text-brand-blue`}>Start Time</p>
                                <div className="relative">
                                    <select value={startTime} onChange={e => setStartTime(e.target.value)} className={`${inpClass} border-brand-blue/20`}>
                                        {TIME_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-charcoal-900">{o.label}</option>)}
                                    </select>
                                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-brand-blue/50 text-[10px]">▼</div>
                                </div>
                            </div>
                            <div>
                                <p className={`${lblClass} mb-2 text-brand-purple`}>End Time</p>
                                <div className="relative">
                                    <select value={endTime} onChange={e => setEndTime(e.target.value)} className={`${inpClass} border-brand-purple/20`}>
                                        {TIME_OPTIONS.map(o => <option key={o.value} value={o.value} className="bg-charcoal-900">{o.label}</option>)}
                                    </select>
                                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-brand-purple/50 text-[10px]">▼</div>
                                </div>
                            </div>
                        </div>

                        <p className={`${lblClass} mb-4`}>Actual Units Packed</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
                            {ICE_PRODUCTS.map(product => {
                                const active = selectedQuantities[product.name] !== undefined;
                                return (
                                    <div key={product.name} 
                                        className={`flex items-center justify-between p-3.5 rounded-xl border transition-all duration-300 ${active ? 'bg-brand-blue/5 border-brand-blue/30 shadow-[0_0_15px_rgba(0,210,255,0.05)]' : 'bg-charcoal-900/40 border-white/5 hover:border-white/10'}`}>
                                        <label className="flex items-center gap-3 cursor-pointer group flex-1">
                                            <input type="checkbox" checked={active} 
                                                onChange={e => {
                                                    if (e.target.checked) setSelectedQuantities(p => ({ ...p, [product.name]: 0 }));
                                                    else { const n = { ...selectedQuantities }; delete n[product.name]; setSelectedQuantities(n); }
                                                }} className="w-5 h-5 rounded border-2 border-white/10 bg-black/20 checked:bg-brand-blue checked:border-brand-blue transition-all cursor-pointer accent-brand-blue" />
                                            <span className={`text-sm font-black transition-colors ${active ? 'text-white' : 'text-slate-500 group-hover:text-slate-400'}`}>{product.name} ICE</span>
                                        </label>
                                        
                                        {active && (
                                            <div className="flex items-center gap-3">
                                                <input type="text" inputMode="numeric" placeholder="Qty"
                                                    value={selectedQuantities[product.name] === 0 ? '' : selectedQuantities[product.name]}
                                                    onChange={e => { const v = e.target.value.replace(/\D/g, ''); setSelectedQuantities(p => ({ ...p, [product.name]: parseInt(v) || 0 })); }}
                                                    className="w-16 px-2 py-1 bg-brand-blue/10 border border-brand-blue/20 rounded-lg text-brand-blue font-black text-center text-sm outline-none focus:border-brand-blue/50 transition-all" />
                                                <span className="text-[10px] font-black text-brand-green w-12 text-right">{(selectedQuantities[product.name] * product.weight).toLocaleString()} KG</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <button type="submit" disabled={submitting} 
                            className={`w-full py-4 rounded-xl font-black text-sm uppercase tracking-widest transition-all duration-300 shadow-xl flex items-center justify-center gap-3
                                ${submitted ? 'bg-brand-green text-black' : (submitting ? 'bg-slate-700 text-slate-400 cursor-not-allowed' : 'bg-gradient-to-r from-brand-blue to-blue-600 text-black hover:shadow-brand-blue/30 hover:scale-[1.01] active:scale-[0.99]')}`}>
                            {submitting ? (<><div className="w-4 h-4 rounded-full border-2 border-black/20 border-t-black animate-spin" /> Logging...</>) 
                                : submitted ? '✓ Saved Successfully' 
                                : <><span className="text-xl">⚡</span> Submit Production Log</>}
                        </button>
                    </form>
                </div>

                {/* ── Right KPI Panel ── */}
                <div className={`${cardClass} p-6 flex flex-col gap-8 shadow-2xl relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                        <span className="text-8xl font-black">📈</span>
                    </div>
                    <div>
                        <p className={`${lblClass} pb-4 border-b border-white/5 mb-6`}>Log Efficiency</p>
                        
                        <div className="space-y-6">
                            {[
                                { label: 'Expected Production', value: expectedYield, color: 'text-white', unit: 'KG', sub: `${hours.toFixed(2)}h @ 42kg/h Rate` },
                                { label: 'Actual Production', value: totalWeight.toFixed(1), color: totalWeight > 0 ? 'text-brand-blue' : 'text-slate-600', unit: 'KG', sub: 'Aggregated Output' },
                            ].map(m => (
                                <div key={m.label} className="group">
                                    <p className={lblClass}>{m.label}</p>
                                    <div className="flex items-baseline gap-2 mt-1">
                                        <span className={`text-4xl font-black tabular-nums transition-colors ${m.color}`}>{m.value}</span>
                                        <span className="text-sm text-slate-500 font-bold">{m.unit}</span>
                                    </div>
                                    <p className="text-[9px] text-slate-600 font-bold mt-1.5 uppercase tracking-tighter">{m.sub}</p>
                                </div>
                            ))}
                            
                            <div className="pt-6 border-t border-white/5">
                                <p className={lblClass}>Variance Calculation</p>
                                <div className={`text-5xl font-black mt-2 tabular-nums ${isCritical ? 'text-red-500' : variance < 0 ? 'text-brand-yellow' : 'text-brand-green'}`}>
                                    {variance > 0 ? '+' : ''}{variance.toFixed(1)}%
                                </div>
                                <div className={`mt-3 inline-flex px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border
                                    ${isCritical ? 'bg-red-500/10 border-red-500/30 text-red-500' 
                                        : variance < 0 ? 'bg-brand-yellow/10 border-brand-yellow/30 text-brand-yellow' 
                                        : 'bg-brand-green/10 border-brand-green/30 text-brand-green'}`}>
                                    {isCritical ? 'Critical Shortage' : variance < 0 ? 'Below Expected' : variance === 0 ? 'On Target' : 'Surplus Output'}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ══ INSIGHTS ═════════════════════════════════════════════════════ */}
            {
                insights && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 mt-8">
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                            <div>
                                <h3 className="text-xl font-black text-white m-0 tracking-tight">Production Analytics</h3>
                                <p className={`${lblClass} mt-1`}>Aggregated from {insights.totalRuns} recorded {insights.totalRuns === 1 ? 'session' : 'sessions'}</p>
                            </div>

                            {/* Integrated Period Picker */}
                            <div className="relative" ref={periodRef}>
                                <button onClick={() => setPeriodOpen(!periodOpen)} 
                                    className="flex items-center gap-2 px-4 py-2 bg-brand-blue/10 border border-brand-blue/20 rounded-xl text-brand-blue text-[11px] font-black uppercase tracking-widest hover:bg-brand-blue/20 transition-all duration-200 shadow-lg shadow-brand-blue/5">
                                    <span>📅</span>
                                    {selectedDate ? selectedDate : (selectedWeeks.length > 0 ? `${selectedWeeks.length} Weeks` : (selectedMonths.length > 0 ? `${selectedMonths.length} Months` : 'All Time History'))}
                                    <span className="text-[8px] opacity-60">▼</span>
                                </button>
                                {periodOpen && (
                                    <div className="absolute right-0 top-full mt-2 w-72 bg-charcoal-800 border border-white/10 rounded-2xl shadow-2xl z-[100] p-4 animate-in zoom-in-95 duration-200 overflow-hidden">
                                        <div className="flex justify-between items-center pb-3 border-b border-white/5 mb-3">
                                            <span className={lblClass}>Select Range</span>
                                            <button onClick={() => { setSelectedMonths([]); setSelectedWeeks([]); setSelectedDate(''); }} className="text-[10px] font-black text-red-400 hover:text-red-300 transition-colors uppercase">Reset</button>
                                        </div>
                                        <div className="max-h-64 overflow-y-auto pr-1 space-y-1">
                                            {groupedPeriods.map(g => (
                                                <div key={g.month} className="mb-1">
                                                    <button onClick={() => setExpandedMonths(prev => prev.includes(g.month) ? prev.filter(m => m !== g.month) : [...prev, g.month])}
                                                        className={`w-full flex justify-between items-center p-2.5 rounded-lg transition-all ${selectedMonths.includes(g.month) ? 'bg-brand-blue/10 text-brand-blue' : 'hover:bg-white/5 text-slate-300'}`}>
                                                        <span className="text-xs font-bold" onClick={(e) => { e.stopPropagation(); setSelectedMonths(prev => prev.includes(g.month) ? prev.filter(m => m !== g.month) : [...prev, g.month]); }}>{g.month}</span>
                                                        <span className="text-[10px] opacity-40">{expandedMonths.includes(g.month) ? '▲' : '▼'}</span>
                                                    </button>
                                                    {expandedMonths.includes(g.month) && (
                                                        <div className="pl-4 mt-1 space-y-1 border-l border-white/5 ml-2">
                                                            {g.weeks.map(({ w, i }) => (
                                                                <button key={i} onClick={() => setSelectedWeeks(prev => prev.includes(i) ? prev.filter(wi => wi !== i) : [...prev, i])}
                                                                    className={`w-full text-left p-2 rounded-md text-[10px] font-bold transition-all ${selectedWeeks.includes(i) ? 'bg-brand-purple/20 text-brand-purple' : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'}`}>
                                                                    {w.label}
                                                                </button>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="mt-3 pt-3 border-t border-white/5">
                                            <p className={`${lblClass} mb-2`}>Specific Date</p>
                                            <input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setSelectedMonths([]); setSelectedWeeks([]); }}
                                                className="w-full bg-charcoal-900 border border-white/10 rounded-lg p-2 text-xs text-white outline-none focus:border-brand-blue transition-all color-scheme-dark" />
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* KPI insight row */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
                            {[
                                { label: 'Gross Output', value: insights.totalKgProduced.toFixed(0), unit: 'KG', color: 'text-brand-green', icon: '🧊', bg: 'bg-brand-green/5' },
                                { label: 'Avg Duration', value: insights.avgHours.toFixed(1), unit: 'h', color: 'text-brand-blue', icon: '⏱', bg: 'bg-brand-blue/5' },
                                { label: 'Avg Yield', value: insights.avgOutput.toFixed(1), unit: 'KG', color: 'text-brand-purple', icon: '📦', bg: 'bg-brand-purple/5' },
                                { label: 'Avg Variance', value: (insights.avgVariance > 0 ? '+' : '') + insights.avgVariance.toFixed(1), unit: '%', color: insights.avgVariance < -5 ? 'text-red-500' : 'text-brand-yellow', icon: '📉', bg: insights.avgVariance < -5 ? 'bg-red-500/5' : 'bg-brand-yellow/5' },
                                { label: 'Issue Rate', value: insights.criticalRuns, unit: `/${insights.totalRuns}`, color: insights.criticalRuns > 0 ? 'text-red-500' : 'text-brand-green', icon: '⚠️', bg: insights.criticalRuns > 0 ? 'bg-red-500/5' : 'bg-brand-green/5' },
                            ].map(k => (
                                <div key={k.label} className={`${cardClass} p-4 relative group hover:scale-[1.02]`}>
                                    <div className={`absolute inset-0 ${k.bg} opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />
                                    <div className="flex items-center justify-between mb-2 opacity-50 relative z-10">
                                        <span className="text-xl">{k.icon}</span>
                                        <p className={lblClass}>{k.label}</p>
                                    </div>
                                    <div className="relative z-10">
                                        <span className={`text-2xl font-black tabular-nums ${k.color}`}>{k.value}</span>
                                        <span className="text-[10px] font-bold text-slate-500 ml-1">{k.unit}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* SKU Production Mix */}
                            <div className={`${cardClass} p-6 relative overflow-hidden`}>
                                <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                                    <span className="text-8xl font-black">🏗</span>
                                </div>
                                <div className="relative z-10">
                                    <p className={`${lblClass} mb-1`}>🏭 SKU Production Portfolio</p>
                                    <p className="text-[10px] text-slate-500 mb-6 italic">Visualizing unit distribution across machine runs</p>
                                    
                                    <div className="space-y-4">
                                        {Object.entries(insights.skuTotals).sort((a, b) => b[1] - a[1]).map(([sku, units]) => (
                                            <div key={sku}>
                                                <div className="flex justify-between items-center mb-1.5 px-1">
                                                    <span className="text-[11px] font-black" style={{ color: skuColors[sku] }}>{sku} ICE</span>
                                                    <span className="text-[11px] font-black text-white/70 tabular-nums">{units.toLocaleString()} Units</span>
                                                </div>
                                                <StatBar value={units} max={maxSKU} color={skuColors[sku]} />
                                            </div>
                                        ))}
                                    </div>
                                    
                                    {insights.topSKU && (
                                        <div className="mt-8 p-4 bg-brand-green/5 border border-brand-green/20 rounded-xl flex items-center gap-3 animate-pulse-subtle">
                                            <div className="text-2xl">🏆</div>
                                            <div>
                                                <p className="text-[10px] font-black text-brand-green uppercase tracking-widest">Primary SKU</p>
                                                <p className="text-sm font-black text-white">{insights.topSKU[0]} ICE — {insights.topSKU[1].toLocaleString()} total units</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Recent run history */}
                            <div className={`${cardClass} flex flex-col shadow-2xl overflow-hidden`}>
                                <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.01]">
                                    <p className={lblClass}>📋 Session Ledger (Latest 50 Runs)</p>
                                    <div className="w-2 h-2 rounded-full bg-brand-blue animate-pulse" />
                                </div>
                                <div className="flex-1 min-h-[400px] overflow-auto">
                                    <table className="w-full border-collapse">
                                        <thead className="sticky top-0 z-20 bg-charcoal-800 shadow-xl">
                                            <tr className="bg-black/40">
                                                {['Run Date', 'Operator', 'Hrs', 'Weight', 'Var', 'Opt'].map(h => (
                                                    <th key={h} className={`${lblClass} px-4 py-3 text-left bg-transparent whitespace-nowrap`}>
                                                        {h}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                            {filteredHistory.slice(0, 50).map((run, i) => {
                                                const v = parseFloat(run.variance?.replace('%', '') || '0');
                                                const vColor = v < -10 ? 'text-red-500' : v < 0 ? 'text-brand-yellow' : 'text-brand-green';
                                                return (
                                                    <tr key={i} className="hover:bg-white/[0.02] transition-colors group">
                                                        <td className="px-4 py-3.5 text-xs font-bold text-slate-400 font-mono tracking-tighter">{run.date}</td>
                                                        <td className="px-4 py-3.5 text-xs font-black text-white">{run.staffName || '—'}</td>
                                                        <td className="px-4 py-3.5 text-xs font-black text-brand-blue tabular-nums">{(run.totalHours || 0).toFixed(1)}h</td>
                                                        <td className="px-4 py-3.5 text-xs font-black text-brand-green tabular-nums">{run.totalWeight.toLocaleString()} KG</td>
                                                        <td className={`px-4 py-3.5 text-xs font-black tabular-nums ${vColor}`}>{v > 0 ? '+' : ''}{v.toFixed(1)}%</td>
                                                        <td className="px-4 py-3.5">
                                                            <button onClick={() => setEditingRun({ ...run })} 
                                                                className="px-2.5 py-1 bg-white/5 border border-white/10 rounded-md text-[9px] font-black text-slate-500 hover:text-white hover:bg-brand-blue/20 hover:border-brand-blue/50 transition-all uppercase tracking-tighter">
                                                                Edit
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {filteredHistory.length === 0 && (
                                        <div className="flex flex-col items-center justify-center py-20 opacity-30">
                                            <span className="text-5xl mb-4">📭</span>
                                            <p className={lblClass}>No records found for this period</p>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* ── Edit Modal ── */}
            {editingRun && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[1000] flex items-center justify-center p-4">
                    <div className={`${cardClass} w-full max-w-[500px] p-8 shadow-2xl relative animate-in zoom-in-95 duration-200`}>
                        <div className="flex justify-between items-start mb-8">
                            <div>
                                <h3 className="text-2xl font-black text-white m-0 tracking-tight">Edit Run Record</h3>
                                <p className={`${lblClass} mt-1 text-brand-blue`}>{editingRun.date} · {editingRun.startTime}</p>
                            </div>
                            <button onClick={() => setEditingRun(null)} className="text-slate-500 hover:text-white transition-colors p-2 scale-150">×</button>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mb-8">
                            {ICE_PRODUCTS.map(p => (
                                <div key={p.name}>
                                    <label className={`${lblClass} block mb-2`}>{p.name} Units Output</label>
                                    <input type="number" 
                                        value={(editingRun as any)[`units_${p.name}`] || 0}
                                        onChange={e => setEditingRun({ ...editingRun, [`units_${p.name}`]: parseInt(e.target.value) || 0 })}
                                        className={inpClass} />
                                </div>
                            ))}
                            <div className="col-span-2">
                                <label className={`${lblClass} block mb-2`}>Attending Operator</label>
                                <div className="relative">
                                    <select value={editingRun.staffName} 
                                        onChange={e => setEditingRun({ ...editingRun, staffName: e.target.value })} 
                                        className={inpClass}>
                                        {employees.map(e => <option key={e} value={e} className="bg-charcoal-900 font-bold">{e}</option>)}
                                    </select>
                                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-slate-500 text-[10px]">▼</div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-black/20 p-5 rounded-xl border border-white/5 mb-8">
                            <p className={`${lblClass} mb-3 text-brand-yellow`}>⚠️ System Audit Authentication</p>
                            <input type="password" value={editPin} onChange={e => setEditPin(e.target.value)}
                                placeholder="● ● ● ● ● ●" maxLength={6}
                                className={`${inpClass} text-center text-2xl tracking-[0.6em] border-brand-yellow/20 focus:border-brand-yellow/50`} />
                        </div>

                        <div className="flex gap-3">
                            <button onClick={() => setEditingRun(null)} 
                                className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-slate-400 font-black text-xs rounded-xl transition-all uppercase tracking-widest">
                                Discard
                            </button>
                            <button onClick={handleUpdateRun} disabled={isSaving} 
                                className="flex-[2] py-3.5 bg-gradient-to-r from-brand-blue to-blue-600 text-black font-black text-xs rounded-xl shadow-lg shadow-brand-blue/20 hover:shadow-brand-blue/40 transition-all uppercase tracking-widest disabled:opacity-50">
                                {isSaving ? 'Verifying...' : 'Commit Changes'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div >
    );
}
