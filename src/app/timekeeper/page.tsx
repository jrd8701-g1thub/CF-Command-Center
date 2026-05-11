'use client';

import { useState, useEffect } from 'react';
import { Clock, LogIn, LogOut, DollarSign, Users, Settings, X, CheckCircle2, AlertCircle, ChevronDown } from 'lucide-react';

interface Employee { name: string; role: string; basePay: number; }
interface ClockStatus { clockedIn: boolean; clockInTime: string; clockInDate: string; capturedAt?: string; rowIndex: number; }
interface ExpenseModal { name: string; type: string; description: string; amount: string; submitting: boolean; success: boolean; }
interface OverrideModal {
    name: string;
    step: 'pin' | 'form';
    pin: string;
    pinError: boolean;
    overrideLogin: boolean;
    loginDate: string;
    loginTime: string;
    overrideLogout: boolean;
    logoutDate: string;
    logoutTime: string;
    submitting: boolean;
}

const ADMIN_PIN = '615007';

export default function StaffPage() {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [clockStatus, setClockStatus] = useState<Record<string, ClockStatus>>({});
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);
    const [override, setOverride] = useState<OverrideModal | null>(null);
    const [expense, setExpense] = useState<ExpenseModal | null>(null);
    const [expenseCategories, setExpenseCategories] = useState<string[]>(['Gas', 'Food', 'Other']);
    const [manageStaff, setManageStaff] = useState(false);
    const [newStaffName, setNewStaffName] = useState('');
    const [newStaffRole, setNewStaffRole] = useState('');
    const [newStaffPay, setNewStaffPay] = useState('');
    const [editingStaff, setEditingStaff] = useState<{ oldName: string; name: string; role: string; basePay: string } | null>(null);
    const [managingStaffLoading, setManagingStaffLoading] = useState(false);

    useEffect(() => {
        fetchStaffData();
        fetch('/api/sheet?tab=expenses')
            .then(r => r.json())
            .then(d => {
                const cats: string[] = d.categories || [];
                if (cats.length > 0) setExpenseCategories([...cats, 'Other']);
            })
            .catch(() => {});
    }, []);

    async function fetchStaffData() {
        setLoading(true);
        try {
            const res = await fetch('/api/sheet?tab=staff', { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                setEmployees(data.employees || []);
                const enriched: Record<string, ClockStatus> = {};
                if (data.clockStatus) {
                    Object.keys(data.clockStatus).forEach(name => {
                        const s = data.clockStatus[name];
                        if (s.clockedIn) {
                            const d = parseClockDateTime(s.clockInDate, s.clockInTime);
                            let capturedAtText = "Invalid Data";
                            if (d && !isNaN(d.getTime())) {
                                capturedAtText = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                                    + ' @ ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
                            } else if (s.clockInDate || s.clockInTime) {
                                // Fallback: just display the raw values cleanly
                                capturedAtText = `${s.clockInDate} @ ${s.clockInTime}`;
                            }
                            enriched[name] = {
                                ...s,
                                capturedAt: capturedAtText
                            };
                        } else {
                            enriched[name] = s;
                        }
                    });
                }
                setClockStatus(enriched);
            }
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }

    // Robustly parse a date string "YYYY-MM-DD" and a 12-hr time string "HH:MM AM/PM"
    // Returns a Date in local time, or null if unable to parse.
    function parseClockDateTime(dateStr: string, timeStr: string): Date | null {
        if (!dateStr && !timeStr) return null;
        try {
            const cleanDate = (dateStr || '').replace(/^'/, '');
            const cleanTime = (timeStr || '').replace(/^'/, '');

            // Parse date part: expects YYYY-MM-DD
            const dateParts = cleanDate.split('-');
            const year  = parseInt(dateParts[0] || '0', 10);
            const month = parseInt(dateParts[1] || '1', 10) - 1;
            const day   = parseInt(dateParts[2] || '1', 10);

            // Parse time part: expects "HH:MM AM" or "HH:MM PM"
            let hours = 0, minutes = 0;
            const timeMatch = cleanTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
            if (timeMatch) {
                hours   = parseInt(timeMatch[1], 10);
                minutes = parseInt(timeMatch[2], 10);
                const isPM = timeMatch[3].toUpperCase() === 'PM';
                if (isPM && hours !== 12) hours += 12;
                if (!isPM && hours === 12) hours = 0;
            }

            if (year < 2000 || isNaN(year)) return null; // sanity check
            return new Date(year, month, day, hours, minutes, 0);
        } catch { return null; }
    }

    const handleClockAction = async (action: 'CLOCK_IN' | 'CLOCK_OUT', employeeName: string) => {
        if (!employeeName || processing === employeeName) return;
        setProcessing(employeeName);
        const employee = employees.find(e => e.name === employeeName);
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        try {
            const body: Record<string, unknown> = { action, staffName: employeeName, time: timeStr };
            if (action === 'CLOCK_IN') { body.role = employee?.role || ''; body.basePay = employee?.basePay || 0; }
            const res = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) { await fetchStaffData(); }
            else { 
                const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                alert('Failed to update status: ' + err.error); 
            }
        } catch (e) { console.error(e); }
        finally { setProcessing(null); }
    };

    const handleLogExpense = async () => {
        if (!expense || !expense.amount || expense.submitting) return;
        if (expense.type === 'Other' && !expense.description) { alert('Please describe the expense.'); return; }
        setExpense({ ...expense, submitting: true });
        try {
            const res = await fetch('/api/sheet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'LOG_EXPENSE',
                    staffName: expense.name,
                    description: expense.type === 'Other' ? expense.description : expense.type,
                    amount: parseFloat(expense.amount)
                })
            });
            if (res.ok) {
                setExpense({ ...expense, success: true, submitting: false });
                setTimeout(() => setExpense(null), 1500);
            } else { alert('Failed to log expense.'); setExpense({ ...expense, submitting: false }); }
        } catch (e) { console.error(e); setExpense({ ...expense, submitting: false }); }
    };

    const openOverride = (name: string) => {
        const now = new Date();
        const today = now.toLocaleDateString('en-CA');
        const nowTime = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        setOverride({ name, step: 'pin', pin: '', pinError: false, overrideLogin: false, loginDate: today, loginTime: nowTime, overrideLogout: true, logoutDate: today, logoutTime: nowTime, submitting: false });
    };

    const submitPin = () => {
        if (!override) return;
        if (override.pin === ADMIN_PIN) {
            setOverride(o => o ? { ...o, step: 'form', pinError: false } : null);
        } else {
            setOverride(o => o ? { ...o, pinError: true, pin: '' } : null);
            setTimeout(() => setOverride(o => o ? { ...o, pinError: false } : null), 600);
        }
    };

    const submitOverride = async () => {
        if (!override || override.submitting) return;
        if (!override.overrideLogin && !override.overrideLogout) { alert('Please check at least one section to override.'); return; }
        setOverride(o => o ? { ...o, submitting: true } : null);
        try {
            const body: Record<string, unknown> = { action: 'OVERRIDE_CLOCK', staffName: override.name };
            if (override.overrideLogin) { body.overrideLoginDate = override.loginDate; body.overrideLoginTime = override.loginTime; }
            if (override.overrideLogout) { body.overrideLogoutDate = override.logoutDate; body.overrideLogoutTime = override.logoutTime; }
            const res = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) {
                const snap = override;
                setOverride(null);
                await fetchStaffData();
                const parts: string[] = [];
                if (snap.overrideLogin) parts.push(`Login → ${snap.loginTime} on ${snap.loginDate}`);
                if (snap.overrideLogout) parts.push(`Logout → ${snap.logoutTime} on ${snap.logoutDate}`);
                alert(`Override applied for ${snap.name}:\n${parts.join('\n')}\n\nAudit note saved to Google Sheet (col N).`);
            } else {
                const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                alert('Override failed: ' + err.error);
                setOverride(o => o ? { ...o, submitting: false } : null);
            }
        } catch { setOverride(o => o ? { ...o, submitting: false } : null); }
    };

    const handleAddEmployee = async () => {
        if (!newStaffName || !newStaffRole || !newStaffPay || managingStaffLoading) return;
        setManagingStaffLoading(true);
        try {
            const body = { action: 'ADD_EMPLOYEE', staffName: newStaffName, role: newStaffRole, basePay: newStaffPay };
            const res = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) {
                await fetchStaffData();
                setNewStaffName(''); setNewStaffRole(''); setNewStaffPay('');
                alert(`Successfully added ${newStaffName}.`);
            } else {
                const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                alert('Add Employee failed: ' + err.error);
            }
        } catch (e) { console.error(e); alert('Error adding employee.'); }
        finally { setManagingStaffLoading(false); }
    };

    const handleRemoveEmployee = async (staffName: string) => {
        if (!window.confirm(`Are you sure you want to completely remove ${staffName} from the Master list? This cannot be easily undone.`)) return;
        setManagingStaffLoading(true);
        try {
            const body = { action: 'REMOVE_EMPLOYEE', staffName };
            const res = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) { await fetchStaffData(); }
            else {
                const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                alert('Remove Employee failed: ' + err.error);
            }
        } catch (e) { console.error(e); alert('Error removing employee.'); }
        finally { setManagingStaffLoading(false); }
    };

    const handleEditEmployee = async () => {
        if (!editingStaff || !editingStaff.name || !editingStaff.role || !editingStaff.basePay || managingStaffLoading) return;
        setManagingStaffLoading(true);
        try {
            const body = { action: 'EDIT_EMPLOYEE', oldStaffName: editingStaff.oldName, newStaffName: editingStaff.name, role: editingStaff.role, basePay: editingStaff.basePay };
            const res = await fetch('/api/sheet', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) {
                await fetchStaffData();
                setEditingStaff(null);
                alert(`Successfully updated ${editingStaff.name}.`);
            } else {
                const err = await res.json().catch(() => ({ error: 'Unknown error' }));
                alert('Edit Employee failed: ' + err.error);
            }
        } catch (e) { console.error(e); alert('Error editing employee.'); }
        finally { setManagingStaffLoading(false); }
    };

    const now = new Date();
    const getHours = (s: ClockStatus | undefined) => {
        if (!s || !s.clockedIn) return 0;
        try {
            const d = parseClockDateTime(s.clockInDate, s.clockInTime);
            if (!d || isNaN(d.getTime())) return 0;
            return (now.getTime() - d.getTime()) / 3600000;
        }
        catch { return 0; }
    };
    const onShiftList = employees.filter(e => clockStatus[e.name]?.clockedIn);
    const offShiftList = employees.filter(e => !clockStatus[e.name]?.clockedIn);
    const onShiftCount = onShiftList.length;

    return (
        <div className="w-full space-y-6">

            {/* ── Page Header ── */}
            <div className="flex flex-wrap justify-between items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-brand-blue/15 border border-brand-blue/30 flex items-center justify-center">
                        <Clock size={20} className="text-brand-blue" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-black text-white tracking-tight">TimeKeeper Hub</h1>
                        <p className="text-[11px] text-slate-500 font-semibold uppercase tracking-wider mt-0.5">Staff Attendance &amp; Expense Logging</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {loading && (
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-brand-blue/10 border border-brand-blue/20">
                            <div className="w-3 h-3 rounded-full border-2 border-brand-blue/30 border-t-brand-blue animate-spin" />
                            <span className="text-xs font-semibold text-brand-blue">Syncing...</span>
                        </div>
                    )}
                    <button onClick={fetchStaffData}
                        className="px-4 py-2 bg-charcoal-800 hover:bg-charcoal-700 border border-charcoal-700 hover:border-charcoal-600 rounded-lg text-sm font-bold text-slate-300 hover:text-white transition-all">
                        ↺ Refresh
                    </button>
                    <button onClick={() => setManageStaff(true)}
                        className="px-4 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-lg text-sm font-bold shadow-[0_0_15px_rgba(58,134,255,0.3)] transition-all flex items-center gap-2">
                        <Users size={15} /> Manage Staff
                    </button>
                </div>
            </div>

            {/* ── Summary Stats ── */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl p-4 flex items-center gap-4 shadow-lg">
                    <div className="w-12 h-12 rounded-xl bg-brand-teal/10 border border-brand-teal/25 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-brand-teal animate-pulse" />
                    </div>
                    <div>
                        <div className="text-2xl font-black text-white">{onShiftCount}</div>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">On Shift</div>
                    </div>
                </div>
                <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl p-4 flex items-center gap-4 shadow-lg">
                    <div className="w-12 h-12 rounded-xl bg-charcoal-700 border border-charcoal-600 flex items-center justify-center">
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                    </div>
                    <div>
                        <div className="text-2xl font-black text-white">{offShiftList.length}</div>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Off Shift</div>
                    </div>
                </div>
                <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl p-4 flex items-center gap-4 shadow-lg">
                    <div className="w-12 h-12 rounded-xl bg-brand-blue/10 border border-brand-blue/25 flex items-center justify-center">
                        <Users size={18} className="text-brand-blue" />
                    </div>
                    <div>
                        <div className="text-2xl font-black text-white">{employees.length}</div>
                        <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Staff</div>
                    </div>
                </div>
            </div>

            {/* ── On Shift ── */}
            <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl shadow-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-charcoal-700 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-brand-teal animate-pulse" />
                    <span className="text-sm font-bold text-white">Currently On Shift</span>
                    <span className="text-xs font-black px-2 py-0.5 rounded-full text-brand-teal bg-brand-teal/10 border border-brand-teal/25">
                        {onShiftCount} active
                    </span>
                </div>

                {onShiftList.length === 0 ? (
                    <div className="py-10 text-center text-slate-500 italic text-sm">No staff currently on shift.</div>
                ) : (
                    <div className="divide-y divide-charcoal-700/50">
                        {onShiftList.map(emp => {
                            const s = clockStatus[emp.name];
                            const hrs = getHours(s);
                            const isLong = hrs >= 12;
                            const hDisplay = `${Math.floor(hrs)}h ${Math.round((hrs % 1) * 60)}m`;
                            return (
                                <div key={emp.name} className="px-5 py-4 flex flex-wrap items-center gap-4 hover:bg-charcoal-700/30 transition-colors">
                                    {/* Avatar */}
                                    <div className="w-10 h-10 rounded-xl bg-brand-teal/10 border border-brand-teal/25 flex items-center justify-center shrink-0 font-black text-sm text-brand-teal">
                                        {emp.name.slice(0,2).toUpperCase()}
                                    </div>
                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-black text-white">{emp.name}</div>
                                        <div className="text-[11px] text-slate-500 font-semibold">{emp.role} · logged in {s?.capturedAt || s?.clockInTime}</div>
                                    </div>
                                    {/* Duration badge */}
                                    <span className={`text-xs font-black px-3 py-1.5 rounded-lg shrink-0 border ${
                                        isLong
                                            ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/25'
                                            : 'text-brand-teal bg-brand-teal/10 border-brand-teal/25'
                                    }`}>
                                        ⏱ {hDisplay}
                                    </span>
                                    {/* Actions */}
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button
                                            disabled={processing === emp.name}
                                            onClick={() => setExpense({ name: emp.name, type: expenseCategories[0] || 'Gas', description: '', amount: '', submitting: false, success: false })}
                                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-brand-blue/10 border border-brand-blue/30 text-brand-blue hover:bg-brand-blue/20 transition-all">
                                            💸 Expense
                                        </button>
                                        <button
                                            disabled={processing === emp.name}
                                            onClick={() => handleClockAction('CLOCK_OUT', emp.name)}
                                            className="px-3 py-1.5 rounded-lg text-xs font-black bg-brand-orange/10 border border-brand-orange/30 text-brand-orange hover:bg-brand-orange/20 transition-all flex items-center gap-1">
                                            {processing === emp.name ? '...' : <><LogOut size={11}/>Logout</>}
                                        </button>
                                        <button onClick={() => openOverride(emp.name)}
                                            className="w-8 h-8 rounded-lg flex items-center justify-center bg-charcoal-700 border border-charcoal-600 text-slate-400 hover:text-white hover:border-charcoal-500 transition-all"
                                            title="Admin Override">
                                            <Settings size={13} />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* ── Off Shift ── */}
            <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl shadow-lg overflow-hidden">
                <div className="px-5 py-4 border-b border-charcoal-700 flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full bg-slate-600" />
                    <span className="text-sm font-bold text-white">Off Shift</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full text-slate-500 bg-charcoal-700 border border-charcoal-600">
                        {offShiftList.length} available
                    </span>
                </div>

                {offShiftList.length === 0 ? (
                    <div className="py-10 text-center text-slate-500 italic text-sm">All staff are currently on shift.</div>
                ) : (
                    <div className="divide-y divide-charcoal-700/50">
                        {offShiftList.map(emp => (
                            <div key={emp.name} className="px-5 py-3.5 flex flex-wrap items-center gap-4 hover:bg-charcoal-700/30 transition-colors">
                                <div className="w-9 h-9 rounded-xl bg-charcoal-700 border border-charcoal-600 flex items-center justify-center shrink-0 font-black text-xs text-slate-400">
                                    {emp.name.slice(0,2).toUpperCase()}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="text-sm font-bold text-slate-200">{emp.name}</div>
                                    <div className="text-[11px] text-slate-500 font-semibold">{emp.role}</div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <button
                                        disabled={processing === emp.name}
                                        onClick={() => handleClockAction('CLOCK_IN', emp.name)}
                                        className="px-4 py-1.5 rounded-lg text-xs font-black bg-brand-teal/10 border border-brand-teal/30 text-brand-teal hover:bg-brand-teal/20 transition-all flex items-center gap-1">
                                        {processing === emp.name ? '...' : <><LogIn size={11}/>Login</>}
                                    </button>
                                    <button onClick={() => openOverride(emp.name)}
                                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-charcoal-700 border border-charcoal-600 text-slate-400 hover:text-white hover:border-charcoal-500 transition-all"
                                        title="Admin Override">
                                        <Settings size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ══════════ EXPENSE MODAL ══════════ */}
            {expense && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-charcoal-800 border border-brand-blue/25 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                        {/* Header */}
                        <div className="px-6 pt-6 pb-4 border-b border-charcoal-700 flex items-start justify-between">
                            <div>
                                <p className="text-[10px] font-black text-brand-blue uppercase tracking-widest mb-1">💸 Log Expense</p>
                                <h2 className="text-xl font-black text-white">{expense.name}</h2>
                            </div>
                            <button onClick={() => setExpense(null)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white bg-charcoal-700 border border-charcoal-600 transition-all">
                                <X size={15} />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Expense Type</label>
                                <div className="relative">
                                    <select
                                        value={expense.type}
                                        onChange={e => setExpense({ ...expense, type: e.target.value, description: '' })}
                                        className="w-full appearance-none pr-8 pl-3 py-2.5 rounded-lg text-sm font-semibold text-white outline-none bg-charcoal-900 border border-charcoal-700 focus:border-brand-blue transition-colors"
                                        style={{colorScheme:'dark'}}>
                                        {expenseCategories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                                </div>
                            </div>

                            {expense.type === 'Other' && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Description</label>
                                    <textarea
                                        value={expense.description}
                                        onChange={e => setExpense({ ...expense, description: e.target.value })}
                                        placeholder="Describe the expense..."
                                        rows={2}
                                        className="w-full px-3 py-2.5 rounded-lg text-sm font-semibold text-white outline-none resize-none bg-charcoal-900 border border-charcoal-700 focus:border-brand-blue transition-colors"
                                        style={{colorScheme:'dark'}}
                                    />
                                </div>
                            )}

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Amount (₱)</label>
                                <input
                                    type="number"
                                    placeholder="0.00"
                                    min="0.01"
                                    step="0.01"
                                    value={expense.amount}
                                    onChange={e => setExpense({ ...expense, amount: e.target.value })}
                                    className="w-full px-3 py-2.5 rounded-lg text-sm font-bold text-white outline-none bg-charcoal-900 border border-charcoal-700 focus:border-brand-blue transition-colors"
                                    style={{colorScheme:'dark'}}
                                />
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 pb-6">
                            <button
                                onClick={handleLogExpense}
                                disabled={expense.submitting || !expense.amount}
                                className={`w-full py-3 rounded-xl font-black text-sm tracking-wider transition-all ${
                                    expense.success
                                        ? 'bg-brand-teal text-charcoal-900'
                                        : (expense.submitting || !expense.amount)
                                            ? 'bg-charcoal-700 text-slate-500 cursor-not-allowed'
                                            : 'bg-brand-blue hover:bg-brand-blue/90 text-white shadow-[0_0_15px_rgba(58,134,255,0.3)]'
                                }`}>
                                {expense.success ? '✓ LOGGED!' : expense.submitting ? 'SUBMITTING...' : 'SUBMIT EXPENSE'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════ OVERRIDE MODAL ══════════ */}
            {override && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-charcoal-800 border border-brand-orange/25 w-full max-w-[460px] max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl">
                        <div className="px-6 pt-6 pb-4 border-b border-charcoal-700 flex items-start justify-between">
                            <div>
                                <p className="text-[10px] font-black text-brand-orange uppercase tracking-widest mb-1">⚙ Admin Override</p>
                                <h2 className="text-xl font-black text-white">{override.name}</h2>
                                <p className="text-[11px] text-slate-500 mt-0.5">Correct login / logout timestamps</p>
                            </div>
                            <button onClick={() => setOverride(null)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white bg-charcoal-700 border border-charcoal-600 transition-all">
                                <X size={15} />
                            </button>
                        </div>

                        <div className="px-6 py-5">
                            {override.step === 'pin' && (
                                <div className="space-y-4">
                                    <p className="text-xs text-slate-500 leading-relaxed">Admin authorisation required. Enter your PIN to continue.</p>
                                    <input
                                        type="password" maxLength={6} autoFocus
                                        value={override.pin}
                                        onChange={e => setOverride(o => o ? { ...o, pin: e.target.value } : null)}
                                        onKeyDown={e => e.key === 'Enter' && submitPin()}
                                        placeholder="● ● ● ● ● ●"
                                        className={`w-full px-4 py-4 rounded-xl text-center text-2xl tracking-[0.4em] text-white outline-none bg-charcoal-900 border transition-all ${override.pinError ? 'border-red-500/60' : 'border-charcoal-700 focus:border-brand-orange'}`}
                                        style={{colorScheme:'dark'}}
                                    />
                                    {override.pinError && <p className="text-xs text-red-400 text-center font-bold">Incorrect PIN — try again</p>}
                                    <div className="flex gap-3">
                                        <button onClick={() => setOverride(null)}
                                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white bg-charcoal-700 border border-charcoal-600 transition-colors">
                                            Cancel
                                        </button>
                                        <button onClick={submitPin}
                                            className="flex-[2] py-2.5 px-6 rounded-xl text-sm font-black text-white bg-brand-orange hover:bg-brand-orange/90 transition-all">
                                            Verify PIN
                                        </button>
                                    </div>
                                </div>
                            )}

                            {override.step === 'form' && (
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-teal/10 border border-brand-teal/25">
                                        <CheckCircle2 size={14} className="text-brand-teal" />
                                        <span className="text-xs font-bold text-brand-teal">PIN verified — select what to override</span>
                                    </div>

                                    {/* Login override */}
                                    <div className={`p-4 rounded-xl border transition-all ${override.overrideLogin ? 'border-brand-blue/35 bg-brand-blue/5' : 'border-charcoal-700 bg-transparent'}`}>
                                        <label className="flex items-center gap-2.5 cursor-pointer mb-0">
                                            <input type="checkbox" checked={override.overrideLogin}
                                                onChange={e => setOverride(o => o ? { ...o, overrideLogin: e.target.checked } : null)}
                                                className="w-4 h-4 accent-brand-blue" />
                                            <span className={`text-sm font-bold ${override.overrideLogin ? 'text-brand-blue' : 'text-slate-400'}`}>Override Login Time</span>
                                        </label>
                                        {override.overrideLogin && (
                                            <div className="grid grid-cols-2 gap-3 mt-3">
                                                <div>
                                                    <div className="text-[10px] font-black text-brand-blue uppercase tracking-wider mb-1.5">Login Date</div>
                                                    <input type="date" value={override.loginDate}
                                                        onChange={e => setOverride(o => o ? { ...o, loginDate: e.target.value } : null)}
                                                        className="w-full px-2.5 py-2 rounded-lg text-sm text-white outline-none bg-charcoal-900 border border-brand-blue/25 focus:border-brand-blue"
                                                        style={{colorScheme:'dark'}} />
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-black text-brand-blue uppercase tracking-wider mb-1.5">Login Time</div>
                                                    <input type="time" value={override.loginTime}
                                                        onChange={e => setOverride(o => o ? { ...o, loginTime: e.target.value } : null)}
                                                        className="w-full px-2.5 py-2 rounded-lg text-sm text-white outline-none bg-charcoal-900 border border-brand-blue/25 focus:border-brand-blue"
                                                        style={{colorScheme:'dark'}} />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Logout override */}
                                    <div className={`p-4 rounded-xl border transition-all ${override.overrideLogout ? 'border-brand-orange/35 bg-brand-orange/5' : 'border-charcoal-700 bg-transparent'}`}>
                                        <label className="flex items-center gap-2.5 cursor-pointer">
                                            <input type="checkbox" checked={override.overrideLogout}
                                                onChange={e => setOverride(o => o ? { ...o, overrideLogout: e.target.checked } : null)}
                                                className="w-4 h-4 accent-brand-orange" />
                                            <span className={`text-sm font-bold ${override.overrideLogout ? 'text-brand-orange' : 'text-slate-400'}`}>Override Logout Time</span>
                                        </label>
                                        {override.overrideLogout && (
                                            <div className="grid grid-cols-2 gap-3 mt-3">
                                                <div>
                                                    <div className="text-[10px] font-black text-brand-orange uppercase tracking-wider mb-1.5">Logout Date</div>
                                                    <input type="date" value={override.logoutDate}
                                                        onChange={e => setOverride(o => o ? { ...o, logoutDate: e.target.value } : null)}
                                                        className="w-full px-2.5 py-2 rounded-lg text-sm text-white outline-none bg-charcoal-900 border border-brand-orange/25 focus:border-brand-orange"
                                                        style={{colorScheme:'dark'}} />
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-black text-brand-orange uppercase tracking-wider mb-1.5">Logout Time</div>
                                                    <input type="time" value={override.logoutTime}
                                                        onChange={e => setOverride(o => o ? { ...o, logoutTime: e.target.value } : null)}
                                                        className="w-full px-2.5 py-2 rounded-lg text-sm text-white outline-none bg-charcoal-900 border border-brand-orange/25 focus:border-brand-orange"
                                                        style={{colorScheme:'dark'}} />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-3 pt-1">
                                        <button onClick={() => setOverride(null)}
                                            className="flex-1 py-2.5 rounded-xl text-sm font-bold text-slate-400 hover:text-white bg-charcoal-700 border border-charcoal-600 transition-colors">
                                            Cancel
                                        </button>
                                        <button onClick={submitOverride}
                                            disabled={override.submitting || (!override.overrideLogin && !override.overrideLogout)}
                                            className="flex-[2] py-2.5 rounded-xl text-sm font-black text-white bg-brand-orange hover:bg-brand-orange/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                                            {override.submitting
                                                ? <><div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin"/>Applying...</>
                                                : '⚙ Apply Override'}
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ══════════ MANAGE STAFF MODAL ══════════ */}
            {manageStaff && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4">
                    <div className="bg-charcoal-800 border border-charcoal-700 w-full max-w-[480px] max-h-[88vh] flex flex-col rounded-2xl shadow-2xl">
                        <div className="px-6 pt-6 pb-4 border-b border-charcoal-700 flex items-start justify-between shrink-0">
                            <div>
                                <p className="text-[10px] font-black text-brand-blue uppercase tracking-widest mb-1">⚙ Manage Staff</p>
                                <h2 className="text-xl font-black text-white">Add or Remove Employees</h2>
                            </div>
                            <button onClick={() => setManageStaff(false)}
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-white bg-charcoal-700 border border-charcoal-600 transition-all">
                                <X size={15} />
                            </button>
                        </div>

                        <div className="px-6 pt-5 pb-4 shrink-0">
                            <div className="p-4 rounded-xl space-y-3 bg-charcoal-900 border border-charcoal-700">
                                <p className="text-xs font-black text-brand-blue uppercase tracking-wider">+ Register New Employee</p>
                                <div className="grid grid-cols-2 gap-3">
                                    <input placeholder="Full Name" value={newStaffName} onChange={e => setNewStaffName(e.target.value)}
                                        className="px-3 py-2.5 rounded-lg text-sm font-semibold text-white outline-none bg-charcoal-800 border border-charcoal-700 focus:border-brand-blue transition-colors"
                                        style={{colorScheme:'dark'}} />
                                    <input placeholder="Role (e.g. Driver)" value={newStaffRole} onChange={e => setNewStaffRole(e.target.value)}
                                        className="px-3 py-2.5 rounded-lg text-sm font-semibold text-white outline-none bg-charcoal-800 border border-charcoal-700 focus:border-brand-blue transition-colors"
                                        style={{colorScheme:'dark'}} />
                                </div>
                                <div className="flex gap-3">
                                    <input type="number" placeholder="Base Pay (₱)" value={newStaffPay} onChange={e => setNewStaffPay(e.target.value)}
                                        className="flex-1 px-3 py-2.5 rounded-lg text-sm font-semibold text-white outline-none bg-charcoal-800 border border-charcoal-700 focus:border-brand-blue transition-colors"
                                        style={{colorScheme:'dark'}} />
                                    <button onClick={handleAddEmployee}
                                        disabled={!newStaffName || !newStaffRole || !newStaffPay || managingStaffLoading}
                                        className="px-4 py-2.5 rounded-lg text-xs font-black bg-brand-blue hover:bg-brand-blue/90 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                                        {managingStaffLoading ? 'Adding...' : 'Add'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="overflow-y-auto px-6 pb-6 flex-1 space-y-2">
                            <p className="text-xs font-black text-slate-500 uppercase tracking-wider mb-3">Current Employees ({employees.length})</p>
                            {employees.map(emp => (
                                <div key={emp.name} className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-charcoal-900 border border-charcoal-700 hover:border-charcoal-600 transition-colors">
                                    {editingStaff?.oldName === emp.name ? (
                                        <>
                                            <div className="grid grid-cols-2 gap-2">
                                                <input value={editingStaff.name} onChange={e => setEditingStaff({ ...editingStaff, name: e.target.value })} className="px-2 py-1.5 rounded-lg text-xs font-semibold text-white bg-charcoal-800 border border-charcoal-700 focus:border-brand-blue outline-none" placeholder="Name" />
                                                <input value={editingStaff.role} onChange={e => setEditingStaff({ ...editingStaff, role: e.target.value })} className="px-2 py-1.5 rounded-lg text-xs font-semibold text-white bg-charcoal-800 border border-charcoal-700 focus:border-brand-blue outline-none" placeholder="Role" />
                                            </div>
                                            <div className="flex gap-2">
                                                <input type="number" value={editingStaff.basePay} onChange={e => setEditingStaff({ ...editingStaff, basePay: e.target.value })} className="flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold text-white bg-charcoal-800 border border-charcoal-700 focus:border-brand-blue outline-none" placeholder="Base Pay" />
                                                <button onClick={handleEditEmployee} disabled={managingStaffLoading} className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-brand-teal/10 text-brand-teal hover:bg-brand-teal/20 transition-all">Save</button>
                                                <button onClick={() => setEditingStaff(null)} disabled={managingStaffLoading} className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-charcoal-700 text-slate-400 hover:text-white transition-all">Cancel</button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <div className="text-sm font-bold text-white">{emp.name}</div>
                                                <div className="text-[11px] text-slate-500 font-semibold">{emp.role} · ₱{emp.basePay} / shift</div>
                                            </div>
                                            <div className="flex gap-2">
                                                <button onClick={() => setEditingStaff({ oldName: emp.name, name: emp.name, role: emp.role, basePay: emp.basePay.toString() })} disabled={managingStaffLoading}
                                                    className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-brand-blue/10 border border-brand-blue/25 text-brand-blue hover:bg-brand-blue/20 transition-all disabled:opacity-40">
                                                    Edit
                                                </button>
                                                <button onClick={() => handleRemoveEmployee(emp.name)} disabled={managingStaffLoading}
                                                    className="px-3 py-1.5 rounded-lg text-[11px] font-black bg-brand-orange/10 border border-brand-orange/25 text-brand-orange hover:bg-brand-orange/20 transition-all disabled:opacity-40">
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                            {employees.length === 0 && (
                                <div className="py-8 text-center text-slate-500 italic text-sm">No employees found.</div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
