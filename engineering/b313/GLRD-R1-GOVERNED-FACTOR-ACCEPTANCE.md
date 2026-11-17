# GLRD R1 — Governed B31.3 factor-service acceptance

**Engineering status: HOLD (software candidate, not production approval).**

## Source recovery — PSI-02 (30 rows) versus historical BM2 (31 rows)

The selected `@GLRD-INPUTS` connected Drive folder is empty, but the owner's
earlier `GLRD-INPUTS-MANIFEST.md` and `glrd-input-links.md` identify public,
commit-pinned GLRD inputs in `reallakshman19/3D_Converters`.
The **30-row wall audit** corresponds to `GLRD-1000-PSI-02.xml`, not
`GLRD-1000-PI-01 - BM2.xml` (31 branches).
The latter has different names/nominal sizes for important branches and
cannot be silently substituted. See `glrd-pinned-source-manifest.json`.

The CI source-custody job pins and hashes **both** XML revisions, staged JSON,
Line List, Piping Class, valve-weight master and material map. It verifies
30 current audit branches, 1,224 PSI-02 nodes, 31 historical BM2 branches,
1,196 BM2 nodes, and 86 staged top-level records. The provided 30-row audit
classifications have a dedicated source-ordered register:
`glrd-psi02-factor-groups.json` (26 DSS/T1 120°C, two LTCS/T1 120°C,
two LTCS/T1 82°C), with *zero factor approvals* and *unverified routes*.

**Do not mistake pinned bytes and the branch census for a complete live Step 4 replay.**
The staged JSON's relationship to PSI-02 is unverified. The historically
supplied `bm2-workbench-config.json` was 8,433,327 bytes (SHA-256
`766da8fa5711c373e309e975f6c1bb8fedc7caf4b835d9dbc9909af3de876bd8`),
but is not accessible to the current CI runtime; the old config's Line List
source was the workbook's Coversheet rather than the authoritative Linelist.
It is *not* established as the effective configuration for PSI-02.

Exact authoritative replay therefore still requires the 30-row run's effective
config/source-selection evidence, actual P1/T1 units, code edition,
manufacturing routes, approved factor sources, and native CII output.
The current code path's synthetic browser Pull test is not a real-material
CII parity test.

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
