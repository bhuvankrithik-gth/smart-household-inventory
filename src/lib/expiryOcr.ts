// Photo-based expiry capture: OCR the printed expiry block on a pack, pull
// the date out of the recognised text, and let the user confirm it before
// anything is saved. The parser is pure and unit-tested; the OCR call uses
// ocr.space (free tier). A personal key can be set via EXPO_PUBLIC_OCR_API_KEY;
// otherwise the shared demo key is used and may be rate-limited.

export interface ExpiryGuess {
  date: string; // YYYY-MM-DD
  basis: string; // how it was derived, shown to the user for confirmation
}

const MONTHS: Record<string, number> = {
  JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6,
  JUL: 7, AUG: 8, SEP: 9, SEPT: 9, OCT: 10, NOV: 11, DEC: 12,
};

function pad(n: number): string { return String(n).padStart(2, '0'); }
function lastDay(year: number, month: number): number { return new Date(Date.UTC(year, month, 0)).getUTCDate(); }
function fullYear(y: number): number { return y < 100 ? 2000 + y : y; }
function validYmd(y: number, m: number, d: number): boolean {
  return m >= 1 && m <= 12 && d >= 1 && d <= lastDay(y, m);
}

interface Found { y: number; m: number; d: number | null; raw: string; index: number }

// Finds every date-shaped token in the text: DD/MM/YYYY, DD-MM-YY,
// YYYY-MM-DD, MM/YYYY, "30 NOV 2027", "NOV 2027", "12-Jan-26",
// "12th Jan 2026", "JAN. 2027". Day/month separators may be a space,
// dot or dash, and day numbers may carry an ordinal suffix.
function findDates(text: string): Found[] {
  const out: Found[] = [];
  const push = (y: number, m: number, d: number | null, raw: string, index: number) => {
    if (m < 1 || m > 12) return;
    if (d !== null && !validYmd(y, m, d)) return;
    out.push({ y: fullYear(y), m, d, raw, index });
  };
  let match: RegExpExecArray | null;
  const numeric = /(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})|(\d{4})[\/.\-](\d{1,2})[\/.\-](\d{1,2})|(\d{1,2})[\/.\-](\d{2,4})/g;
  while ((match = numeric.exec(text)) !== null) {
    if (match[1] !== undefined) push(+match[3], +match[2], +match[1], match[0], match.index);
    else if (match[4] !== undefined) push(+match[4], +match[5], +match[6], match[0], match.index);
    else push(+match[8], +match[7], null, match[0], match.index); // MM/YYYY
  }
  const named = /(\d{1,2})(?:ST|ND|RD|TH)?[\s.\-]*(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*\.?[\s.\-]*(\d{2,4})|(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEPT?|OCT|NOV|DEC)[A-Z]*\.?[\s.\-]*(\d{2,4})/g;
  while ((match = named.exec(text)) !== null) {
    if (match[1] !== undefined) push(+match[3], MONTHS[match[2]], +match[1], match[0], match.index);
    else push(+match[5], MONTHS[match[4]], null, match[0], match.index);
  }
  return out.sort((a, b) => a.index - b.index);
}

function toIso(f: Found): string {
  const d = f.d ?? lastDay(f.y, f.m); // month-only expiry = end of that month
  return `${f.y}-${pad(f.m)}-${pad(d)}`;
}

function addMonths(y: number, m: number, d: number, months: number): string {
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12); const nm = (total % 12) + 1;
  const nd = Math.min(d, lastDay(ny, nm));
  return `${ny}-${pad(nm)}-${pad(nd)}`;
}

// The date printed nearest AFTER a label like EXP / USE BY / BEST BEFORE.
function dateNearLabel(text: string, label: RegExp, dates: Found[]): Found | null {
  const m = label.exec(text);
  if (!m) return null;
  const after = dates.filter(d => d.index >= m.index && d.index <= m.index + 40);
  return after[0] ?? null;
}

// A compact DDMMYY date printed after a label ("USE BY 120127"). The digit
// run must stand alone (not part of a longer barcode/price run) and form a
// real calendar date, so stray numbers never become expiry dates.
function compactNearLabel(text: string, label: RegExp): Found | null {
  const m = label.exec(text);
  if (!m) return null;
  const window = text.slice(m.index, m.index + 60);
  const re = /\d{6}/g;
  let run: RegExpExecArray | null;
  while ((run = re.exec(window)) !== null) {
    const before = window[run.index - 1];
    const after = window[run.index + 6];
    if ((before !== undefined && /\d/.test(before)) || (after !== undefined && /\d/.test(after))) continue;
    const d = +run[0].slice(0, 2); const mo = +run[0].slice(2, 4); const y = fullYear(+run[0].slice(4, 6));
    if (!validYmd(y, mo, d)) continue;
    return { y, m: mo, d, raw: run[0], index: m.index + run.index };
  }
  return null;
}

function sameDay(a: Found | null, b: Found | null): boolean {
  return !!a && !!b && a.y === b.y && a.m === b.m && (a.d ?? lastDay(a.y, a.m)) === (b.d ?? lastDay(b.y, b.m));
}

export function extractExpiry(rawText: string): ExpiryGuess | null {
  if (!rawText) return null;
  const text = rawText.toUpperCase().replace(/(\d)\s*([\/.\-])\s*(\d)/g, '$1$2$3');
  const dates = findDates(text);
  // No early return on empty `dates`: a compact DDMMYY date after a label
  // (e.g. "BBE 120127") is found by the label steps below, not by findDates.
  const mfgDate = dateNearLabel(text, /(MFG|MFD|PKD|PACKED|MANUFACTURED)/, dates)
    ?? compactNearLabel(text, /(MFG|MFD|PKD|PACKED|MANUFACTURED)/);

  // 1. Explicit expiry labels win (hyphenated labels and BBE included).
  const expLabel = /(EXP|EXPIRY|EXP[\s\-]*DATE|USE[\s\-]*BY|USE[\s\-]*BEFORE|BBE)/;
  const exp = dateNearLabel(text, expLabel, dates) ?? compactNearLabel(text, expLabel);
  if (exp && !sameDay(exp, mfgDate)) return { date: toIso(exp), basis: 'expiry date printed on the pack' };

  // 2. "BEST BEFORE <date>" (including "BEST BEFORE END").
  const bbLabel = /BEST[\s\-]*BEFORE/;
  const bb = dateNearLabel(text, bbLabel, dates) ?? compactNearLabel(text, bbLabel);
  if (bb && !sameDay(bb, mfgDate)) return { date: toIso(bb), basis: '"best before" date printed on the pack' };

  // 3. "BEST BEFORE n MONTHS FROM MFG/PKD" + the manufacture date.
  const rel = /BEST\s*BEFORE\s*(\d{1,2})\s*MONTHS?\s*FROM/.exec(text);
  if (rel && mfgDate) {
    let date = addMonths(mfgDate.y, mfgDate.m, mfgDate.d ?? 1, parseInt(rel[1], 10));
    if (mfgDate.d === null) { // month-precision MFG: expiry = end of the target month
      const [yy, mm] = date.split('-').map(Number);
      date = `${yy}-${pad(mm)}-${pad(lastDay(yy, mm))}`;
    }
    return { date, basis: `calculated: ${rel[1]} months from the manufacture date` };
  }

  // 4. A single unlabelled date that is not the manufacture date.
  const others = dates.filter(d => d !== mfgDate);
  if (others.length === 1) return { date: toIso(others[0]), basis: 'the only date printed on the pack' };
  return null;
}

// ---- date display format (DD-MM-YYYY for entry, ISO for storage) ----
export function isoToDdmmyyyy(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}
export function ddmmyyyyToIso(s: string): string | null {
  const m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s.trim());
  if (!m) return null;
  const d = +m[1]; const mo = +m[2]; const y = +m[3];
  if (!validYmd(y, mo, d)) return null;
  return `${y}-${pad(mo)}-${pad(d)}`;
}

// ---- OCR call (ocr.space free API) ----
// Reads the raw text of a photo. Engine 2 is tried first; when it returns
// nothing usable, Engine 1 gets a turn — the two engines read faint and
// dot-matrix print differently, so the retry rescues real misses.
export type OcrTextResult =
  | { kind: 'ok'; text: string }
  | { kind: 'empty' }
  | { kind: 'error' };

export async function readOcrText(base64: string, apiKey: string): Promise<OcrTextResult> {
  let sawEmpty = false;
  for (const engine of ['2', '1']) {
    try {
      const form = new FormData();
      form.append('apikey', apiKey || 'helloworld');
      form.append('base64Image', `data:image/jpeg;base64,${base64}`);
      form.append('OCREngine', engine);
      form.append('scale', 'true');
      form.append('language', 'eng');
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25000);
      const res = await fetch('https://api.ocr.space/parse/image', { method: 'POST', body: form as any, signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data: any = await res.json();
      const text = String(data?.ParsedResults?.[0]?.ParsedText || '');
      if (text.trim()) return { kind: 'ok', text };
      sawEmpty = true;
    } catch { /* try the next engine */ }
  }
  return sawEmpty ? { kind: 'empty' } : { kind: 'error' };
}

export type OcrExpiryResult =
  | { kind: 'found'; guess: ExpiryGuess }
  | { kind: 'no-date' }
  | { kind: 'error' };

export async function readExpiryFromPhoto(base64: string, apiKey: string): Promise<OcrExpiryResult> {
  const r = await readOcrText(base64, apiKey);
  if (r.kind === 'error') return { kind: 'error' };
  if (r.kind === 'empty') return { kind: 'no-date' };
  const guess = extractExpiry(r.text);
  return guess ? { kind: 'found', guess } : { kind: 'no-date' };
}
