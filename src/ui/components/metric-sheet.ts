import type { CountryCode, Stage } from '../../../schemas';
import { valueBridge } from '../../engine/bridge';
import type { Ledger, TaxEvent } from '../../engine/types';
import { h } from '../dom';
import { ASSET_LABEL, pct, STAGE_LABEL, usd } from '../format';
import type { DrilldownCtx, DrillTarget } from './drilldown';

/** The three headline columns of the summary table that are not a single tax stage. */
export type Metric = 'net' | 'tax' | 'rate';
export const METRIC_LABEL: Record<Metric, string> = { net: 'Net value', tax: 'Total tax', rate: 'Tax / gain' };
export const isMetric = (s: string): s is Metric => s in METRIC_LABEL;

const STAGES: Stage[] = ['ingress', 'growth', 'egress'];
const STAGE_SHORT: Record<Stage, string> = { ingress: 'buying in', growth: 'each year', egress: 'selling out' };

function head(title: string, lede: string, country: CountryCode, ctx: DrilldownCtx): HTMLElement {
  return h('header', { class: 'sheet-head' },
    h('h3', null, title),
    h('p', { class: 'muted' }, lede),
    h('p', { class: 'muted' }, ctx.jurisdictionNote(country) ?? '', ctx.taxYear(country) ? ` Tax year ${ctx.taxYear(country)}.` : ''),
    ctx.realNote ? h('p', { class: 'muted' }, ctx.realNote) : null,
  );
}

function kpi(label: string, value: string, onclick?: () => void): HTMLElement {
  return onclick
    ? h('button', { type: 'button', class: 'kpi kpi-btn', onclick, title: 'Show the rules behind this' }, h('span', null, label), h('strong', null, value))
    : h('div', { class: 'kpi' }, h('span', null, label), h('strong', null, value));
}

const signed = (v: number, sign: '+' | '−'): string => `${sign}${usd(Math.abs(v))}`;

interface RuleGroup { ruleId: string; label: string; stage: Stage; category: TaxEvent['category']; years: Set<number>; total: number }

function groupRules(l: Ledger): RuleGroup[] {
  const groups = new Map<string, RuleGroup>();
  for (const r of l.rows) for (const e of r.events) {
    const g = groups.get(e.ruleId) ?? { ruleId: e.ruleId, label: e.label, stage: e.stage, category: e.category, years: new Set<number>(), total: 0 };
    g.years.add(e.year);
    g.total += e.amountUsd;
    groups.set(e.ruleId, g);
  }
  return [...groups.values()].filter((g) => g.total !== 0).sort((a, b) => Math.abs(b.total) - Math.abs(a.total));
}

function ruleRow(g: RuleGroup, open: (stage: Stage) => void): HTMLElement {
  const neg = g.total < 0;
  return h('button', { type: 'button', class: 'rule-row', onclick: () => open(g.stage), title: `Open ${STAGE_LABEL[g.stage].toLowerCase()}` },
    h('span', { class: `tag tag-${g.category}` }, STAGE_SHORT[g.stage]),
    h('span', { class: 'label' }, g.label, h('span', { class: 'sub' }, g.years.size > 1 ? ` · ${g.years.size} years` : '')),
    h('strong', { class: neg ? 'is-refund' : '' }, `${neg ? '−' : ''}${usd(Math.abs(g.total))}`),
  );
}

export function renderMetricSheet(root: HTMLElement, ledger: Ledger, metric: Metric, ctx: DrilldownCtx, open: (t: DrillTarget) => void): void {
  const who = `${ctx.names[ledger.country]} · ${ASSET_LABEL[ledger.asset]}`;
  const openStage = (stage: Stage) => open({ country: ledger.country, asset: ledger.asset, stage });
  const openYear = (year: number) => open({ country: ledger.country, asset: ledger.asset, year });
  const years = ledger.horizonYears;
  const gain = ledger.finalGrossUsd - ledger.principalUsd;

  if (metric === 'net') {
    const b = valueBridge(ledger);
    const incomeLabel = ledger.asset === 'equities' ? 'Dividends received' : ledger.asset === 'property' ? 'Rent after running costs' : 'Rent and dividends after running costs';
    const otherCosts = b.growthCost - b.interest;
    const line = (label: string, v: number, sign: '+' | '−', stage?: Stage, sub?: string): HTMLElement | null => (v === 0 ? null :
      h('tr', { class: stage ? 'is-link' : '', onclick: stage ? () => openStage(stage) : undefined, title: stage ? `Open ${STAGE_LABEL[stage].toLowerCase()}` : undefined },
        h('td', null, label, sub ? h('span', { class: 'sub' }, ` ${sub}`) : null),
        h('td', { class: `num${sign === '−' ? ' neg' : ''}` }, signed(v, sign))));
    root.append(
      head(`Net value · ${who}`, `How ${usd(ledger.principalUsd)} of cash became ${usd(ledger.finalNetUsd)} over ${years} years. Click a line to see the rules behind it, or a year for that year's detail.`, ledger.country, ctx),
      h('div', { class: 'kpis' },
        kpi('Net value', usd(ledger.finalNetUsd)),
        kpi('Untaxed value', usd(ledger.finalGrossUsd)),
        kpi('Tax drag', pct(ledger.dragPct)),
        ledger.loanUsd > 0 ? kpi('Bought with loan', `${usd(ledger.purchasePriceUsd)} · ${usd(ledger.loanUsd)}`) : kpi('Cash invested', usd(ledger.principalUsd)),
      ),
      h('table', { class: 'bridge' },
        h('tbody', null,
          h('tr', null, h('td', null, 'Cash invested'), h('td', { class: 'num' }, usd(b.invested))),
          line('Taxes when buying in', b.ingressTax, '−', 'ingress'),
          line('Costs when buying in', b.ingressCost, '−', 'ingress'),
          line(incomeLabel, b.income, '+', 'growth', `over ${years} years`),
          line('Price growth', b.growth, '+', undefined, `over ${years} years`),
          line('Mortgage interest', b.interest, '−', 'growth'),
          line('Other costs each year', otherCosts, '−', 'growth'),
          line('Taxes each year', b.growthTax, '−', 'growth'),
          line('Taxes when selling out', b.egressTax, '−', 'egress'),
          line('Costs when selling out', b.egressCost, '−', 'egress'),
          Math.abs(b.residual) >= 1 ? line("Inflation adjustment", b.residual, b.residual < 0 ? '−' : '+', undefined, "(each year's flows are in today's dollars)") : null,
        ),
        h('tfoot', null, h('tr', null, h('td', null, 'Net value'), h('td', { class: 'num' }, usd(b.net)))),
      ),
      h('h4', { class: 'section' }, 'Year by year'),
      h('table', { class: 'bridge years' },
        h('thead', null, h('tr', null, h('th', null, 'Year'), h('th', { class: 'num' }, 'Untaxed'), h('th', { class: 'num' }, 'Net'), h('th', { class: 'num' }, 'Tax that year'))),
        h('tbody', null, ...ledger.rows.map((r) => h('tr', { class: 'is-link', onclick: () => openYear(r.year), title: `Open year ${r.year}` },
          h('td', null, r.year === 0 ? 'Buy' : r.year === years ? `${r.year} (sell)` : String(r.year)),
          h('td', { class: 'num' }, usd(r.grossValueUsd)),
          h('td', { class: 'num' }, usd(r.netValueUsd)),
          h('td', { class: 'num neg' }, usd(r.taxesUsd.ingress + r.taxesUsd.growth + r.taxesUsd.egress)),
        ))),
      ),
    );
    return;
  }

  if (metric === 'tax') {
    const groups = groupRules(ledger);
    const taxes = groups.filter((g) => g.category === 'tax');
    const costs = groups.filter((g) => g.category === 'cost');
    const parts: (HTMLElement | null)[] = [
      head(`Total tax · ${who}`, `Every tax charged over ${years} years, added up by rule. Fees and interest are costs, not tax: they reduce net value but are listed separately. Click a rule for its explanation and source.`, ledger.country, ctx),
      h('div', { class: 'kpis' },
        kpi('Total tax', usd(ledger.totalsUsd.taxes.all)),
        ...STAGES.map((s) => kpi(STAGE_LABEL[s], usd(ledger.totalsUsd.taxes[s]), () => openStage(s))),
      ),
      h('h4', { class: 'section' }, 'By rule'),
      taxes.length ? h('div', { class: 'rule-list' }, ...taxes.map((g) => ruleRow(g, openStage))) : h('p', { class: 'empty' }, `No tax applies in ${ctx.names[ledger.country]} for ${ASSET_LABEL[ledger.asset].toLowerCase()}.`),
      costs.length ? h('h4', { class: 'section' }, `Costs, not counted as tax · ${usd(ledger.totalsUsd.costs.all)}`) : null,
      costs.length ? h('div', { class: 'rule-list' }, ...costs.map((g) => ruleRow(g, openStage))) : null,
    ];
    root.append(...parts.filter((x): x is HTMLElement => x !== null));
    return;
  }

  // metric === 'rate'
  root.append(
    head(`Tax / gain · ${who}`, 'Total tax divided by the gain you would have made over the same years with every cost but no tax at all. It measures how much of the untaxed gain the taxman keeps.', ledger.country, ctx),
    h('div', { class: 'kpis' },
      kpi('Tax / gain', pct(ledger.effectiveTaxRate)),
      kpi('Total tax', usd(ledger.totalsUsd.taxes.all)),
      kpi('Untaxed gain', usd(gain)),
      kpi('Tax drag', pct(ledger.dragPct)),
    ),
    h('div', { class: 'formula' },
      gain > 0
        ? `${usd(ledger.totalsUsd.taxes.all)} ÷ (${usd(ledger.finalGrossUsd)} − ${usd(ledger.principalUsd)}) = ${pct(ledger.effectiveTaxRate)}`
        : `No untaxed gain over ${years} years, so the rate is shown as 0%.`),
    h('h4', { class: 'section' }, 'Where it comes from'),
    h('table', { class: 'bridge' },
      h('tbody', null, ...STAGES.map((s) => h('tr', { class: 'is-link', onclick: () => openStage(s), title: `Open ${STAGE_LABEL[s].toLowerCase()}` },
        h('td', null, STAGE_LABEL[s]),
        h('td', { class: 'num' }, usd(ledger.totalsUsd.taxes[s])),
        h('td', { class: 'num' }, gain > 0 ? pct(ledger.totalsUsd.taxes[s] / gain) : '—'),
      ))),
      h('tfoot', null, h('tr', null, h('td', null, 'Total'), h('td', { class: 'num' }, usd(ledger.totalsUsd.taxes.all)), h('td', { class: 'num' }, pct(ledger.effectiveTaxRate)))),
    ),
    h('ul', { class: 'notes' },
      h('li', null, `The untaxed gain comes from running the same ${years} years with every fee${ledger.loanUsd > 0 ? ', interest payment' : ''} and running cost, but no tax rule, so the rate isolates tax.`),
      h('li', null, 'It counts tax paid every year on income, not only the tax on sale, which is why it can sit well above the headline capital gains rate.'),
      h('li', null, 'Tax drag is the same tax as a share of the untaxed final value rather than the gain, so it is always the smaller number.'),
    ),
  );
}
