# Phase 4 Preview — B31.3 wall update

## 2026-11-18 — Owner correction: B31.3 reads 4 Preview only

**Calculation input contract:** the existing **XML→CII 2019 Standalone → 4 Preview** branch-row snapshot is the sole process-design input for this B31.3 calculation. Use the row's effective Material, T1, P1, P1 unit (or its explicit B31.3 basis), DN, corrosion allowance and Piping Class data. S is looked up/interpolated by Material + T1 in the coefficient master; the conditional manufacture display defaults to Seamless / E=1. The Preview node ledger or exact-DN dimensional master provides geometry according to documented provenance.

**Do not** read or infer design pressure, pressure units or T1 from source XML, parse XML during a wall calculation, substitute 0 or −100000 sentinel fields, or extrapolate from another branch. Explicitly changing XML metadata must have no effect on the calculation or audit. In particular the source document's `PressureUnits` is not authority for the Preview row's design P1.

The audit distinguishes complete and incomplete **4 Preview** rows. If a row has no effective P1/T1 or no resolved design-pressure unit, display the missing 4 Preview input and keep the qualified Pull on HOLD; do not fill a blank from any earlier source. The separate workbook Line List matching diagnostic explains where Preview values originated; it never replaces displayed Preview P1/T1 during calculation. The user can correct the current 4 Preview row/basis and rebuild.

**Acceptance witness:** `tests/xml-cii-b313-preview-screening-reference.test.mjs` passes two different contradictory `xmlText` values with identical effective 4 Preview rows; B31.3 screening thickness, coefficient lookup and HOLD status remain identical. `tests/xml-cii-b313-preview-pressure-unit.test.mjs` confirms XML pressure units cannot supply a missing 4 Preview unit. Neither test is proof of engineering-approved factors or native CII output.


## Action

Phase 4 Preview exposes the explicit action:

```text
Update wall thickness as per B31.3 Sec II
```

The action calculates proposals only. It does **not** modify Wall Thk. On a qualified result, use the new **⤓ Pull** icon beside the existing **↓ Fill Down** icon in the Step 4 Wall Thk cell to explicitly accept the validated same-OD wall for that Preview branch. Pull and Fill are independent operations.

## Runtime chain

```text
Phase 4 Preview Material column + T1
        ↓
B31.3 Material Factors material identity
        ↓
strict active S / E / W / Y at T1
(VERIFIED / PROJECT_APPROVED only)
        ↓
manual controlled S/E/W/Y fallback only if active factors are incomplete
        ↓
Preview P1 + corrosion + effective Step 4 source-bound node OD
        ↓
B31.3-2024 straight-pipe thickness API
        ↓
required nominal wall with configurable 12.5% default or absolute-mm negative mill tolerance
        ↓
Pipe Wall Master selector
        ↓
CALCULATED proposal + source-bound node evidence
        ↓
explicit ⤓ Pull confirmation (never Fill Down)
        ↓
accepted same-OD node group → Rebuild Preview → enriched XML parity verification
```

## 2026-11 B31.3 robustness correction

No new Step 4 columns: effective Preview remains the sole input and the
existing ⤳ Pull action remains distinct from Fill. Step 8 exact Piping
Class/material-code evidence is passed to the B31.3 resolver *only as
corroboration*, never as a silent Line List material overwrite. Generic
`DSS`, `LTCS` or `CS` may name a family candidate; the inferred grade
is not an engineering-qualified material specification without reviewed
evidence. Conflicting primary material and exact class grade HOLD.

For **LTCS at 82 °C**, strict S may be interpolated only between
qualified, same-source, same-edition material stress records enclosing 82 °C;
qualified E/W/Y must independently cover 82 °C and the manufacturing route.
Screening neighbors at 80/120 °C do not qualify. The info popup shows source
temperatures and qualification status.

For **unknown material with blank T1**, the CS fallback cannot create
design temperature. The existing T1 field in 4 Preview must be edited using
project design evidence, then Preview rebuilt. Blank, below absolute zero,
configuration-default-only, and unresolved T1 cause row-specific HOLD; a
default-only P1 also HOLDs. Valid unrelated rows can still calculate.

For **Pull**, a previous proposal is invalidated by material evidence,
Preview inputs, pipe node identity or a changed active S/E/W/Y master. No
Pull is allowed for unapproved inferred grade, unresolved route, or
incomplete factor qualification. User-entered manual S/E/W/Y remains an
explicit, non-master fallback with independent source/review requirements.

## Size-specific material authority

The existing Step 8 **Piping Class / Material Code** default is not an
exact pipe product specification across all DN sizes. For B31.3 factor
corroboration, the selected effective **Piping Class + DN** master row is
required. A matching row's exact grade is evidence; a class-wide material
fallback without a matching DN is **review required**. If the generic
Material Code designation disagrees with the exact-size Piping Class
material, the row is HOLD (`B313_MATERIAL_CODE_VS_CLASS_DN_CONFLICT`).

This is essential for class 11472 (A333 Grade 6 through DN600; A671
CC65 Class 22 at DN750–1200) and class 13831 (A790 S31803 through
DN200; composite A790/A928 at DN250–600). An `A790/A928` product must
not silently be treated as seamless A790. All factor qualification is
scoped to the physical pipe occurrence and confirmed route.

See `engineering/b313/material-factor-qualification-intake-v1.json`.
The intake is a review-only register, **not** an automatic factor
source and not an authorization for Pull.

## Material-column custody

The effective Phase 4 `Material` cell is the primary material identity input. That cell already follows the Preview material-authority order: process/line-list material evidence first, then governed piping-class/material-code fallback when process material is absent.

The Preview adapter resolves the displayed material into the merged B31.3 material catalog from PR #423.

Examples:

```text
ASTM A106-B     -> CS-A106-B
CS              -> CS-A106-B only when the project-family default is unique
ASTM A333-6     -> LTCS-A333-6
A312-TP304      -> SS-A312-TP304
A312-TP316      -> SS-A312-TP316
DSS             -> DSS-A790-S31803 only when the project-family default is unique
SDSS            -> SDSS-A790-S32760 only when the project-family default is unique
```

Project material-map spelling variants such as `A312-TP316` are normalized only for identity lookup; the Preview Material text and its provenance are not rewritten.

Reviewed `materialCodeMatchedMaterial` evidence may corroborate or disambiguate the Preview material. It never silently overrides a conflicting material identity.

Important negative controls:

- generic `SS` remains ambiguous unless reviewed material-code evidence identifies TP304 or TP316;
- a Preview material / reviewed material-code identity conflict blocks the row;
- reviewed material-code evidence that is not represented in the active B31.3 material catalog blocks the row instead of falling back to a different family default.

## B31.3 Material Factors linkage

For each unique resolved material + T1 group, the Preview panel shows:

- Preview Material and source;
- resolved B31.3 `materialId`;
- active factor status;
- an **Open B31.3 Material Factors** button.

That button deep-links to the Engineering `B31.3 Material Factors` tab with the resolved `materialId` and T1 context.

The Engineering tab edits a candidate working copy only. Preview reads the published active B31.3 factor master, not local candidate drafts.

## Factor authority

Preview always calls the material-factor resolver in:

```text
qualificationMode = strict
```

Therefore only `VERIFIED` / `PROJECT_APPROVED` active factor rows can become the automatic factor basis. `BENCHMARK_ONLY` data is never enabled by this adapter.

If strict active factors cannot be resolved at Preview T1 using qualified exact records, qualified S interpolation or explicit factor-specific temperature applicability, the existing per-material/T1 manual basis may be used only when all of the following are explicit:

- allowable stress `S` and unit;
- `E`;
- `W`;
- `Y`;
- controlled source/reference.

Manual fallback is recorded as `MANUAL_EXPLICIT_FALLBACK`; it is not promoted into the active factor master and is not labelled design-authority data.

When controlled factors later become available in the active master, `ACTIVE_MASTER_STRICT` takes precedence over a retained manual fallback record. The current automatic-basis panel allows manual S/E/W/Y and explicit source reference even when no fallback seed exists. A user-entered source reference alone is not independent design qualification; Pull requires explicit review of a manual basis.

## Basis key

New basis records are keyed by resolved material identity and T1:

```text
MATID:<materialId>|T1=<temperature>
```

Legacy raw material-text keys remain readable so existing #424 draft basis entries are not lost during integration.

## Pressure custody

Pressure-unit resolution happens **when Build/Rebuild Preview constructs the effective P1 row**, including its matching Line List column and unit provenance. B31.3 calculation accepts either that Preview-resolved unit or a non-conflicting explicit basis unit; contradictory units HOLD. The B31.3 action does not independently read XML or re-match the Line List.

## Dimension-standard custody

An explicit basis selection wins. Otherwise the resolved B31.3 material family supplies the Preview project inference:

- CS / LTCS -> ASME B36.10M;
- SS / DSS / SDSS -> ASME B36.19M.

The B31.3 material core itself still does not silently choose a pipe-dimension standard; this inference belongs only to the Phase 4 Preview adapter and is recorded in evidence.

## OD custody

The pressure calculation uses the effective Step 4 source-bound node OD ledger exposed by the Preview worker. AVEVA may encode pipe-run nodes as ELBO, TEE, RIGID, etc., without a literal PIPE node type. A single, positive OD group may be accepted for that branch; zero-OD nodes retain their existing walls. Distinct positive ODs in the branch produce HOLD rather than arbitrary selection. The Pipe Wall Master DN OD is a parity/reference value only.

For the retained DN50 source-data warning:

```text
master reference OD = 60.0 mm
source candidates    = 60.3 mm, 26.7 mm
status               = HOLD (mixed positive ODs)
```

The 26.7 mm fitting/flange endpoint is not silently ignored in favor of 60.3 mm. Resolve the physical occurrence/scope upstream in Preview; the project master inconsistency is not silently corrected.

## Wall selection

The Step 4 default is:

```js
negativeMillTolerance: { basis: 'percent', value: 12.5 }
```

The existing B31.3 basis panel also permits an alternative absolute deduction, e.g.:

```js
negativeMillTolerance: { basis: 'absolute', value: 1.5, unit: 'mm' }
```

These alternatives are **not additive**. Changing tolerance invalidates prior proposals and acceptances.

The B31.3 API computes the required nominal wall; the merged Pipe Wall Master API selects the next adequate commercial wall/schedule. The Preview UI contains no duplicated pressure-thickness equation and no duplicated schedule-selection formula.

## Evidence

Successful calculation rows write a **proposal only**:

```text
config.b313WallUpdate.proposalsByBranch[branchOccurrenceIndex]
```

Explicit Pull writes a separate accepted record:

```text
config.b313WallUpdate.acceptedWallByBranch[branchOccurrenceIndex]
```

The accepted wall is applied to the validated positive-OD node group on full Preview rebuild, after material/rating resolution. Zero-OD nodes are preserved, and mixed-OD branches remain held. It is not a shared Piping-Class/DN override.

The proposal and acceptance evidence includes:

- Preview material, material source and material-code evidence;
- resolved B31.3 material identity and resolution source;
- T1;
- factor-basis mode and factor sources;
- strict factor resolver result;
- manual fallback source when used;
- P1 provenance and pressure-unit provenance;
- source OD, master reference OD and parity delta;
- corrosion allowance;
- chosen percent or absolute-mm negative mill tolerance;
- B31.3 calculation result;
- selected wall, schedule/equivalents and margin.

The Preview Material cell receives a non-authoritative linkage badge (`B31.3 ID ✓` or `B31.3 MASTER ✓`) without changing the displayed material value. The wall cell must not receive `✓ B31.3` from calculation alone; its accepted authority is shown only after explicit Pull and successful Preview rebuild.

## Engineering qualification boundary

Merging this Preview adoption does not complete B31.3 design-authority qualification. Controlled B31.3-2024 `S/E/W/Y` population/review and the licensed-code-text engineering review of the production thickness implementation remain separate release/governance requirements.

## CS fallback policy

When the effective Preview material is blank or genuinely unmapped, the B31.3 basis panel may offer the configured **CS** family fallback. It does not rewrite the Preview Material cell, does not override known non-CS identities (for example stainless), and requires explicit user confirmation before Pull. The CS family is not itself an allowable-stress record: a controlled exact material identity and qualified S/E/W/Y or independently reviewed manual basis are required for engineering acceptance. The default may be disabled in project settings.

## 2026-11-18 — Source-to-wall receipt / Line List recovery (PR #12)

The existing **4 Preview → Calculate B31.3 pressure-design wall** now
records the selected Line List matching result for *each physical branch
occurrence*, using the exact source matcher already used for Preview
population. Every row is independently classified as:

- `MATCHED_PROCESS_INPUTS_PRESENT`: one unique exact or P-only numeric
  alias match, with source P1/T1 and unit provenance visible;
- `P1_UNIT_SOURCE_UNRESOLVED`: P1 and T1 exist, but the selected
  same-line source has no verifiable unit-bearing design-pressure header;
- `NO_SELECTED_MASTER_LINE`: no matching row in the actually loaded master;
- `AMBIGUOUS_SELECTED_MASTER`: multiple exact or alias source candidates;
- `PREVIEW_MASTER_OUT_OF_SYNC` or `PREVIEW_REBUILD_REQUIRED`: the
  current Preview and selected master no longer describe the same source;
- `PREVIEW_SOURCE_P1_CONFLICT` or `PREVIEW_SOURCE_T1_CONFLICT`:
  a unique source row exists but its source-design value no longer agrees
  with the Preview field;
- `EXPLICIT_OVERRIDE_NO_LINE_LIST_MATCH`: independently entered P1/T1
  require engineering review; not a source Line List match.

The bare numeric workbook sequence `4110001` may match a unique
**P4110001** pipe line, but must never match **B4110001** or another
unrelated service-family line. Both the Preview resolver and the Pull-time
source-pressure receipt now use this same P-only alias rule.

The audit now has **Download source → wall CSV** and **Download JSON
evidence**. These contain one row per physical Preview occurrence, with
branch/line identity, selected source row/status, matched P1/T1 and source
units, S lookup method and interpolation brackets, conditional E/W/Y,
OD/provenance, CA, screening pressure wall, required nominal/class wall,
actual strict/qualified status, Pull eligibility, and explicit HOLD reasons.
CSV labels are formula-injection-safe. It changes no source values,
approved factors, physical walls, or config.

**Source availability boundary:** the owner-saved PSI-02 Preview had
16 loaded master rows, 7 populated physical rows and 23 missing P1/T1,
on 18 distinct keys. The historically pinned BM2 `LL_BM2.xlsx`
`Linelist` sheet contained only two unscoped numeric sequence matches
against the target PSI-02 branch keys (not two verified design matches).
The separately accessible `ImportedRawLineListLL.xlsx` does not contain
the 18 missing PSI-02 line keys either. It would be incorrect to choose
either as a complete PSI-02 master on the user's behalf. Re-import the
actual governed PSI-02 master and worksheet if available, verify its
source mapping, then **Rebuild Preview**. If no authoritative source row
exists, record that line-specific engineering input or reviewed override;
never extrapolate another line's 120°C or 13001 pressure.

The existing master P unit control can be set to the documented unit.
A pressure unit is automatically accepted only from the same selected
source Line List row with a unit-bearing design P1 header and equal
numeric cell. Neither the 13001 magnitude nor a hydro/test pressure
header identifies that unit.

Reproduction:
```sh
node --test tests/xml-cii-b313-glrd-16-row-linelist-coverage.test.mjs
node --test tests/xml-cii-b313-preview-screening-reference.test.mjs
node scripts/run-xml-cii-b313-live-preview-e2e.mjs
```

The browser test verifies real downloadable CSV/JSON data from the
current Preview row population; it is *software proof*, not a signed
30/30 PSI-02 engineering input receipt or native emitted CII acceptance.

## 2026-11-18 screenshot RCA: screening dimensional OD and missing design-unit evidence

Owner's deployed **4 Preview** screenshot after R3 merge: 30 GLRD physical
rows, only 16 loaded Line List master records and 7/30 physically matched,
23 lacking effective P1/T1 input evidence. A matched DSS row shows source
P1=13001, T1=120°C, screening S=29.5 ksi and conditional Seamless E=1,
but no pressure wall because P1 **unit is unresolved** and the source-node
OD is not present in the report's node ledger.

A read-only screening calculation may now use the **exact-DN dimensional
master outside diameter** when the source node ledger has no OD and the
effective Preview row has an exact matching Piping Class DN, positive
nominal wall, a pipe material, schedule and source-row identity. This
screening-only dimensional OD is labelled
`pipe-wall-master-exact-DN-SCREENING-ONLY`; it has
`outsideDiameterReferenceOnly=true` and **does not certify the physical
XML OD, alter strict factor eligibility, create an accepted wall, or
authorize Pull**. Conflicting/mixed positive node ODs continue to HOLD;
the master cannot override a known physical mismatch.

Source precision note: the project's pinned
`docs/Masters/NPS_OD_BORE_SCHEDULE_MASTER.tsv` lists **DN150 OD(mm)=168**
and **OD(in)=6.625**, equivalent to 168.275 mm. The screening-only
fallback consumes the master **as published** (168 mm), rather than
silently rewriting it to an external dimensional value or the source-node
fixture's 168.3 mm. A real positive physical-node OD remains preferred.
With the conditional synthetic P1=13001 kPa, DSS S=29.5 ksi at 120°C,
Seamless E=1, CA=0, the master-only fallback calculates
**t=5.235409 mm** and required nominal wall **5.983324 mm** (12.5%
negative tolerance). This numerical difference from the physical-source
168.3-mm witness is kept visible; the master itself is not changed.

The code **does not assume pressure units** from P1 magnitude or simply
infer that `13001` means kPa. Source-verified same-line P1 units may
resolve automatically from unit-bearing Line List columns; otherwise the
user must select the actual documented P unit in the existing B31.3
basis. Missing P1/T1 for 23 unmatched rows cannot be fixed by master-OD
logic and must be sourced from the correct project Line List and matched
to the physical branch. Unresolved restraints and native CII engineering
HOLD are independent and not modified by this change.

Proof:
```
node --test tests/xml-cii-b313-preview-screening-reference.test.mjs
node scripts/run-xml-cii-b313-live-preview-e2e.mjs
```
New tests assert master-OD provenance, numerical wall parity for an
explicit-kPa **synthetic** scenario, absence of any Pull mutation, missing
unit HOLD, mismatched class DN HOLD, and actual rendered browser text.

## Read-only screening reference from the existing material master

The same **4 Preview → Calculate B31.3 pressure-design wall (review only)**
action now shows two separate results for each physical row:

- **Qualified calculation:** existing strict S/E/W/Y, controlled manual
  fallback and explicit Pull. There is no change to acceptance authority.
- **SCREENING MASTER LOOKUP — NOT PULL ELIGIBLE:** reads the existing
  `docs/Masters/b313-material-factor-master.json → screeningBases`,
  resolves the actual 4 Preview material + T1 and reports S, E, W, Y with
  exact/interpolated source temperatures. If source-bound P1 unit, corrosion,
  OD and dimensional evidence are present, it displays conditional route-
  specific pressure wall and required nominal thickness scenarios.

For example, source screening basis `OWNER-B313-SEWY-2026-08-11`
contains `DSS-A790-S31803` at 120°C with S=29.5 ksi,
W=1, Y=0.4, and route-dependent E. `LTCS-A333-6` at 82°C
interpolates S=20 ksi between the 80°C and 120°C master records.
The displayed provenance and interpolation bracket allow direct review.

For the **conditional screening calculation**, when a physical manufacturing route
has not been evidenced in 4 Preview the *display default* is now
**Conditional manufacturing = Seamless; E = 1.0**, read directly from that
material's existing screening EByRoute entry. This is an explicitly labeled
assumption, **not** a claim about the physical pipe. A route selector in the
existing B31.3 audit switches between the other master-supplied E scenarios,
without changing any source data or approval.

The actual physical route remains unknown until reviewed pipe-product
evidence establishes it. The screening-default route never sets the strict
factor basis or a Pull approval. The reference also preserves
`conditionalRouteSource: 'DEFAULT_SEAMLESS_SCREENING_ONLY'` and
`conditionalRouteAssumed: true` in its evidence.

 If the P1 pressure unit is unresolved, S/E/W/Y
can still be displayed but **no numerical pressure wall** is calculated.
Missing source OD, unsupported temperature, material conflicts and missing
corrosion likewise remain visible HOLDs.

The reference does not create `proposalsByBranch`, write
`acceptedWallByBranch`, set `overrides.wallThickness`, or affect
`summary.calculatedRows`. It is ineligible for Pull by construction;
the actual strict code/master governance is unchanged. This is deliberately
not an engineering endorsement of the owner's screening coefficients.

Reproduction:
```sh
node --test tests/xml-cii-b313-preview-screening-reference.test.mjs
```

## Release boundary

An accepted Pull is recorded as user-accepted and **pending native output verification**. A successful UI calculation is not a verified design or proof of native CII parity. Strict factor master qualification and Owner-supplied actual input/output cases remain required for release.
