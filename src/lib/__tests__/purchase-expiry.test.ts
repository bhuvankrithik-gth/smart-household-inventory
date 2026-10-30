import { describe, test, expect } from '@jest/globals';
import { withPurchaseExpiry } from '../logic';
import { Batch } from '../types';
const b = (id: string, expiry?: string, noExpiry?: boolean): Batch => ({ id, householdId: 'h1', itemId: 'i1', qty: 2, unit: 'pcs', expiryDate: expiry, noExpiry, location: 'Pantry', createdAt: '2026-01-01' });
describe('purchase expiry stamping', () => {
  test('stamps only the purchase batch and clears its no-expiry flag', () => {
    const out = withPurchaseExpiry([b('old', '2026-06-01'), b('new')], 'new', '2027-01-12');
    expect(out[0]).toEqual(b('old', '2026-06-01'));
    expect(out[1].expiryDate).toBe('2027-01-12');
    expect(out[1].noExpiry).toBe(false);
  });
  test('blank date leaves batches untouched (stays "not recorded", not "no expiry")', () => {
    const before = [b('new')];
    expect(withPurchaseExpiry(before, 'new', undefined)).toEqual(before);
    expect(withPurchaseExpiry(before, 'new', '')).toEqual(before);
  });
  test('unknown batch id leaves everything unchanged', () => {
    const before = [b('a', '2026-06-01')];
    expect(withPurchaseExpiry(before, 'missing', '2027-01-12')).toEqual(before);
  });
});
