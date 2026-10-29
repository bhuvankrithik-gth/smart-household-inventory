// Receipt reading: turn a shop receipt's OCR text into item lines the user
// reviews before anything is saved. Pure and unit-tested — the OCR call
// itself lives in expiryOcr.readOcrText (same ocr.space service, same key).

export interface ReceiptLine { name: string; qty: number; price: number | null }

// Lines that are never products: headers, tax, totals, payment, greetings.
const SKIP = /^(GSTIN|GST|CGST|SGST|IGST|VAT|TAX|TOTAL|GRAND\s*TOTAL|SUB\s*TOTAL|SUBTOTAL|AMOUNT|NET\s*AMOUNT|BALANCE|CASH|CARD|CHANGE|RETURN|THANK|VISIT|TEL|PHONE|MOB|BILL|INVOICE|RECEIPT|DATE|TIME|CUSTOMER|CASHIER|STORE|SHOP|ITEMS?|QTY|RATE|AMT|MRP|DISCOUNT|ROUND\s*OFF|UPI|WELCOME|HELLO)\b/i;
const PRICE_AT_END = /([\d,]+\.\d{1,2}|[\d,]+)\s*[₹Rs.]?\s*$/;
const QTY_PREFIX = /^(\d+)\s*[xX×]\s+/;
const TRAILING_NUMBER = /\s[\d,]+(\.\d{1,2})?\s*$/;

export function parseReceiptLines(rawText: string): ReceiptLine[] {
  const out: ReceiptLine[] = [];
  for (const raw of rawText.split('\n')) {
    let line = raw.trim().replace(/\s+/g, ' ');
    if (line.length < 2) continue;
    if (!/[A-Za-z]/.test(line)) continue; // barcode / number-only rows
    if (SKIP.test(line)) continue;
    // Trailing price first: the last number on the line is the line total.
    // A line with no price is never an item (store names, addresses and
    // greetings have none) — dropping it beats inventing inventory.
    const pm = PRICE_AT_END.exec(line);
    let price: number | null = null;
    if (pm) {
      price = parseFloat(pm[1].replace(/,/g, ''));
      line = line.slice(0, pm.index).trim();
    } else continue;
    // Leading "2 X" quantity.
    let qty = 1;
    const qm = QTY_PREFIX.exec(line);
    if (qm) { qty = parseInt(qm[1], 10); line = line.slice(qm[0].length).trim(); }
    // A leftover trailing number is the unit price ("MAGGI 2 X 12.00 24.00"
    // already gave up 24.00 as the total; 12.00 is not part of the name).
    if (price !== null) line = line.replace(TRAILING_NUMBER, '').trim();
    // Clean wrappers: "*NAME*", "- NAME -", "NAME.".
    line = line.replace(/^[\*\-\.\s]+|[\*\-\.\s]+$/g, '').trim();
    if (line.length < 2) continue;
    if (SKIP.test(line)) continue;
    out.push({ name: line, qty: Number.isFinite(qty) && qty > 0 ? qty : 1, price });
  }
  return out;
}
