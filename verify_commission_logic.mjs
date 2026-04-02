import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';

// Helper: Ph Time
function getPHTime() {
    return new Date(new Date().getTime() + (8 * 60 * 60 * 1000)).toISOString().replace('T', ' ').split('.')[0];
}

// Exactly from route.ts
export async function fetchCommissionRules(doc) {
    try {
        const sheet = doc.sheetsByTitle['POS_System_Control'];
        await sheet.loadCells('A15:B65');
        const rules = [];
        let current = {};

        for (let r = 14; r < 65; r++) {
            const label = sheet.getCell(r, 0).value?.toString().toLowerCase().trim() || '';
            const val = sheet.getCell(r, 1).value?.toString().trim() || '';

            if (!label || !val) continue;

            // Use stricter startsWith matching to avoid descriptive words triggering wrong fields
            if (label.startsWith('sku keyword')) {
                if (current.keyword !== undefined) rules.push(current);
                current = { keyword: val.toLowerCase(), value: 0, type: 'Fixed', maxCap: 0 };
            } else if (label.startsWith('value') || label.startsWith('divisor') || label.startsWith('amount') || label.startsWith('rate')) {
                const n = parseFloat(val.replace(/[^0-9.-]+/g, ''));
                current.value = isNaN(n) ? 0 : n;
            } else if (label.startsWith('commission type') || label.startsWith('type')) {
                current.type = val === 'Weight' ? 'Weight' : 'Fixed';
            } else if (label.startsWith('max cap') || (label.startsWith('max') && !label.startsWith('maximum'))) {
                const n = parseFloat(val.replace(/[^0-9.-]+/g, ''));
                current.maxCap = isNaN(n) ? 0 : n;
            }
        }
        if (current.keyword !== undefined) rules.push(current);
        return rules;
    } catch (e) {
        console.error('Error fetching commission rules:', e);
        return [];
    }
}

export function calculateCommission(itemName, quantity, orderType, rules) {
    if (!orderType.toLowerCase().includes('delivery') || orderType.toLowerCase().includes('pickup')) return 0;

    let commPerUnit = 0;
    const lowerName = itemName.toLowerCase();

    for (const rule of rules) {
        if (lowerName.includes(rule.keyword)) {
            if (rule.type === 'Fixed') {
                commPerUnit = rule.value ?? 0;
            } else if (rule.type === 'Weight') {
                const match = lowerName.match(/(\d+)\s*kg/);
                if (match) {
                    const weight = parseFloat(match[1]);
                    const divisor = rule.value || 1;
                    let calculated = weight / divisor;
                    if (rule.maxCap > 0 && calculated > rule.maxCap) {
                        calculated = rule.maxCap;
                    }
                    commPerUnit = calculated;
                }
            }
            break;
        }
    }

    const qty = isNaN(quantity) ? 0 : quantity;
    const finalComm = commPerUnit * qty;
    return isNaN(finalComm) ? 0 : finalComm;
}

const sheetId = '15AOU_ur7mWhnoAFmf_qOVQ87OaXb36W8z4FbPgbxK60';
const email = 'pos-agent@cf-command-center.iam.gserviceaccount.com';
const key = `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDfZXsP3jUFpE1t\nzjUnZJo91Pwf6O9LiEOOGHE7QlBs9jm+yVFZsh0DGSoJGPvL3WpQz0H3ZVML1Jhe\nSuB/1te3hvqFaGTf5CIm1MkS6spQzF86Tqi+nKZVe7DkaE+txzn99hvTgpTDDhXO\n6WgfTDm7qjQTGJfUoxhBX/VGzzMYNgNh4vZ79SJe1+y3jDR+6WjnRmNla8wTUKud\n9w2W+MfKpp4JGou7aD1yDNlNMqbsE2e4Mq5y73i98Bfx4OLc0Rena4mitdaACFvN\nEhh/Cz+1oTxt6sN/PbXdy09DaegWAXoX8JwK6zpgPmpxnTFOn3zirczgG72QmLSL\nfaaWOg2pAgMBAAECggEABLIL26IGiEdTT08Jw/mz2j/bSsppGTPUg6yU2LOEoD2u\nqgluOc3qGTIStZ0+UaMmRGuOzeXl0HZX+4dkX5uC7jsakepHUINpilpnnYus0/Tv\nvXiAyHzfbCWM6sgcgKES4XkmTZRNjyoBIFe8lgfSoNSrgok+S7xf2qPrMmFRiB00\ndw+UfhiOhXMMuAxuMe9ZENqVOkM+Weh6bIERLM8M6UAYwRD0xg654xnHuRMlcy8B\nusGVwpP2Yrc6AWTMyTzPugd/C2Q7g4ZSie5AL25G84H1o6mh+KDaYlsoXL33atR/\nDLgYmT7If8bDvYz1jUsnvXeGMSaCFEv2+81OQ4tvJwKBgQD2/gWqswBkqGHVX7Fa\n1IigO8B3oDOWJkwixQvmXYxHsEOPc7NvH61eJGAMBxmfwjEu4yg2DUztkJj84A+t\ncJBPcNQOR4tANX9ht+SaRgpvfjot/Q8hkf2iMrM9IVyoXADjNLUm7rEdIf4Aizdm\nsOyxwyZ/XcIOQVxnLJ2JklHcowKBgQDniyl7a9bMZK1BayemxPIdGTx/W/HBMAvQ\nTr7Lz+peaM/GWlu2THezMpqHbGfqBIl/Z21t3dWoUk1ml8EBwFRNZme0zYB27byJ\nag34kTFu95Tuu1SvWhg2ArYu9Rv+cLPzfaQ24c0SRG2p3VjbM7qXtvE0S307MX4J\n895V6UtlQwKBgB1UEIwycSuCqwtRL5gfgJG2RqZtyXJc3dGLIFycYxnoHj2ceYQK\neOWi4BzNgwdrYbe1lYLFlYroDqKIYJQxt5EXTrbbW/el4phR471F79tJW9M2J2PP\nGBT4fDwYCA6dziUsjw4uba2N6cFaxptVCuYYzCt3kKFstXIy5An/6+SNAoGBANfR\ncKLny1jMZmlZlaXuYLYatbcIXnhxbjGFlHWooI3LKA98XYu4DsJq4npj4x/PhtHH\n98m2QdYYkKiVvoMBYBKc5wExoxI3WcrDna4Yt3j1ME6tMawYUATX1jRCpwssxa6p\nZ4z4PwtN2OHBvXbj6oJLNNxHmLy5zv873fs57tq9AoGBAIbEVGrpzTltbak+sYQm\nGj07Xbbfk+64Dm60YkpZuY8hOl5sa/US0iSblpjzcLp1rnoEzKcnTwz1KWkqFeWZ\nQ9ywonyft7S+uzxVjqX//pAj83XrFLVS8/BtybRhRPdaFybth3daGxeeaXangBp+\nxUwmUGxyfcw1UjpxrXzAp06a\n-----END PRIVATE KEY-----\n`.replace(/\\n/g, '\n');

const jwt = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet(sheetId, jwt);

async function simulate() {
    await doc.loadInfo();
    const rules = await fetchCommissionRules(doc);
    console.log('Fetched Rules:', JSON.stringify(rules, null, 2));

    const testRow = {
        item: 'Water',
        qty: 4,
        orderType: 'Regular (Delivery)'
    };
    const c = calculateCommission(testRow.item, testRow.qty, testRow.orderType, rules);
    console.log(`Simulation Result for Water (qty 4): ${c}`);

    const testIce = {
        item: '45KG Ice',
        qty: 2,
        orderType: 'Regular (Delivery)'
    };
    const ci = calculateCommission(testIce.item, testIce.qty, testIce.orderType, rules);
    console.log(`Simulation Result for 45KG Ice (qty 2): ${ci}`);
}

simulate().catch(console.error);
