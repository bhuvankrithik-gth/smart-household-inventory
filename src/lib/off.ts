// Open Food Facts lookup: turns a barcode into honest product details
// (name / brand / pack size) for pre-filling the add-item form. Anything the
// database does not know stays blank — details are never fabricated.
// Data: https://world.openfoodfacts.org — free, no API key required.

export interface OffProduct {
  name: string;
  brand?: string;
  packSize?: string;
}

export type OffResult =
  | { kind: 'found'; product: OffProduct }
  | { kind: 'not-found' }
  | { kind: 'error' };

// Pure parser for the OFF v2 product response — unit-tested.
export function parseOffProduct(json: any): OffProduct | null {
  if (!json || json.status !== 1 || !json.product) return null;
  const p = json.product;
  const name = String(p.product_name || p.product_name_en || '').trim();
  if (!name) return null;
  const brandRaw = String(p.brands || '').split(',')[0]?.trim();
  // OFF quantities look like "400 g e" (the trailing e = estimated sign).
  const pack = String(p.quantity || '').replace(/\s+e$/i, '').trim();
  return {
    name,
    brand: brandRaw || undefined,
    packSize: pack || undefined,
  };
}

export async function lookupBarcode(code: string): Promise<OffResult> {
  const barcode = code.trim();
  if (!barcode) return { kind: 'not-found' };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9000);
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_en,brands,quantity`,
      {
        headers: {
          'User-Agent': 'SmartHouseholdInventory/2.0 (Android; bhuvankeerthan@gmail.com)',
          Accept: 'application/json',
        },
        signal: ctrl.signal,
      },
    );
    if (!res.ok) return { kind: 'error' };
    const product = parseOffProduct(await res.json());
    return product ? { kind: 'found', product } : { kind: 'not-found' };
  } catch {
    return { kind: 'error' };
  } finally {
    clearTimeout(timer);
  }
}
