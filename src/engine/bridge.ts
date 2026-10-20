import type { Ledger } from './types';

/** The walk from cash invested to net value, every line in the ledger's USD terms, summed over the horizon. */
export interface ValueBridge {
  invested: number;
  ingressTax: number;
  ingressCost: number;
  /** Rent or dividends after running costs, before mortgage interest and tax. */
  income: number;
  /** Price growth of the holding. */
  growth: number;
  /** Mortgage interest; already included in growthCost. */
  interest: number;
  growthTax: number;
  growthCost: number;
  egressTax: number;
  egressCost: number;
  net: number;
  /** net − the sum of the lines above: ~0 in nominal dollars, the inflation effect in today's dollars. */
  residual: number;
}

const INTEREST_RULE = 'leverage_mortgage_interest';

export function valueBridge(l: Ledger): ValueBridge {
  const t = l.totalsUsd;
  let interest = 0;
  let income = 0;
  let growth = 0;
  for (const r of l.rows) {
    income += r.incomeUsd;
    growth += r.growthUsd;
    for (const e of r.events) if (e.ruleId.endsWith(INTEREST_RULE)) interest += e.amountUsd;
  }
  // Year rows report income net of interest, and interest is also a growth-stage cost: add it back so each line counts once.
  income += interest;
  const sum = l.principalUsd - t.taxes.ingress - t.costs.ingress + income + growth
    - t.taxes.growth - t.costs.growth - t.taxes.egress - t.costs.egress;
  return {
    invested: l.principalUsd,
    ingressTax: t.taxes.ingress, ingressCost: t.costs.ingress,
    income, growth, interest,
    growthTax: t.taxes.growth, growthCost: t.costs.growth,
    egressTax: t.taxes.egress, egressCost: t.costs.egress,
    net: l.finalNetUsd,
    residual: l.finalNetUsd - sum,
  };
}
