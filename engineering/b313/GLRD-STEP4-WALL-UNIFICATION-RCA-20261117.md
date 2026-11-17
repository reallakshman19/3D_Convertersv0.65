# GLRD 4 Preview wall-thickness workflow — source RCA and safe unification
Date: 2026-11-17
Status: SOFTWARE CANDIDATE / ENGINEERING HOLD
Base main: ac15cf30cf0d9cf993ca9f56d70d947a494154c4 (PR #8 merge)

## What was actually observed

The owner's saved `error.html` from the published 3D_Convertersv0.65 page shows:
- 30 effective Preview physical branches; 16 selected Line List rows; 10,699 Piping Class rows, 383 material map rows, 1,595 valve weight rows;
- B31.3 report evaluated 30, calculated/applied zero, held 30;
- 29 occurrence-scoped editable factor-basis entries for 30 physical rows (NOT 29 materials);
- 26 DSS-A790-S31803 / 120 C factor HOLDS, two LTCS-A333-6 / 82 C HOLDS, and two exact-DN class vs Preview material conflicts;
- P1=13001 with unit unresolved in displayed GLRD records; test pressure 22905 is not design-pressure-unit authority;
- staged JSON original SHA-256 1d2469fe05d712cd1dd2da9913a840516ae686fb1616eb6d7b5e14d8918e2746, which is the pinned BM2-named managed-stage source. Its use with PSI-02 is not yet justified by a source-to-branch/node mapping receipt;
- both the DTXR bulk-update button and the governed B31.3 calculation button visible above the review tables.

The exact user-selected connected Drive folder GLRD-INPUTS (1F09it3WmRiyakUitwg2XjOPUiaxxUNlI) was fetched and listed under the matching reallakshman19@gmail.com account and returned zero direct files. The owner-visible effective PSI-02 saved config and workbook sheet-selection receipts were not available. Repository-pinned source records remain evidence, not proof of the owner's current loaded session.

## Actual source target and data limit

Repository `engineering/b313/glrd-pinned-source-manifest.json` pins:
- PSI-02 XML 30 Branch / 1,224 Node, SHA-256 164163380dccffb8f9d6bd7853eabd36eea89e508da2215443e81969144d4a45;
- historical BM2 XML 31 Branch / 1,196 Node, SHA-256 6bcc477860fdbe9a80159839bf476a8c1e6ce7a966587a25bc62498709843151;
- stage JSON 86 top-level records, SHA-256 1d2469fe...e2746, originally BM2-named;
- saved historical bm2-workbench-config.json not available for active PSI-02 replay. Historical Coversheet-vs-Linelist source discrepancy remains.

Source custody tests have authenticated pinned bytes, but have not certified PSI-02 saved Config / Line List selection / DTXR stage applicability.

## PR-by-PR root causes, not a single failed deployment

1. PR #1: created B31.3 proposals and occurrence-bound Pull; qualified target material factors still missing.
2. PR #2: bootstrapped GitHub Pages; successful publication says nothing about ASME source qualification.
3. PR #3: restored Step 8 exact material evidence; correctly HOLDs contradictory class/line-list identities.
4. PR #5: built edition-specific governed E/W/Y rule engine, but active `docs/Masters/b313-code-factor-rules.json` is deliberately `records: []`; target material S/E/W/Y remains screening/not qualified. Synthetic writer parity is not GLRD design approval.
5. PR #6: external EPCC/MatSEng reference review only, not qualified factor publication.
6. PR #4: cleaned obsolete workflow YAML but did not address live GLRD calculations.
7. PR #7: unified B31.3 basis/audit presentation and surfaced masked P1/T1/route HOLDS; 30 physical rows vs 29 basis entries and 3 root-cause groups are distinct counts.
8. PR #8: fixed real P1-unit source-header gating and exact-DN Piping Class schedule selection, and physically moved lazy B31.3 audit into its panel. These software repairs cannot supply approved factors or resolve two source conflicts.

The original legacy DTXR button was an independent hazardous defect: `_bindDtxrWallUpdateButtonBranchScoped` immediately wrote every matching `overrides.wallThickness[key]`, even when an existing manual override or accepted B31.3 wall was present, and labelled changes manual. A read-only Preview promise was therefore not fulfilled.

The UI label "B31.3 Sec II" was also misleading. The pressure design calculation cites ASME B31.3-2024 §304.1.2, while Section II source material/stress tables have separate engineering authority.

## Implemented in this draft

- One grouped `Wall Thickness Review` action area in existing Step 4, with distinct `Review DTXR wall candidates` and `Calculate B31.3 pressure-design wall (review only)` actions.
- One shared results workspace containing the per-occurrence B31.3 basis, independent DTXR schedule proposals and existing governed B31.3 physical-row audit. No new top-level tab or second B31.3 calculator.
- Pure read-only DTXR planner; the Review click makes ZERO wall changes.
- DTXR proposals are grouped by effective wall override key; differing candidate values or schedules on the same shared key are quarantined; unchanged entries require no write.
- Explicit row-key checkbox selection before Apply. No preselected candidates. Existing overrides show `REPLACE_EXISTING_REQUIRES_APPROVAL`; B31.3 accepted walls are blocked using original `branchOccurrenceIndex`; changed overrides at approval-time fail closed.
- Apply sets only individually approved DTXR wall keys and records DTXR provenance; marks Preview dirty and requires an explicit Rebuild. B31.3 still calculates proposals only; original signed Pull rules are unchanged.
- B31.3 report displays `Eligible proposals 0 · Held N` instead of suggesting that the Calculate action automatically updates walls.
- Source code and GitHub Pages `docs/` mirrors kept byte-identical for all five touched modules; exact-head CI now includes dedicated DTXR approval regressions and browser review coverage.

## Evidence actually run

- 9/9 executable isolated V8 pure-plan regression cases PASSED (source-pure, same-key deduplication, conflict HOLD, B31.3 accepted-wall block, actual occurrence ID, newly accepted wall, stale override, explicit subset, unchanged/invalid walls).
- 5/5 altered JS modules parsed in the same isolate after ESM import stripping.
- 5/5 source-vs-`docs/` JavaScript module pairs byte-identical by fetched GitHub blob SHA.
- Existing Step4 GitHub Actions workflow extended with new Node tests and the Chromium fixture strengthened to check that viewing DTXR candidates does not mutate the config. **CI Chromium, full repository suite, real GLRD 30-row owner session replay, emitted CII parity and deployed Pages smoke have NOT been executed or certified at this write.**

## What remains engineering HOLD, not solved by code or UI

1. Recover the actual PSI-02 saved effective Config and authoritative Linelist sheet, pressure-design P1 headers/units and temperature sources; reconcile the apparent 16-row selected master and its older 39-row reports.
2. Establish source-to-PSI-02 applicability for the BM2-named staged JSON before trusting DTXR.
3. Independent engineering acceptance of ASTM/UNS product form, actual pipe manufacturing routes (MTR/spec), class/DN/OD/schedule and the two LTCS-vs-DSS contradictions.
4. Publish original-code/project-authorized allowable S at applicable temperatures and E/W/Y code-rule records from licensed engineering sources; `SCREENING` and `BENCHMARK_ONLY` remain excluded.
5. Perform and independently verify exact-source 30-row Calculate/HOLD → explicit Pull → rebuilt enriched XML → native emitted CII wall parity, including negative controls and overrides.

**Do not claim 30/30 B31.3 CALCULATED or release this draft until those prerequisites and exact-head browser/CI tests pass.** No automatic code-factor promotion, P1-unit guessing, manufacturing-route inference or hidden schedule substitution is included.
