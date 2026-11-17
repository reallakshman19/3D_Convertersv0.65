# Phase 4 Preview — B31.3 wall update

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

If strict active factors are incomplete at the exact Preview T1, the existing per-material/T1 manual basis may be used only when all of the following are explicit:

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

## Release boundary

An accepted Pull is recorded as user-accepted and **pending native output verification**. A successful UI calculation is not a verified design or proof of native CII parity. Strict factor master qualification and Owner-supplied actual input/output cases remain required for release.
