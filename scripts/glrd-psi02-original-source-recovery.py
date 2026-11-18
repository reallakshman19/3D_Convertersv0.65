#!/usr/bin/env python3
"""PSI-02 source availability audit: actual XML, BM2 workbook candidates and factor authority.

This is intentionally read-only. The historical BM2 workbook is NOT
declared to be the PSI-02 Line List merely because a sequence matches.
No S/E/W/Y gets promoted, and no P1/T1 is ever inferred from XML sentinel
values, unrelated line keys or source workbook candidates.
"""
import argparse
import csv
import hashlib
import json
import re
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from pathlib import Path
from zipfile import ZipFile

X = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
R = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
P = "{http://schemas.openxmlformats.org/package/2006/relationships}"
ALLOWED = ("VERIFIED", "PROJECT_APPROVED")
NUMERIC = re.compile(r"^411\d{4}$")


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def named(child, tag):
    return next((node for node in child if node.tag.split("}")[-1] == tag), None)


def child_text(parent, name):
    n = named(parent, name)
    return "" if n is None else (n.text or "").strip()


def workbook_sheet_rows(path, sheet_name="Linelist"):
    """Read XLSX original cell coordinates, not inferred normalized table rows."""
    with ZipFile(path) as f:
        workbook = ET.fromstring(f.read("xl/workbook.xml"))
        relations = ET.fromstring(f.read("xl/_rels/workbook.xml.rels"))
        rels = {r.attrib["Id"]: r.attrib["Target"] for r in relations}
        strings = []
        if "xl/sharedStrings.xml" in f.namelist():
            shared = ET.fromstring(f.read("xl/sharedStrings.xml"))
            strings = [
                "".join(t.text or "" for t in s.iter(X + "t"))
                for s in shared.findall(X + "si")
            ]
        sheets = [s for s in workbook.iter(X + "sheet")]
        sheet = next((s for s in sheets if s.attrib.get("name", "").lower() ==
                      sheet_name.lower()), None)
        if sheet is None:
            raise ValueError("BM2_WORKSHEET_NOT_PRESENT:" + sheet_name)
        target = rels[sheet.attrib[R + "id"]].lstrip("/")
        if not target.startswith("xl/"):
            target = "xl/" + target
        if "/../" in "/" + target:
            raise ValueError("UNSAFE_WORKSHEET_RELATIONSHIP")
        data = ET.fromstring(f.read(target))
        by_row = {}
        for row in data.findall(".//" + X + "sheetData/" + X + "row"):
            num = int(row.attrib["r"])
            cells = {}
            for cell in row.findall(X + "c"):
                ref = cell.attrib["r"]
                col = re.match(r"^[A-Z]+", ref).group()
                v = cell.find(X + "v")
                if cell.attrib.get("t") == "s" and v is not None:
                    idx = int(v.text or -1)
                    value = strings[idx] if 0 <= idx < len(strings) else ""
                elif v is not None:
                    value = (v.text or "").strip()
                else:
                    inline = cell.find(X + "is")
                    value = "".join(t.text or "" for t in inline.iter(X + "t")) if inline is not None else ""
                cells[col] = {"coordinate": ref, "value": value}
            if cells:
                by_row[num] = cells
        return {"workbookSheet": sheet.attrib["name"],
                "rows": by_row,
                "headerByColumn": {
                    col: [
                        {"cell": by_row[n][col]["coordinate"],
                         "text": by_row[n][col]["value"]}
                        for n in sorted(by_row) if n < 9 and col in by_row[n]
                    ]
                    for col in ("C", "K", "V", "W", "X", "Y", "Z")
                }}


def candidate_for_line(key, row_cells):
    """Only the documented BM2 C column, exact or P-only numeric alias.

    Does not accept a B branch numeric alias. Source row 9+; matching
    other columns such as From/To never establishes line identity.
    """
    key = (key or "").strip().upper()
    result = []
    for number, cells in row_cells.items():
        if number < 9:
            continue
        line = cells.get("C", {}).get("value", "").strip().upper()
        if not line:
            continue
        method = ("EXACT" if line == key else
                  "P_ONLY_NUMERIC_ALIAS" if key.startswith("P")
                  and NUMERIC.fullmatch(line) and key[1:] == line
                  else None)
        if not method:
            continue
        result.append({
            "method": method, "worksheetRow": number,
            "lineCell": "C" + str(number), "lineCellText": line,
            "K9ProfilePressureCandidateCell": "K" + str(number),
            "K9ProfilePressureCandidate": cells.get("K", {}).get("value", ""),
            "Y9ProfileTemperatureCandidateCell": "Y" + str(number),
            "Y9ProfileTemperatureCandidate": cells.get("Y", {}).get("value", ""),
            "V9ProfileClassCandidate": cells.get("V", {}).get("value", ""),
            "WDesignCandidateCell": "W" + str(number),
            "WDesignCandidateValue": cells.get("W", {}).get("value", ""),
            "XDesignCandidateCell": "X" + str(number),
            "XDesignCandidateValue": cells.get("X", {}).get("value", ""),
            "ZDesignCandidateCell": "Z" + str(number),
            "ZDesignCandidateValue": cells.get("Z", {}).get("value", ""),
            "authority": "HISTORICAL_BM2_UNQUALIFIED_CANDIDATE_ONLY"
        })
    # Exact source line keys outrank unique numeric aliases. Ambiguous
    # duplicate exact source rows remain ambiguous and are never selected.
    exact = [row for row in result if row["method"] == "EXACT"]
    return exact if exact else result


def factor_census(master, rules):
    factor = master.get("factors", {}).get("S", {})
    s_records = factor.get("records", [])
    published_s = [r for r in s_records if str(r.get("status", "")).upper() in ALLOWED]
    code = rules.get("records", [])
    approved_code = [r for r in code if str(r.get("status", "")).upper() in ALLOWED]
    return {
        "designCodeEdition": rules.get("edition"),
        "SRecordCount": len(s_records),
        "SApprovedRecordCount": len(published_s),
        "SNonApprovedStatusCounts": dict(Counter(str(x.get("status")) for x in s_records)),
        "E_W_YRuleCount": len(code),
        "E_W_YApprovedRuleCount": len(approved_code),
        "factorReleaseEligible": False if not published_s or not approved_code else None,
        "approvalRule": "VERIFIED_OR_PROJECT_APPROVED_WITH_ACTUAL_CODE_EDITION_AND_PRODUCT_ROUTE"
    }


def audit(manifest_path, matrix_path, source_dir, master_path, rules_path, output_dir):
    manifest = json.loads(Path(manifest_path).read_text(encoding="utf-8"))
    matrix = json.loads(Path(matrix_path).read_text(encoding="utf-8"))
    inputs = {entry["role"]: entry for entry in manifest["files"]}
    path_xml = Path(source_dir) / Path(inputs["xml"]["path"]).name
    path_line = Path(source_dir) / Path(inputs["line_list"]["path"]).name
    for label, path in (("xml", path_xml), ("line_list", path_line)):
        if not path.is_file() or sha(path) != inputs[label]["sha256"] or \
           path.stat().st_size != inputs[label]["bytes"]:
            raise ValueError("PINNED_SOURCE_CUSTODY_FAIL:" + label)
    root = ET.parse(path_xml).getroot()
    branches = [b for b in root.iter() if b.tag.split("}")[-1] == "Branch"]
    if len(branches) != 30 or len(matrix.get("rows", [])) != 30:
        raise ValueError("WRONG_PSI02_MODEL")
    unit_node = next((n for n in root.iter() if n.tag.split("}")[-1] == "Units"), None)
    xml_pressure_unit = child_text(unit_node, "PressureUnits") if unit_node is not None else ""
    xml_temp_unit = child_text(unit_node, "TemperatureUnits") if unit_node is not None else ""
    if not xml_pressure_unit or not xml_temp_unit:
        raise ValueError("SOURCE_XML_UNITS_UNAVAILABLE")
    wb = workbook_sheet_rows(path_line)
    factors = factor_census(json.loads(Path(master_path).read_text()),
                            json.loads(Path(rules_path).read_text()))
    items = []
    for index, (branch, expected) in enumerate(zip(branches, matrix["rows"])):
        name = child_text(branch, "Branchname")
        if expected.get("sourceOrdinal") != index or expected.get("branchName") != name:
            raise ValueError("SOURCE_BRANCH_ORDINAL_OR_NAME_MISMATCH")
        key = expected.get("lineKey", "")
        pnode = named(branch, "Pressure")
        tnode = named(branch, "Temperature")
        pressure = child_text(pnode, "Pressure1") if pnode is not None else ""
        temperature = child_text(tnode, "Temperature1") if tnode is not None else ""
        candidates = candidate_for_line(key, wb["rows"])
        raw_p = float(pressure) if pressure else None
        raw_t = float(temperature) if temperature else None
        xml_placeholder = raw_p == 0 and raw_t == -100000
        if not xml_placeholder:
            raise ValueError("SOURCE_XML_DESIGN_INPUT_STATUS_CHANGED_VERIFY_MANUALLY_AT:" + str(index))
        candstatus = ("NO_HISTORICAL_BM2_LINE_CANDIDATE" if not candidates
                      else "AMBIGUOUS_HISTORICAL_BM2_LINE_CANDIDATE" if len(candidates) > 1
                      else "UNIQUE_HISTORICAL_BM2_CANDIDATE_NOT_PSI02_AUTHORITY")
        items.append({
            "sourceOrdinal": index, "branchName": name, "lineKey": key,
            "xmlPressure1": pressure, "xmlPressureUnits": xml_pressure_unit,
            "xmlTemperature1": temperature, "xmlTemperatureUnits": xml_temp_unit,
            "xmlDesignInputsArePlaceholders": xml_placeholder,
            "historicalWorkbookSha256": inputs["line_list"]["sha256"],
            "historicalWorkbookName": Path(inputs["line_list"]["path"]).name,
            "historicalWorksheet": wb["workbookSheet"],
            "historicalCandidateStatus": candstatus,
            "historicalCandidateCount": len(candidates),
            "historicalLineCell": candidates[0]["lineCell"] if len(candidates) == 1 else None,
            "historicalCandidatePressureCell": candidates[0]["K9ProfilePressureCandidateCell"] if len(candidates) == 1 else None,
            "historicalCandidatePressureValue": candidates[0]["K9ProfilePressureCandidate"] if len(candidates) == 1 else None,
            "historicalCandidateTemperatureCell": candidates[0]["Y9ProfileTemperatureCandidateCell"] if len(candidates) == 1 else None,
            "historicalCandidateTemperatureValue": candidates[0]["Y9ProfileTemperatureCandidate"] if len(candidates) == 1 else None,
            "qualifiedP1": None, "qualifiedP1Unit": None, "qualifiedT1": None,
            "sourceEvidenceStatus": "HOLD_PSI02_GOVERNED_LINE_LIST_CELLS_NOT_VERIFIED",
            "factorStatus": "HOLD_PROJECT_QUALIFIED_B313_FACTORS_NOT_AVAILABLE",
            "manufacturingRouteStatus": "HOLD_PHYSICAL_MANUFACTURING_ROUTE_NOT_VERIFIED",
            "approvedWallMm": None, "eligibleForPull": False,
            "historicalCandidateDetails": candidates
        })
    summary = {
        "schema": "glrd-psi02-original-source-recovery/v1",
        "pinnedXmlSha256": inputs["xml"]["sha256"],
        "pinnedHistoricalWorkbookSha256": inputs["line_list"]["sha256"],
        "physicalRows": len(items),
        "distinctLineKeys": len({x["lineKey"] for x in items}),
        "xmlDesignPlaceholders": sum(x["xmlDesignInputsArePlaceholders"] for x in items),
        "xmlPressureUnits": xml_pressure_unit,
        "xmlTemperatureUnits": xml_temp_unit,
        "historicalCandidatePhysicalRows": sum(bool(x["historicalCandidateCount"]) for x in items),
        "historicalCandidateUniqueLineKeys": sorted({x["lineKey"] for x in items if x["historicalCandidateCount"] == 1}),
        "historicalCandidateAmbiguousLineKeys": sorted({x["lineKey"] for x in items if x["historicalCandidateCount"] > 1}),
        "unverifiedPsi02DesignLines": len(items),
        "sourceLineListPressureUnitsNotEstablishedByXmlUnits": True,
        "s_E_W_YApproval": factors,
        "sourceEngineeringApproval": "HOLD_NO_PROJECT_SPECIFIC_PSI02_DESIGN_INPUT_RECEIPTS",
        "pullApprovedRows": 0,
        "criterion": "NEVER_BORROW_HISTORICAL_BM2_VALUES_OR_XML_SENTINELS_TO_FILL_PSI02"
    }
    dest = Path(output_dir)
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "psi02-original-source-recovery.json").write_text(json.dumps({
        "summary": summary, "historicalBm2HeaderCells": wb["headerByColumn"], "rows": items,
    }, indent=2) + "\n", encoding="utf-8")
    columns = [k for k in items[0] if k != "historicalCandidateDetails"]
    with (dest / "psi02-original-source-recovery.csv").open("w", newline="", encoding="utf-8") as out:
        writer = csv.DictWriter(out, fieldnames=columns)
        writer.writeheader()
        for item in items:
            writer.writerow({key: item[key] for key in columns})
    print(json.dumps(summary, indent=2))
    print("Source header coordinate witness:", json.dumps(wb["headerByColumn"], ensure_ascii=False)[:8000])
    for key in summary["historicalCandidateUniqueLineKeys"]:
        candidate=next(r["historicalCandidateDetails"][0]
          for r in items if r["lineKey"]==key and len(r["historicalCandidateDetails"])==1)
        print("CANDIDATE SOURCE CELLS", key, json.dumps(candidate, ensure_ascii=False))
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="engineering/b313/glrd-pinned-source-manifest.json")
    parser.add_argument("--matrix", default="engineering/b313/glrd-psi02-factor-groups.json")
    parser.add_argument("--source-dir", default=".cache/glrd-b313-source")
    parser.add_argument("--master", default="docs/Masters/b313-material-factor-master.json")
    parser.add_argument("--rules", default="docs/Masters/b313-code-factor-rules.json")
    parser.add_argument("--output-dir", default="out/glrd-psi02-original-source-recovery")
    options = parser.parse_args()
    audit(options.manifest, options.matrix, options.source_dir,
          options.master, options.rules, options.output_dir)


if __name__ == "__main__":
    main()
