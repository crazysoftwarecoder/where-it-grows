<p align="center"><img src="public/logo.svg" width="96" alt="Where it Grows logo: a sprout growing from a gold coin"></p>

# Where it Grows

**Where does $100K grow best after tax?**

A static site that simulates investing USD 100,000 (adjustable) for 10–25 years in ten countries (Australia, United States — Texas and California separately, with state taxes —, United Kingdom, Canada, New Zealand, Singapore, UAE, Germany, Switzerland, India) and shows every tax that bites at **ingress** (buying in), **growth** (each year you hold) and **egress** (selling out), for an equities index portfolio and a residential investment property side by side. It also charts how GDP per capita is rising in each country and what a family of four spends there each year.

Every chart is clickable. A click opens a drill-down listing each tax with its amount, the rule in plain English, the primary source URL and the date it was last verified.

Live site: https://crazysoftwarecoder.github.io/where-it-grows/

## How it works

- All country knowledge is data: `data/tax/{cc}.json`, `data/gdp/{cc}.json`, `data/col/{cc}.json`, `data/countries.json` (FX), `data/assumptions.json`. Shapes are enforced by zod schemas in `schemas/`.
- The engine in `src/engine/` is a generic interpreter of tax rules (flat, marginal schedule, allowance, fixed; with modifiers for discounts, holding periods, imputation credits and income thresholds). It never hard-codes a country.
- The UI in `src/ui/` is vanilla TypeScript plus Apache ECharts. State lives in the URL, so any scenario is shareable.
- `npm run validate` is the gate: every file must parse, every number must carry a source and a verified date, and the simulation must run cleanly for every country, asset and income band.

## Keeping the data fresh without a terminal

Four Claude Code cloud routines (prompts in `.claude/routines/`) re-research the data on a schedule and open pull requests: tax rules monthly, GDP and cost of living quarterly, and a weekly freshness audit. CI validates, tests and builds every PR; merging to `main` deploys to GitHub Pages.

## Development

```bash
npm install
npm run dev        # http://localhost:5173/where-it-grows/
npm run validate   # data gate
npm test           # engine + UI state tests
npm run build      # dist/
```

Specialist agents for Claude Code live in `.claude/agents/` (tax-engineer, income-tracker, cost-of-living-tracker, ux-engineer, qa-engineer). Task tracking uses [beads](https://github.com/steveyegge/beads) (`bd ready`). See `AGENTS.md`.

## Disclaimer

Not tax advice. The model assumes a resident individual taxpayer in one representative state or canton per country, fixed exchange rates, identical nominal returns everywhere, no leverage, and a whole-position sale at the end. It compares tax drag, not markets. Rules change; check the source links and verified dates in the drill-down.
