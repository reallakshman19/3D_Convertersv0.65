# GLRD R3 — governed source-to-CII proof, not another wall-thickness UI patch
Date: 2026-11-17
Baseline: main ac15cf30cf0d9cf993ca9f56d70d947a494154c4 (PR #8)
Integrated draft predecessors: #9 (source coverage), #10 (DTXR/B31.3 review)
Status: SOFTWARE PROOF CANDIDATE / ENGINEERING DESIGN HOLD / DO NOT MERGE WITHOUT REVIEW

## Root cause now separated in source order

The owner's 2026-11-17 saved Step 4 browser HTML was independently parsed by a separate Python parser not importing app code (SHA-256 c845f63b8b1612c24fcf51d4c0b842a9c26b3039993f179baabdaf0552d94614). The physical table has **30 rows, 22 distinct line keys**, and **23 rows lacking both P1 and T1** on **18 line keys**. Only 7 rows have both fields populated. The browser loaded **16 Line List rows** and 29 occurrence basis entries. All 30 B31.3 report entries were NOT UPDATED. Negative controls remove P1/T1/branch or forge a changed audit status and must be rejected. This is evidence of the owner's saved state, not native-source authority.

The pinned GLRD authoritative source is **PSI-02, 30 Branch / 1,224 Node**, SHA-256 164163380dccffb8f9d6bd7853eabd36eea89e508da2215443e81969144d4a45. Historical BM2 is 31 Branch / 1,196 Node. The project Line List named `LL_BM2.xlsx` is not demonstrated to resolve the PSI-02 physical line population; a raw cell token scan found little matching coverage, but cannot prove zero matches. **Do not silently swap XML variants, worksheets or staged JSON.**

Existing `docs/Masters/b313-code-factor-rules.json` is EMPTY; qualification of S/E/W/Y, manufacturing route, and two class/material conflicts remains a separate engineering gate. Source-identification proof is not design factor approval.

## What this branch implements

1. **PR #9 source-root error preservation:** B31.3 Preview now records precise current 30 physical-row coverage and emits `B313_PREVIEW_LINE_LIST_SOURCE_MISSING` before downstream factor errors for unmatched physical lines with blank P1/T1. It displays affected line keys and navigates to existing Source & Masters. No automatic worksheet selection, P1, or T1 fill. The original source/docs mirrors remain byte-identical.
2. **PR #10 unified Step 4 wall review:** DTXR and governed B31.3 candidates appear in one review workflow. DTXR only writes explicitly selected physical keys, blocks collisions and stale approvals. The B31.3 calculation still requires signed Pull. No materials/factors or Python CII writer changed.
3. **Pinned source oracle `scripts/glrd-r3-source-ledger.py`:** independently fetch-validated PSI-02 XML, all seven pinned hashes, exact 30 branch ordinals and 1,224 nodes; creates machine-readable per-physical-row JSON/CSV and summarizes 22 line keys. Optional governed `--line-receipt` + `--line-master` requires exact worksheet, workbook digest, original line cell, actual P1 and T1 cells and design column headers/units. No source cell = typed HOLD, never fake 120C or 13001 units.
4. **Independent accepted CII oracle `scripts/glrd-r3-cii-parity-oracle.py`:** accepts ONLY a future approved source/config/factor-pinned receipt and original/enriched XML plus before/after native CII. Enforces branch/node lineage, emitted wall equal to accepted wall, approved physical element keys and no non-wall field differences. Empty code rule pack, missing approvals, or stale config reject; no synthetic CII PASS is reported as production acceptance.
5. **Negative controls `tests/test_glrd_r3_source_to_cii.py`:** verified receipt and CII tests deliberately corrupt source key, sheet, hash, header/unit, pressure, approval, element index/lineage or unrelated fields. All must fail closed.
6. **One nonreleasing CI workflow:** source custody SHA check, independent workbook inspection, 30-row ledger, negative controls, 23-row live-Preview reconstruction, and existing synthetic native CII serialization witness. Evidence includes JSON/CSV; original project XLSX/XML are NOT redistributed as CI artifacts.

## How to run the authoritative proof

```sh
python3 -m pip install openpyxl==3.1.5
python3 scripts/verify-glrd-b313-authentic-inputs.py --fetch \
  --output out/glrd-b313-source-custody.json
python3 scripts/inspect-glrd-b313-linelist-workbook.py
python3 -m unittest discover -s tests -p test_glrd_r3_source_to_cii.py -v
node --test tests/xml-cii-b313-glrd-16-row-linelist-coverage.test.mjs
python3 scripts/glrd-r3-source-ledger.py --out-dir out/glrd-r3-source-to-cii
python3 scripts/verify-glrd-b313-native-writer-parity.py \
  --output out/glrd-r3-source-to-cii/synthetic-native-wall-parity.json
```

A verified actual Line List receipt can be passed with:
`python3 scripts/glrd-r3-source-ledger.py --line-master PATH_TO_AUTHORIZED_XLSX --line-receipt PATH_TO_APPROVED_MAPPING_JSON`.

Minimum receipt schema is `glrd-psi02-line-receipt/v1`, with `sourceXmlSha256`, `workbookSha256`, exact `worksheet`, and an occurrence-scoped `rows` array containing `sourceOrdinal`, `branchName`, `lineKey`, `lineCell`, `p1Cell`, `p1HeaderCell`, `p1`, `p1Unit`, `t1Cell`, `t1HeaderCell`, `t1C`. Each cell and header is re-read from the workbook; no field is promoted on a mere author statement.

For approved design-to-output parity (NOT executable today without real approvals), use `scripts/glrd-r3-cii-parity-oracle.py --receipt ... --source-xml ... --enriched-xml ... --cii-before ... --cii-after ... --effective-config ...`. It requires a physical-node/element mapping receipt and code-factor pack digests; the current empty rule pack intentionally refuses PASS.

## Acceptance standard

- **A, source integrity:** 30/30 exact PSI-02 branch/node model, independently checked source SHA, no BM2 substitution — machine-PASS when verified.
- **B, process authority:** 30/30 cells either source-verified at original worksheet/row/header/unit or typed independent HOLD. Current 23 blank browser P1/T1 occurrences must not be populated by a neighboring line or CS fallback. The current saved config may still be wrong sheet/model.
- **C, design authority:** independently qualified applicable product, route, original B31.3 stress S at T1 and code-specific E/W/Y, P1 pressure units, exact-DN pipe schedule; code equation applicability checked. No SCREENING, no empty-rule-pack approval.
- **D, Pull:** explicit source/factor/version-bound per-occurrence acceptance, no overwriting manual fields or copying class-wide values.
- **E, real native output:** each accepted physical node matched to an independently identified CII element with exact wall; no unrelated element field changed. Synthetic writer parity is useful but is NOT this gate.
- **F, release:** exact-head Node, Chromium, independent negative controls, pinned input ledger, and owner engineering approval before merge/deploy.

**A legitimate final proof need not say 30 UPDATED. It must classify all 30 into independently source-qualified accepted CII parity or precise HOLD, with 0 false Pull and 0 untraceable modifications.**

## Remaining owner evidence (cannot be invented by software)

- Actual effective PSI-02 saved workbench configuration, exact workbook, worksheet and line-key mappings for 23 missing P1/T1 branches; wrong BM2 Line List is a live hypothesis, not corrected by a guessed sheet.
- Physical pipe material/form/manufacturing route, P1 pressure units/design temperature per applicable line, two P4110003 material/class contradictions.
- Governing edition and independently reviewed original code stress/rule records, project approvals and applicable temperature/route bounds.
- Real accepted Pull plus before/after enriched XML and native CII with physical node-to-element lineage.

No source records, signed approvals, production wall changes, deploy or merge have been fabricated by this proof branch.
