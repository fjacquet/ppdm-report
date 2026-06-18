# ADR 0003 — "In Use" via the N/A-Placeholder Rule; Single Idle-Agents Panel

**Status:** Accepted

## Context

The Live Optics export always includes a sheet for every asset-type agent that PPDM supports, regardless of whether any assets of that type exist in the customer environment. Sheets for unused agents contain a single data row populated entirely with `N/A` placeholder values. Generating a dedicated slide per asset type would produce empty, misleading slides for a typical customer who uses only 5–8 of the ~18 available agents.

Requirement #6: do not create dedicated slides for asset types that are not in use.
Requirement #7: do include one slide listing agents that are present but not in use.

## Decision

An asset-type sheet is classified as **present but not in use** if and only if every cell in every data row is either empty, `null`, or the literal string `"N/A"` (case-insensitive). Otherwise it is **in use**.

This rule is implemented in `src/engines/parser/detectInUse.ts` as `sheetIsInUse()` and `classifyAgents()`. The result (`inUse[]` and `idleAgents[]`) is stored directly on `ParsedWorkbook` and is computed once at parse time inside the worker, not re-derived on every render.

The same classification drives both requirements with a single mechanism:

- `inUse[]` controls which per-type detail slides are generated (one per in-use type).
- `idleAgents[]` populates the single "Agents present, not in use" slide, which is emitted whenever the list is non-empty.

## Consequences

- Reports are lean by default; a customer with five in-use asset types gets exactly five per-type slides.
- The idle-agents slide provides full visibility without cluttering the deck with blank slides.
- The rule is deterministic and unit-testable directly against fixture workbooks, including an all-idle edge case.
- If Live Optics changes the placeholder value from `"N/A"`, the rule in `detectInUse.ts` must be updated accordingly.
