'use client';

import { useState, useEffect, useMemo, useRef } from 'react';

function getTodayISO(): string {
    const d = new Date();
    const ph = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const y = ph.getUTCFullYear();
    const m = String(ph.getUTCMonth() + 1).padStart(2, '0');
    const day = String(ph.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
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

// Generate the last 12 months as selectable labels (e.g. "March 2026")
// independent of any loaded payroll data so past months are always visible.
function getLast12Months(): string[] {
    const months: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d.toLocaleString('default', { month: 'long', year: 'numeric' }));
    }
    return months;
}


interface ShiftRow {
    date: string; staffName: string; role: string;
    clockIn: string; clockOut: string; logoutDate: string;
    hours: number; basePay: number; netPay: number; auditNote: string;
}
interface CommissionLine {
    type: 'water' | 'ice';
    itemName: string; qty: number; kgEach?: number; commission: number;
    date: string; customer: string; row: number;
}
interface Commission {
    totalWaterContainers: number; waterCommission: number;
    totalIceKg: number; iceCommission: number;
    lines: CommissionLine[];
    totalCommission: number;
}
interface EmployeePayroll {
    name: string; role: string; shifts: ShiftRow[];
    totalHours: number; totalBasePay: number;
    commission: Commission; grandTotal: number;
}

const fmt = (n: number | string | undefined | null) => {
    const val = typeof n === 'number' ? n : parseFloat(String(n || 0));
    return `₱${(isNaN(val) ? 0 : val).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export default function PayrollPage() {
    const [pin, setPin] = useState('');
    const [adminPin, setAdminPin] = useState('');
    const [pinError, setPinError] = useState(false);
    const [unlocked, setUnlocked] = useState(false);
    const [loading, setLoading] = useState(true);
    const [payroll, setPayroll] = useState<EmployeePayroll[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [expandedShifts, setExpandedShifts] = useState(false);
    const [isFilterMode, setIsFilterMode] = useState(false);

    // Period Selection State
    const allWeeks = useMemo(() => getWorkWeeks(), []);
    const allMonths = useMemo(() => getLast12Months(), []);
    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [selectedWeeks, setSelectedWeeks] = useState<number[]>([]);
    const [selectedDate, setSelectedDate] = useState<string>('');
    const [periodOpen, setPeriodOpen] = useState(false);
    const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
    const periodRef = useRef<HTMLDivElement>(null);

    // Group months with their weeks (same pattern as Sales History)
    const groupedPeriods = useMemo(() => allMonths.map(mStr => {
        const weeksInMonth = allWeeks
            .map((w, i) => ({ w, i }))
            .filter(({ w }) => {
                const mst = w.start.toLocaleString('default', { month: 'long', year: 'numeric' });
                const men = w.end.toLocaleString('default', { month: 'long', year: 'numeric' });
                return mst === mStr || men === mStr;
            });
        return { month: mStr, weeks: weeksInMonth };
    }), [allMonths, allWeeks]);

    // Click-outside closes the period dropdown
    useEffect(() => {
        const h = (e: MouseEvent) => {
            if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodOpen(false);
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    useEffect(() => {
        fetch('/api/sheet?tab=pos')
            .then(r => r.json())
            .then(d => { if (d.adminPin) setAdminPin(d.adminPin); })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const fetchPayroll = () => {
        setLoading(true);
        let url = '/api/sheet?tab=payroll';
        if (selectedDate) {
            url += `&startDate=${selectedDate}&endDate=${selectedDate}`;
        } else if (selectedWeeks.length > 0) {
            const w = allWeeks[selectedWeeks[0]];
            url += `&startDate=${w.start.toISOString()}&endDate=${w.end.toISOString()}`;
        } else if (selectedMonths.length > 0) {
            const [m, y] = selectedMonths[0].split(' ');
            const start = new Date(`${m} 1, ${y}`);
            const end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
            url += `&startDate=${start.toISOString()}&endDate=${end.toISOString()}`;
        } else {
            // Default to current month if nothing selected
            const now = new Date();
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            url += `&startDate=${start.toISOString()}&endDate=${end.toISOString()}`;
        }

        fetch(url, { cache: 'no-store' })
            .then(r => r.json())
            .then(d => {
                setPayroll(d.payroll || []);
                if (d.payroll?.length && !selected) setSelected(d.payroll[0].name);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (unlocked) fetchPayroll();
    }, [unlocked, selectedMonths, selectedWeeks, selectedDate]);

    const submitPin = () => {
        if (pin === adminPin) {
            setUnlocked(true);
        } else {
            setPinError(true);
            setPin('');
            setTimeout(() => setPinError(false), 600);
        }
    };

    const emp = payroll.find(e => e.name === selected);

    // Shared styles
    const card: React.CSSProperties = { background: 'linear-gradient(135deg,rgba(15,23,42,0.97),rgba(15,30,55,0.97))', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 16 };
    const lbl: React.CSSProperties = { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' };
    const mono: React.CSSProperties = { fontFamily: 'monospace, monospace', fontSize: 12 };

    // ── PIN Gate ───────────────────────────────────────────────────────────────
    if (!unlocked) return (
        <div style={{ maxWidth: 400, margin: '80px auto' }}>
            <style>{`
                @keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
                @keyframes spin{to{transform:rotate(360deg)}}
                @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
            `}</style>
            <div style={{ ...card, padding: 40, textAlign: 'center', boxShadow: '0 30px 80px rgba(0,0,0,0.6)', animation: 'fadeUp 0.4s ease' }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>💼</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', marginBottom: 4 }}>Payroll</div>
                <div style={{ ...lbl, marginBottom: 28 }}>Admin access required</div>
                <input
                    type="password" maxLength={6} autoFocus
                    value={pin} onChange={e => setPin(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitPin()}
                    placeholder="● ● ● ● ● ●"
                    style={{ width: '100%', padding: '16px', textAlign: 'center', fontSize: 24, letterSpacing: '0.4em', background: 'rgba(255,255,255,0.06)', border: `1px solid ${pinError ? 'rgba(255,71,87,0.7)' : 'rgba(255,255,255,0.12)'}`, borderRadius: 14, color: '#fff', outline: 'none', boxSizing: 'border-box', marginBottom: 12, animation: pinError ? 'shake 0.4s ease' : 'none', transition: 'border-color 0.25s' }}
                />
                {pinError && <p style={{ fontSize: 12, color: '#FF4757', marginBottom: 12, fontWeight: 700 }}>Incorrect PIN</p>}
                <button onClick={submitPin} disabled={loading || !adminPin}
                    style={{ width: '100%', padding: '14px', background: loading || !adminPin ? '#333' : 'linear-gradient(135deg,#00D2FF,#3A7BD5)', color: loading || !adminPin ? '#888' : '#000', fontWeight: 900, fontSize: 14, borderRadius: 12, border: 'none', cursor: loading || !adminPin ? 'not-allowed' : 'pointer', letterSpacing: '0.05em', boxShadow: loading || !adminPin ? 'none' : '0 4px 20px rgba(0,210,255,0.25)' }}>
                    {loading ? 'Initializing...' : 'Unlock Payroll'}
                </button>
            </div>
        </div>
    );

    // ── Main Payroll View ──────────────────────────────────────────────────────
    return (
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <style>{`
                @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
                @keyframes spin{to{transform:rotate(360deg)}}
                .pbi-c{animation:fadeUp 0.35s ease-out both}
                .emp-pill:hover{opacity:0.85;}
                .sh-row:hover{background:rgba(255,255,255,0.025)!important}
            `}</style>

            {/* Header / Controls */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
                <div>
                    <h2 style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em', margin: 0 }}>Payroll</h2>
                    <p style={{ ...lbl, marginTop: 4, fontSize: 11 }}>● Shift & Commission Logs · {
                        selectedDate ? new Date(selectedDate).toLocaleDateString() :
                            selectedWeeks.length > 0 ? `Week 40 - ${allWeeks[selectedWeeks[0]].start.toLocaleDateString()}` :
                                selectedMonths.length > 0 ? selectedMonths[0] : 'Current Month'
                    }</p>
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                    <button onClick={() => {
                        const today = getTodayISO();
                        setSelectedDate(today);
                        setSelectedWeeks([]);
                        setSelectedMonths([]);
                    }} style={{ background: 'rgba(255,255,255,0.06)', color: '#fff', fontWeight: 800, fontSize: 11, padding: '8px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', cursor: 'pointer' }}>
                        TODAY
                    </button>
                    <button onClick={fetchPayroll} style={{ background: 'linear-gradient(135deg, #00D2FF, #3A7BD5)', color: '#000', fontWeight: 900, fontSize: 12, padding: '10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', letterSpacing: '0.06em', boxShadow: '0 4px 20px rgba(0,210,255,0.25)' }}>
                        ↺ REFRESH
                    </button>
                    <button onClick={() => setUnlocked(false)} style={{ padding: '10px 20px', background: 'rgba(255,71,87,0.1)', border: '1px solid rgba(255,71,87,0.25)', borderRadius: 10, color: '#FF4757', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>🔒 Lock</button>
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ ...lbl, fontSize: 11 }}>● Salary &amp; Commission Breakdown</span>
                    <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.1)' }} />
                    <button onClick={() => setIsFilterMode(!isFilterMode)}
                        style={{ background: isFilterMode ? '#00D2FF' : 'rgba(255,255,255,0.05)', border: 'none', borderRadius: 6, color: isFilterMode ? '#000' : 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 800, padding: '3px 10px', cursor: 'pointer', transition: '0.2s' }}>
                        {isFilterMode ? '👓 Filter Active' : '🔍 Discussion Mode'}
                    </button>
                </div>
            </div>

            {/* Period Selector — Sales History style */}
            <div style={{ position: 'relative', marginBottom: 20 }} ref={periodRef}>
                <p style={{ ...lbl, marginBottom: 6 }}>Calendar</p>
                <button
                    onClick={() => setPeriodOpen(o => !o)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: selectedDate ? 'rgba(0,210,255,0.1)' : 'rgba(255,255,255,0.06)', border: `1px solid ${selectedDate ? 'rgba(0,210,255,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, color: selectedDate ? '#00D2FF' : '#fff', fontSize: 13, fontWeight: 700, outline: 'none', cursor: 'pointer', minWidth: 200, boxSizing: 'border-box', whiteSpace: 'nowrap', transition: 'all 0.15s' }}
                >
                    {selectedDate ? selectedDate : (selectedMonths.length === 0 && selectedWeeks.length === 0 ? 'Current Month' : `${selectedMonths.length + selectedWeeks.length} Selected`)}
                    <span style={{ marginLeft: 'auto', fontSize: 10, transform: periodOpen ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}>▾</span>
                </button>

                {periodOpen && (
                    <div style={{ position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 100, background: '#0f1e37', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 12, width: 290, maxHeight: 400, overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>

                        {/* Header: Select All / Clear */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                            <button onClick={() => { setSelectedMonths(allMonths); setSelectedWeeks([]); setSelectedDate(''); }} style={{ fontSize: 11, color: '#00D2FF', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Select All</button>
                            <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                            <button onClick={() => { setSelectedMonths([]); setSelectedWeeks([]); setExpandedMonths([]); setSelectedDate(''); setPeriodOpen(false); }} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,107,107,0.8)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
                        </div>

                        {/* Specific Date */}
                        <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <button onClick={() => setExpandedMonths(prev => prev.includes('specific_date') ? prev.filter(m => m !== 'specific_date') : [...prev, 'specific_date'])} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', width: 20, textAlign: 'center' }}>
                                    {expandedMonths.includes('specific_date') ? '▾' : '▸'}
                                </button>
                                <span onClick={() => { setExpandedMonths(prev => prev.includes('specific_date') ? prev.filter(m => m !== 'specific_date') : [...prev, 'specific_date']); }} style={{ fontSize: 13, fontWeight: 800, color: selectedDate ? '#fff' : 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>Specific Date</span>
                            </div>
                            {expandedMonths.includes('specific_date') && (
                                <div style={{ paddingLeft: 36, marginTop: 8 }}>
                                    <input
                                        type="date" value={selectedDate}
                                        onChange={e => { setSelectedDate(e.target.value); setSelectedMonths([]); setSelectedWeeks([]); setPeriodOpen(false); }}
                                        style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,210,255,0.3)', borderRadius: 10, color: '#00D2FF', fontWeight: 700, fontSize: 13, outline: 'none', cursor: 'pointer', colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Month + Week tree */}
                        {groupedPeriods.map(g => {
                            const isMonthSel = selectedMonths.includes(g.month) && !selectedDate;
                            const selCount = !selectedDate ? g.weeks.filter(({ i }) => selectedWeeks.includes(i)).length : 0;
                            const isPartial = !isMonthSel && selCount > 0 && selCount < g.weeks.length;
                            const isFullySel = isMonthSel || (selCount === g.weeks.length && g.weeks.length > 0);
                            const isExpanded = expandedMonths.includes(g.month);
                            return (
                                <div key={g.month} style={{ marginBottom: 6 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                        <button onClick={() => setExpandedMonths(prev => prev.includes(g.month) ? prev.filter(m => m !== g.month) : [...prev, g.month])} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', width: 20, textAlign: 'center' }}>
                                            {isExpanded ? '▾' : '▸'}
                                        </button>
                                        <input
                                            type="checkbox"
                                            checked={isFullySel}
                                            ref={el => { if (el) el.indeterminate = isPartial; }}
                                            onChange={() => {
                                                setSelectedDate('');
                                                if (isFullySel) {
                                                    setSelectedMonths(m => m.filter(x => x !== g.month));
                                                    setSelectedWeeks(w => w.filter(x => !g.weeks.some(gw => gw.i === x)));
                                                } else {
                                                    setSelectedMonths(m => Array.from(new Set([...m, g.month])));
                                                    setSelectedWeeks(w => w.filter(x => !g.weeks.some(gw => gw.i === x)));
                                                }
                                            }}
                                            style={{ accentColor: '#00D2FF', width: 14, height: 14, cursor: 'pointer' }}
                                        />
                                        <span onClick={() => setExpandedMonths(prev => prev.includes(g.month) ? prev.filter(m => m !== g.month) : [...prev, g.month])} style={{ fontSize: 13, fontWeight: 800, color: isFullySel || isPartial ? '#fff' : 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                                            {g.month}
                                        </span>
                                    </div>
                                    {isExpanded && (
                                        <div style={{ paddingLeft: 36, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5, borderLeft: '1px dashed rgba(255,255,255,0.1)', marginLeft: 10, paddingBottom: 4 }}>
                                            {g.weeks.length === 0 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>No weeks</span>}
                                            {g.weeks.map(({ w, i }) => {
                                                const isWeekSel = isFullySel || selectedWeeks.includes(i);
                                                return (
                                                    <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isFullySel ? 'default' : 'pointer' }}>
                                                        <input
                                                            type="checkbox"
                                                            checked={isWeekSel}
                                                            disabled={isFullySel}
                                                            onChange={() => {
                                                                setSelectedDate('');
                                                                if (isFullySel) return;
                                                                setSelectedWeeks(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);
                                                            }}
                                                            style={{ accentColor: '#00D2FF', width: 12, height: 12 }}
                                                        />
                                                        <span style={{ fontSize: 11, fontWeight: isWeekSel ? 700 : 500, color: isWeekSel ? '#00D2FF' : 'rgba(255,255,255,0.5)' }}>
                                                            {w.label}
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

            {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', background: 'rgba(0,210,255,0.05)', border: '1px solid rgba(0,210,255,0.15)', borderRadius: 10, marginBottom: 20 }}>
                    <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(0,210,255,0.3)', borderTopColor: '#00D2FF', animation: 'spin 1s linear infinite' }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#00D2FF' }}>Loading payroll data...</span>
                </div>
            )}

            {!loading && payroll.length === 0 && (
                <div style={{ ...card, padding: 60, textAlign: 'center' }}>
                    <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.3 }}>📋</div>
                    <p style={{ color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>No completed shift records found.</p>
                </div>
            )}

            {!loading && payroll.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: isFilterMode ? '1fr' : '220px 1fr', gap: 20, alignItems: 'start' }}>

                    {/* ── Employee Sidebar ── */}
                    {(!isFilterMode) && (
                        <div className="pbi-c" style={{ ...card, overflow: 'hidden' }}>
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                                <span style={lbl}>Employees</span>
                            </div>
                            {payroll.map(e => (
                                <button key={e.name} className="emp-pill" onClick={() => { setSelected(e.name); setExpandedShifts(false); }}
                                    style={{ width: '100%', padding: '14px 16px', background: selected === e.name ? 'rgba(0,210,255,0.08)' : 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.04)', borderLeft: `3px solid ${selected === e.name ? '#00D2FF' : 'transparent'}`, cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s' }}>
                                    <div style={{ fontSize: 13, fontWeight: 800, color: selected === e.name ? '#fff' : 'rgba(255,255,255,0.6)' }}>{e.name}</div>
                                    <div style={{ fontSize: 10, color: selected === e.name ? '#00D2FF' : 'rgba(255,255,255,0.3)', fontWeight: 600, marginTop: 2 }}>{e.role}</div>
                                    <div style={{ fontSize: 12, fontWeight: 900, color: '#4ECB71', marginTop: 6 }}>{fmt(e.grandTotal)}</div>
                                </button>
                            ))}
                        </div>
                    )}
                    {isFilterMode && (
                        <div className="pbi-c" style={{ ...card, padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                            <div style={lbl}>Select Person</div>
                            <select
                                value={selected || ''}
                                onChange={(e) => setSelected(e.target.value)}
                                style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontWeight: 700 }}
                            >
                                {payroll.map(e => <option key={e.name} value={e.name} style={{ background: '#0f172a' }}>{e.name}</option>)}
                            </select>
                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: 0 }}>Discussion mode hides all other employee data for privacy.</p>
                        </div>
                    )}

                    {/* ── Employee Detail ── */}
                    {emp && (
                        <div className="pbi-c" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

                            {/* KPI row */}
                            {!isFilterMode && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
                                    {[
                                        { label: 'Total Hours', value: `${emp.totalHours}h`, color: '#00D2FF', bg: 'rgba(0,210,255,0.08)', border: 'rgba(0,210,255,0.2)' },
                                        { label: 'Base Pay', value: fmt(emp.totalBasePay), color: '#A78BFA', bg: 'rgba(167,139,250,0.08)', border: 'rgba(167,139,250,0.2)' },
                                        { label: 'Commission', value: fmt(emp.commission?.totalCommission || 0), color: '#FF9500', bg: 'rgba(255,149,0,0.08)', border: 'rgba(255,149,0,0.2)' },
                                        { label: 'Grand Total', value: fmt(emp.grandTotal), color: '#4ECB71', bg: 'rgba(78,203,113,0.08)', border: 'rgba(78,203,113,0.2)' },
                                    ].map(k => (
                                        <div key={k.label} style={{ ...card, padding: '16px 18px', background: k.bg, border: `1px solid ${k.border}` }}>
                                            <div style={{ ...lbl, color: k.color, marginBottom: 8 }}>{k.label}</div>
                                            <div style={{ fontSize: 20, fontWeight: 900, color: k.color }}>{k.value}</div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {isFilterMode && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                                    {/* Navigation / Exit */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <button onClick={() => setIsFilterMode(false)}
                                            style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, color: '#fff', fontSize: 13, fontWeight: 700, padding: '12px 24px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                                            ⇠ EXIT DISCUSSION MODE
                                        </button>
                                        <div style={{ ...lbl, fontSize: 12, color: '#00D2FF' }}>Viewing: {emp.name}</div>
                                    </div>

                                    {/* Main Summary Cards */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                                        <div style={{ ...card, padding: '24px', background: 'rgba(167,139,250,0.07)', border: '1px solid rgba(167,139,250,0.2)', textAlign: 'center' }}>
                                            <div style={{ ...lbl, color: '#A78BFA', marginBottom: 8 }}>Daily Salary (Base Pay)</div>
                                            <div style={{ fontSize: 32, fontWeight: 900, color: '#A78BFA' }}>{fmt(emp.totalBasePay)}</div>
                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Total for {emp.shifts.length} shifts</div>
                                        </div>
                                        <div style={{ ...card, padding: '24px', background: 'rgba(255,149,0,0.07)', border: '1px solid rgba(255,149,0,0.2)', textAlign: 'center' }}>
                                            <div style={{ ...lbl, color: '#FF9500', marginBottom: 8 }}>Commission Earned</div>
                                            <div style={{ fontSize: 32, fontWeight: 900, color: '#FF9500' }}>{fmt(emp.commission?.totalCommission || 0)}</div>
                                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Based on deliveries</div>
                                        </div>
                                    </div>

                                    <div style={{ ...card, padding: '32px', background: 'rgba(78,203,113,0.08)', border: '1px solid rgba(78,203,113,0.3)', textAlign: 'center', boxShadow: '0 10px 40px rgba(78,203,113,0.1)' }}>
                                        <div style={{ ...lbl, color: '#4ECB71', marginBottom: 10, fontSize: 12 }}>Total Payout Amount</div>
                                        <div style={{ fontSize: 56, fontWeight: 900, color: '#4ECB71', letterSpacing: '-0.03em' }}>{fmt(emp.grandTotal)}</div>
                                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 12, fontWeight: 600 }}>Release this amount for the selected period.</div>
                                    </div>

                                    {/* Itemized Commission Breakdown */}
                                    <div style={{ ...card, overflow: 'hidden' }}>
                                        <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
                                            <span style={{ ...lbl, color: '#fff' }}>📋 Detailed Commission Breakdown</span>
                                            <p style={{ margin: '4px 0 0 0', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Calculation: Ice = ₱1.00 per 25kg (pooled) | Water = ₱1.00 per container</p>
                                        </div>
                                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                            <thead>
                                                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                                                    {['Date', 'Customer', 'Item Detail', 'Qty', 'Weight', 'Commission'].map(h => (
                                                        <th key={h} style={{ ...lbl, fontSize: 9, padding: '12px 14px', textAlign: h === 'Commission' || h === 'Qty' ? 'right' : 'left' }}>{h}</th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(() => {
                                                    let runningIceKg = 0;
                                                    return emp.commission.lines.map((l, i) => {
                                                        const isIce = l.type === 'ice';
                                                        let contribution = '—';

                                                        if (isIce) {
                                                            const kg = (l.kgEach || 0) * l.qty;
                                                            runningIceKg += kg;
                                                            contribution = `${kg}kg contribution`;
                                                        } else {
                                                            contribution = 'Direct (Water)';
                                                        }

                                                        return (
                                                            <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                                <td style={{ padding: '12px 14px', ...mono, color: 'rgba(255,255,255,0.5)', fontSize: 11 }}>{l.date}</td>
                                                                <td style={{ padding: '12px 14px', fontSize: 12, fontWeight: 700, color: '#fff' }}>{l.customer}</td>
                                                                <td style={{ padding: '12px 14px', fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
                                                                    {l.itemName}
                                                                    {isIce && <span style={{ fontSize: 9, color: '#00D2FF', marginLeft: 8, fontWeight: 800 }}>({l.kgEach}kg each)</span>}
                                                                </td>
                                                                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: '#fff' }}>{l.qty}</td>
                                                                <td style={{ padding: '12px 14px', fontSize: 10, color: isIce ? '#00D2FF' : 'rgba(255,255,255,0.3)', fontWeight: 700 }}>
                                                                    {contribution}
                                                                </td>
                                                                <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 900, color: l.commission > 0 ? '#4ECB71' : 'rgba(255,255,255,0.2)', fontSize: 13 }}>
                                                                    {l.commission > 0 ? `+₱${l.commission.toFixed(2)}` : (isIce ? `₱${(((l.kgEach || 0) * l.qty) / 25).toFixed(2)} contribution` : '—')}
                                                                </td>
                                                            </tr>
                                                        );
                                                    });
                                                })()}
                                            </tbody>
                                        </table>
                                        <div style={{ padding: '16px 20px', background: 'rgba(0,0,0,0.2)', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'flex-end', gap: 20 }}>
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ ...lbl, fontSize: 8 }}>Total Ice Weight</div>
                                                <div style={{ fontSize: 16, fontWeight: 900, color: '#00D2FF' }}>{emp.commission.totalIceKg} kg</div>
                                            </div>
                                            <div style={{ width: 1, height: 30, background: 'rgba(255,255,255,0.1)' }} />
                                            <div style={{ textAlign: 'right' }}>
                                                <div style={{ ...lbl, fontSize: 8 }}>Total Commission</div>
                                                <div style={{ fontSize: 16, fontWeight: 900, color: '#FF9500' }}>{fmt(emp.commission.totalCommission)}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Shift History */}
                            <div style={{ ...card, overflow: 'hidden', marginTop: isFilterMode ? 20 : 0 }}>
                                <div style={{ padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={lbl}>⏱ Daily Salary Logs (shifts)</span>
                                    <button onClick={() => setExpandedShifts(v => !v)}
                                        style={{ padding: '4px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, color: 'rgba(255,255,255,0.5)', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>
                                        {expandedShifts ? 'Show Less ▲' : 'Show All ▼'}
                                    </button>
                                </div>
                                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                    <thead>
                                        <tr style={{ background: 'rgba(0,0,0,0.2)' }}>
                                            {['Login Date', 'Login Time', 'Logout Time', 'Hours', 'Pay', 'Comm', 'Override?'].map(h => (
                                                <th key={h} style={{ ...lbl, fontSize: 8, padding: '8px 14px', textAlign: ['Hours', 'Pay', 'Comm'].includes(h) ? 'right' : 'left', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>{h}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(expandedShifts ? emp.shifts : emp.shifts.slice(0, 5)).map((s, i) => {
                                            const shiftComm = emp.commission?.lines
                                                .filter(l => l.date === s.date)
                                                .reduce((sum, l) => sum + (l.commission || 0), 0) || 0;

                                            return (
                                                <tr key={i} className="sh-row" style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                                                    <td style={{ padding: '10px 14px', ...mono, color: 'rgba(255,255,255,0.7)' }}>{s.date}</td>
                                                    <td style={{ padding: '10px 14px', ...mono, color: '#00D2FF', fontWeight: 800 }}>{s.clockIn}</td>
                                                    <td style={{ padding: '10px 14px', ...mono, color: '#FF9500', fontWeight: 800 }}>{s.clockOut}</td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 900, color: '#4ECB71', fontSize: 12 }}>{s.hours}h</td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 900, color: '#A78BFA', fontSize: 12 }}>{fmt(s.netPay)}</td>
                                                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 900, color: '#FF9500', fontSize: 12 }}>{shiftComm > 0 ? `+₱${shiftComm.toFixed(2)}` : '—'}</td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        {s.auditNote
                                                            ? <span title={s.auditNote} style={{ fontSize: 9, fontWeight: 900, color: '#FFD93D', background: 'rgba(255,217,61,0.1)', padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(255,217,61,0.25)', cursor: 'help' }}>OVERRIDE ⓘ</span>
                                                            : <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)' }}>—</span>
                                                        }
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                                <div style={{ padding: '16px 20px', background: 'rgba(78,203,113,0.05)', borderTop: '1px solid rgba(78,203,113,0.15)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <div style={{ ...lbl, color: '#4ECB71' }}>Grand Total Payout</div>
                                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>Base Pay {fmt(emp.totalBasePay)} + Commission {fmt(emp.commission?.totalCommission || 0)}</div>
                                    </div>
                                    <div style={{ fontSize: 26, fontWeight: 900, color: '#4ECB71' }}>{fmt(emp.grandTotal)}</div>
                                </div>
                            </div>

                        </div>
                    )}
                </div>
            )
            }
        </div >
    );
}
