import type { CountryCode } from '../../../schemas';

/** Validated categorical palette (fixed order, light / dark steps). See CLAUDE.md → dataviz. */
export const SERIES_LIGHT = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const SERIES_DARK = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'];

/** Fixed colour slot per country: colour follows the entity, never its rank. */
export const COUNTRY_SLOT: Record<CountryCode, number> = { au: 0, 'us-tx': 1, 'us-ca': 6, uk: 2, ca: 3, nz: 4, sg: 5, ae: 6, de: 7, ch: 0, in: 1, no: 4 };

export const STAGE_SLOT = { ingress: 0, growth: 1, egress: 2 } as const;

export function isDark(): boolean {
  const t = document.documentElement.dataset.theme;
  if (t === 'dark') return true;
  if (t === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export const chrome = () => (isDark()
  ? { surface: '#0f1b15', ink: '#eef2ea', ink2: '#b9c6bd', muted: '#93a39a', grid: '#1d2c24', axis: '#2c3d34', series: SERIES_DARK }
  : { surface: '#fffdf8', ink: '#13241c', ink2: '#44554c', muted: '#5f6d65', grid: '#ece6d9', axis: '#cfc7b5', series: SERIES_LIGHT });

/**
 * Stable colour slots for the current selection: a country keeps its slot while selected, prefers its home slot,
 * and otherwise takes the lowest free slot. Up to 8 countries are selectable, so colours never repeat on screen.
 */
const slotOf = new Map<CountryCode, number>();
export function assignCountrySlots(codes: CountryCode[]): void {
  for (const k of [...slotOf.keys()]) if (!codes.includes(k)) slotOf.delete(k);
  for (const c of codes) {
    if (slotOf.has(c)) continue;
    const used = new Set(slotOf.values());
    let slot = used.has(COUNTRY_SLOT[c]) ? 0 : COUNTRY_SLOT[c];
    while (used.has(slot) && slot < 8) slot++;
    slotOf.set(c, slot % 8);
  }
}

export function countryColor(code: CountryCode): string {
  return chrome().series[slotOf.get(code) ?? COUNTRY_SLOT[code]]!;
}

