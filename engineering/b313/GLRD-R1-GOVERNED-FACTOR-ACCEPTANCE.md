# GLRD R1 — Governed B31.3 factor-service acceptance

**Engineering status: HOLD (software candidate, not production approval).**

## Selected input custody

The current user-selected GLRD-INPUTS Library folder was accessed through the exact
selected Google Drive account and folder locator. Direct connector listing,
folder fetch and the exact parent-filtered search all returned zero children.
No archive from another drive folder or earlier task was silently substituted.
**Actual-model 30-row replay is therefore NOT verified.** The 30-row diagnostics
pasted by the owner are evidence of the reported failure, not a substitute for
the original XML, staged JSON, masters and effective configuration.

## Root cause and architecture

The deployed resolver originally required four individual strict qualified
numeric factor records for each material/T1/route. Its active master contains
only screening and benchmark candidates for the GLRD cases. Repetition of
`B313_PREVIEW_FACTOR_BASIS_UNAVAILABLE` across 30 rows is an expected consequence;
changing HOLD text or automatically accepting screening values is not a fix.

This work establishes a **two-part governed factor service**:

1. **S** remains an exact-grade/product, edition-scoped, qualified
   allowable-stress lookup with accepted source-temperature interpolation.
2. **E/W/Y** can additionally be resolved from an independently verified,
   edition-specific *code rule pack*. This uses the relevant code table, exact
   material or explicitly qualified material-family scope, product form,
   physical manufacturing route, temperature domain and source/approval trail.

The active `docs/Masters/b313-code-factor-rules.json` is **EMPTY**. It has no
E=1, W=1, Y=0.4 defaults. A verified rule must be sourced and approved;
the runtime refuses caller-injected rule arrays. Rules and physical occurrence
approvals are separate namespaces. The factor/master/code-rule fingerprint is
part of Pull staleness checks.

## Governed publication of code-rule records

Edit `docs/Masters/b313-code-factor-rules.json` only in a reviewed PR, then
run:

```sh
node scripts/generate-b313-code-factor-rules.mjs --write
node scripts/generate-b313-code-factor-rules.mjs --check
node scripts/generate-b313-material-factors.mjs --check
node --test tests/xml-cii-b313-governed-factor-engine.test.mjs
```

Each E/W/Y record requires:

- governing code **edition**, **factor** and **code clause/table**;
- explicit **EXACT_MATERIAL** scope, or source-authorized
  **CODE_MATERIAL_FAMILY** scope;
- **product form** and **manufacturing route applicability**;
- exact T or explicit constant-temperature range (no blind extrapolation);
- a source authority, exact source reference, status VERIFIED or
  PROJECT_APPROVED, and an approval reference for project-approved records.

The generator rejects incomplete or contradictory metadata, but the named
source and approval must also be **independently reviewed against the actual
licensed standard**. A syntactically valid text reference is not proof of
engineering qualification.

## GLRD occurrence/factor-group reconciliation

On the original GLRD run, extract every physical pipe occurrence from
effective Step 4 (not class-wide guesses): branch/line, source-node identity,
DN and outside diameter, effective material and Piping Class/DN source row,
actual ASTM/UNS product form, manufacturing process/seam examination, P1
design pressure and *units*, T1 and source, corrosion allowance, and source
wall. Establish the actual project B31.3 governing edition.

Use shared code facts only for genuinely applicable material/product/route/
temperature scopes. An occurrence with ambiguous class/material, route,
P1 units or T1 must HOLD individually. Manual factors, guessed grade review
and Pull acceptance are occurrence-scoped; existing material+T1-wide approvals
are not silently inherited.

## Engineering verification and release gates

1. 100% input-file custody: original XML and source masters/hash/active config.
2. 30/30 source-fidelity mapping from physical Preview to source evidence.
3. Controlled 2024 (or project-governing) stress tables and code-rule sources;
   no screening/benchmark promotion or unidentified weld route.
4. Exact-head unit, browser, and negative controls for grade, route, edition,
   table note, interpolation, pressure units, mixed OD and stale source.
5. Independent manual B31.3 calculations for representative DSS and LTCS
   occurrences, including temperature factors and nominal schedule checks.
6. Explicit Calculate → proposal → Pull → rebuild → native CII wall parity
   verified for accepted rows (Fill Down remains separate).
7. Independent engineering acceptance and deliberate merge/deployment
   authorization.

Until these gates are satisfied: **no claim of all 30 rows updated**, no
release-ready factor qualification, no silent XML/material mutation.
