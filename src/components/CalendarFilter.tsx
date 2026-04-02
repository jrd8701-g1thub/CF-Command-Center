'use client';

import { useState, useEffect, useRef, useMemo } from 'react';

export function getTodayISO(): string {
    const d = new Date();
    const ph = new Date(d.getTime() + 8 * 60 * 60 * 1000);
    const y = ph.getUTCFullYear();
    const m = String(ph.getUTCMonth() + 1).padStart(2, '0');
    const day = String(ph.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

export function getWorkWeeks() {
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

export function getPHDateISO(ts: string): string {
    if (!ts) return '';
    const datePart = ts.split(' ')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
    try {
        const d = new Date(ts);
        if (!isNaN(d.getTime())) {
            const dPH = new Date(d.getTime() + (ts.includes('Z') || ts.includes('+') ? 8 * 60 * 60 * 1000 : 0));
            return dPH.getUTCFullYear() + '-' + String(dPH.getUTCMonth() + 1).padStart(2, '0') + '-' + String(dPH.getUTCDate()).padStart(2, '0');
        }
    } catch { }
    return datePart;
}

interface CalendarFilterProps {
    availableDates: string[]; // ISO YYYY-MM-DD
    selectedDate: string;
    setSelectedDate: (d: string) => void;
    selectedMonths: string[];
    setSelectedMonths: React.Dispatch<React.SetStateAction<string[]>>;
    selectedWeeks: number[];
    setSelectedWeeks: React.Dispatch<React.SetStateAction<number[]>>;
}

export default function CalendarFilter({
    availableDates,
    selectedDate,
    setSelectedDate,
    selectedMonths,
    setSelectedMonths,
    selectedWeeks,
    setSelectedWeeks
}: CalendarFilterProps) {
    const [periodOpen, setPeriodOpen] = useState(false);
    const periodRef = useRef<HTMLDivElement>(null);
    const [expandedMonths, setExpandedMonths] = useState<string[]>([]);
    
    const allWeeks = useMemo(() => getWorkWeeks(), []);
    const currentWeekIdx = useMemo(() => { const n = new Date(); return allWeeks.findIndex(w => n >= w.start && n <= w.end); }, [allWeeks]);

    useEffect(() => {
        const h = (e: MouseEvent) => { if (periodRef.current && !periodRef.current.contains(e.target as Node)) setPeriodOpen(false); };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const months = useMemo(() => {
        const set = new Set<string>();
        availableDates.forEach(ds => {
            try {
                const date = new Date(ds + 'T12:00:00Z');
                set.add(date.toLocaleString('default', { month: 'long', year: 'numeric', timeZone: 'UTC' }));
            } catch { }
        });
        return Array.from(set).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
    }, [availableDates]);

    const weeksWithData = useMemo(() => {
        return [...allWeeks.map((w, i) => ({ w, i }))]
            .filter(({ i }) => availableDates.some(ds => {
                try {
                    const d = new Date(ds + 'T12:00:00Z').getTime();
                    return d >= allWeeks[i].start.getTime() && d <= allWeeks[i].end.getTime();
                } catch { return false; }
            }))
            .reverse();
    }, [availableDates, allWeeks]);

    const groupedPeriods = useMemo(() => {
        return months.map(mStr => {
            const weeksInMonth = weeksWithData.filter(({ w }) => {
                const mst = w.start.toLocaleString('default', { month: 'long', year: 'numeric' });
                const men = w.end.toLocaleString('default', { month: 'long', year: 'numeric' });
                return mst === mStr || men === mStr;
            });
            const uniqueWeeks = Array.from(new Map(weeksInMonth.map(item => [item.i, item])).values());
            return { month: mStr, weeks: uniqueWeeks };
        });
    }, [months, weeksWithData]);

    const lbl: React.CSSProperties = { color: 'rgba(255,255,255,0.45)', fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' };

    return (
        <div ref={periodRef} style={{ position: 'relative' }}>
            <p style={{ ...lbl, marginBottom: 6 }}>Calendar</p>
            <button onClick={() => setPeriodOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', background: selectedDate ? 'rgba(0,210,255,0.1)' : 'rgba(255,255,255,0.06)', border: `1px solid ${selectedDate ? 'rgba(0,210,255,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 10, color: selectedDate ? '#00D2FF' : '#fff', fontSize: 13, fontWeight: 700, outline: 'none', cursor: 'pointer', width: '100%', boxSizing: 'border-box', whiteSpace: 'nowrap', transition: 'all 0.15s' }}>
                {selectedDate ? selectedDate : (selectedMonths.length === 0 && selectedWeeks.length === 0 ? 'All Periods' : `${selectedMonths.length + selectedWeeks.length} Selected`)}
                <span style={{ marginLeft: 'auto', fontSize: 10, transform: periodOpen ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}>▾</span>
            </button>
            {periodOpen && (
                <div className="pbi-c" style={{ position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 50, background: '#0f1e37', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, padding: 12, width: 280, maxHeight: 380, overflowY: 'auto', boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <button onClick={() => { setSelectedMonths(months); setSelectedWeeks([]); setSelectedDate(''); }} style={{ fontSize: 11, color: '#00D2FF', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Select All</button>
                        <span style={{ color: 'rgba(255,255,255,0.2)' }}>|</span>
                        <button onClick={() => { setSelectedMonths([]); setSelectedWeeks([]); setExpandedMonths([]); setSelectedDate(''); }} style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,107,107,0.8)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Clear</button>
                    </div>

                    <div style={{ marginBottom: 10, paddingBottom: 10, borderBottom: '1px dashed rgba(255,255,255,0.1)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button onClick={() => setExpandedMonths(prev => prev.includes('specific_date') ? prev.filter(m => m !== 'specific_date') : [...prev, 'specific_date'])} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', width: 20, textAlign: 'center', transition: 'color 0.15s' }}>
                                {expandedMonths.includes('specific_date') ? '▾' : '▸'}
                            </button>
                            <span onClick={() => {
                                setExpandedMonths(prev => prev.includes('specific_date') ? prev.filter(m => m !== 'specific_date') : [...prev, 'specific_date']);
                                if (!selectedDate) setSelectedDate(getTodayISO());
                            }} style={{ fontSize: 13, fontWeight: 800, color: selectedDate ? '#fff' : 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                                Specific Date
                            </span>
                        </div>
                        {expandedMonths.includes('specific_date') && (
                            <div style={{ paddingLeft: 36, marginTop: 8 }}>
                                <input
                                    type="date"
                                    value={selectedDate}
                                    onChange={e => { setSelectedDate(e.target.value); setSelectedMonths([]); setSelectedWeeks([]); }}
                                    style={{ padding: '8px 14px', background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(0,210,255,0.3)', borderRadius: 10, color: '#00D2FF', fontWeight: 700, fontSize: 13, outline: 'none', cursor: 'pointer', colorScheme: 'dark', width: '100%', boxSizing: 'border-box' }}
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
                            <div key={g.month} style={{ marginBottom: 6 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <button onClick={() => setExpandedMonths(prev => prev.includes(g.month) ? prev.filter(m => m !== g.month) : [...prev, g.month])} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', width: 20, textAlign: 'center', transition: 'color 0.15s' }}>
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
                                        style={{ accentColor: '#00D2FF', width: 14, height: 14, cursor: 'pointer' }}
                                    />
                                    <span onClick={() => setExpandedMonths(prev => prev.includes(g.month) ? prev.filter(m => m !== g.month) : [...prev, g.month])} style={{ fontSize: 13, fontWeight: 800, color: isFullySelected || isPartiallySelected ? '#fff' : 'rgba(255,255,255,0.7)', cursor: 'pointer' }}>
                                        {g.month}
                                    </span>
                                </div>

                                {isExpanded && (
                                    <div style={{ paddingLeft: 36, marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, borderLeft: '1px dashed rgba(255,255,255,0.1)', marginLeft: 10, paddingBottom: 4 }}>
                                        {monthWeeks.map(({ w, i }) => {
                                            const isWeekSelected = isFullySelected || selectedWeeks.includes(i);
                                            return (
                                                <label key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: isFullySelected ? 'default' : 'pointer' }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={isWeekSelected}
                                                        disabled={isFullySelected}
                                                        onChange={() => {
                                                            setSelectedDate('');
                                                            if (isFullySelected) return;
                                                            setSelectedWeeks(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i]);
                                                        }}
                                                        style={{ accentColor: '#00D2FF', width: 12, height: 12 }}
                                                    />
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
}
