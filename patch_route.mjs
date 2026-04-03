import fs from 'fs';
const file = 'src/app/api/sheet/route.ts';
let code = fs.readFileSync(file, 'utf8');

// 1. Replace tab === 'expenses' block (lines ~201-311)
code = code.replace(/\/\/ ---- EXPENSES TAB \(read budgets \+ actuals from both sources\) ----[\s\S]*?return NextResponse\.json\(\{ expenses, budgets, categories \}\);\n\s*\}/, 
`// ---- EXPENSES TAB (Unified dynamic fetch from side-by-side tables) ----
        if (tab === 'expenses') {
            const expenses = [];
            let budgets = [];
            let categories = [];

            const expSheet = doc.sheetsByTitle['Expenses'];
            if (!expSheet) return NextResponse.json({ error: 'Expenses sheet not found' }, { status: 500 });
            
            const maxRows = Math.max(expSheet.rowCount, 50);
            await expSheet.loadCells(\`A1:M\${maxRows}\`);

            for (let i = 1; i < maxRows; i++) {
                const desc = expSheet.getCell(i, 0).value;
                if (!desc) continue;
                const type = expSheet.getCell(i, 1).value || 'OPEX';
                const amtRaw = expSheet.getCell(i, 2).value;
                const amtNum = typeof amtRaw === 'number' ? amtRaw : parseFloat(amtRaw?.toString().replace(/[^0-9.-]+/g, '') || '0');
                budgets.push({ description: desc.toString(), category: type.toString(), amount: amtNum });
                if (!categories.includes(desc.toString())) categories.push(desc.toString());
            }

            for (let i = 1; i < maxRows; i++) {
                const date = expSheet.getCell(i, 4).value;
                const amtRaw = expSheet.getCell(i, 7).value;
                if (!date && (!amtRaw && amtRaw !== 0)) continue;
                const amtNum = typeof amtRaw === 'number' ? amtRaw : parseFloat(amtRaw?.toString().replace(/[^0-9.-]+/g, '') || '0');
                expenses.push({ rowIndex: i, date: date?.toString() || '', staffName: expSheet.getCell(i, 5).value?.toString() || '', description: expSheet.getCell(i, 6).value?.toString() || '', amount: amtNum, source: 'Dashboard', isCOGS: false });
            }

            for (let i = 1; i < maxRows; i++) {
                const date = expSheet.getCell(i, 9).value;
                const amtRaw = expSheet.getCell(i, 12).value;
                if (!date && (!amtRaw && amtRaw !== 0)) continue;
                const amtNum = typeof amtRaw === 'number' ? amtRaw : parseFloat(amtRaw?.toString().replace(/[^0-9.-]+/g, '') || '0');
                expenses.push({ rowIndex: i, date: date?.toString() || '', staffName: expSheet.getCell(i, 10).value?.toString() || '', description: expSheet.getCell(i, 11).value?.toString() || '', amount: amtNum, source: 'Dashboard', isCOGS: true });
            }

            console.log(\`[GET expenses] Returning \${expenses.length} total expenses, \${budgets.length} budgets/categories\`);
            return NextResponse.json({ expenses, budgets, categories });
        }`);

// 2. Replace action === 'GET_EXPENSES' which was a duplicate in POST
code = code.replace(/if \(action === 'GET_EXPENSES'\) \{[\s\S]*?console\.log\(`\[GET_EXPENSES\] Returning \${expenses\.length} expenses and \${budgets\.length} budgets`\);\n\s*return NextResponse\.json\(\{ expenses, budgets, categories \}\);\n\s*\}/,
`if (action === 'GET_EXPENSES') { return NextResponse.json({ error: 'Deprecated. Use GET ?tab=expenses' }, { status: 400 }); }`);

// 3. Replace ADD_EXPENSE
code = code.replace(/if \(action === 'ADD_EXPENSE'\) \{[\s\S]*?return NextResponse\.json\(\{ success: true \}\);\n\s*\}/g,
`if (action === 'ADD_EXPENSE' || action === 'LOG_EXPENSE') {
            const { staffName, description, amount, date } = body;
            const expSheet = doc.sheetsByTitle['Expenses'];
            if (!expSheet) return NextResponse.json({ error: 'Expenses sheet not found' }, { status: 500 });
            
            const maxRows = Math.max(expSheet.rowCount, 50);
            await expSheet.loadCells(\`A1:M\${maxRows + 50}\`);
            
            let isCogs = false;
            for (let i = 1; i < maxRows; i++) {
                const desc = expSheet.getCell(i, 0).value?.toString() || '';
                if (desc === description && expSheet.getCell(i, 1).value === 'COGS') {
                    isCogs = true; break;
                }
            }
            
            let targetRow = 1;
            const colOffset = isCogs ? 9 : 4; // 4=E, 9=J
            for (let i = 1; i < maxRows + 50; i++) {
                if (!expSheet.getCell(i, colOffset).value && !expSheet.getCell(i, colOffset+3).value) {
                    targetRow = i; break;
                }
            }
            
            const expDate = date || new Date().toLocaleDateString('en-PH', { timeZone: 'Asia/Manila' });
            expSheet.getCell(targetRow, colOffset).value = expDate;
            expSheet.getCell(targetRow, colOffset + 1).value = staffName || (action === 'LOG_EXPENSE' ? 'Staff' : 'Admin (Dashboard)');
            expSheet.getCell(targetRow, colOffset + 2).value = description;
            expSheet.getCell(targetRow, colOffset + 3).value = parseFloat(amount || '0');
            await expSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }`);

// 4. Remove old LOG_EXPENSE since we merged it above
code = code.replace(/if \(action === 'LOG_EXPENSE'\) \{[\s\S]*?console\.log\('\[LOG_EXPENSE\] ✅ Saved successfully'\);\s*return NextResponse\.json\(\{ success: true \}\);\s*\}/, 
`/* LOG_EXPENSE merged with ADD_EXPENSE */`);

// 5. UPDATE_EXPENSE
code = code.replace(/if \(action === 'UPDATE_EXPENSE'\) \{[\s\S]*?return NextResponse\.json\(\{ success: true \}\);\n\s*\}/, 
`if (action === 'UPDATE_EXPENSE') {
            const { rowIndex, description, amount, staffName, isCOGS } = body;
            if (rowIndex === undefined || rowIndex === null) return NextResponse.json({ error: 'Missing rowIndex' }, { status: 400 });

            const expSheet = doc.sheetsByTitle['Expenses'];
            if (!expSheet) return NextResponse.json({ error: 'Expenses sheet not found' }, { status: 500 });
            await expSheet.loadCells(\`A1:M\${rowIndex + 10}\`);

            const colOffset = isCOGS ? 9 : 4;
            if (description !== undefined) expSheet.getCell(rowIndex, colOffset + 2).value = description;
            if (amount !== undefined) expSheet.getCell(rowIndex, colOffset + 3).value = parseFloat(String(amount));
            if (staffName !== undefined) expSheet.getCell(rowIndex, colOffset + 1).value = staffName;
            await expSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }`);

// 6. DELETE_EXPENSE
code = code.replace(/if \(action === 'DELETE_EXPENSE'\) \{[\s\S]*?return NextResponse\.json\(\{ success: true \}\);\n\s*\}/, 
`if (action === 'DELETE_EXPENSE') {
            const { rowIndex, isCOGS } = body;
            if (rowIndex === undefined || rowIndex === null) return NextResponse.json({ error: 'Missing rowIndex' }, { status: 400 });

            const expSheet = doc.sheetsByTitle['Expenses'];
            if (!expSheet) return NextResponse.json({ error: 'Expenses sheet not found' }, { status: 500 });
            await expSheet.loadCells(\`A1:M\${rowIndex + 10}\`);

            const colOffset = isCOGS ? 9 : 4;
            // Clear the 4 cells for this record
            expSheet.getCell(rowIndex, colOffset).value = null;
            expSheet.getCell(rowIndex, colOffset + 1).value = null;
            expSheet.getCell(rowIndex, colOffset + 2).value = null;
            expSheet.getCell(rowIndex, colOffset + 3).value = null;
            await expSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }`);

// 7. ADD_CATEGORY
code = code.replace(/if \(action === 'ADD_CATEGORY'\) \{[\s\S]*?return NextResponse\.json\(\{ success: true \}\);\n\s*\}/, 
`if (action === 'ADD_CATEGORY') {
            const { categoryName, budgetAmount, isCOGS } = body;
            if (!categoryName) return NextResponse.json({ error: 'Missing categoryName' }, { status: 400 });
            const expSheet = doc.sheetsByTitle['Expenses'];
            if (!expSheet) return NextResponse.json({ error: 'Expenses sheet not found' }, { status: 500 });

            const maxRows = Math.max(expSheet.rowCount, 50);
            await expSheet.loadCells(\`A1:C\${maxRows + 50}\`);
            
            let nextRow = 1;
            for (let i = 1; i < maxRows + 50; i++) {
                if (!expSheet.getCell(i, 0).value) { nextRow = i; break; }
            }
            
            expSheet.getCell(nextRow, 0).value = categoryName;
            expSheet.getCell(nextRow, 1).value = isCOGS ? 'COGS' : 'OPEX';
            expSheet.getCell(nextRow, 2).value = parseFloat(budgetAmount || '0');
            await expSheet.saveUpdatedCells();
            return NextResponse.json({ success: true });
        }`);

fs.writeFileSync(file, code);
console.log("Updated route.ts successfully");
