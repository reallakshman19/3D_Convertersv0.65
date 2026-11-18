# GLRD PSI-02 — Original source cells, missing design inputs, and B31.3 release HOLD

**Date:** 2026-11-18  
**Implementation PR:** [#12](https://github.com/reallakshman19/3D_Convertersv0.65/pull/12)  
**Authority:** Authentic-source inspection / nonreleasing; **NOT engineering approval**.

## Exact pinned source inspection

- Primary model: `GLRD-1000-PSI-02.xml`, SHA-256 `164163380dccffb8f9d6bd7853eabd36eea89e508da2215443e81969144d4a45`, **30 Branch / 1,224 Node**, 22 distinct line keys.
- All **30/30** original XML branches have `<Pressure1>0</Pressure1>` and `<Temperature1>-100000</Temperature1>`. Original XML declares `<PressureUnits>pascal</PressureUnits>` and `<TemperatureUnits>degC</TemperatureUnits>`. These are source XML placeholders; XML pressure units **cannot** establish units for separately imported design Line List pressures.
- Historical workbook `LL_BM2.xlsx`, SHA-256 `73496a1277cd1f39de823d57180ee0d8c4b1d72241923f1e558af2c7c805d007`, has three worksheets: `Coversheet` (30 populated rows), `Legend` (33), `Linelist` (248). The `Linelist` worksheet contains only **two unique numeric sequence candidates** among the target PSI-02 line keys. They are **not** evidence that the BM2 workbook is the approved PSI-02 design source.

## What the actual workbook cells prove — and do NOT prove

| Meaning | Exact workbook cells | Values |
|---|---|---|
| Working pressure, NOT P1 | `K5 = AT WORKING CONDITIONS`, `K6 = Pressure`, `K8 = kPa(g)` | `K9 = 11000` for historic `4110001` |
| **Design pressure P1 header** | `W5 = DESIGN CONDITIONS`, `W6 = Pressure Max`, `W8 = kPa(g)` | **Source design-pressure unit kPa(g), not XML Pa** |
| Design temperature T1 header | `Y6 = Temp. Max`, `Y8 = ºC` | Celsius |
| Unique `P4110001` candidate | `C9 = 4110001`, `W9 = 13001.3`, `Y9 = 120`, `V9 = 93833` | **13,001.3 kPa(g) / 120°C** from historical BM2 candidate |
| Unique `P4110003` candidate | `C10 = 4110003`, `W10 = 701.3`, `Y10 = 82`, `V10 = 11502` | **701.3 kPa(g) / 82°C** from historical BM2 candidate |

The owner-saved effective 4 Preview has **7** rows with P1/T1 and **23** with neither, spread over **18** line keys. Its first two `P4110001` occurrences show **13001** (not **13001.3**) / 120°C; those numbers are **not cell-exact**. The `P4110003` occurrences show 701.3 / 82°C but the source workbook class is 11502 while the physical branch class token is 93833. **Do not silently overwrite precision or resolve the material/class conflict.**

Three populated saved B-family occurrences (`B4110001`, `B4110003`) are **not** justified by the historical numeric P-family aliases. Only an exact B-family source row can establish B-family design values; never duplicate a P-family P1/T1 onto a B-family branch.

## Actual software correction

1. Keep the user's **4 Preview** workflow and manually initiated calculation.
2. The Line List import worker now preserves *same source column* multirow header evidence `DESIGN CONDITIONS → Pressure Max → kPa(g)`, including original P1 cell value and pressure unit, on each normalized line.
3. A working-pressure `K` column is rejected; only the design `W` column can provide design-P1 unit. Rounded/edited P1 cannot inherit a previous source unit.
4. The Preview B31.3 resolver and Pull-time independent source receipt revalidate the exact selected source row, numeric value, header provenance and unit. Duplicate, stale or unrelated P/B aliases are rejected.
5. PR #12 also exports **one physical occurrence per row** as CSV/JSON: source → S/E/W/Y screening lookup → conditional wall / exact-DN reference → strict approval status and typed HOLD. No screening result can approve Pull.

The authorized worksheet selection remains controlled by the user/import workflow; the historical workbook is **not** automatically swapped in as the effective PSI-02 Line List.

## B31.3 factor qualification findings

The active `docs/Masters/b313-material-factor-master.json` has **8 S records, all BENCHMARK_ONLY**; **0** S records with `VERIFIED` or `PROJECT_APPROVED` status. The governed `docs/Masters/b313-code-factor-rules.json` contains **0** published E/W/Y records. No engineering-approved wall can be produced solely from current masters.

Existing `engineering/b313/glrd-b313-2024-external-reference-intake-v1.json` has **unapproved** A333-6 stress candidate 138 MPa at 82/120°C, while the exact A790 S31803 candidate at **120°C** has no validated project source bracket. External transcriptions are not original controlled Code evidence. Do **not** publish or extrapolate candidate factors as verified. Retain the approved intake and generator controls in `engineering/b313/material-factor-qualification-intake-v1.json`, `scripts/generate-b313-material-factors.mjs` and `scripts/generate-b313-code-factor-rules.mjs`.

The owner-requested **Seamless / E = 1** is solely the default **conditional screening** manufacturing scenario. Physical manufacturing route requires its own pipe-spec/MTR source evidence.

## Source-backed acceptance path

1. Supply the **governed PSI-02 Line List** with original workbook hash, worksheet, actual design-pressure column/unit and design T1 source cells for all 22 line keys (or reviewed per-line engineering overrides). Do not recycle BM2 values simply because numeric aliases match.
2. Use 4 Preview's new CSV/JSON receipt to reconcile all 30 occurrences; explicitly accept or correct conflicts such as `P4110001` precision and `P4110003` class identity, then rebuild Preview.
3. Provide the controlled **B31.3 project edition** and original source references for S/E/W/Y, scope to exact grade/product/route/temperature, and named independent engineering approval. Only publish these through the existing strict factor generators.
4. Recalculate; approve only qualified per-occurrence Pull proposals. Independently verify source XML → accepted wall → native emitted CII while preserving unrelated element fields. The separate prefinal restraint conflicts are unaffected by this wall audit.

## Reproducible proof

```sh
python scripts/verify-glrd-b313-authentic-inputs.py --fetch
python scripts/glrd-psi02-original-source-recovery.py
python -m unittest discover -s tests -p test_glrd_psi02_original_source_recovery.py -v
node --test tests/xml-cii-b313-header-band-source-unit.test.mjs
node --test tests/xml-cii-b313-glrd-16-row-linelist-coverage.test.mjs
```

The nonreleasing GLRD R3 workflow uploads `psi02-original-source-recovery.json` and `.csv` with original source branch identities, original XML sentinel values, historical candidate source cells and HOLDs. **Passing these controls does not constitute a 30/30 engineering wall-design acceptance**.

**Merge/deploy status:** PR #12 draft until reviewed; no physical wall mutation, code-factor publishing, native approved Pull, merge or production deployment performed in this workpack.
