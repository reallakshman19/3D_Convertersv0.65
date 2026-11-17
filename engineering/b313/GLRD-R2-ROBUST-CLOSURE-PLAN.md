# GLRD PSI-02 B31.3 — R2 robust closure workpack (17 Nov 2026)

**Disposition:** EXECUTABLE PLAN / ENGINEERING HOLD. Do not merge PR #5 or deploy based on software-only PASS. Do not promote SCREENING, BENCHMARK_ONLY, or invented source approval. This plan is not an engineering sign-off.

## Baseline and scope

- Repository: `reallakshman19/3D_Convertersv0.65`; PR #5 current reviewed head before this plan: `33a810f6f5aa173291ac8c201bf2db9b0519f08f`; main: `91c1a28d248d0053dfdb38d4cc05402a4fb12013`.
- Authentic target is **GLRD-1000-PSI-02.xml**: 30 Branch, 1,224 Node, SHA-256 `164163380dccffb8f9d6bd7853eabd36eea89e508da2215443e81969144d4a45`. The 31-Branch/1,196-Node BM2 XML is a **different historical model**, never substitute.
- Seven source-file hashes are pinned in `glrd-pinned-source-manifest.json`; all seven passed in CI (source-custody run 44025609526 / 44025855008). The 86-root-entry staged JSON is **BM2-named**; its applicability to PSI-02 remains unverified.
- Owner-provided 30-row factor audit was mapped to the exact PSI-02 branch order: 26 DSS S31803/T1 120°C; 2 LTCS A333 Gr 6/T1 120°C; 2 LTCS A333 Gr 6/T1 82°C. These are **audit labels**, NOT independently certified pipe grades/routes or approved factor sets. Source: `glrd-psi02-factor-groups.json`.
- The prior `bm2-workbench-config.json` was 8,433,327 bytes, SHA-256 `766da8fa5711c373e309e975f6c1bb8fedc7caf4b835d9dbc9909af3de876bd8`, and its saved Line List rows corresponded to `Coversheet` rather than the required `Linelist`. It is not proved effective for PSI-02.
- PR-head workflow inventory: **54 total: 23 success, 31 failure**. Dedicated B31.3/Preview + Chromium, P0, and GLRD pinned source/native-writer synthetic tests passed. Do NOT represent the whole PR as CI green. P1 `branch-format-extraction.js` runtime/docs drift was observed on `main`; all other failures require independent classification.
- Actual strict E/W/Y rule pack has **zero published records**. Actual strict S material-factor source has no project-qualified DSS/LTCS stress rows. Code cannot supply licensed/approved engineering values by itself.

## Acceptance outcome, not a blanket target of "30 updated"

Produce a reproducible run of the **real effective 30-row Step 4 Preview** with each occurrence in one of:
- `CALCULATED_PULL_READY` (fully qualified and correctly selected nominal wall);
- `CALCULATED_REVIEW_REQUIRED` (valid numeric result but protected physical/source authority or schedule condition requires acceptance);
- `HOLD_<SPECIFIC_CAUSE>` (missing/ambiguous source, factors, route, pressure units, code clause, applicability or output).
Only explicit accepted physical rows may become `PULLED`; after Final Run, each accepted row must be independently checked against emitted CII fields. The total may be less than 30 if genuine engineering gaps remain. Never equate calculation with Pull.

## Ordered workpacks and exact acceptance gates

### R2-A — Recover *effective* PSI-02 Preview authority (source engineer + developer)

**Inputs:** pinned PSI-02 XML, Line List workbook, piping-class master, material map, weights, relevant stage; actual saved PSI-02 session configuration or a precisely defined/reviewed replacement.

1. Recover previously provided configuration by exact SHA when possible. Do **not** silently repurpose historical BM2 settings. If source configuration is incomplete, create `psi02-effective-config-r1.json` under controlled custody with explicit deviations, preserved prior settings, source workbook+sheet names and newly computed SHA.
2. Verify `LL_BM2.xlsx` `Linelist` sheet rather than `Coversheet`; reconcile headers/merged cells and each actual line key. Check source precedence and record conflicts instead of guessing.
3. Prove the BM2-named staged JSON belongs to PSI-02 using branch/node/geometry identity mapping; otherwise mark it `STAGE_NOT_APPLICABLE` and replay without invented staged facts.
4. Extract 30 physical Preview rows to `glrd-psi02-effective-preview.json`, each with source branch ordinal/name, line key, XML node IDs, DN/actual OD, Piping Class+exact DN row, source material, actual product form, manufacturing route evidence, P1/value/unit/source, hydro/test pressure separately, T1/value/unit/source, corrosion/erosion allowance, tolerance mode, original wall, pipe schedule options.
5. Record every unresolved conflict (e.g. LTCS line under class 93833, unverified material code, ambiguous route, no pressure unit); no placeholder approvals.

**PASS:** 30/30 exact branch identity/order; complete source-lineage columns or explicit HOLD; independently confirmed P1 vs hydro/test value and applicable design temperature; effective config hash captured. **FAIL:** Coversheet used as Linelist, BM2 substituted for PSI-02, ambiguous stage accepted.

### R2-B — Establish code edition and governed material/product basis (project piping engineer)

1. Resolve actual governing ASME B31.3 edition from the **PSI-02 project's** engineering design basis. Current app pack declares 2024; an unrelated document mentioning 2020 is NOT authority to switch.
2. For each physical DN, resolve actual ASTM specification + grade/UNS + product form and manufacturing/seam/examination route. Piping Class alone is insufficient if materials change with DN. A790, A928, A333 or A671 designations are distinct product/manufacturing contexts.
3. Require MTR/PO/piping specification or other controlled evidence for route. For unknown route, E remains HOLD. No "all DSS seamless" assumption.
4. Create a small approved `product_identity` register keyed by physical occurrence and reusable qualified product scope; retain evidence hashes, approver and source date.

**PASS:** every eligible occurrence has code edition, exact product and applicable route/quality evidence; conflicts remain named HOLDS. **FAIL:** matching project material-family label used as grade/route approval.

### R2-C — Publish qualified S and E/W/Y (code authority + independent reviewer)

- **S:** exact material/spec, grade, product form and edition; applicable B31.3 Appendix A stress-table row and notes; original temperature records and units; controlled source/table/row reference; allowed temperature interpolation *only under approved code rule and both bracket records*. No default screening S or extrapolation.
- **E:** table/rule selected from actual manufacturing/seam/examination route and code edition (e.g. B31.3 Tables A-2/A-3 as applicable); no route guess and no unrelated material cross-approval.
- **W:** weld-strength-reduction code table/rule with material group and metal temperature applicability (B31.3 Table 302.3.5-1 or applicable provisions); explicit source notes, scope and validity.
- **Y:** coefficient from appropriate code material/temperature/geometry rule, including eq. (3a) applicability (B31.3 Table 304.1.1-1). Do not automatically apply a carbon-steel Y to all DSS.
- Source authority schema for every approved rule/row: `{edition, spec, grade, productForm, manufacturingRouteScope, factor, temperatureScope, value, units, codeTable, codeRow, codeNotes, sourceDocumentDigest, sourceReviewer, approvalReference, approvalDate, revision}`.
- Only controlled reviewed values enter `docs/Masters/b313-material-factor-master.json` and `docs/Masters/b313-code-factor-rules.json`. Preserve current benchmark/screening records as nonproduction diagnostics; do not overwrite their statuses.
- S/E/W/Y can be reused for legitimately identical qualified product+route+edition+temperature scopes. **Individual Pull decisions remain physical-occurrence scoped.**
- Verify generator, runtime/docs parity, published pack revision fingerprint, ambiguity/duplicate conflict, source supersession/stale Pull, and negative controls. A syntactically well-formed source name is *not* verification of its content.

**PASS:** every eligible factor resolves with a compatible authoritative source and provenance; independently checked values for DSS/120, LTCS/120, LTCS/82, splitting groups by route or product as needed. **FAIL:** manually re-label SCREENING as VERIFIED without external proof or use fake code-table values.

### R2-D — Pressure-design calculation, nominal wall and existing Step 4 UX (developer + engineer)

1. Use only actual **P1 design pressure** with documented units and coincident design **T1**. Never substitute hydro/test pressure or a default T1. Convert units once with trace.
2. Apply applicable B31.3 straight-pipe pressure-design equation (e.g. §304.1.2 Eq. 3a) **only when its validity conditions are met**; route thick-wall/special conditions to explicit engineering review, not silent Eq.3a acceptance.
3. Calculate pressure wall, add corrosion/erosion and applicable mechanical allowances, apply negative mill tolerance (12.5% default or explicit mm input), then choose an available project-authorized *nominal* OD/DN/schedule with thickness >= required. Respect source wall and "do not silently reduce" policy.
4. Validate branch/pipe node topology and effective occurrence authority. Do not copy one branch wall across different OD/nodes/grades/schedules.
5. Preserve existing `4 Preview` UI, adjacent Fill and `⤓ Pull` icons and individual approval. Rename ambiguous audit `Updated` to `Calculated`; show independent `Pull ready`, `Pulled`, `CII verified` counts. Group HOLDs by distinct product/T1/route/root cause while retaining full 30-row details.

**PASS:** independent hand calculations for representative DSS120, LTCS120, LTCS82, negative pressure/missing-unit/route/class test cases; no silent modifications. **FAIL:** completed formula but invalid pipe schedule, source grade or pressure units.

### R2-E — Authentic end-to-end replay and emitted native CII (developer + independent verifier)

At fixed input/config/master/code-pack SHA snapshots:
1. Launch original standalone Step 4 using PSI-02, proven applicable stage and correct Line List worksheet; rebuild Preview and capture 30-row source ledger.
2. Run automatic B31.3 factor resolution and calculation; capture each source record, numeric factor, intermediate wall, nominal selection, status.
3. Explicitly Pull authorized rows only. Record before/after Preview and node signatures; confirm no unintended Fill Down or cross-branch edit.
4. Rebuild effective enriched XML via actual app finalization path, then emit **real native CII** with the production Python engine/options, not just a synthetic independent writer call.
5. Match each accepted physical pipe's source/target nodes to emitted CII ELEMENTs; compare wall numerical fields, units, counts, ordering and unchanged engineering fields. Take separate SHA-256s for original XML, stage/config, enriched XML, native CII, factor pack and acceptance ledger.
6. Reopen saved state; prove Pull staleness invalidation after factor-pack edition/source revision or source-node mutation.

**PASS:** 100% of accepted Pulls independently matched to emitted CII; no unexpected changes outside authorized row scope. **FAIL:** an unchanged synthetic writer test is used as a substitute for real Step 4 acceptance, or topology/output differs without explanation.

### R2-F — CI triage, independent engineering approval and controlled release

1. Inventory all 54 PR-head workflows and classify all 31 failures by failure step: relevant changed-code regression, inherited main mismatch (reproduced on same test at same base), infrastructure flake (rerun with evidence), or unrelated but blocking release qualification.
2. Do not mark any failure "pre-existing" from a description alone. At minimum, the observed P1 runtime/docs branch-format extraction mismatch exists on main; the remaining 30 require evidence.
3. Require successful B31.3 unit+browser+authentic-source+E2E CII workflows at **the final exact PR head**; all production-required workflow failures resolved or explicitly independently dispositioned.
4. Independent piping-engineer approval of governing edition, material routes, factor sources, schedule selections and CII parity. Engineering signoff cannot be self-granted by CI.
5. Only after all mandatory gates: non-draft PR, explicit owner approval, merge, Pages deployment, live smoke with cache purge and source/factor revision display.

**PASS:** signed numerical/source qualification + final-head technical acceptance + controlled deployment. Until then **PR #5 DRAFT / ENGINEERING HOLD**.

## UI contract (reuse existing Step 4, no extra screen)

```
4 Preview    [Fill ▾] [⤓ Pull]  [B31.3 Wall Calculation ▾]
             B31.3: Evaluated 30 | Basis qualified _ | Calculated _ |
                    Pull-ready _ | Pulled _ | Native CII verified _
  ┌ Material / T1 / Route group ──────────────────────────────────────┐
  │ DSS-A790-S31803  120°C  route: UNVERIFIED   26  HOLD ROUTE+S     │
  │ LTCS-A333-6      120°C  route: UNVERIFIED    2  HOLD FACTORS      │
  │ LTCS-A333-6       82°C  route: UNVERIFIED    2  HOLD S BRACKETS   │
  └───────────────────────────────────────────────────────────────────┘
  Existing Preview row:  Source → Material → P1/T1 → Wall Thk [Fill][⤓]
  Existing audit details: factor values/sources/revisions or precise HOLD.
```

These are **present diagnostic groups**, not guaranteed final engineering groups. Actual product/route conflicts may split them.

## Deliverables and custody contract

- `glrd-psi02-effective-config-r1.json` + SHA + source workbook/worksheet manifest
- `glrd-psi02-occurrence-custody.json` + CSV: exactly 30 physical rows, conflict reasons, P1/T1/units and source links
- `glrd-b313-product-route-qualification.json` and independently governed code-factor S/E/W/Y source pack revisions
- `glrd-b313-factor-and-wall-audit.json`: factor group IDs, row-level calculations, source table notes and nominal selections
- `glrd-b313-pull-ledger.json`: explicit per-occurrence acceptance, node scope and revision signatures
- `glrd-b313-emitted-cii-parity.json`: exact native CII node/ELEMENT mapping, counts, differences, hashes and status
- `glrd-b313-ci-closure.json`: 54 workflow classifications, exact-head required checks and independent release decision

No deliverable may claim `ENGINEERING_APPROVED` or `PULLED` without supporting evidence. Missing external inputs remain explicit HOLD fields.

## Order and responsibility

`R2-A source custody → R2-B product identity + edition → R2-C factor authorization → R2-D calculations → R2-E Pull/CII → R2-F independent review/release`.

Software owner can complete schema, resolvers, verifiers, source reconciliation and tests. The project engineering authority must establish the governing edition, controlled numerical code values, manufacturing route and physical design approvals. This is a real external dependency, not a software defect to bypass.

## 2026-11-17 — Implemented Step 8 / Step 4 source-chain integration (PR #5)

**Code-scoped disposition: IMPLEMENTED / focused CI PASS. Engineering factor and actual-Pull approval remain HOLD.**

The exact 7-column Step 8 Piping Class / Material Code configuration and the
existing Step 4 Preview/auto-basis panel have not been replaced.

**Effective source resolution and UI:**
- Preserve governing effective Preview Material, P1/T1 and the *separate*
  hydro/test-pressure column; display P1 with resolved unit or `unit unresolved`.
- Carry read-only exact DN Piping Class `Material_Name`, `SCH`,
  nominal wall, corrosion, class rating and `_sourceRowIndex` into the
  existing Step 4 branch-row ledger and show them in the existing
  `B31.3 automatic basis` identity/status cell.
- Show Material Code and its source/match method as separate mapping
  evidence. Mapping confidence is NOT an ASME stress/factor approval.
- Compare physical exact-DN master product to *both* Preview material
  and the Material Code designation, even if the Material Code matches first.
  An unapproved choice between exact Line List and branch class is a
  distinct `B313_PREVIEW_PIPING_CLASS_AUTHORITY_UNRESOLVED` HOLD.
- Preserve original source Material/Piping Class values: no auto substitution.
  Physical class/product contradiction produces
  `B313_PREVIEW_CLASS_DN_MATERIAL_CONFLICT` *before* S/E/W/Y lookup.
- Change the existing badge from misleading `B31.3 ID ✓` to
  `B31.3 ID ONLY`, `B31.3 GRADE REVIEW`, or
  `B31.3 FACTORS ✓` (latter ONLY when strict factors qualify).
- Save Pull authority signature with class source selection, exact-DN material,
  schedule, nominal wall, corrosion and original master row. Any changed
  value invalidates a previously saved Pull.
- A source-confirmed ASTM A106 pipe specification may imply seamless
  manufacturing, whereas a generic CS family default or unscoped
  class mapping may NOT prove the manufacturing route.

**Real source examples and specific intended statuses:**

| Owner GLRD row | Effective Material / T1 | Exact source master | New disposition |
|---|---|---|---|
| P4110001/B6, DN200 | DSS, 120 °C | 93833 DN200 / ASTM A790 UNS S31803 / Sch 80S / 12.7 mm / CA0 / source row 10559 | Identity corroborated; factors still HOLD until qualified |
| P4110003/B2, DN50 | LTCS, 120 °C | 93833 DN50 / ASTM A790 UNS S31803 / Sch 40S / 3.9116 mm / CA0 | **B313_PREVIEW_CLASS_DN_MATERIAL_CONFLICT**; no code lookup or Pull |
| B4110003/B1, 82 °C | LTCS, 82 °C | 11502 is ASTM A333 Grade 6 family | DN and production source must still be reconciled; qualified 82 °C factors absent |

The B313 source-chain regression uses the actual committed Class 93833
and 11502 JSON rows and tests conflicts, Config 8 precedence, downstream
auto-basis display/source trace, and Pull staleness on class/master edits.
`tests/xml-cii-b313-glrd-config8-sourcechain.test.mjs`.

**Focused CI evidence:** [Step 4 B31.3 Pull acceptance run 44033041090](https://github.com/reallakshman19/3D_Convertersv0.65/actions/runs/44033041090):
unit and Chromium PASS. [Pinned GLRD source custody run 44033041051](https://github.com/reallakshman19/3D_Convertersv0.65/actions/runs/44033041051): PASS.

**Not cleared:** controlled project-governing B31.3 code-table S sources,
manufacturing-route evidence, qualified E/W/Y rule values (the governed
published pack still contains zero approved rows), approved effective PSI-02
configuration, and real full-row Pull-to-native-CII parity. Do not claim a
nonzero production GLRD thickness result until those are supplied and
independently reviewed. This is not a release authorization.

## 2026-11-17 — R3 factor-source hardening and route evidence implementation

The user authorized the fix in the existing `8 Config → Piping Class exact DN → 4 Preview → B31.3 → Pull` flow. The following changes are committed in **draft PR #5**.

### Software changes and custody

- Strict qualified `S/E/W/Y` records now require the active code edition, controlled source-document SHA-256, independent reviewer, review date and source revision. `PROJECT_APPROVED` additionally needs an approval reference; BENCHMARK/SCREENING remain excluded. E cannot resolve from a missing/unverified route or a generic route-less material record; E/W must satisfy `0 < value <= 1`, Y `0 <= value <= 1`. Qualified code rules need the same provenance.
- The **existing Factors tab** now has the additional provenance columns and candidate-draft validation. The Factors tab's own numerical preview uses explicitly **non-authoritative manual mode**; it never changes the active factor tables.
- Step 4 B31.3's existing route cell now supports an actual route, pipe-spec/MTR source reference and reviewer checkbox. Route-only saves are permitted independently of factor overrides; a typed route without reviewed physical evidence receives `B313_PREVIEW_MANUFACTURING_ROUTE_EVIDENCE_REQUIRED`.
- ASTM A106 seamless inference requires an exact physical product; generic CS/class-family fallback cannot infer a manufacturing route. Contradictory A106+ERW metadata produces `B313_PREVIEW_MANUFACTURING_ROUTE_PRODUCT_CONFLICT`.
- The `glrd-b313-qualification-readiness.mjs` tool generates a JSON readiness artifact for the authentic, source-ordered 30 PSI-02 branches and three provisional groups (26 DSS/120, 2 LTCS/120, 2 LTCS/82), including individual missing S/E/W/Y, unverified manufacturing route, project edition/config/pressure authority and the two LTCS-vs-class-93833 conflicts. The reporter can **never** mark an audit-only row as Pull-ready.
- Dedicated CI tests for source provenance, published generator parity, GLRD branch group custody, route-specific negative controls and live Chromium now gate this integration.

### What is intentionally NOT asserted

This delivery does **not** contain approved Appendix A S records for the actual DSS/LTCS product contexts, a signed code-verified E/W/Y rule pack, or a real PSI-02 effective config and original owner-approved Pull-to-native-CII parity. There is no source permission to copy candidate SCREENING numbers into production. The `0 qualified / 0 Pull-ready` outcome is an honest engineering HOLD, **not** evidence that the controlled numeric inputs have been supplied.

**Exact acceptance remaining:** (1) source-authorized governing 2024 edition/project approval, (2) exact product/manufacturing-route documents, (3) independently verified applicable B31.3 tables/notes and approved factor-pack release, (4) authentic effective Preview run with P1/T1 units, and (5) accepted Pull → native CII field parity for every eligible GLRD pipe. Do not merge/deploy while these are missing.

## 2026-11-17 — 2024 ASME reference-source reconciliation (owner links)

**New evidence** (pinned exact original Git commits; this is *not* project code-table approval):

1. [v0.65 B31.3 adapter](https://github.com/reallakshman19/3D_Convertersv0.65/blob/91c1a28d248d0053dfdb38d4cc05402a4fb12013/docs/converters/engineering-calculations/adapters/b313.js#L117), Git blob `ed299634e5d9a10c74ad3592d48b60398e296302`: the cited line 117 is `allowable: result.requiredMinimumThicknessMm`, a **minimum-wall acceptance comparator**, not an ASME stress-table publication. The adapter itself has `codeCompliance:false` and `B313_CODE_TEXT_ENGINEERING_REVIEW_REQUIRED`.
2. [EPCC 57-row B31.3 materials subset](https://github.com/iman-taheri59/epcc-platform/blob/afa8b5989733c293bd91752de095376b64b60d98/standards-packs/reference/b313-materials.ref.json), Git blob `3d2d1201e87b54a62b2a3d50f6dccef4b85b4de6`: A333 Grade 6 and A-3 E construction variants are present; A790 S31803 **not** present in this subset. Also contains W and Y family tables.
3. [EPCC full 798-row B31.3 Table A-1 reference](https://github.com/iman-taheri59/epcc-platform/blob/afa8b5989733c293bd91752de095376b64b60d98/standards-packs/reference/allowable-stress.ref.json), Git blob `a6b20119b517738459f3a605e88dbf051afc96cd`: A333-6 internally `verified:true` with 65/100/150°C source temperatures and a constant **reference candidate** S=138 MPa at 82°C and 120°C. **A790 UNS S31803 is present but `verified:false`, `heldNotCitableBecause` populated, and the transcribed stress points begin at 225°C: no source support for S at 120°C, and extrapolation is prohibited.** A671 CC65 is also present, but is a different actual pipe product from A333/A790 and cannot replace it.

The EPCC files claim derivation from an owner-held licensed B31.3-2024 copy. An independent GLRD engineering reviewer has **not** checked the original applicable Code page/notes, project governing edition, original PDF digest, material/product certification, route or NDE. The EPCC `verified:true` flag is its **producer's internal cross-check**, not a project `VERIFIED` or `PROJECT_APPROVED` decision. Git blob SHA-1 is a pin to extracted source text; it is not the required `sourceDocumentSha256` of the original approved licensed source.

The pinned review-only `engineering/b313/glrd-b313-2024-external-reference-intake-v1.json` lists the three GLRD factor groups, status and bounded candidate values; it does not redistribute full proprietary tables. The `glrd-b313-qualification-readiness.mjs` output joins this intake by exact group without consuming any external candidate as `SOURCE_QUALIFIED`. Tests assert no source-candidate promotion.

**Remaining work before release:**
- Verify actual purchased ASME B31.3-2024 original against the LTCS 82°C/120°C A333-6 source row, confirm grade/product and approve source SHA-256/reviewer/date/revision.
- Confirm physical A333 pipe route (seamless vs ERW) from a project pipe specification/MTR; review Table A-3 E and applicable W/Y applicability/notes for that material and route.
- Obtain **A790 UNS S31803 at 120°C** directly from applicable original B31.3 data or another governed, engineer-approved allowable-stress source that has that actual temperature; never use 225°C extrapolation or A789 tube/A182 forging.
- Resolve GLRD class 93833 DSS-vs-LTCS conflict for the two LTCS 120°C occurrences; source-controlled effective config, T1/P1 and 30-row accepted Pull-to-native-CII parity remain required.

**Disposition:** source evidence strengthened. No new `VERIFIED` code factors were published. The 30/30 application failure remains an honest engineering HOLD pending independent verification and actual project data. PR #5 remains draft and must not be merged/deployed on the strength of a public reference transcription alone.
