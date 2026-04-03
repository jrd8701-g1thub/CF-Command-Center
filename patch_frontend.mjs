import fs from 'fs';
const file = 'src/app/expenses/page.tsx';
let code = fs.readFileSync(file, 'utf8');

// 1. Add state for newCatIsCOGS
code = code.replace(
`  const [addingCat, setAddingCat]     = useState(false);`,
`  const [addingCat, setAddingCat]     = useState(false);
  const [newCatIsCOGS, setNewCatIsCOGS] = useState(false);`
);

// 2. Update handleAddCategory
code = code.replace(
`body: JSON.stringify({ action:'ADD_CATEGORY', categoryName:newCatName, budgetAmount:parseFloat(newCatBudget||'0') }) });`,
`body: JSON.stringify({ action:'ADD_CATEGORY', categoryName:newCatName, budgetAmount:parseFloat(newCatBudget||'0'), isCOGS: newCatIsCOGS }) });`
);

// 3. Update handleUpdateExpense
code = code.replace(
`          action:'UPDATE_EXPENSE', rowIndex:editTarget.rowIndex,`,
`          action:'UPDATE_EXPENSE', rowIndex:editTarget.rowIndex, isCOGS:editTarget.isCOGS,`
);

// 4. Update handleDelete
code = code.replace(
`body: JSON.stringify({ action:'DELETE_EXPENSE', rowIndex:deleteTarget.rowIndex })});`,
`body: JSON.stringify({ action:'DELETE_EXPENSE', rowIndex:deleteTarget.rowIndex, isCOGS:deleteTarget.isCOGS })});`
);

// 5. Update Add Category Modal UI
code = code.replace(
`                    <input type="number" step="0.01" min="0" placeholder="Monthly budget (₱)" value={newCatBudget}
                      onChange={e=>setNewCatBudget(e.target.value)}
                      className="w-full bg-charcoal-800 border border-charcoal-700 text-white rounded-lg p-2.5 text-sm outline-none focus:border-brand-teal font-mono"/>`,
`                    <input type="number" step="0.01" min="0" placeholder="Monthly budget (₱)" value={newCatBudget}
                      onChange={e=>setNewCatBudget(e.target.value)}
                      className="w-full bg-charcoal-800 border border-charcoal-700 text-white rounded-lg p-2.5 text-sm outline-none focus:border-brand-teal font-mono"/>
                    <label className="flex items-center gap-2 text-sm text-slate-300">
                      <input type="checkbox" checked={newCatIsCOGS} onChange={e=>setNewCatIsCOGS(e.target.checked)} className="rounded border-charcoal-700 text-brand-teal bg-charcoal-900"/>
                      This is a COGS cost (Cost of Goods Sold)
                    </label>`
);

// 6. Badge in transaction table
code = code.replace(
`                      <td className="p-4">
                        <span className={\`text-[10px] font-bold px-2 py-1 rounded-full border \${exp.source==='Timekeeper'?'text-brand-blue bg-brand-blue/10 border-brand-blue/20':'text-brand-teal bg-brand-teal/10 border-brand-teal/20'}\`}>
                          {exp.source}
                        </span>
                      </td>`,
`                      <td className="p-4 flex gap-1">
                        <span className={\`text-[10px] font-bold px-2 py-1 rounded-full border \${exp.isCOGS?'text-purple-400 bg-purple-400/10 border-purple-400/20':'text-brand-teal bg-brand-teal/10 border-brand-teal/20'}\`}>
                          {exp.isCOGS ? 'COGS' : 'OPEX'}
                        </span>
                      </td>`
);

fs.writeFileSync(file, code);
console.log("Updated page.tsx successfully");
