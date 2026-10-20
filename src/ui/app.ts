import type { Asset, CountryCode } from '../../schemas';
import { compareAll, fxFor } from '../engine/compare';
import { deflateLedger } from '../engine/deflate';
import { COL_CATEGORY_KEYS } from '../../schemas';
import { dataTable } from './components/data-table';
import type { Ledger, LedgerAsset } from '../engine/types';
import { availableCountries, dataset } from '../data/loader';
import { COL_LABEL, colBars, colOption, type ColBar } from './charts/col';
import { gdpBars, gdpHistoryOption, gdpOption, type GdpBar } from './charts/gdp';
import { networthOption, type NetworthSeriesMeta } from './charts/networth';
import { taxStackOption, type TaxStackMeta } from './charts/taxstack';
import { assignCountrySlots, countryColor, echarts, isDark, mountChart } from './charts/theme';
import { renderDrilldown, type DrillTarget, type DrilldownCtx } from './components/drilldown';
import { isMetric, renderMetricSheet, type Metric } from './components/metric-sheet';
import { freshnessFooter } from './components/freshness';
import { createInputsPanel, type InputsPanel } from './components/inputs-panel';
import { renderHero } from './components/hero';
import { renderSummary as renderSummaryTables } from './components/summary';
import { firstPaintInputs } from './first-paint';
import { $, clear, h } from './dom';
import { ASSET_LABEL, ASSET_ORDER, pct, usd, usdCompact } from './format';
import { decodeState, encodeState, type AppState } from './state';

const REPO_URL = 'https://github.com/crazysoftwarecoder/where-it-grows';

export function startApp(): void {
  let state: AppState = decodeState(location.search);
  // Drop countries that have no data yet.
  const available = new Set(availableCountries.map((c) => c.code));
  state.countries = state.countries.filter((c) => available.has(c));
  if (!state.countries.length) state.countries = [availableCountries[0]!.code];

  const names = Object.fromEntries(dataset.countries.countries.map((c) => [c.code, c.name])) as Record<CountryCode, string>;

  const inputsHost = $('#inputs');
  const summaryHost = $('#summary');
  const nwHost = $('#networth-charts');
  const taxChart = mountChart($('#tax-chart'));
  const gdpChart = mountChart($('#gdp-chart'));
  const colChart = mountChart($('#col-chart'));
  const sheet = $('#sheet');
  const sheetBody = $('#sheet-body');
  const sheetChart = $('#sheet-chart');
  const nwCharts = new Map<LedgerAsset, echarts.ECharts>();
  let ledgers: Ledger[] = [];

  $('#footer').append(freshnessFooter(dataset, REPO_URL));

  const inputs = (): Parameters<typeof compareAll>[0] => firstPaintInputs(state);

  function hideTooltips(): void {
    const hide = () => { for (const c of [taxChart, gdpChart, colChart, ...nwCharts.values()]) if (!c.isDisposed()) c.dispatchAction({ type: 'hideTip' }); };
    hide();
    requestAnimationFrame(hide);
  }

  function openSheet(target: DrillTarget): void {
    hideTooltips();
    const ledger = ledgers.find((l) => l.country === target.country && l.asset === target.asset);
    if (!ledger) return;
    renderDrilldown(sheetBody, ledger, target, drillCtx());
    sheetChart.hidden = true;
    showSheet();
    $('#sheet-close').focus();
  }

  function drillCtx(): DrilldownCtx {
    return {
      names,
      jurisdictionNote: (c) => dataset.tax[c]?.jurisdiction_note,
      taxYear: (c) => dataset.tax[c]?.tax_year,
      realNote: state.real ? `USD amounts are in today's dollars (${state.infl}% inflation removed); local-currency amounts are as charged in that year.` : undefined,
    };
  }

  /** Net value, Total tax and Tax / gain each get their own sheet explaining how the figure was arrived at. */
  function openMetricSheet(country: CountryCode, asset: LedgerAsset, metric: Metric): void {
    hideTooltips();
    const ledger = ledgers.find((l) => l.country === country && l.asset === asset);
    if (!ledger) return;
    clear(sheetBody);
    renderMetricSheet(sheetBody, ledger, metric, drillCtx(), openSheet);
    sheetChart.hidden = true;
    showSheet();
    $('#sheet-close').focus();
  }

  let sheetChartInstance: echarts.ECharts | undefined;
  function openGdpSheet(country: CountryCode): void {
    hideTooltips();
    const g = dataset.gdp[country];
    if (!g) return;
    clear(sheetBody);
    const rate = g.projection.method === 'manual' ? (g.projection.cagr ?? 0) : undefined;
    sheetBody.append(
      h('header', { class: 'sheet-head' },
        h('h3', null, `GDP per capita · ${names[country]}`),
        h('p', { class: 'muted' }, `${g.indicator}. Projection: ${g.projection.method === 'manual' ? `manual CAGR ${pct(rate ?? 0)}` : 'compound growth of the last 10 years'}.`),
      ),
    );
    sheetBody.querySelector('.sheet-head')!.after(sheetChart);
    sheetChart.hidden = false;
    sheetChartInstance ??= mountChart(sheetChart);
    sheetChartInstance.setOption(gdpHistoryOption(g, state.horizon), { notMerge: true });
    sheetBody.append(
      h('footer', { class: 'src' },
        h('a', { href: g.meta.source, target: '_blank', rel: 'noopener' }, g.meta.source_title ?? 'Source'),
        h('span', { class: 'verified' }, `verified ${g.meta.last_verified}`),
      ),
    );
    showSheet();
    $('#sheet-close').focus();
    requestAnimationFrame(() => sheetChartInstance?.resize());
  }

  function showSheet(): void {
    sheet.classList.add('is-open');
    sheet.removeAttribute('inert');
    sheet.setAttribute('aria-hidden', 'false');
    document.body.classList.add('sheet-open');
  }
  function closeSheet(): void {
    sheet.classList.remove('is-open');
    sheet.setAttribute('inert', '');
    sheet.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('sheet-open');
  }
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheet.classList.contains('is-open')) closeSheet(); });

  function renderSummary(): void {
    renderSummaryTables(summaryHost, ledgers, state, names, (country, asset, cell) => (isMetric(cell) ? openMetricSheet(country, asset, cell) : openSheet({ country, asset, stage: cell })));
  }


  function renderNetworth(): void {
    const assets: LedgerAsset[] = ASSET_ORDER.filter((a) => ledgers.some((l) => l.asset === a));
    // Create or remove per-asset chart panels.
    for (const [asset, chart] of nwCharts) {
      if (!assets.includes(asset)) { chart.dispose(); nwCharts.delete(asset); nwHost.querySelector(`[data-asset="${asset}"]`)?.remove(); }
    }
    for (const asset of assets) {
      if (!nwCharts.has(asset)) {
        const panel = h('div', { class: 'chart-panel', dataset: { asset } },
          h('h3', null, `${ASSET_LABEL[asset]} · net worth after tax`),
          h('div', { class: 'chart chart-tall', role: 'img', 'aria-label': `Net worth over time for ${asset}` }),
        );
        nwHost.append(panel);
        const chart = mountChart(panel.querySelector<HTMLElement>('.chart')!);
        // Generous hit target: any click inside the plot snaps to the nearest year and the nearest country line.
        chart.getZr().on('click', (e: { offsetX: number; offsetY: number }) => {
          if (!chart.containPixel('grid', [e.offsetX, e.offsetY])) return;
          const rows = ledgers.filter((l) => l.asset === asset);
          if (!rows.length) return;
          const [xi, yv] = chart.convertFromPixel({ seriesId: JSON.stringify({ country: rows[0]!.country, asset } satisfies NetworthSeriesMeta) }, [e.offsetX, e.offsetY]) as [number, number];
          const year = Math.max(0, Math.min(rows[0]!.rows.length - 1, Math.round(xi)));
          const nearest = rows.reduce((best, l) => {
            const d = Math.abs(l.rows[year]!.netValueUsd - yv);
            return d < best.d ? { d, l } : best;
          }, { d: Infinity, l: rows[0]! });
          openSheet({ country: nearest.l.country, asset, year });
        });
        nwCharts.set(asset, chart);
      }
      nwCharts.get(asset)!.setOption(networthOption(ledgers, asset, names, window.innerWidth < 720), { notMerge: true });
    }
    for (const asset of assets) {
      const t = nwHost.querySelector(`[data-asset="${asset}"] h3`);
      if (t) t.textContent = `${ASSET_LABEL[asset]} · net worth after tax${state.real ? " (today's dollars)" : ''}`;
    }
    // Keep panels in display order (portfolio first).
    for (const asset of assets) { const el = nwHost.querySelector(`[data-asset="${asset}"]`); if (el) nwHost.append(el); }
    nwHost.classList.toggle('two-up', assets.length === 2);
    nwHost.classList.toggle('three-up', assets.length === 3);
    nwHost.style.minHeight = '';
  }

  let panel: InputsPanel | undefined;
  function render(): void {
    history.replaceState(null, '', `${location.pathname}${encodeState(state)}`);
    assignCountrySlots(state.countries);
    if (!panel) {
      panel = createInputsPanel(availableCountries, (patch) => { state = { ...state, ...patch }; render(); });
      clear(inputsHost);
      inputsHost.append(panel.el);
    }
    panel.sync(state);

    ledgers = compareAll(inputs(), dataset);
    if (state.real) ledgers = ledgers.map((l) => deflateLedger(l, state.infl / 100));
    renderHero($('#hero'), ledgers, state, names);
    renderSummary();
    renderNetworth();
    taxChart.setOption(taxStackOption(ledgers, names), { notMerge: true });

    const deflator = state.real ? Math.pow(1 + state.infl / 100, state.horizon) : 1;
    const gb = lastGdp = gdpBars(dataset.gdp, state.countries, state.horizon).map((g) => ({ ...g, projected: g.projected / deflator }));
    gdpChart.setOption(gdpOption(gb, names, state.horizon), { notMerge: true });
    $('#gdp-note').textContent = gb.length
      ? `Trend CAGR: ${gb.map((x) => `${names[x.country]} ${pct(x.cagr)}`).join(' · ')}.${state.real ? " Projections shown in today's dollars." : ''} Click a bar for the full history.`
      : 'GDP data not yet available for the selected countries.';

    const cb = lastCol = colBars(dataset.col, (c) => fxFor(dataset, c), state.countries, state.horizon).map((c) => ({
      ...c,
      categoriesUsd: Object.fromEntries(Object.entries(c.categoriesUsd).map(([k, v]) => [k, v / deflator])),
      totalUsd: c.totalUsd / deflator,
      incomeUsd: c.incomeUsd === undefined ? undefined : c.incomeUsd / deflator,
    }));
    colChart.setOption(colOption(cb, names), { notMerge: true });
    $('#col-note').textContent = cb.length
      ? `Annual spend for two adults and two children in ${cb[0]!.year}, inflated at each country's CPI from the base year, converted at today's exchange rates${state.real ? `, then shown in today's dollars (${state.infl}% removed)` : ''}.`
      : 'Cost-of-living data not yet available for the selected countries.';
    refreshTables();
  }

  // ---- Table views (accessibility): each chart card can flip to a plain data table.
  let lastGdp: GdpBar[] = [];
  let lastCol: ColBar[] = [];
  const tableBuilders: Record<string, () => HTMLElement> = {
    networth: () => {
      const assets: LedgerAsset[] = ASSET_ORDER.filter((a) => ledgers.some((l) => l.asset === a));
      const wrap = h('div', { class: 'tables' });
      for (const asset of assets) {
        const ls = ledgers.filter((l) => l.asset === asset);
        if (!ls.length) continue;
        wrap.append(dataTable(
          `${ASSET_LABEL[asset]} · net worth after tax by year${state.real ? " (today's dollars)" : ''}`,
          ['Year', ...ls.map((l) => names[l.country]), 'No-tax benchmark'],
          ls[0]!.rows.map((r, i) => [`Year ${r.year}`, ...ls.map((l) => usd(l.rows[i]!.netValueUsd)), usd(r.grossValueUsd)]),
        ));
      }
      return wrap;
    },
    tax: () => dataTable(
      `Total tax by stage over ${state.horizon} years${state.real ? " (today's dollars)" : ''}`,
      ['Country', 'Asset', 'Ingress', 'Growth', 'Egress', 'Total tax', 'Costs'],
      ledgers.filter((l) => l.asset !== 'portfolio').map((l) => [names[l.country], ASSET_LABEL[l.asset], usd(l.totalsUsd.taxes.ingress), usd(l.totalsUsd.taxes.growth), usd(l.totalsUsd.taxes.egress), usd(l.totalsUsd.taxes.all), usd(l.totalsUsd.costs.all)]),
    ),
    gdp: () => dataTable(
      'GDP per capita (current USD)',
      ['Country', 'Latest', 'Year', `Projected in ${state.horizon} yrs`, 'Trend growth'],
      lastGdp.map((g) => [names[g.country], usd(g.now), g.nowYear, usd(g.projected), pct(g.cagr)]),
    ),
    col: () => dataTable(
      `Annual spend, family of four, ${lastCol[0]?.year ?? ''} (USD)`,
      ['Country', 'City', ...COL_CATEGORY_KEYS.map((k) => COL_LABEL[k]), 'Total', 'Median income'],
      lastCol.map((c) => [names[c.country], c.city, ...COL_CATEGORY_KEYS.map((k) => usd(c.categoriesUsd[k] ?? 0)), usd(c.totalUsd), c.incomeUsd === undefined ? '—' : usd(c.incomeUsd)]),
    ),
  };
  const tableOpen = new Set<string>();
  function refreshTables(): void {
    for (const key of Object.keys(tableBuilders)) {
      const host = document.querySelector<HTMLElement>(`[data-table-host="${key}"]`);
      const view = document.querySelector<HTMLElement>(`[data-chart-view="${key}"]`);
      const btn = document.querySelector<HTMLButtonElement>(`[data-table-toggle="${key}"]`);
      if (!host || !view || !btn) continue;
      const open = tableOpen.has(key);
      host.hidden = !open;
      view.hidden = open;
      btn.textContent = open ? 'Chart' : 'Table';
      btn.setAttribute('aria-pressed', String(open));
      clear(host);
      if (open) host.append(tableBuilders[key]!());
    }
    if (!tableOpen.size) requestAnimationFrame(() => { for (const c of [taxChart, gdpChart, colChart, ...nwCharts.values()]) if (!c.isDisposed()) c.resize(); });
  }
  for (const btn of document.querySelectorAll<HTMLButtonElement>('[data-table-toggle]')) {
    btn.addEventListener('click', () => {
      const key = btn.dataset.tableToggle!;
      if (tableOpen.has(key)) tableOpen.delete(key); else tableOpen.add(key);
      refreshTables();
      if (!tableOpen.has(key)) requestAnimationFrame(() => { for (const c of [taxChart, gdpChart, colChart, ...nwCharts.values()]) if (!c.isDisposed()) c.resize(); });
    });
  }

  taxChart.on('click', (p) => {
    const meta = (p.data as { meta?: TaxStackMeta }).meta;
    if (meta) openSheet({ country: meta.country, asset: meta.asset, stage: meta.stage });
  });
  gdpChart.on('click', (p) => {
    const meta = (p.data as { meta?: { country: CountryCode } }).meta;
    if (meta) openGdpSheet(meta.country);
  });

  let copyTimer: number | undefined;
  $('#copy-link').addEventListener('click', async () => {
    const btn = $('#copy-link');
    window.clearTimeout(copyTimer);
    try {
      await navigator.clipboard.writeText(location.href);
      btn.textContent = 'Link copied';
    } catch {
      btn.textContent = location.href;
    }
    copyTimer = window.setTimeout(() => { btn.textContent = 'Copy link'; }, 1800);
  });

  const themeBtn = $('#theme-toggle');
  themeBtn.addEventListener('click', () => {
    const next = isDark() ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('theme', next); } catch { /* ignore */ }
    for (const c of nwCharts.values()) c.dispose();
    nwCharts.clear();
    clear(nwHost);
    render();
  });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) render(); });

  render();
}
