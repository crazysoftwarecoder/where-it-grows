import { describe, expect, it } from 'vitest';
import type { Assumptions, Rule, TaxFile } from '../../../schemas';
import { valueBridge } from '../bridge';
import { combineLedgers } from '../combine';
import { deflateLedger } from '../deflate';
import { simulate } from '../simulate';
import type { SimInputs } from '../types';

const meta = { source: 'https://example.org', last_verified: '2026-01-01' };
const assumptions: Assumptions = {
  principal_usd: 1_000_000, horizon_years_default: 10,
  equities: { growth: 0.07, yield: 0.02, franked_fraction: 0.7, meta },
  property: { growth: 0.05, yield: 0.035, cost_rate: 0.25, land_fraction: 0.6, meta },
};
const inputs: SimInputs = {
  horizonYears: 12, principalUsd: 1_000_000, equities: { growth: 0.07, yield: 0.02 },
  property: { growth: 0.05, yield: 0.035, costRate: 0.25, lvr: 0.7, interestRate: 0.06 },
  otherIncomeBand: 'mid', startDate: '2026-07-01', inflation: 0.025,
};
const rentTax: Rule = {
  id: 'rent', label: 'rent', stage: 'growth', category: 'tax', base: 'income',
  kind: { type: 'schedule', schedule: { $ref: 'income_tax' }, stack_on_other_income: true }, plain_english: 'tax on net rent for tests', meta,
};
const cgt: Rule = { id: 'cgt', label: 'cgt', stage: 'egress', category: 'tax', base: 'gain', kind: { type: 'flat', rate: 0.3 }, plain_english: 'flat gain tax for tests', meta };
const stamp: Rule = { id: 'stamp', label: 'stamp', stage: 'ingress', category: 'tax', base: 'principal', kind: { type: 'flat', rate: 0.05 }, plain_english: 'stamp duty for tests', meta };
const fee: Rule = { id: 'fee', label: 'fee', stage: 'egress', category: 'cost', base: 'value', kind: { type: 'flat', rate: 0.02 }, plain_english: 'agent fee for tests', meta };
const file: TaxFile = {
  country: 'uk', currency: 'GBP', tax_year: '2026', jurisdiction_note: 'test', meta,
  resident_profile: { other_income_options: [50_000, 150_000, 300_000], meta },
  income_tax: { brackets: [{ from: 0, to: null, rate: 0.4 }], meta }, levies: [],
  assets: { equities: { ingress: [], growth: [rentTax], egress: [cgt] }, property: { ingress: [stamp], growth: [rentTax], egress: [cgt, fee] } },
  // UK-style: interest not deductible, 20% credit instead, losses carried forward.
  property_leverage: { interest_deductible: false, finance_cost_credit_rate: 0.2, rental_loss: [{ treatment: 'carry_forward' }], plain_english: 'policy text for tests', meta },
};

describe('valueBridge', () => {
  const eq = simulate(inputs, file, 'equities', assumptions, 1.25);
  const pr = simulate(inputs, file, 'property', assumptions, 1.25);
  const pf = combineLedgers(eq, pr);

  it.each([['equities', eq], ['leveraged property', pr], ['portfolio', pf]])('%s: the lines sum to net value in nominal dollars', (_, l) => {
    const b = valueBridge(l);
    expect(b.net).toBe(l.finalNetUsd);
    expect(Math.abs(b.residual)).toBeLessThan(1e-6);
    expect(b.ingressTax + b.growthTax + b.egressTax).toBeCloseTo(l.totalsUsd.taxes.all, 6);
  });

  it('separates mortgage interest from other yearly costs without double counting', () => {
    const b = valueBridge(pr);
    expect(b.interest).toBeGreaterThan(0);
    expect(b.growthCost).toBeCloseTo(b.interest, 6); // the test file has no other growth-stage costs
    expect(b.income).toBeCloseTo(pr.rows.reduce((a, r) => a + r.incomeUsd, 0) + b.interest, 6);
  });

  it("in today's dollars the residual carries the inflation effect and net still matches the ledger", () => {
    const b = valueBridge(deflateLedger(pr, 0.025));
    expect(b.net).toBe(deflateLedger(pr, 0.025).finalNetUsd);
    expect(Math.abs(b.residual)).toBeGreaterThan(1);
  });
});
