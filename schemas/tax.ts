import { z } from 'zod';
import { MetaSchema } from './meta';

export const CountryCodeSchema = z.enum(['au', 'us-tx', 'us-ca', 'uk', 'ca', 'nz', 'sg', 'ae', 'de', 'ch', 'in', 'no']);
export type CountryCode = z.infer<typeof CountryCodeSchema>;

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD');

export const StageSchema = z.enum(['ingress', 'growth', 'egress']);
export type Stage = z.infer<typeof StageSchema>;

export const AssetSchema = z.enum(['equities', 'property']);
export type Asset = z.infer<typeof AssetSchema>;

/** Marginal brackets. `to: null` means open-ended. Amounts in local currency. */
export const BracketSchema = z.object({
  from: z.number().min(0),
  to: z.number().positive().nullable(),
  rate: z.number().min(0).max(1),
});
export const ScheduleSchema = z.object({
  brackets: z.array(BracketSchema).min(1),
  meta: MetaSchema,
});
export type Schedule = z.infer<typeof ScheduleSchema>;

/** A rule may reference the file-level income_tax schedule instead of repeating it. */
export const ScheduleRefSchema = z.union([ScheduleSchema, z.object({ $ref: z.literal('income_tax') })]);

/**
 * What the rule is computed on:
 * - principal: the initial outlay (ingress)
 * - value: current market value (wealth tax, exit agent fee)
 * - land_value: value × assumptions.property.land_fraction (land tax)
 * - income: the year's taxable investment income (dividends / net rent)
 * - gain: value − cost base at exit
 * - net_value: value − loan (wealth taxes that allow debt deduction)
 * - loan: outstanding loan principal
 */
export const BaseSchema = z.enum(['principal', 'value', 'net_value', 'land_value', 'income', 'gain', 'loan']);
export type Base = z.infer<typeof BaseSchema>;

export const RuleKindSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('flat'), rate: z.number().min(0).max(1) }),
  z.object({
    type: z.literal('schedule'),
    schedule: ScheduleRefSchema,
    /** true: the base is stacked on top of the taxpayer's other income before brackets apply. */
    stack_on_other_income: z.boolean(),
    /**
     * Which tax system this schedule belongs to (e.g. 'federal', 'state'). Income stacks only on earlier income
     * of the same group, so a state tax on the same dividend does not see it twice. Default 'income'.
     */
    stack_group: z.string().regex(/^[a-z_]+$/).optional(),
  }),
  z.object({
    type: z.literal('flat_above_allowance'),
    rate: z.number().min(0).max(1),
    allowance: z.number().min(0),
  }),
  z.object({ type: z.literal('fixed'), amount: z.number().min(0) }),
]);
export type RuleKind = z.infer<typeof RuleKindSchema>;

export const ModifiersSchema = z.object({
  /** Fraction of the base that is taxable (AU 50% discount → 0.5; CA inclusion → 0.5). */
  inclusion: z.number().min(0).max(1).optional(),
  /** `inclusion` only applies when the holding period is at least this many years; otherwise inclusion = 1. */
  min_holding_years: z.number().min(0).optional(),
  /** The rule does not apply at all once the holding period is at least this many years. */
  exempt_after_years: z.number().min(0).optional(),
  /** The rule applies only while the holding period is below this many years (e.g. short-term rate). */
  applies_until_years: z.number().min(0).optional(),
  /** Imputation (franking) credit rate: gross up franked income, tax it, then credit the gross-up. */
  imputation_credit_rate: z.number().min(0).max(1).optional(),
  /** Share of dividends carrying imputation credits. Defaults to assumptions.equities.franked_fraction. */
  franked_fraction: z.number().min(0).max(1).optional(),
  /** The rule applies only when the taxpayer's other income is above this threshold (US NIIT). */
  applies_if_other_income_above: z.number().min(0).optional(),
  /** Fraction of the base that is taxable after an allowance of this fraction (e.g. partial exemptions). */
  taxable_fraction: z.number().min(0).max(1).optional(),
  /** The rule only applies to events dated on/after this date (YYYY-MM-DD). */
  effective_from: IsoDate.optional(),
  /** The rule only applies to events dated before this date (YYYY-MM-DD). */
  effective_until: IsoDate.optional(),
  /** base 'gain' only: tax only the part of the gain that accrued on/after this date (value at that date becomes the cost base). */
  accrual_from: IsoDate.optional(),
  /** base 'gain' only: tax only the part of the gain that accrued before this date. */
  accrual_until: IsoDate.optional(),
  /** base 'gain' only: index the cost base by CPI (SimInputs.inflation) before computing the taxable gain. Requires min_holding_years to be met if set. */
  cost_base_indexation: z.boolean().optional(),
  /**
   * Assessed value grows from the purchase price by at most this rate per year, never above market value
   * (California Proposition 13). Applies to base 'principal' or 'value'.
   */
  assessed_growth_cap: z.number().min(0).max(1).optional(),
  /** Floor on the tax as a share of the taxable amount (e.g. AU 30% minimum tax on capital gains). */
  minimum_rate: z.number().min(0).max(1).optional(),
});
export type Modifiers = z.infer<typeof ModifiersSchema>;

export const RuleSchema = z.object({
  id: z.string().regex(/^[a-z0-9_]+$/),
  label: z.string().min(1),
  stage: StageSchema,
  /** tax = goes to the state; cost = fees that apply even in a zero-tax country. */
  category: z.enum(['tax', 'cost']),
  base: BaseSchema,
  kind: RuleKindSchema,
  modifiers: ModifiersSchema.optional(),
  /** Shown verbatim in the drill-down. 2–3 sentences a non-expert understands. */
  plain_english: z.string().min(20),
  meta: MetaSchema,
});
export type Rule = z.infer<typeof RuleSchema>;

export const AssetRulesSchema = z.object({
  ingress: z.array(RuleSchema),
  growth: z.array(RuleSchema),
  egress: z.array(RuleSchema),
});
export type AssetRules = z.infer<typeof AssetRulesSchema>;

/** How a leveraged rental property is treated: interest deductibility and what happens to rental losses. */
export const RentalLossTreatmentSchema = z.enum([
  'offset_other_income',      // loss reduces tax on salary (negative gearing)
  'carry_forward',            // quarantined; offsets future rental profits only
  'carry_forward_incl_gains', // quarantined; offsets future rental profits and the capital gain on sale
  'lapse',                    // loss cannot be used
]);
export const PropertyLeverageSchema = z.object({
  interest_deductible: z.boolean(),
  /** UK-style relief: a tax credit at this rate on finance costs instead of a deduction (unused costs carry forward). */
  finance_cost_credit_rate: z.number().min(0).max(1).optional(),
  /** Loss treatment by date; the latest entry whose effective_from is on/before the event date applies. */
  rental_loss: z.array(z.object({ effective_from: IsoDate.optional(), treatment: RentalLossTreatmentSchema })).min(1),
  plain_english: z.string().min(20),
  meta: MetaSchema,
});
export type PropertyLeverage = z.infer<typeof PropertyLeverageSchema>;

export const TaxFileSchema = z.object({
  country: CountryCodeSchema,
  currency: z.string().length(3),
  tax_year: z.string().min(4),
  jurisdiction_note: z.string().min(1),
  meta: MetaSchema,
  resident_profile: z.object({
    /** Other (salary) income in local currency for the low / mid / high bands. */
    other_income_options: z.tuple([z.number().min(0), z.number().min(0), z.number().min(0)]),
    meta: MetaSchema,
  }),
  income_tax: ScheduleSchema,
  /** Legislated future bracket changes; the latest entry whose effective_from is on/before an event's date replaces income_tax. */
  income_tax_changes: z.array(z.object({ effective_from: IsoDate, schedule: ScheduleSchema })).optional(),
  /** Rules that apply to both assets at the stage they declare (Medicare levy, NIIT, surcharge/cess). */
  levies: z.array(RuleSchema),
  assets: z.object({ equities: AssetRulesSchema, property: AssetRulesSchema }),
  property_leverage: PropertyLeverageSchema,
});
export type TaxFile = z.infer<typeof TaxFileSchema>;
