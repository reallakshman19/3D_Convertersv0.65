# GLRD PSI-02 — Nov 17 saved UI failure and current-main recovery

**Branch base:** `ac15cf30cf0d9cf993ca9f56d70d947a494154c4` (latest `main` at investigation start). PR #5 had already merged 2026-11-17 08:41 UTC; its old branch was 68 commits behind `main`. Recovery uses a **fresh branch from main**, not a force-rebase or a deployment of a stale PR.

**Owner evidence:** locally supplied saved `error(1).html`, exact source SHA-256
`c845f63b8b1612c24fcf51d4c0b842a9c26b3039993f179baabdaf0552d94614` (748,408 bytes). This is a local page snapshot, NOT a rerun or a complete GLRD source bundle. Do not upload the entire owner browser HTML or infer live API state from its timestamp.

## Direct observations from saved Step 4 UI

- XML `GLRD-1000-PSI-02` 30/30 branch count, four masters loaded, but **Line List 16 rows**. The other masters are 10,699 piping class, 383 material map and 1,595 valve weights.
- Step 4 editable Preview **7/30 physical rows have actual populated P1/T1**; the **other 23/30 physical rows have both P1 and T1 empty**, spread across **18 distinct line keys**.
- Explicit first two rows `P4110001`: T1 120°C, P1 13001 **unit unresolved**. P4110003 rows show Line List class 11502 vs branch 93833 and T1 82°C/P1 701.3 in this saved session; do not silently substitute DSS or approved pressure units.
- `B31.3 wall update audit`: 23 `B313_PREVIEW_T1_REQUIRED`, 3 DSS/120 `B313_PREVIEW_FACTOR_BASIS_UNAVAILABLE`, 2 LTCS/82 factor HOLD, 2 class authority conflicts; 0/30 calculated/updated.
- The pinned custody manifest also warns that a historical saved configuration selected `Coversheet` rather than effective `Linelist`; this is **supporting suspicion, not proof** of the active sheet name in the uploaded HTML (which does not expose that choice).

**Root-cause separation:** Missing physical Line List match is the immediate **upstream** cause for 23 empty P1/T1 fields. The separate 7 rows cannot produce governed B31.3 walls until S/E/W/Y, P1 units, product/route, and class-identity engineering approval are qualified. A Piping Class master can establish pipe product/schedule candidates but cannot invent a missing design temperature or pressure.

## Code correction in fresh main-based branch

1. Add `buildPreviewB313LineListCoverage` to the existing B31.3 model; compute matched/unmatched physical rows, loaded Line List row count, missing T1/P1 and missing unique line keys **from the current Preview**, not a hardcoded GLRD assumption.
2. For branches with `lineMiss === true` and missing P1/T1, emit `B313_PREVIEW_LINE_LIST_SOURCE_MISSING` ahead of generic material/factor checks. This is a specific actionable HOLD; it never creates a wall proposal.
3. Show an explanatory Line List coverage banner in the **existing** unified audit (no new panel): loaded rows, physical coverage, unique missing keys, probable worksheet-selection trap, and a button taking the user to **1 Source & Masters**. This does not auto-select a sheet or overwrite source.
4. Preserve compatibility for manually supplied independently reviewed P1/T1: a deliberately unmatched Line List does not itself forbid qualified explicit process authority; its other code/factor gates still apply.
5. Preserve original `tabs` / `docs` mirrors and run regression including 30-row owner-screen reconstruction (16 workbook rows, 7 physical matching, 23 missing/18 keys), negative-control overrides and 0 false Pull approvals.

## Real correction required in owner session

1. In `1 Source & Masters → Line List`, inspect workbook and active worksheet. The intended engineering `Linelist` sheet, not `Coversheet`/summary or a stale stored subset, must be loaded if it is source-correct.
2. Verify exact line-key matches for the 18 listed missing keys, confirm effective 30-row P1/T1 and pressure units, then `Rebuild Preview`. If the authoritative master truly lacks these lines, obtain signed process data or reviewed line-specific overrides; don't propagate values by similarity.
3. Re-run the B31.3 audit. The upstream 23 errors should disappear **only when real source evidence was restored**. Other independent factor/route/class HOLDS must remain until their own evidence is qualified. Do not claim 30/30 calculated.
4. CI green only establishes code behavior, not owner session parity; repeat real browser and final emitted CII validation under the restored configuration before any merge/deployment.

**Engineering outcome:** FAIL_CLOSED. This workpack does not approve screening factors, manufacturing route, code-table transcription, wall changes, Pull, merge or deployment.

## Pinned workbook worksheet and model coverage — independent CI

Executed the pinned workbook metadata inspection through the existing authenticated GLRD source-custody workflow. [CI 44121753434](https://github.com/reallakshman19/3D_Convertersv0.65/actions/runs/44121753434) PASS:
- `Coversheet`: 30 populated Excel rows; **zero** complete P/B line tokens or numeric PSI-02 sequence matches.
- `Legend`: 33 populated Excel rows; **zero** matching tokens/sequences.
- `Linelist`: 248 populated Excel rows; **zero complete** P/B joined line tokens and **two numeric** `411XXXX` sequences among 22 distinct PSI-02 branch keys.
- The whole-cell scan is deliberately heuristic: Excel may separate service prefix/sequence or use transformed identifiers. Raw worksheet counts are NOT normalized/master-usable counts; numeric sequence matches are NOT validated physical line authority.

**Corrected root-cause disposition:** The selected **16-row browser master** does not cover 23 physical PSI-02 occurrences. The original `LL_BM2.xlsx` workbook includes a named `Linelist` sheet, but the scant two raw numeric sequence matches suggest an additional **BM2/PSI-02 master coverage mismatch**. Selecting `Linelist` alone is *not* demonstrated sufficient to restore all 22 distinct source line keys. No source values were exported from the raw workbook.

**Owner-source recovery acceptance:** prove exact matching row+worksheet+line key for *each* physical PSI-02 branch, with source P1/T1, units and class precedence; if the BM2 workbook does not contain all PSI-02 lines, source the correct PSI-02 Line List (or line-specific reviewed engineering overrides). Do not fill all missing lines from one known 120°C row. Rebuild Preview, then assess approved S/E/W/Y and explicit Pull separately.
