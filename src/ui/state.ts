import { z } from 'zod';
import { CountryCodeSchema, type CountryCode } from '../../schemas';
import type { AssetChoice } from '../engine/compare';
import type { IncomeBand } from '../engine/types';

export const MAX_COUNTRIES = 8;

export interface AppState {
  horizon: number;
  principal: number;
  countries: CountryCode[];
  asset: AssetChoice;
  eqGrowth: number; // percent
  eqYield: number;
  prGrowth: number;
  prYield: number;
  prCost: number;
  lvr: number; // percent
  alloc: number; // percent of capital in equities when asset = both
  rate: number; // mortgage rate, percent
  income: IncomeBand;
  real: boolean;
  infl: number; // percent
}

export const DEFAULT_STATE: AppState = {
  horizon: 15,
  principal: 100_000,
  countries: ['au', 'us-tx', 'us-ca', 'uk', 'sg'],
  asset: 'both',
  eqGrowth: 7,
  eqYield: 2,
  prGrowth: 5,
  prYield: 3.5,
  prCost: 25,
  lvr: 0,
  alloc: 50,
  rate: 6,
  income: 'mid',
  real: false,
  infl: 2.5,
};

const num = (min: number, max: number, d: number) => z.coerce.number().min(min).max(max).catch(d);

const StateSchema = z.object({
  h: num(1, 40, DEFAULT_STATE.horizon),
  p: num(1000, 1e9, DEFAULT_STATE.principal),
  c: z.string().transform((s) => s.split(',').map((x) => x.trim()).map((x) => (x === 'us' ? 'us-tx' : x)).filter((x) => CountryCodeSchema.safeParse(x).success) as CountryCode[]).catch(DEFAULT_STATE.countries),
  a: z.enum(['equities', 'property', 'both']).catch(DEFAULT_STATE.asset),
  eg: num(-20, 30, DEFAULT_STATE.eqGrowth),
  ey: num(0, 20, DEFAULT_STATE.eqYield),
  pg: num(-20, 30, DEFAULT_STATE.prGrowth),
  py: num(0, 20, DEFAULT_STATE.prYield),
  pc: num(0, 90, DEFAULT_STATE.prCost),
  lv: num(0, 90, DEFAULT_STATE.lvr),
  al: num(0, 100, DEFAULT_STATE.alloc),
  mr: num(0, 25, DEFAULT_STATE.rate),
  inc: z.enum(['low', 'mid', 'high']).catch(DEFAULT_STATE.income),
  rt: z.enum(['0', '1']).catch('0'),
  inf: num(0, 20, DEFAULT_STATE.infl),
});

export function decodeState(search: string): AppState {
  const q = Object.fromEntries(new URLSearchParams(search));
  const s = StateSchema.parse(q);
  const countries = [...new Set(s.c)].slice(0, MAX_COUNTRIES);
  return {
    horizon: Math.round(s.h),
    principal: s.p,
    countries: countries.length ? countries : DEFAULT_STATE.countries,
    asset: s.a,
    eqGrowth: s.eg, eqYield: s.ey, prGrowth: s.pg, prYield: s.py, prCost: s.pc, lvr: s.lv, rate: s.mr, alloc: Math.round(s.al),
    income: s.inc,
    real: s.rt === '1',
    infl: s.inf,
  };
}

export function encodeState(s: AppState): string {
  const q = new URLSearchParams();
  const put = (k: string, v: string | number, d: string | number) => { if (String(v) !== String(d)) q.set(k, String(v)); };
  put('h', s.horizon, DEFAULT_STATE.horizon);
  put('p', s.principal, DEFAULT_STATE.principal);
  put('c', s.countries.join(','), DEFAULT_STATE.countries.join(','));
  put('a', s.asset, DEFAULT_STATE.asset);
  put('eg', s.eqGrowth, DEFAULT_STATE.eqGrowth);
  put('ey', s.eqYield, DEFAULT_STATE.eqYield);
  put('pg', s.prGrowth, DEFAULT_STATE.prGrowth);
  put('py', s.prYield, DEFAULT_STATE.prYield);
  put('pc', s.prCost, DEFAULT_STATE.prCost);
  put('lv', s.lvr, DEFAULT_STATE.lvr);
  put('al', s.alloc, DEFAULT_STATE.alloc);
  put('mr', s.rate, DEFAULT_STATE.rate);
  put('inc', s.income, DEFAULT_STATE.income);
  put('rt', s.real ? 1 : 0, 0);
  put('inf', s.infl, DEFAULT_STATE.infl);
  const str = q.toString();
  return str ? `?${str}` : '';
}
