# Where it Grows

Static site that simulates investing USD 100,000 (adjustable) for 10–25 years in 10 countries (AU, US-Texas, US-California, UK, CA, NZ, SG, UAE, DE, CH, IN) and shows every tax that bites at **ingress**, **growth** (each year) and **egress**, for equities and residential property side by side. Also shows GDP-per-capita growth and median family-of-4 expenses per country. Charts are clickable: a click opens a drill-down listing each tax with amount, plain-English rule, source URL and last-verified date.

## Task Management

This project uses **bd** (beads) for all task tracking. See `AGENTS.md` for full details.

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work atomically
bd create "Title" --description="Details" -t task -p 2  # Create issue
bd close <id> --reason "Done"  # Complete work
```

- Use `bd` for ALL task tracking — no markdown TODOs or task lists
- Run `bd ready` before starting work to check for unblocked issues
- Link discovered work: `bd create "Title" --deps discovered-from:<parent-id>`
- Use `--json` flag when parsing output programmatically

## Tech Stack

- Vite + TypeScript (vanilla, no framework), Apache ECharts (tree-shaken from `echarts/core`)
- zod schemas in `schemas/` are the single source of truth for all data shapes
- vitest for the engine; `scripts/validate.ts` is the data gate
- GitHub Pages via GitHub Actions (`.github/workflows/deploy.yml`)
- Cloud refresh loops: Claude Code scheduled routines; prompts live in `.claude/routines/`

## Commands

```bash
npm run dev        # local dev server
npm run validate   # zod-parse every data/** file + cross-file checks + dry-run simulate
npm test           # vitest
npm run build      # tsc --noEmit && vite build → dist/
```

## Core rule

**All country knowledge lives in `data/**` JSON. Code never hard-codes a country value.** The engine (`src/engine/`) is a generic interpreter of `Rule` objects defined in `schemas/tax.ts`. Every researched number carries `meta.source` (https URL) and `meta.last_verified` (ISO date). Every tax rule carries `plain_english`, shown verbatim in the UI.

## Project Structure

```
data/            countries.json, assumptions.json, tax/{cc}.json, gdp/{cc}.json, col/{cc}.json
schemas/         zod schemas (meta, tax, gdp, col, countries, assumptions)
scripts/         validate.ts
src/engine/      types, rules (applyRule), simulate, compare, projections, __tests__
src/data/        loader.ts (import.meta.glob of data/**, parsed with zod)
src/ui/          app, state (URL codec), dom helpers, components/, charts/
src/styles/      CSS
.claude/agents/  specialist agents (see AGENTS.md)
.claude/routines/ prompts for the scheduled cloud refresh routines
```

## Specialist Agents

Defined in `.claude/agents/`. Delegate work to the right specialist:

| Agent | Scope |
|-------|-------|
| `tax-engineer` | tax rules per country, `schemas/tax.ts`, `src/engine/**` |
| `income-tracker` | GDP per capita / income series and projections (`data/gdp/**`) |
| `cost-of-living-tracker` | family-of-4 expense baskets, CPI (`data/col/**`) |
| `ux-engineer` | `src/ui/**`, charts, drill-down, responsive layout |
| `qa-engineer` | validate script, tests, CI/CD, routine prompts |

## Disclaimer

Not tax advice. Models a resident individual taxpayer in one representative sub-national jurisdiction per country, with fixed FX and nominal returns.
