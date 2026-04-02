"use client";

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  PieChart, Pie, Cell, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend,
  RadialBarChart, RadialBar, PolarAngleAxis
} from 'recharts';
import { MoreHorizontal, TrendingUp, TrendingDown, Info, Wallet, X, Pencil, Check, Trash2, Plus, CalendarDays, ChevronDown } from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function parseExpenseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  // Try M/D/YYYY
  const parts = dateStr.split('/');
  if (parts.length === 3) return new Date(`${parts[2]}-${parts[0].padStart(2,'0')}-${parts[1].padStart(2,'0')}`);
  return null;
}

import CalendarFilter, { getTodayISO, getWorkWeeks } from '@/components/CalendarFilter';

// ── constants ─────────────────────────────────────────────────────────────────

const COLORS = ['#FF4500','#00E5FF','#3A86FF','#F7B731','#20BF6B','#A55EEA','#FC427B','#2ECC71'];


// ── sub-components ────────────────────────────────────────────────────────────

const Card = ({ children, className='' }: { children: React.ReactNode, className?: string }) => (
  <div className={`bg-charcoal-800 border border-charcoal-700 rounded-xl p-5 shadow-lg relative overflow-hidden ${className}`}>{children}</div>
);

const Cylinder = ({ value, color, label, amount }: { value:number, color:string, label:string, amount:string }) => (
  <div className="flex flex-col items-center">
    <div className="text-xs text-slate-400 font-semibold mb-1">{label}</div>
    <div className="text-sm font-bold text-white mb-3">{amount}</div>
    <div className="relative w-16 h-32 bg-charcoal-900 rounded-lg border border-charcoal-700 overflow-hidden flex items-end shadow-inner">
      <div className="absolute top-0 left-0 w-full h-3 rounded-[50%] bg-charcoal-800 border border-charcoal-700 z-10" />
      <div className="w-full relative rounded-b-lg transition-all duration-1000 ease-out"
        style={{ height:`${Math.min(value,100)}%`, backgroundColor:color, boxShadow:`inset 0 10px 15px -10px rgba(0,0,0,0.5)` }}>
        <div className="absolute -top-1.5 left-0 w-full h-3 rounded-[50%] brightness-125 z-10" style={{ backgroundColor:color }} />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center font-bold text-white text-xs z-20 mix-blend-overlay">{Math.round(value)}%</div>
      </div>
    </div>
  </div>
);

// ── main page ─────────────────────────────────────────────────────────────────

export default function ExpensesPage() {
  // ─ data ─
  const [expenses, setExpenses]   = useState<any[]>([]);
  const [budgets, setBudgets]     = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [employees, setEmployees] = useState<{name:string}[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState('All');

  // ─ calendar filter ─
  const allWeeks = useMemo(() => getWorkWeeks(), []);
  const [selectedDate, setSelectedDate]     = useState(getTodayISO());
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [selectedWeeks, setSelectedWeeks]   = useState<number[]>([]);

  const availableDates = useMemo(() => {
    return Array.from(new Set(expenses.map(e => {
        const d = parseExpenseDate(e.date);
        if(!d) return '';
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }).filter(Boolean)));
  }, [expenses]);
  
  // ─ log expense modal ─
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [logSubmitting, setLogSubmitting] = useState(false);
  const [newExpense, setNewExpense] = useState({ description:'', amount:'', staffName:'' });
  // Add-category sub-form
  const [showAddCat, setShowAddCat]   = useState(false);
  const [newCatName, setNewCatName]   = useState('');
  const [newCatBudget, setNewCatBudget] = useState('');
  const [addingCat, setAddingCat]     = useState(false);

  // ─ edit modal ─
  const [editTarget, setEditTarget] = useState<any|null>(null);
  const [editVals, setEditVals]     = useState({ description:'', amount:'', staffName:'' });
  const [editSaving, setEditSaving] = useState(false);

  // ─ delete ─
  const [deleteTarget, setDeleteTarget] = useState<any|null>(null);
  const [deleting, setDeleting]         = useState(false);

  // ─ fetch ─────────────────────────────────────────────────────────────────
  const fetchData = async () => {
    try {
      setLoading(true);
      const [expRes, staffRes] = await Promise.all([
        fetch('/api/sheet?tab=expenses'),
        fetch('/api/sheet?tab=staff'),
      ]);
      const expData   = await expRes.json();
      const staffData = await staffRes.json();
      setExpenses(expData.expenses   || []);
      setBudgets(expData.budgets     || []);
      setCategories(expData.categories || []);
      setEmployees(staffData.employees || []);
    } catch(e) { console.error(e); }
    finally    { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, []);

  // ─ calendar filters ──────────────────────────────────────────────────────
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const d = parseExpenseDate(e.date);
      if (!d) return false;
      const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
      const m = d.toLocaleString('default', { month: 'long', year: 'numeric' });

      const periodFilterActive = selectedMonths.length > 0 || selectedWeeks.length > 0;
      const periodMatch = !periodFilterActive || selectedMonths.includes(m) || selectedWeeks.some(wi => {
          try { return d >= allWeeks[wi].start && d <= allWeeks[wi].end; } catch { return false; }
      });
      const dateMatch = !selectedDate || iso === selectedDate;
      return periodMatch && dateMatch;
    });
  }, [expenses, selectedDate, selectedMonths, selectedWeeks, allWeeks]);

  // ─ data transforms ───────────────────────────────────────────────────────
  const totalBudget       = budgets.reduce((s,b)=>s+b.amount, 0);
  const totalActual       = filteredExpenses.reduce((s,e)=>s+e.amount, 0);
  const budgetUtilization = totalBudget > 0 ? (totalActual/totalBudget)*100 : 0;

  const expenseMap: Record<string,number> = {};
  filteredExpenses.forEach(e => { expenseMap[e.description||'Other']=(expenseMap[e.description||'Other']||0)+e.amount; });
  const dynamicPie = Object.entries(expenseMap).map(([name,value],i)=>({name,value,color:COLORS[i%COLORS.length]})).sort((a,b)=>b.value-a.value);
  const doughnutData = dynamicPie.length > 0 ? dynamicPie : [{name:'No Data',value:1,color:'#1C212E'}];
  const activeSlice  = activeTab==='All' ? {name:'Total',value:totalActual} : (dynamicPie.find(d=>d.name===activeTab)||{name:activeTab,value:0});

  // ─ handlers ──────────────────────────────────────────────────────────────

  const handleAddCategory = async () => {
    if (!newCatName) return;
    setAddingCat(true);
    try {
      const res = await fetch('/api/sheet', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'ADD_CATEGORY', categoryName:newCatName, budgetAmount:parseFloat(newCatBudget||'0') }) });
      if (res.ok) {
        setNewCatName(''); setNewCatBudget(''); setShowAddCat(false);
        await fetchData();
      } else { alert('Failed to add category'); }
    } finally { setAddingCat(false); }
  };

  const handleLogExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpense.description || !newExpense.amount) return;
    setLogSubmitting(true);
    try {
      const res = await fetch('/api/sheet', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action: 'ADD_EXPENSE', staffName: newExpense.staffName || 'Admin',
          description: newExpense.description, amount: parseFloat(newExpense.amount),
          date: new Date().toLocaleDateString('en-PH', { timeZone:'Asia/Manila' })
        }) });
      if (res.ok) {
        setIsLogOpen(false); setNewExpense({description:'',amount:'',staffName:''});
        await fetchData();
      } else {
        const err = await res.json().catch(()=>({}));
        alert('Failed to log expense: '+(err.error||'Unknown'));
      }
    } catch(err){ console.error(err); }
    finally { setLogSubmitting(false); }
  };

  const handleUpdateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;
    setEditSaving(true);
    try {
      const res = await fetch('/api/sheet', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          action:'UPDATE_EXPENSE', rowIndex:editTarget.rowIndex,
          description:editVals.description, amount:parseFloat(editVals.amount), staffName:editVals.staffName
        })});
      if (res.ok) { setEditTarget(null); await fetchData(); }
      else { const err = await res.json().catch(()=>({})); alert('Failed: '+(err.error||'Unknown')); }
    } finally { setEditSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/sheet', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'DELETE_EXPENSE', rowIndex:deleteTarget.rowIndex })});
      if (res.ok) { setDeleteTarget(null); await fetchData(); }
      else { alert('Failed to delete'); }
    } finally { setDeleting(false); }
  };

  // ─ filter label ──────────────────────────────────────────────────────────
  const filterLabel = selectedDate ? selectedDate : (selectedMonths.length > 0 || selectedWeeks.length > 0 ? `${selectedMonths.length + selectedWeeks.length} Periods Selected` : 'All Time');

  const displayExpenses = [...filteredExpenses].reverse();

  if (loading) return <div className="p-8 text-slate-400 font-bold animate-pulse">Loading Expenses...</div>;

  return (
    <div className="w-full space-y-6 animate-in fade-in duration-500 relative">

      {/* ── Header ── */}
      <div className="flex flex-wrap justify-between items-start gap-4 mb-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <Wallet className="text-brand-teal" size={28} />
            Expenses
          </h1>
          <p className="text-slate-400 text-sm mt-1">Live expense actuals vs expected OpEx budget · {filterLabel}</p>
        </div>

        {/* ── Calendar Filter ── */}
        <div className="flex items-center gap-3 z-50">
          <div className="w-64">
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

          <button onClick={()=>setIsLogOpen(true)}
            className="px-4 py-2 bg-brand-blue hover:bg-brand-blue/90 text-white rounded-lg text-sm font-bold shadow-[0_0_15px_rgba(58,134,255,0.3)] transition-all">
            + Log Expense
          </button>
        </div>
      </div>

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">

        {/* Doughnut */}
        <Card className="md:col-span-4 flex flex-col items-center justify-center">
          <div className="w-full flex justify-between items-center absolute top-5 px-5 z-10">
            <span className="text-sm font-bold text-slate-300">Expense Breakdown</span>
            <MoreHorizontal size={16} className="text-slate-500" />
          </div>
          <div className="mt-8 relative h-48 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={doughnutData} cx="50%" cy="50%" innerRadius={60} outerRadius={80}
                  paddingAngle={dynamicPie.length>0?5:0} dataKey="value" stroke="none" cornerRadius={4}>
                  {doughnutData.map((e,i)=><Cell key={i} fill={e.color}/>)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute flex flex-col items-center">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">{activeSlice.name}</span>
              <span className="text-2xl font-bold text-white">₱{activeSlice.value.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
            </div>
          </div>
          <div className="flex gap-2 mt-4 bg-charcoal-900 p-1 rounded-lg border border-charcoal-700 w-full max-w-[280px] overflow-x-auto">
            {[{name:'All'},...dynamicPie.slice(0,3)].map(item=>(
              <button key={item.name} onClick={()=>setActiveTab(item.name)}
                className={`flex-1 text-[10px] font-bold py-1.5 px-3 whitespace-nowrap rounded transition-colors ${activeTab===item.name?'bg-charcoal-700 text-white':'text-slate-400 hover:text-slate-200'}`}>
                {item.name}
              </button>
            ))}
          </div>
        </Card>

        {/* Radial Budget vs Actual */}
        <Card className="md:col-span-4 flex flex-col justify-between">
          <div className="w-full flex justify-between items-center mb-2">
            <span className="text-sm font-bold text-slate-300">Expected vs Actual OpEx</span>
            <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${budgetUtilization>100?'text-brand-orange bg-brand-orange/10 border-brand-orange/20':'text-brand-teal bg-brand-teal/10 border-brand-teal/20'}`}>
              {budgetUtilization>100?<TrendingUp size={12}/>:<TrendingDown size={12}/>}
              <span className="font-bold">₱{Math.abs(totalBudget-totalActual).toLocaleString()}</span>
            </div>
          </div>
          <div className="relative h-44 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <RadialBarChart cx="50%" cy="50%" innerRadius="70%" outerRadius="100%" barSize={12}
                data={[{name:'U',value:Math.min(Math.round(budgetUtilization),100),fill:'#3A86FF'}]} startAngle={90} endAngle={-270}>
                <PolarAngleAxis type="number" domain={[0,100]} angleAxisId={0} tick={false}/>
                <RadialBar background={{fill:'#1C212E'}} dataKey="value" cornerRadius={10}/>
              </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute flex flex-col items-center justify-center w-24 h-24 bg-charcoal-900 rounded-full border border-charcoal-700">
              <span className="text-2xl font-bold text-white">{Math.round(budgetUtilization)}%</span>
            </div>
          </div>
          <div className="flex justify-between pt-4 border-t border-charcoal-700/50">
            <div>
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Expected Budget</p>
              <p className="text-lg font-bold text-white">₱{totalBudget.toLocaleString(undefined,{maximumFractionDigits:0})}</p>
            </div>
            <div className="text-xs text-slate-400 font-semibold text-right self-end">
              Actual: <span className="text-white">₱{totalActual.toLocaleString(undefined,{maximumFractionDigits:0})}</span>
            </div>
          </div>
        </Card>

        {/* Mini stats */}
        <div className="md:col-span-4 grid grid-rows-2 gap-6">
          <Card className="flex flex-col justify-center">
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Total Actual Expense</p>
            <div className="flex items-end justify-between">
              <span className="text-3xl font-black text-white">₱{totalActual.toLocaleString()}</span>
              <span className={`text-sm font-bold px-2 py-0.5 rounded ${budgetUtilization<100?'text-brand-teal bg-brand-teal/10':'text-brand-orange bg-brand-orange/10'}`}>
              {budgetUtilization<100?'Within Budget':'Over Budget'}
            </span>
            </div>
            <div className="w-full bg-charcoal-900 h-1.5 mt-4 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-brand-teal to-brand-blue h-full rounded-full" style={{width:`${Math.min(budgetUtilization,100)}%`}}/>
            </div>
          </Card>
          <Card className="flex flex-col justify-center">
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Remaining Budget</p>
            <span className="text-3xl font-black text-white">₱{Math.max(totalBudget-totalActual,0).toLocaleString()}</span>
            <div className="w-full bg-charcoal-900 h-1.5 mt-4 rounded-full overflow-hidden">
              <div className="bg-gradient-to-r from-brand-orange to-red-600 h-full rounded-full" style={{width:`${Math.max(100-budgetUtilization,0)}%`}}/>
            </div>
          </Card>
        </div>

        {/* Budget vs Actual Bar Chart */}
        <Card className="md:col-span-8 pb-2">
          <div className="flex items-center gap-4 mb-4">
            <span className="text-sm font-bold text-slate-300">Budget vs Actual by Category</span>
            <div className="flex gap-3 text-xs font-semibold">
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-brand-blue"/><span className="text-slate-400">Budget</span></div>
              <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-brand-orange"/><span className="text-slate-400">Actual</span></div>
            </div>
          </div>
          {/* Horizontally scrollable so every category is visible */}
          <div className="overflow-x-auto pb-1" style={{ cursor: 'grab' }}>
            <div style={{ minWidth: Math.max(budgets.length * 80, 400) }}>
              <BarChart
                width={Math.max(budgets.length * 80, 400)}
                height={240}
                data={budgets.map(b => ({
                  name: b.description.length > 14 ? b.description.slice(0, 13) + '…' : b.description,
                  fullName: b.description,
                  budget: b.amount,
                  actual: expenseMap[b.description] || 0,
                }))
                  // entries with actual spend come first (left), then budget-only, sorted by actual desc
                  .sort((a, b) => {
                    if (b.actual > 0 && a.actual === 0) return 1;
                    if (a.actual > 0 && b.actual === 0) return -1;
                    return b.actual - a.actual;
                  })}
                margin={{ top: 10, right: 16, left: -10, bottom: 50 }}
              >
                <CartesianGrid vertical={false} stroke="#1C212E" strokeDasharray="4 4"/>
                <XAxis dataKey="name" axisLine={false} tickLine={false}
                  tick={{ fill:'#64748b', fontSize:9, fontWeight:700 }}
                  angle={-35} textAnchor="end" interval={0}/>
                <YAxis axisLine={false} tickLine={false}
                  tick={{ fill:'#64748b', fontSize:10 }}
                  tickFormatter={v => v >= 1000 ? `₱${(v/1000).toFixed(0)}k` : `₱${v}`}/>
                <RechartsTooltip
                  contentStyle={{ backgroundColor:'#13161F', borderColor:'#1C212E', borderRadius:'8px', fontSize:11 }}
                  formatter={(val: number, name: string) => [`₱${val.toLocaleString()}`, name === 'budget' ? 'Budget' : 'Actual']}
                  labelFormatter={(label, payload: any[]) => payload?.[0]?.payload?.fullName || label}
                />
                <Bar dataKey="budget" fill="#3A86FF" opacity={0.4} radius={[4,4,0,0]} maxBarSize={32}/>
                <Bar dataKey="actual" fill="#FF4500" radius={[4,4,0,0]} maxBarSize={32}
                  label={{ position:'top', fill:'#FF4500', fontSize:8, formatter:(v: number) => v > 0 ? `₱${v >= 1000 ? (v/1000).toFixed(1)+'k' : v}` : '' }}/>
              </BarChart>
            </div>
          </div>
        </Card>


        {/* Cylinders */}
        <Card className="md:col-span-4">
          <div className="flex justify-between items-center mb-6">
            <span className="text-sm font-bold text-slate-300">Budget Depletion</span>
            <Info size={16} className="text-slate-500"/>
          </div>
          <div className="flex justify-center gap-10 mt-4">
            <Cylinder label="Burn Rate" amount={`₱${totalActual.toLocaleString()}`} value={Math.min(budgetUtilization,100)} color="#FF4500"/>
            <Cylinder label="Capital Intact" amount={`₱${Math.max(totalBudget-totalActual,0).toLocaleString()}`} value={Math.max(100-budgetUtilization,0)} color="#00E5FF"/>
          </div>
          <div className="mt-8 flex justify-between items-center px-4 py-3 bg-charcoal-900 border border-charcoal-700 rounded-lg">
            <div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Total Entries</p>
              <p className="text-lg font-bold text-brand-teal">{filteredExpenses.length}</p>
            </div>
            <span className="text-xs text-slate-500 font-semibold">{filterLabel}</span>
          </div>
        </Card>

        {/* ── Transaction Table ── */}
        <div className="md:col-span-12 mt-2">
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <h2 className="text-xl font-bold text-white">Transactions</h2>
            <span className="text-xs bg-charcoal-700 text-slate-400 px-2 py-1 rounded-full font-semibold">{filteredExpenses.length} entries</span>
            <span className="text-xs bg-brand-teal/10 text-brand-teal border border-brand-teal/20 px-3 py-1 rounded-full font-bold">Timekeeper + Dashboard</span>
          </div>
          <div className="bg-charcoal-800 border border-charcoal-700 rounded-xl overflow-hidden shadow-lg">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300 min-w-[780px]">
                <thead className="bg-charcoal-900 border-b border-charcoal-700 text-xs uppercase text-slate-500 font-bold tracking-wider">
                  <tr>
                    <th className="p-4">Date</th>
                    <th className="p-4">Staff Member</th>
                    <th className="p-4">Category / Description</th>
                    <th className="p-4">Source</th>
                    <th className="p-4 text-right">Amount (₱)</th>
                    <th className="p-4 text-center w-24">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-charcoal-700/50">
                  {displayExpenses.length===0 ? (
                    <tr><td colSpan={6} className="p-8 text-center text-slate-500">No expenses match the selected filter.</td></tr>
                  ) : displayExpenses.slice(0,50).map((exp,i)=>(
                    <tr key={i} className="hover:bg-charcoal-700/30 transition-colors group">
                      <td className="p-4 whitespace-nowrap text-slate-400 text-xs">{exp.date}</td>
                      <td className="p-4 font-semibold text-slate-200">{exp.staffName}</td>
                      <td className="p-4">{exp.description}</td>
                      <td className="p-4">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-full border ${exp.source==='Timekeeper'?'text-brand-blue bg-brand-blue/10 border-brand-blue/20':'text-brand-teal bg-brand-teal/10 border-brand-teal/20'}`}>
                          {exp.source}
                        </span>
                      </td>
                      <td className="p-4 text-right font-black text-brand-orange">
                        ₱{exp.amount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={()=>{ setEditTarget(exp); setEditVals({description:exp.description,amount:String(exp.amount),staffName:exp.staffName}); }}
                            className="p-1.5 bg-charcoal-700 hover:bg-brand-blue/20 hover:text-brand-blue text-slate-400 rounded-lg transition-all">
                            <Pencil size={12}/>
                          </button>
                          <button onClick={()=>setDeleteTarget(exp)}
                            className="p-1.5 bg-charcoal-700 hover:bg-red-500/20 hover:text-red-400 text-slate-400 rounded-lg transition-all">
                            <Trash2 size={12}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

      </div>{/* end grid */}

      {/* ══════════ LOG EXPENSE MODAL ══════════ */}
      {isLogOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-in fade-in">
          <div className="bg-charcoal-800 border border-charcoal-700 w-full max-w-md rounded-2xl shadow-2xl relative overflow-hidden">
            <div className="p-6">
              <button onClick={()=>setIsLogOpen(false)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20}/></button>
              <h2 className="text-2xl font-black text-white mb-6">Log New Expense</h2>
              <form onSubmit={handleLogExpense} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Who Spent It?</label>
                  <select required value={newExpense.staffName} onChange={e=>setNewExpense({...newExpense,staffName:e.target.value})}
                    className="w-full bg-charcoal-900 border border-charcoal-700 text-white rounded-lg p-3 outline-none focus:border-brand-teal transition-colors">
                    <option value="" disabled>Select staff member...</option>
                    {employees.map(emp=><option key={emp.name} value={emp.name}>{emp.name}</option>)}
                    <option value="Admin">Admin</option>
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Expense Category</label>
                    <button type="button" onClick={()=>setShowAddCat(p=>!p)}
                      className="flex items-center gap-1 text-[10px] font-bold text-brand-teal hover:text-brand-teal/80 transition-colors">
                      <Plus size={12}/> Add New Category
                    </button>
                  </div>
                  <select required value={newExpense.description} onChange={e=>setNewExpense({...newExpense,description:e.target.value})}
                    className="w-full bg-charcoal-900 border border-charcoal-700 text-white rounded-lg p-3 outline-none focus:border-brand-teal transition-colors">
                    <option value="" disabled>Select from OpEx_Budget...</option>
                    {categories.map(c=><option key={c} value={c}>{c}</option>)}
                    <option value="Other">Other (Unbudgeted)</option>
                  </select>
                </div>

                {/* Add Category Sub-form */}
                {showAddCat && (
                  <div className="bg-charcoal-900 border border-brand-teal/30 rounded-xl p-4 space-y-3 animate-in slide-in-from-top-2">
                    <p className="text-xs font-bold text-brand-teal uppercase tracking-wider">New Budget Category</p>
                    <input type="text" placeholder="Category name (e.g. Gas)" value={newCatName}
                      onChange={e=>setNewCatName(e.target.value)}
                      className="w-full bg-charcoal-800 border border-charcoal-700 text-white rounded-lg p-2.5 text-sm outline-none focus:border-brand-teal"/>
                    <input type="number" step="0.01" min="0" placeholder="Monthly budget (₱)" value={newCatBudget}
                      onChange={e=>setNewCatBudget(e.target.value)}
                      className="w-full bg-charcoal-800 border border-charcoal-700 text-white rounded-lg p-2.5 text-sm outline-none focus:border-brand-teal font-mono"/>
                    <button type="button" onClick={handleAddCategory} disabled={addingCat||!newCatName}
                      className="w-full py-2 bg-brand-teal/20 hover:bg-brand-teal/30 text-brand-teal font-bold rounded-lg text-sm transition-colors disabled:opacity-50">
                      {addingCat?'Saving...':'Save to OpEx_Budget'}
                    </button>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Amount (₱)</label>
                  <input type="number" step="0.01" required min="0.01" value={newExpense.amount}
                    onChange={e=>setNewExpense({...newExpense,amount:e.target.value})}
                    className="w-full bg-charcoal-900 border border-charcoal-700 text-white rounded-lg p-3 outline-none focus:border-brand-teal transition-colors font-mono"
                    placeholder="0.00"/>
                </div>

                <div className="pt-2 bg-charcoal-900/50 -mx-6 px-6 py-4 border-t border-charcoal-700/50">
                  <p className="text-[10px] text-slate-500 mb-3">
                    Writes to <strong className="text-slate-400">Staff_&_Commission_Hub</strong> → columns L &amp; M
                  </p>
                  <button type="submit" disabled={logSubmitting}
                    className="w-full bg-brand-teal hover:bg-brand-teal/90 text-charcoal-950 font-black rounded-lg p-3 transition-colors disabled:opacity-50">
                    {logSubmitting?'SAVING...':'SAVE & LOG EXPENSE'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ EDIT MODAL ══════════ */}
      {editTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-in fade-in">
          <div className="bg-charcoal-800 border border-charcoal-700 w-full max-w-md rounded-2xl p-6 shadow-2xl relative">
            <button onClick={()=>setEditTarget(null)} className="absolute top-4 right-4 text-slate-400 hover:text-white"><X size={20}/></button>
            <h2 className="text-2xl font-black text-white mb-1">Edit Expense</h2>
            <p className="text-slate-500 text-xs mb-6">
              From <span className="text-brand-teal font-semibold">{editTarget.source}</span> · {editTarget.date}
            </p>
            <form onSubmit={handleUpdateExpense} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Staff Member</label>
                <select value={editVals.staffName} onChange={e=>setEditVals({...editVals,staffName:e.target.value})}
                  className="w-full bg-charcoal-900 border border-charcoal-700 text-white rounded-lg p-3 outline-none focus:border-brand-teal">
                  {employees.map(emp=><option key={emp.name} value={emp.name}>{emp.name}</option>)}
                  <option value="Admin">Admin</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Description</label>
                <input type="text" required value={editVals.description} onChange={e=>setEditVals({...editVals,description:e.target.value})}
                  className="w-full bg-charcoal-900 border border-charcoal-700 text-white rounded-lg p-3 outline-none focus:border-brand-teal"/>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Amount (₱)</label>
                <input type="number" step="0.01" required min="0.01" value={editVals.amount}
                  onChange={e=>setEditVals({...editVals,amount:e.target.value})}
                  className="w-full bg-charcoal-900 border border-charcoal-700 text-white rounded-lg p-3 outline-none focus:border-brand-teal font-mono"/>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={()=>setEditTarget(null)} className="flex-1 py-2.5 bg-charcoal-700 text-slate-300 rounded-lg font-bold hover:bg-charcoal-600">Cancel</button>
                <button type="submit" disabled={editSaving} className="flex-1 py-2.5 bg-brand-blue text-white rounded-lg font-black hover:bg-brand-blue/90 disabled:opacity-50 flex items-center justify-center gap-2">
                  <Check size={15}/> {editSaving?'Saving...':'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════ DELETE CONFIRM ══════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-center z-50 p-4 animate-in fade-in">
          <div className="bg-charcoal-800 border border-red-500/30 w-full max-w-sm rounded-2xl p-6 shadow-2xl text-center">
            <Trash2 size={32} className="text-red-500 mx-auto mb-4"/>
            <h2 className="text-xl font-black text-white mb-2">Delete Entry?</h2>
            <p className="text-slate-400 text-sm mb-1">
              <strong className="text-white">{deleteTarget.description}</strong> · ₱{deleteTarget.amount.toLocaleString()}
            </p>
            <p className="text-slate-500 text-xs mb-6">
              This clears columns L & M on the row in Google Sheets. Clock-in data is preserved.
            </p>
            <div className="flex gap-3">
              <button onClick={()=>setDeleteTarget(null)} className="flex-1 py-2.5 bg-charcoal-700 text-slate-300 rounded-lg font-bold hover:bg-charcoal-600">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-lg font-black disabled:opacity-50">
                {deleting?'Deleting...':'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
