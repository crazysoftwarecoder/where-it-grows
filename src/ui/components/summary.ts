import type { CountryCode, Stage } from '../../../schemas';
import type { Ledger, LedgerAsset } from '../../engine/types';
import { countryColor } from '../charts/palette';
import { clear, h } from '../dom';
import { ASSET_LABEL, ASSET_ORDER, pct, usd, usdCompact } from '../format';
import type { AppState } from '../state';

/** "Where you end up" tables. Rows open the drill-down via onRow; the Ingress, Growth and Egress cells open their own stage, anywhere else opens egress. */
export function renderSummary(
  host: HTMLElement, ledgers: Ledger[], state: AppState, names: Record<CountryCode, string>,
  onRow: (country: CountryCode, asset: LedgerAsset, stage: Stage) => void,
): void {
  clear(host);
  const stageOf = (e: Event): Stage => ((e.target as Element | null)?.closest('td[data-stage]')?.getAttribute('data-stage') as Stage | null) ?? 'egress';
  const assets = ASSET_ORDER.filter((a) => ledgers.some((l) => l.asset === a));
  for (const asset of assets) {
    const rows = ledgers.filter((l) => l.asset === asset).sort((a, b) => b.finalNetUsd - a.finalNetUsd);
    host.append(h('table', { class: 'summary' },
      h('caption', null, `${ASSET_LABEL[asset]} · ${usdCompact(rows[0]?.principalUsd ?? state.principal)}${asset === 'portfolio' ? ` (${state.alloc}% equities / ${100 - state.alloc}% property)` : ''} after ${state.horizon} years${asset !== 'equities' && state.lvr > 0 && (asset === 'property' || state.alloc < 100) ? ` · ${state.lvr}% LVR at ${state.rate}%` : ''}${state.real ? " · in today's dollars" : ''}`),
      h('thead', null, h('tr', null,
        h('th', null, 'Country'), h('th', { class: 'num' }, 'Net value'), h('th', { class: 'num' }, 'Total tax'),
        h('th', { class: 'num' }, 'Tax / gain'), h('th', { class: 'num' }, 'Ingress'), h('th', { class: 'num' }, 'Growth'), h('th', { class: 'num' }, 'Egress'),
        ...(asset === 'property' && state.lvr > 0 ? [h('th', { class: 'num' }, 'Price'), h('th', { class: 'num' }, 'Loan')] : []),
      )),
      h('tbody', null, ...rows.map((l) => h('tr', { tabindex: 0, role: 'button', 'aria-label': `Show taxes for ${names[l.country]} ${asset}`,
        onclick: (e: MouseEvent) => onRow(l.country, asset, stageOf(e)),
        onkeydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onRow(l.country, asset, 'egress'); } },
      },
        h('td', null, h('span', { class: 'swatch', style: `background:${countryColor(l.country)}` }), names[l.country]),
        h('td', { class: 'num' }, usd(l.finalNetUsd)),
        h('td', { class: 'num' }, usd(l.totalsUsd.taxes.all)),
        h('td', { class: 'num' }, pct(l.effectiveTaxRate)),
        h('td', { class: 'num', 'data-stage': 'ingress', title: 'Show taxes when buying in' }, usdCompact(l.totalsUsd.taxes.ingress)),
        h('td', { class: 'num', 'data-stage': 'growth', title: 'Show taxes each year' }, usdCompact(l.totalsUsd.taxes.growth)),
        h('td', { class: 'num', 'data-stage': 'egress', title: 'Show taxes when selling out' }, usdCompact(l.totalsUsd.taxes.egress)),
        ...(asset === 'property' && state.lvr > 0 ? [h('td', { class: 'num' }, usdCompact(l.purchasePriceUsd)), h('td', { class: 'num' }, usdCompact(l.loanUsd))] : []),
      ))),
    ));
  }
}
