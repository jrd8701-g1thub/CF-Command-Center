'use client';

import { useState, useEffect, useRef, useMemo } from 'react';

const ICE_PACKAGING = ['1KG', '3KG', '5KG', '10KG', '25KG', '30KG', '45KG'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const COLORS = ['#00D2FF', '#7B61FF', '#FF6B6B', '#FFD93D', '#4ECB71', '#FF8A5C', '#A78BFA'];

interface ProductionLog { date: string;[key: string]: string | number; }
interface Sale { timestamp: string; itemName: string; quantity: string | number; customerName: string; orderType: string; paymentMethod?: string; }
interface AuditLog { date: string; status: string; sku?: string; variance?: string | number;[key: string]: string | number | undefined; }

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

function getWorkWeeks() {
    const weeks: { label: string; start: Date; end: Date }[] = [];
    const now = new Date();
    const phNow = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const base = new Date(phNow);
    base.setUTCDate(phNow.getUTCDate() - phNow.getUTCDay() + 1 - 12 * 7);
    base.setUTCHours(0, 0, 0, 0);
    for (let w = 0; w < 24; w++) {
        const start = new Date(base); start.setUTCDate(base.getUTCDate() + w * 7);
        const end = new Date(start); end.setUTCDate(start.getUTCDate() + 6);
        end.setUTCHours(23, 59, 59, 999);
        const jan1 = new Date(start.getUTCFullYear(), 0, 1);
        const wn = Math.ceil(((start.getTime() - jan1.getTime()) / 86400000 + jan1.getUTCDay() + 1) / 7);
        const f = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
        weeks.push({ label: `WW${wn} · ${f(start)} – ${f(end)}`, start, end });
    }
    return weeks;
}

function DonutChart({ value, max, color, size = 80, thickness = 8 }: { value: number; max: number; color: string; size?: number; thickness?: number }) {
    const r = (size - thickness) / 2;
    const circ = 2 * Math.PI * r;
    const pct = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90 transform">
                {/* Background Track */}
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth={thickness} />
                {/* Progress Circle with Glow */}
                <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={thickness}
                    strokeDasharray={`${pct * circ} ${circ}`} strokeLinecap="round" className="transition-all duration-1000 ease-out"
                    style={{ filter: `drop-shadow(0 0 3px ${color}40)` }} />
            </svg>
        </div>
    );
}

function StackedBar({ items }: { items: { label: string; value: number; color: string }[] }) {
    const total = items.reduce((s, i) => s + Math.abs(i.value), 0);
    if (total === 0) return <div className="h-1.5 w-full rounded-full bg-white/5" />;
    return (
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/5 gap-[1px]">
            {items.filter(i => i.value > 0).map((i, idx) => (
                <div key={`${i.label}-${idx}`} title={`${i.label}: ${i.value}`}
                    className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-700 ease-out"
                    style={{ width: `${(i.value / total) * 100}%`, background: i.color }} />
            ))}
        </div>
    );
}

function SkuAuditModal({ sku, onClose, onSave, adminPin }: { sku: string; onClose: () => void; onSave: (status: 'accurate' | 'inaccurate', variance: number) => void, adminPin: string }) {
    const [pin, setPin] = useState('');
    const [authed, setAuthed] = useState(false);
    const [status, setStatus] = useState<'accurate' | 'inaccurate' | null>(null);
    const [variance, setVariance] = useState('');
    const [saving, setSaving] = useState(false);

    const handlePinSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (pin === adminPin) setAuthed(true);
        else { alert('Invalid PIN'); setPin(''); }
    };

    const submit = () => {
        if (!status) return;
        setSaving(true);
        onSave(status, status === 'inaccurate' ? (parseInt(variance) || 0) : 0);
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-[400px] rounded-3xl border border-white/10 bg-slate-900/95 p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                <div className="mb-6 flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black tracking-tight text-white group flex items-center gap-2">
                             <span className="w-2 h-6 bg-brand-blue rounded-full"></span>
                             Audit — {sku}
                        </h3>
                        <p className="text-[10px] uppercase tracking-widest text-white/40 font-bold mt-1">Manual SKU Verification</p>
                    </div>
                    <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-colors">✕</button>
                </div>

                {!authed ? (
                    <form onSubmit={handlePinSubmit} className="space-y-4">
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mb-2">Security Verification</label>
                            <input type="password" placeholder="••••••" value={pin} onChange={e => setPin(e.target.value)}
                                className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-3xl tracking-[0.3em] text-white outline-none focus:border-brand-blue/50 focus:bg-brand-blue/5 transition-all" autoFocus />
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button type="button" onClick={onClose} className="flex-1 rounded-xl border border-white/10 bg-transparent py-4 text-sm font-bold text-white/40 hover:bg-white/5 transition-all">Cancel</button>
                            <button type="submit" className="flex-1 rounded-xl bg-gradient-to-r from-brand-blue to-brand-purple py-4 text-sm font-black text-black shadow-lg shadow-brand-blue/20 hover:scale-[1.02] active:scale-95 transition-all">Unlock</button>
                        </div>
                    </form>
                ) : (
                    <div className="space-y-6">
                        <div className="grid grid-cols-2 gap-3">
                            {(['accurate', 'inaccurate'] as const).map(s => (
                                <button key={s} onClick={() => setStatus(s)}
                                    className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 p-4 transition-all ${status === s
                                        ? s === 'accurate' ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-red-500/50 bg-red-500/10 text-red-400'
                                        : 'border-white/5 bg-white/5 text-white/30 hover:bg-white/10'}`}>
                                    <span className="text-xl">{s === 'accurate' ? '✓' : '⚠'}</span>
                                    <span className="text-[10px] font-black uppercase tracking-wider">{s}</span>
                                </button>
                            ))}
                        </div>

                        {status === 'inaccurate' && (
                            <div className="animate-in slide-in-from-top-4 duration-300">
                                <label className="block text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Missing Units Count</label>
                                <input type="number" min={0} placeholder="Enter missing quantity..." value={variance} onChange={e => setVariance(e.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-xl font-bold text-white outline-none focus:border-red-500/50 transition-all" />
                            </div>
                        )}

                        <div className="flex gap-3 pt-2">
                            <button onClick={onClose} className="flex-1 rounded-xl border border-white/10 bg-transparent py-4 text-sm font-bold text-white/40 hover:bg-white/5 transition-all">Cancel</button>
                            <button onClick={submit} disabled={!status || (status === 'inaccurate' && !variance) || saving}
                                className={`flex-1 rounded-xl py-4 text-sm font-black transition-all shadow-xl ${!status || (status === 'inaccurate' && !variance)
                                    ? 'bg-white/5 text-white/20'
                                    : status === 'accurate' ? 'bg-green-500 text-black shadow-green-500/20' : 'bg-red-500 text-white shadow-red-500/20'} ${saving ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-95'}`}>
                                {saving ? 'Saving...' : 'Confirm Audit'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function InventoryPage() {
    const [loading, setLoading] = useState(true);
    const [adminPin, setAdminPin] = useState('');
    const [production, setProduction] = useState<ProductionLog[]>([]);
    const [sales, setSales] = useState<Sale[]>([]);
    const [audits, setAudits] = useState<AuditLog[]>([]);
    // Per-SKU audit records (stored locally after submissions)
    const [skuAudits, setSkuAudits] = useState<Record<string, { status: 'accurate' | 'inaccurate'; variance: number; date: string }>>({});
    const [auditingSku, setAuditingSku] = useState<string | null>(null);
    const [icePackaging, setIcePackaging] = useState<string[]>(ICE_PACKAGING);

    const [selectedDate, setSelectedDate] = useState<string>('');
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
    const [periodOpen, setPeriodOpen] = useState(false);
    const periodRef = useRef<HTMLDivElement>(null);
    const allWeeks = useMemo(() => getWorkWeeks(), []);
    const currentWeekIdx = useMemo(() => { const n = new Date(); return allWeeks.findIndex(w => n >= w.start && n <= w.end); }, [allWeeks]);
    const [selectedWeeks, setSelectedWeeks] = useState<number[]>(currentWeekIdx >= 0 ? [currentWeekIdx] : []);

    // SKU breakdown filter
    const [skuSelectedDate, setSkuSelectedDate] = useState<string>('');
    const [skuSelectedMonths, setSkuSelectedMonths] = useState<string[]>([]);
    const [skuExpandedMonths, setSkuExpandedMonths] = useState<string[]>([]);
    const [skuSelectedWeeks, setSkuSelectedWeeks] = useState<number[]>([]);
    const [skuPeriodOpen, setSkuPeriodOpen] = useState(false);
    const skuPeriodRef = useRef<HTMLDivElement>(null);

    const [showGlobalAudit, setShowGlobalAudit] = useState(false);
    const [pin, setPin] = useState('');
    const [authed, setAuthed] = useState(false);
    const [auditStatus, setAuditStatus] = useState<'match' | 'mismatch' | null>(null);
    const [missing, setMissing] = useState<Record<string, number>>({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        Promise.all([
            fetch('/api/sheet?tab=production').then(r => r.json()),
            fetch('/api/sheet?tab=sales').then(r => r.json()),
            fetch('/api/sheet?tab=audit').then(r => r.json()),
            fetch('/api/sheet?tab=pos').then(r => r.json()),
        ]).then(([p, s, a, pos]) => {
            setProduction(p.productionHistory || []);
            setSales(s.sales || []);
            setAudits(a.audits || []);
            if (pos.adminPin) setAdminPin(pos.adminPin);
            if (pos.productTypes) {
                const dynamicSkus = pos.productTypes
                    .filter((p: string) => p !== 'ICE PRODUCTS' && p)
                    .map((p: string) => {
                        const match = p.match(/^(\d+)KG/i);
                        return match ? `${match[1].toUpperCase()}KG` : null;
                    })
                    .filter(Boolean);
                if (dynamicSkus.length > 0) setIcePackaging(dynamicSkus);
            }
        }).catch(console.error).finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (skuPeriodRef.current && !skuPeriodRef.current.contains(e.target as Node)) setSkuPeriodOpen(false);
            if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodOpen(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const months = Array.from(new Set(sales.map(s => {
        try {
            const ds = getPHDateISO(s.timestamp);
            const date = new Date(ds + 'T00:00:00Z'); // Force UTC to avoid local shift
            return date.toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' });
        }
        catch { return 'Unknown'; }
    }))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

    const weeksWithSales = useMemo(() => [...allWeeks.map((w, i) => ({ w, i }))]
        .filter(({ i }) => sales.some(sale => {
            try {
                const ds = getPHDateISO(sale.timestamp);
                const d = new Date(ds + 'T12:00:00Z').getTime(); // midday UTC for safe overlap
                return d >= allWeeks[i].start.getTime() && d <= allWeeks[i].end.getTime();
            } catch { return false; }
        }))
        .reverse(), [sales, allWeeks]);

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

    const stock = useMemo(() => {
        const s: Record<string, number> = {};
        icePackaging.forEach(p => s[p] = 0);
        production.forEach(log => icePackaging.forEach(p => { const v = parseInt(log[`units_${p}`]?.toString() || '0'); if (!isNaN(v)) s[p] += v; }));
        sales.forEach(sale => icePackaging.forEach(p => { if (sale.itemName.toUpperCase().includes(p)) { const v = parseInt(sale.quantity?.toString() || '0'); if (!isNaN(v)) s[p] -= v; } }));
        audits.forEach(audit => icePackaging.forEach(p => { const v = parseInt(audit[`missing_${p}`]?.toString() || '0'); if (!isNaN(v)) s[p] -= v; }));
        return s;
    }, [production, sales, audits, icePackaging]);

    const orders = useMemo(() => {
        const o: Record<string, number> = {};
        icePackaging.forEach(p => o[p] = 0);
        sales.forEach(sale => icePackaging.forEach(p => { if (sale.itemName.toUpperCase().includes(p)) { const v = parseInt(sale.quantity?.toString() || '0'); if (!isNaN(v)) o[p] += v; } }));
        return o;
    }, [sales, icePackaging]);

    const produced = useMemo(() => {
        const pr: Record<string, number> = {};
        ICE_PACKAGING.forEach(p => pr[p] = 0);
        let rows = production;
        if (skuSelectedDate) {
            rows = rows.filter(s => {
                const ds = getPHDateISO(String(s.date || s.timestamp || ''));
                return ds === skuSelectedDate;
            });
        } else if (skuSelectedMonths.length > 0 || skuSelectedWeeks.length > 0) {
            rows = rows.filter(s => {
                try {
                    const ds = getPHDateISO(String(s.date || s.timestamp || ''));
                    const d = new Date(ds + 'T12:00:00Z');
                    const mStr = d.toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' });
                    const mMatch = skuSelectedMonths.includes(mStr);
                    const wMatch = skuSelectedWeeks.some(wi => {
                        const w = allWeeks[wi];
                        const t = d.getTime();
                        return t >= w.start.getTime() && t <= w.end.getTime();
                    });
                    return mMatch || wMatch;
                } catch { return false; }
            });
        }
        rows.forEach(log => icePackaging.forEach(p => { const v = parseInt(log[`units_${p}`]?.toString() || '0'); if (!isNaN(v)) pr[p] += v; }));
        return pr;
    }, [production, skuSelectedDate, skuSelectedMonths, skuSelectedWeeks, allWeeks, icePackaging]);

    const totalStock = icePackaging.reduce((s, p) => s + Math.max(0, stock[p]), 0);
    const totalSold = icePackaging.reduce((s, p) => s + orders[p], 0);
    const totalProduced = icePackaging.reduce((s, p) => s + produced[p], 0);

    // Audit stats
    const accurateCount = Object.values(skuAudits).filter(a => a.status === 'accurate').length + audits.filter(a => a.status === 'Match').length;
    const inaccurateCount = Object.values(skuAudits).filter(a => a.status === 'inaccurate').length + audits.filter(a => a.status === 'Mismatch').length;
    const totalVariance = Object.values(skuAudits).reduce((s, a) => s + a.variance, 0) +
        audits.filter(a => a.status === 'Mismatch').reduce((s, a) => s + icePackaging.reduce((sv, p) => sv + (parseInt(a[`missing_${p}`]?.toString() || '0') || 0), 0), 0);

    // Payment breakdown helpers
    const getPaidCredit = (saleList: Sale[]) => {
        const paid = saleList.filter(s => s.paymentMethod?.toLowerCase() === 'paid' || s.orderType?.toLowerCase() === 'paid').length;
        return { paid, credit: saleList.length - paid };
    };

    const filteredProduction = useMemo(() => {
        let rows = production;
        if (selectedDate) {
            rows = rows.filter(p => {
                try {
                    const d = new Date(p.date?.toString() || (p.timestamp && p.timestamp.toString().split(',')[0]));
                    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    return iso === selectedDate;
                } catch { return false; }
            });
        } else if (selectedMonths.length > 0 || selectedWeeks.length > 0) {
            rows = rows.filter(p => {
                try {
                    const d = new Date(p.date?.toString() || (p.timestamp && p.timestamp.toString().split(',')[0]));
                    const mStr = d.toLocaleString('default', { month: 'long', year: 'numeric' });
                    const mMatch = selectedMonths.includes(mStr);
                    const wMatch = selectedWeeks.some(wi => { const w = allWeeks[wi]; return d >= w.start && d <= w.end; });
                    return mMatch || wMatch;
                } catch { return false; }
            });
        }
        return rows;
    }, [production, selectedDate, selectedMonths, selectedWeeks, allWeeks]);

    // SKU breakdown filtered by week
    const skuSales = useMemo(() => {
        let rows = sales;
        if (skuSelectedDate) {
            rows = rows.filter(s => {
                try {
                    const d = new Date(s.timestamp?.toString().split(',')[0]);
                    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    return iso === skuSelectedDate;
                } catch { return false; }
            });
        } else if (skuSelectedMonths.length > 0 || skuSelectedWeeks.length > 0) {
            rows = rows.filter(s => {
                try {
                    const d = new Date(s.timestamp.toString().split(',')[0]);
                    const mStr = d.toLocaleString('default', { month: 'long', year: 'numeric' });
                    const mMatch = skuSelectedMonths.includes(mStr);
                    const wMatch = skuSelectedWeeks.some(wi => { const w = allWeeks[wi]; return d >= w.start && d <= w.end; });
                    return mMatch || wMatch;
                } catch { return false; }
            });
        }
        return rows;
    }, [sales, skuSelectedDate, skuSelectedMonths, skuSelectedWeeks, allWeeks]);

    const skuOrders = useMemo(() => {
        const o: Record<string, number> = {};
        icePackaging.forEach(p => o[p] = 0);
        skuSales.forEach(sale => icePackaging.forEach(p => { if (sale.itemName.toUpperCase().includes(p)) { const v = parseInt(sale.quantity?.toString() || '0'); if (!isNaN(v)) o[p] += v; } }));
        return o;
    }, [skuSales, icePackaging]);

    const handleSkuAuditSave = (sku: string, status: 'accurate' | 'inaccurate', variance: number) => {
        const date = new Date().toLocaleDateString('en-CA');
        // Update UI immediately (optimistic)
        setSkuAudits(prev => ({ ...prev, [sku]: { status, variance, date } }));
        setAuditingSku(null);
        // Fire API save in background — don't block UI on network
        fetch('/api/sheet', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'LOG_AUDIT',
                audit: {
                    date,
                    status: status === 'accurate' ? 'Match' : 'Mismatch',
                    sku,
                    ...Object.fromEntries(icePackaging.map(p => [`missing_${p}`, p === sku && status === 'inaccurate' ? variance : 0])),
                    staff: 'Admin'
                }
            })
        }).catch(() => { /* silently ignore network errors */ });
    };

    const closeGlobalAudit = () => { setShowGlobalAudit(false); setAuthed(false); setPin(''); setAuditStatus(null); setMissing({}); };
    const submitGlobalAudit = async () => {
        if (!auditStatus) return;
        setSaving(true);
        try {
            const body = { action: 'LOG_AUDIT', audit: { date: new Date().toLocaleDateString('en-CA'), status: auditStatus === 'match' ? 'Match' : 'Mismatch', ...Object.fromEntries(icePackaging.map(p => [`missing_${p}`, auditStatus === 'match' ? 0 : (missing[p] || 0)])), staff: 'Admin' } };
            const res = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) { alert('Audit saved!'); window.location.reload(); } else throw new Error();
        } catch { alert('Error saving audit'); }
        finally { setSaving(false); }
    };

    const card: React.CSSProperties = { background: 'linear-gradient(135deg, rgba(15,23,42,0.95) 0%, rgba(15,30,55,0.95) 100%)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16, padding: 24, position: 'relative', overflow: 'hidden' };
    const cardSm: React.CSSProperties = { ...card, padding: 20 };
    const lbl: React.CSSProperties = { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' as const };
    const weekBtnStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, padding: '4px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 };
    const weekDropStyle: React.CSSProperties = { position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 50, background: '#0d1b36', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 8, width: 260, maxHeight: 220, overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' };

    const DateRangePicker = ({
        selectedDate, setSelectedDate,
        selectedMonths, setSelectedMonths,
        selectedWeeks, setSelectedWeeks,
        expandedMonths, setExpandedMonths,
        periodOpen, setPeriodOpen, periodRef
    }: any) => {
        return (
            <div ref={periodRef} style={{ position: 'relative' }}>
                <button onClick={() => setPeriodOpen((o: boolean) => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', background: selectedDate ? 'rgba(0,210,255,0.1)' : 'rgba(255,255,255,0.06)', border: `1px solid ${selectedDate ? 'rgba(0,210,255,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, color: selectedDate ? '#00D2FF' : '#fff', fontSize: 11, fontWeight: 700, outline: 'none', cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                    {selectedDate ? selectedDate : (selectedMonths.length === 0 && selectedWeeks.length === 0 ? 'All Periods' : `${selectedMonths.length + selectedWeeks.length} Selected`)}
                    <span style={{ marginLeft: 'auto', fontSize: 10, transform: periodOpen ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}>▾</span>
                </button>
                {periodOpen && (
                    <div style={{ ...weekDropStyle, right: 0, width: 280, maxHeight: 380, zIndex: 60 }}>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <button onClick={() => { setSelectedMonths(months); setSelectedWeeks([]); setSelectedDate(''); }} style={{ fontSize: 11, color: '#00D2FF', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Select All</button>
                            <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                            <button onClick={() => { setSelectedMonths([]); setSelectedWeeks([]); setExpandedMonths([]); setSelectedDate(''); }} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,107,107,0.8)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
                        </div>

                        {/* Specific Date */}
                        <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button onClick={() => setExpandedMonths((prev: string[]) => prev.includes('specific_date') ? prev.filter(m => m !== 'specific_date') : [...prev, 'specific_date'])} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', width: 20, textAlign: 'center', transition: 'color 0.15s' }}>
                                    {expandedMonths.includes('specific_date') ? '▾' : '▸'}
                                </button>
                                <span onClick={() => {
                                    setExpandedMonths((prev: string[]) => prev.includes('specific_date') ? prev.filter(m => m !== 'specific_date') : [...prev, 'specific_date']);
                                    if (!selectedDate) setSelectedDate(new Date().toLocaleDateString('en-CA'));
                                }} style={{ fontSize: 13, fontWeight: 800, color: selectedDate ? '#fff' : 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                                    Specific Date
                                </span>
                            </div>
                            {expandedMonths.includes('specific_date') && (
                                <div style={{ paddingLeft: 36, marginTop: 8 }}>
                                    <input type="date" value={selectedDate} onChange={e => { setSelectedDate(e.target.value); setSelectedMonths([]); setSelectedWeeks([]); }} style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,210,255,0.3)', borderRadius: 10, color: '#00D2FF', fontWeight: 700, fontSize: 13, outline: 'none', cursor: 'pointer', colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }} />
                                </div>
                            )}
                        </div>

                        {groupedPeriods.map(g => {
                            const isMonthSelected = selectedMonths.includes(g.month) && !selectedDate;
                            const monthWeeks = g.weeks;
                            const selectedCount = !selectedDate ? monthWeeks.filter((w: any) => selectedWeeks.includes(w.i)).length : 0;
                            const isPartiallySelected = !isMonthSelected && selectedCount > 0 && selectedCount < monthWeeks.length;
                            const isFullySelected = isMonthSelected || (selectedCount === monthWeeks.length && monthWeeks.length > 0);
                            const isExpanded = expandedMonths.includes(g.month);

                            return (
                                <div key={g.month} style={{ marginBottom: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <button onClick={() => setExpandedMonths((prev: string[]) => prev.includes(g.month) ? prev.filter(m => m !== g.month) : [...prev, g.month])} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', width: 20, textAlign: 'center', transition: 'color 0.15s' }}>{isExpanded ? '▾' : '▸'}</button>
                                        <input type="checkbox" checked={isFullySelected} ref={el => { if (el) el.indeterminate = isPartiallySelected; }} onChange={() => {
                                            setSelectedDate('');
                                            if (isFullySelected) {
                                                setSelectedMonths((m: string[]) => m.filter(x => x !== g.month));
                                                setSelectedWeeks((w: number[]) => w.filter(x => !monthWeeks.some((mw: any) => mw.i === x)));
                                            } else {
                                                setSelectedMonths((m: string[]) => Array.from(new Set([...m, g.month])));
                                                setSelectedWeeks((w: number[]) => w.filter(x => !monthWeeks.some((mw: any) => mw.i === x)));
                                            }
                                        }} style={{ accentColor: '#00D2FF', width: 14, height: 14, cursor: 'pointer' }} />
                                        <span onClick={() => setExpandedMonths((prev: string[]) => prev.includes(g.month) ? prev.filter(m => m !== g.month) : [...prev, g.month])} style={{ fontSize: 13, fontWeight: 800, color: isFullySelected || isPartiallySelected ? '#fff' : 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>{g.month}</span>
                                    </div>

                                    {isExpanded && (
                                        <div style={{ paddingLeft: 36, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, borderLeft: '1px dashed rgba(255,255,255,0.1)', marginLeft: 10, paddingBottom: 4 }}>
                                            {monthWeeks.map(({ w, i }: any) => {
                                                const isWeekSelected = isFullySelected || selectedWeeks.includes(i);
                                                return (
                                                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isFullySelected ? 'default' : 'pointer' }}>
                                                        <input type="checkbox" checked={isWeekSelected} disabled={isFullySelected} onChange={() => {
                                                            setSelectedDate('');
                                                            if (isFullySelected) return;
                                                            setSelectedWeeks((p: number[]) => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);
                                                        }} style={{ accentColor: '#00D2FF', width: 12, height: 12 }} />
                                                        <span style={{ fontSize: 11, fontWeight: isWeekSelected ? 700 : 500, color: isWeekSelected ? '#00D2FF' : 'rgba(255,255,255,0.5)' }}>
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
        );
    };

    if (loading) return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
            <div style={{ textAlign: 'center' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(0,210,255,0.2)', borderTopColor: '#00D2FF', animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                <p style={{ ...lbl }}>Loading Dashboard</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-transparent pb-12 font-sans text-slate-200 antialiased">
            <style jsx global>{`
                @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
                .animate-fade-in { animation: fade-in 0.5s ease-out forwards; }
                .glass-card { background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); }
            `}</style>

            {/* HEADER */}
            <div className="mb-8 flex items-center justify-between animate-fade-in">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-white mb-1 flex items-center gap-3">
                         <span className="w-2.5 h-8 bg-gradient-to-b from-brand-blue to-brand-purple rounded-full shadow-[0_0_15px_rgba(0,210,255,0.3)]"></span>
                         Inventory Control
                    </h1>
                    <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-widest text-white/30">
                        <span className="flex items-center gap-1.5 font-black"><span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span> Live System</span>
                        <span className="w-1 h-1 rounded-full bg-white/10"></span>
                        <span className="font-extrabold tracking-tight">Last Audit: {audits[0]?.date || 'No Data'}</span>
                    </div>
                </div>
                <button onClick={() => setShowGlobalAudit(true)} 
                    className="group relative flex items-center gap-2 overflow-hidden rounded-xl bg-white/5 px-6 py-3 font-black text-white transition-all hover:bg-white/10 active:scale-95 border border-white/10 shadow-xl">
                    <span className="relative z-10 text-[11px] uppercase tracking-widest text-white/80">Full System Audit</span>
                    <span className="relative z-10 text-xl">🔍</span>
                    <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-brand-blue to-brand-purple transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 shadow-[0_0_10px_#00D2FF]"></div>
                </button>
            </div>

            {/* KPI ROW */}
            <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                    { label: 'Units In Stock', value: totalStock, unit: 'units', color: '#00D2FF', icon: '📦', sub: null },
                    { label: 'Total Units Sold', value: totalSold, unit: 'units', color: '#4ECB71', icon: '📈', sub: null },
                    { label: 'Units Produced', value: totalProduced, unit: 'units', color: '#7B61FF', icon: '🏭', sub: null },
                    { label: 'System Audits', value: audits.length + Object.keys(skuAudits).length, unit: 'records', color: '#FFD93D', icon: '📋', sub: { accurate: accurateCount, inaccurate: inaccurateCount, variance: totalVariance } },
                ].map((kpi, idx) => (
                    <div key={kpi.label} className="glass-card animate-fade-in overflow-hidden rounded-2xl p-5 group hover:border-white/20 transition-all duration-300 relative" style={{ animationDelay: `${idx * 0.1}s` }}>
                        <div className="absolute top-0 left-0 w-full h-1 opacity-20" style={{ backgroundColor: kpi.color }}></div>
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">{kpi.label}</span>
                            <div className="p-2.5 rounded-xl bg-white/5 group-hover:bg-white/10 transition-colors shadow-inner">
                                <span className="text-xl">{kpi.icon}</span>
                            </div>
                        </div>
                        <div className="flex flex-col gap-1">
                            <h2 className="text-4xl font-black tracking-tighter text-white tabular-nums flex items-baseline gap-2 drop-shadow-sm" style={{ color: kpi.color }}>
                                {kpi.value.toLocaleString()}
                                <span className="text-[10px] uppercase font-black text-white/20 tracking-wider font-sans">{kpi.unit}</span>
                            </h2>
                            {kpi.sub ? (
                                <div className="mt-4 space-y-2.5 border-t border-white/5 pt-4">
                                    <div className="flex items-center justify-between text-[11px] font-black">
                                        <span className="text-green-500/50 uppercase tracking-widest">Match</span>
                                        <span className="text-green-400 font-black tabular-nums">{kpi.sub.accurate}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] font-black">
                                        <span className="text-red-500/50 uppercase tracking-widest">Mismatch</span>
                                        <span className="text-red-400 font-black tabular-nums">{kpi.sub.inaccurate}</span>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] font-black border-t border-white/5 pt-2.5 mt-1">
                                        <span className="text-white/30 uppercase tracking-widest">Variance</span>
                                        <span className="text-brand-purple font-black tabular-nums">-{kpi.sub.variance}</span>
                                    </div>
                                </div>
                            ) : (
                                <div className="mt-3 h-1.5 w-full rounded-full bg-white/5 overflow-hidden shadow-inner">
                                     <div className="h-full rounded-full opacity-60 transition-all duration-1000 shadow-[0_0_8px_rgba(255,255,255,0.2)]" 
                                          style={{ width: kpi.label === 'Units In Stock' ? '85%' : kpi.label === 'Total Units Sold' ? '70%' : '60%', backgroundColor: kpi.color }}></div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* DONUT + SKU BREAKDOWN */}
            <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-12 animate-fade-in" style={{ animationDelay: '0.4s' }}>
                {/* Stock Distribution Donut */}
                <div className="glass-card flex flex-col rounded-2xl p-6 lg:col-span-4 group hover:border-white/20 transition-all">
                    <div className="mb-6 flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Stock Distribution</span>
                        <div className="h-2 w-2 rounded-full bg-brand-blue shadow-[0_0_8px_#00D2FF]"></div>
                    </div>
                    
                    <div className="relative mb-8 flex flex-1 items-center justify-center py-4">
                        <div className="relative">
                            {icePackaging.map((p, i) => {
                                const val = Math.max(0, stock[p]);
                                const tot = icePackaging.reduce((s, pk) => s + Math.max(0, stock[pk]), 0);
                                return (
                                    <div key={p} className="absolute inset-0 transition-transform duration-1000 group-hover:scale-105" style={{ zIndex: 10 - i }}>
                                        <DonutChart value={val} max={tot || 1} color={COLORS[i]} size={180} thickness={10 - i * 0.5} />
                                    </div>
                                );
                            })}
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-4xl font-black tracking-tighter text-white drop-shadow-md">{totalStock}</span>
                                <span className="text-[9px] font-black uppercase tracking-widest text-white/30">Total Units</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 border-t border-white/5 pt-6">
                        {icePackaging.map((p, i) => (
                            <div key={p} className="flex items-center gap-3 group/item">
                                <div className="h-2 w-2 rounded-full shadow-sm transition-transform group-hover/item:scale-125" style={{ backgroundColor: COLORS[i] }} />
                                <span className="text-[11px] font-bold text-white/60 tracking-tight">{p}</span>
                                <span className="ml-auto text-xs font-black text-white tabular-nums">{stock[p]}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* SKU Breakdown Table */}
                <div className="glass-card overflow-hidden rounded-2xl lg:col-span-8 border border-white/5">
                    <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.02] px-6 py-4">
                        <div className="flex items-center gap-2">
                             <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">SKU Detailed Analysis</span>
                        </div>
                        <DateRangePicker
                            selectedDate={skuSelectedDate} setSelectedDate={setSkuSelectedDate}
                            selectedMonths={skuSelectedMonths} setSelectedMonths={setSkuSelectedMonths}
                            selectedWeeks={skuSelectedWeeks} setSelectedWeeks={setSkuSelectedWeeks}
                            expandedMonths={skuExpandedMonths} setExpandedMonths={setSkuExpandedMonths}
                            periodOpen={skuPeriodOpen} setPeriodOpen={setSkuPeriodOpen} periodRef={skuPeriodRef}
                        />
                    </div>

                    <div className="overflow-x-auto min-h-[420px]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-white/5 bg-white/[0.01]">
                                    <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-white/30">SKU Size</th>
                                    <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-white/30">Availability</th>
                                    <th className="px-6 py-3.5 text-center text-[10px] font-black uppercase tracking-widest text-white/30">Stock</th>
                                    <th className="px-6 py-3.5 text-center text-[10px] font-black uppercase tracking-widest text-white/30">Sold</th>
                                    <th className="px-6 py-3.5 text-center text-[10px] font-black uppercase tracking-widest text-white/30">Status</th>
                                    <th className="px-6 py-3.5 text-center text-[10px] font-black uppercase tracking-widest text-white/30">Action</th>
                                    <th className="px-6 py-3.5 text-center text-[10px] font-black uppercase tracking-widest text-white/30 whitespace-nowrap">Audit Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/[0.03]">
                                {icePackaging.map((p, i) => {
                                    const remaining = stock[p];
                                    const prod = produced[p];
                                    const sold = skuOrders[p];
                                    const pct = prod > 0 ? Math.max(0, remaining / prod) : 0;
                                    const isOut = remaining <= 0;
                                    const isLow = remaining > 0 && remaining < 10;
                                    const audit = skuAudits[p];
                                    return (
                                        <tr key={p} className="group/row transition-colors hover:bg-white/[0.02]">
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="h-6 w-1 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.1)]" style={{ backgroundColor: COLORS[i] }} />
                                                    <span className="text-sm font-black text-white">{p}</span>
                                                </div>
                                            </td>
                                            <td className="min-w-[120px] px-6 py-4">
                                                <div className="flex flex-col gap-1.5">
                                                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
                                                        <div className={`h-full transition-all duration-1000 ease-out shadow-[0_0_8px_rgba(255,255,255,0.1)] ${isOut ? 'bg-red-500' : isLow ? 'bg-yellow-500' : ''}`}
                                                            style={{ width: `${Math.min(100, pct * 100)}%`, backgroundColor: !isOut && !isLow ? COLORS[i] : undefined }} />
                                                    </div>
                                                    <div className="flex justify-between text-[8px] font-bold uppercase tracking-wider text-white/20">
                                                        <span>Capacity</span>
                                                        <span>{Math.round(pct * 100)}%</span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className={`px-6 py-4 text-center font-black tabular-nums ${isOut ? 'text-red-400' : 'text-white'}`}>
                                                {remaining}
                                            </td>
                                            <td className="px-6 py-4 text-center text-sm font-bold text-green-400 transition-transform group-hover/row:scale-110">
                                                {sold}
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-flex shrink-0 items-center justify-center rounded-full px-2.5 py-1 text-[9px] font-black tracking-wide shadow-sm ${isOut ? 'bg-red-500/10 text-red-500 border border-red-500/20' : isLow ? 'bg-yellow-500/10 text-yellow-500 border border-yellow-500/20' : 'bg-green-500/10 text-green-500 border border-green-500/20'}`}>
                                                    {isOut ? 'STOCKOUT' : isLow ? 'LOW STOCK' : 'AVAILABLE'}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <button onClick={() => setAuditingSku(p)} 
                                                    className={`group/btn relative flex min-w-[80px] items-center justify-center gap-1.5 overflow-hidden rounded-lg px-3 py-1.5 transition-all active:scale-95 border ${audit ? (audit.status === 'accurate' ? 'bg-green-500/10 border-green-500/20 text-green-400' : 'bg-red-500/10 border-red-500/20 text-red-400') : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/10 hover:text-white'}`}>
                                                    <span className="text-[10px] font-black uppercase tracking-widest">{audit ? (audit.status === 'accurate' ? 'Verified' : 'Flagged') : 'Audit SKU'}</span>
                                                </button>
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex flex-col items-center">
                                                    <span className="block font-mono text-[10px] font-bold text-white/30">{audit?.date || 'No Audit'}</span>
                                                    {audit?.variance > 0 && <span className="text-[9px] font-black text-red-500/70 mt-0.5">-{audit.variance} units</span>}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* FILTERED TRANSACTIONS */}
            <div className="pbi-card" style={{ ...card, padding: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <p style={{ ...lbl, fontSize: 10 }}>PRODUCTION ANALYTICS</p>

                    {/* DateRangePicker for Production Analytics */}
                    <div className="flex items-center gap-2">
                        <DateRangePicker
                            selectedDate={selectedDate} setSelectedDate={setSelectedDate}
                            selectedMonths={selectedMonths} setSelectedMonths={setSelectedMonths}
                            selectedWeeks={selectedWeeks} setSelectedWeeks={setSelectedWeeks}
                            expandedMonths={expandedMonths} setExpandedMonths={setExpandedMonths}
                            periodOpen={periodOpen} setPeriodOpen={setPeriodOpen} periodRef={periodRef}
                        />
                    </div>
                </div>

                <div className="overflow-x-auto min-h-[300px]">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="border-b border-white/5 bg-white/[0.01]">
                                <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-white/30">Date</th>
                                <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-white/30">Time Window</th>
                                <th className="px-6 py-3.5 text-center text-[10px] font-black uppercase tracking-widest text-white/30">Duration</th>
                                <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-white/30">Operator</th>
                                <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-widest text-white/30">Production Output (KG)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/[0.03]">
                            {filteredProduction.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="px-6 py-12 text-center">
                                        <p className="text-sm font-bold text-white/20 italic">No production runs found for this period.</p>
                                    </td>
                                </tr>
                            ) : filteredProduction.map((run: any, idx) => {
                                const units = icePackaging.map((p, i) => ({ packaging: p, count: parseInt(run[`units_${p}`] || 0), color: COLORS[i] })).filter(u => u.count > 0);
                                const totalCount = units.reduce((s, u) => s + u.count, 0);
                                const varianceVal = parseFloat(run.variance) || 0;
                                return (
                                    <tr key={idx} className="group/row hover:bg-white/[0.01] transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="text-sm font-black text-white">{run.date || (run.timestamp && run.timestamp.split(',')[0]) || '—'}</span>
                                        </td>
                                        <td className="px-6 py-4 font-mono text-[11px] text-white/50">
                                            {run.startTime} – {run.endTime}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <span className="inline-flex items-center rounded-lg bg-brand-blue/10 px-2 py-1 text-[10px] font-black text-brand-blue border border-brand-blue/20">
                                                {parseFloat(run.totalHours || 0).toFixed(1)} hrs
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <div className="h-6 w-6 rounded-full bg-brand-purple/20 flex items-center justify-center text-[10px] font-black text-brand-purple border border-brand-purple/30 uppercase">
                                                    {(run.staffName || 'A')[0]}
                                                </div>
                                                <span className="text-xs font-bold text-white/70">{run.staffName || 'Admin'}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="space-y-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-baseline gap-1">
                                                        <span className="text-xs font-black text-white tracking-widest">{run.totalWeight || 0}</span>
                                                        <span className="text-[9px] font-bold text-white/20 uppercase">KG</span>
                                                        <span className="mx-1.5 text-white/10">|</span>
                                                        <span className="text-[10px] font-bold text-white/40">Exp: {run.expectedYield || 0}</span>
                                                    </div>
                                                    <span className={`text-[10px] font-black ${varianceVal < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                                        {varianceVal > 0 ? '+' : ''}{varianceVal}%
                                                    </span>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="h-1 w-full overflow-hidden rounded-full bg-white/5 flex">
                                                        {units.map((u, i) => (
                                                            <div key={i} className="h-full transition-all duration-1000 ease-out"
                                                                style={{ width: `${(u.count / totalCount) * 100}%`, backgroundColor: u.color }} />
                                                        ))}
                                                    </div>
                                                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                                                        {units.map((u, i) => (
                                                            <span key={i} className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-tight text-white/40">
                                                                <span className="text-white font-black">{u.count}</span>
                                                                <span>{u.packaging}</span>
                                                            </span>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* SKU AUDIT MODAL */}
            {auditingSku && (
                <SkuAuditModal sku={auditingSku} adminPin={adminPin} onClose={() => setAuditingSku(null)} onSave={(status, variance) => handleSkuAuditSave(auditingSku, status, variance)} />
            )}

            {/* GLOBAL AUDIT MODAL */}
            {showGlobalAudit && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-md animate-in fade-in duration-300">
                    <div className="w-full max-w-[440px] rounded-3xl border border-white/10 bg-slate-900/95 p-8 shadow-2xl animate-in zoom-in-95 duration-300">
                        <div className="mb-6 flex items-center justify-between border-b border-white/5 pb-4">
                            <div>
                                <h3 className="text-2xl font-black tracking-tighter text-white">Full System Audit</h3>
                                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/30 mt-1">Global Inventory Verification</p>
                            </div>
                            <button onClick={closeGlobalAudit} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-white/50 hover:bg-white/10 hover:text-white transition-colors">✕</button>
                        </div>

                        {!authed ? (
                            <form onSubmit={e => { e.preventDefault(); pin === adminPin ? setAuthed(true) : (alert('Invalid PIN'), setPin('')); }} className="space-y-4">
                                <div className="text-center py-4">
                                    <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-blue/10 text-brand-blue mb-4 border border-brand-blue/20">
                                        <span className="text-2xl">🔒</span>
                                    </div>
                                    <p className="text-sm font-bold text-white/60">Administrator Access Required</p>
                                </div>
                                <input type="password" placeholder="••••••" value={pin} onChange={e => setPin(e.target.value)}
                                    className="w-full rounded-2xl border border-white/10 bg-white/5 p-4 text-center text-3xl tracking-[0.3em] text-white outline-none focus:border-brand-blue/50 transition-all font-mono" autoFocus />
                                <div className="flex gap-3 pt-2">
                                    <button type="button" onClick={closeGlobalAudit} className="flex-1 rounded-xl border border-white/10 bg-transparent py-4 text-sm font-bold text-white/40 hover:bg-white/5 transition-all">Cancel</button>
                                    <button type="submit" className="flex-1 rounded-xl bg-gradient-to-r from-brand-blue to-brand-purple py-4 text-sm font-black text-black shadow-lg shadow-brand-blue/20 hover:scale-[1.02] active:scale-95 transition-all">Unlock</button>
                                </div>
                            </form>
                        ) : (
                            <div className="space-y-8 animate-in slide-in-from-bottom-4 duration-500">
                                <div className="grid grid-cols-2 gap-4">
                                    {(['match', 'mismatch'] as const).map(s => (
                                        <button key={s} onClick={() => setAuditStatus(s)}
                                            className={`relative flex flex-col items-center gap-2 rounded-2xl border-2 p-5 transition-all ${auditStatus === s
                                                ? s === 'match' ? 'border-green-500/50 bg-green-500/10 text-green-400' : 'border-red-500/50 bg-red-500/10 text-red-400'
                                                : 'border-white/5 bg-white/5 text-white/30 hover:bg-white/10'}`}>
                                            <span className="text-2xl">{s === 'match' ? '✓' : '⚠'}</span>
                                            <span className="text-[10px] font-black uppercase tracking-widest">{s === 'match' ? 'Stock Match' : 'Mismatch Found'}</span>
                                        </button>
                                    ))}
                                </div>

                                {auditStatus === 'mismatch' && (
                                    <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-300">
                                        <label className="block text-[10px] font-black uppercase tracking-[0.2em] text-white/30 pl-1">Missing Units per SKU</label>
                                        <div className="grid grid-cols-3 gap-3">
                                            {ICE_PACKAGING.map(p => (
                                                <div key={p} className="p-3 rounded-xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-colors">
                                                    <label className="block text-[9px] font-black text-white/30 uppercase mb-2 truncate">{p}</label>
                                                    <input type="number" min={0} placeholder="0" value={missing[p] || ''} 
                                                        onChange={e => setMissing(prev => ({ ...prev, [p]: parseInt(e.target.value) || 0 }))} 
                                                        className="w-full bg-transparent text-sm font-black text-white outline-none border-b border-white/10 focus:border-red-500/50 pb-1" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex gap-3 pt-4">
                                    <button onClick={closeGlobalAudit} className="flex-1 rounded-xl border border-white/10 bg-transparent py-4 text-sm font-bold text-white/40 hover:bg-white/5 transition-all">Cancel</button>
                                    <button onClick={submitGlobalAudit} disabled={!auditStatus || saving}
                                        className={`flex-1 rounded-xl py-4 text-sm font-black transition-all shadow-xl ${!auditStatus 
                                            ? 'bg-white/5 text-white/20' 
                                            : auditStatus === 'match' ? 'bg-green-500 text-black shadow-green-500/20' : 'bg-red-500 text-white shadow-red-500/20'} ${saving ? 'opacity-50 cursor-not-allowed' : 'hover:scale-[1.02] active:scale-95'}`}>
                                        {saving ? 'Processing...' : 'Submit Final Audit'}
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
