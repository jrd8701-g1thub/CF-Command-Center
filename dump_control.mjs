import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';

const sheetId = '15AOU_ur7mWhnoAFmf_qOVQ87OaXb36W8z4FbPgbxK60';
const email = 'pos-agent@cf-command-center.iam.gserviceaccount.com';
const key = `-----BEGIN PRIVATE KEY-----\nMIIEvgIBADANBgkqhkiG9w0BAQEFAASCBKgwggSkAgEAAoIBAQDfZXsP3jUFpE1t\nzjUnZJo91Pwf6O9LiEOOGHE7QlBs9jm+yVFZsh0DGSoJGPvL3WpQz0H3ZVML1Jhe\nSuB/1te3hvqFaGTf5CIm1MkS6spQzF86Tqi+nKZVe7DkaE+txzn99hvTgpTDDhXO\n6WgfTDm7qjQTGJfUoxhBX/VGzzMYNgNh4vZ79SJe1+y3jDR+6WjnRmNla8wTUKud\n9w2W+MfKpp4JGou7aD1yDNlNMqbsE2e4Mq5y73i98Bfx4OLc0Rena4mitdaACFvN\nEhh/Cz+1oTxt6sN/PbXdy09DaegWAXoX8JwK6zpgPmpxnTFOn3zirczgG72QmLSL\nfaaWOg2pAgMBAAECggEABLIL26IGiEdTT08Jw/mz2j/bSsppGTPUg6yU2LOEoD2u\nqgluOc3qGTIStZ0+UaMmRGuOzeXl0HZX+4dkX5uC7jsakepHUINpilpnnYus0/Tv\nvXiAyHzfbCWM6sgcgKES4XkmTZRNjyoBIFe8lgfSoNSrgok+S7xf2qPrMmFRiB00\ndw+UfhiOhXMMuAxuMe9ZENqVOkM+Weh6bIERLM8M6UAYwRD0xg654xnHuRMlcy8B\nusGVwpP2Yrc6AWTMyTzPugd/C2Q7g4ZSie5AL25G84H1o6mh+KDaYlsoXL33atR/\nDLgYmT7If8bDvYz1jUsnvXeGMSaCFEv2+81OQ4tvJwKBgQD2/gWqswBkqGHVX7Fa\n1IigO8B3oDOWJkwixQvmXYxHsEOPc7NvH61eJGAMBxmfwjEu4yg2DUztkJj84A+t\ncJBPcNQOR4tANX9ht+SaRgpvfjot/Q8hkf2iMrM9IVyoXADjNLUm7rEdIf4Aizdm\nsOyxwyZ/XcIOQVxnLJ2JklHcowKBgQDniyl7a9bMZK1BayemxPIdGTx/W/HBMAvQ\nTr7Lz+peaM/GWlu2THezMpqHbGfqBIl/Z21t3dWoUk1ml8EBwFRNZme0zYB27byJ\nag34kTFu95Tuu1SvWhg2ArYu9Rv+cLPzfaQ24c0SRG2p3VjbM7qXtvE0S307MX4J\n895V6UtlQwKBgB1UEIwycSuCqwtRL5gfgJG2RqZtyXJc3dGLIFycYxnoHj2ceYQK\neOWi4BzNgwdrYbe1lYLFlYroDqKIYJQxt5EXTrbbW/el4phR471F79tJW9M2J2PP\nGBT4fDwYCA6dziUsjw4uba2N6cFaxptVCuYYzCt3kKFstXIy5An/6+SNAoGBANfR\ncKLny1jMZmlZlaXuYLYatbcIXnhxbjGFlHWooI3LKA98XYu4DsJq4npj4x/PhtHH\n98m2QdYYkKiVvoMBYBKc5wExoxI3WcrDna4Yt3j1ME6tMawYUATX1jRCpwssxa6p\nZ4z4PwtN2OHBvXbj6oJLNNxHmLy5zv873fs57tq9AoGBAIbEVGrpzTltbak+sYQm\nGj07Xbbfk+64Dm60YkpZuY8hOl5sa/US0iSblpjzcLp1rnoEzKcnTwz1KWkqFeWZ\nQ9ywonyft7S+uzxVjqX//pAj83XrFLVS8/BtybRhRPdaFybth3daGxeeaXangBp+\nxUwmUGxyfcw1UjpxrXzAp06a\n-----END PRIVATE KEY-----\n`.replace(/\\n/g, '\n');

const jwt = new JWT({ email, key, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
const doc = new GoogleSpreadsheet(sheetId, jwt);

async function dump() {
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['POS_System_Control'];
    await sheet.loadCells('A1:B100');
    for (let r = 0; r < 100; r++) {
        const l = sheet.getCell(r, 0).value;
        const v = sheet.getCell(r, 1).value;
        if (l || v) {
            console.log(`Row ${r + 1}: [${l}] => [${v}]`);
        }
    }
}

dump().catch(console.error);
