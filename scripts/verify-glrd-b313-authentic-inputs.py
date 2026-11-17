#!/usr/bin/env python3
"""Verify authentic GLRD source custody; never infer engineering qualification.

Only fetches pinned, SHA-256-controlled public source files. It does not
qualify S/E/W/Y, pick a pipe manufacturing route or emit engineering CII.
"""
import argparse
import hashlib
import json
from pathlib import Path
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile


def sha256(path):
    with path.open("rb") as source:
        h = hashlib.sha256()
        for block in iter(lambda: source.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def localname(tag):
    return tag.split("}", 1)[-1] if "}" in tag else tag


def child_text(elem, tag):
    for child in elem:
        if localname(child.tag).lower() == tag.lower():
            return (child.text or "").strip()
    return ""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--manifest", default="engineering/b313/glrd-pinned-source-manifest.json")
    parser.add_argument("--source-dir", default=".cache/glrd-b313-source")
    parser.add_argument("--output", default="out/glrd-b313-source-custody.json")
    parser.add_argument("--fetch", action="store_true",
                        help="Fetch only canonical files by pinned commit; no fallback to main")
    parser.add_argument("--config", help="Exact effective workbench config, if independently supplied")
    args = parser.parse_args()

    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    if manifest.get("schema") != "glrd-b313-pinned-source-manifest/v1":
        raise SystemExit("Incorrect pinned source manifest schema")
    root = Path(args.source_dir)
    root.mkdir(parents=True, exist_ok=True)
    checks = []
    for item in manifest["files"]:
        target = root / Path(item["path"]).name
        if not target.exists():
            if not args.fetch:
                raise SystemExit("Missing exact pinned source file: " + str(target))
            url = "https://raw.githubusercontent.com/" + manifest["sourceRepo"] + "/" + item["ref"] + "/" + urllib.parse.quote(item["path"], safe="/")
            req = urllib.request.Request(url, headers={"User-Agent": "glrd-b313-pinned-source-verifier/1"})
            with urllib.request.urlopen(req, timeout=90) as response, target.open("wb") as dest:
                while True:
                    block = response.read(1 << 20)
                    if not block:
                        break
                    dest.write(block)
        actual_length = target.stat().st_size
        actual_hash = sha256(target)
        if actual_length != item["bytes"] or actual_hash != item["sha256"]:
            raise SystemExit("GLRD pinned-source integrity FAIL: " + item["role"]
                             + "; size=" + str(actual_length) + " sha256=" + actual_hash)
        if target.suffix.lower() == ".xlsx":
            with zipfile.ZipFile(target) as archive:
                bad = archive.testzip()
                if bad:
                    raise SystemExit("Corrupted XLSX archive " + item["role"] + ": " + bad)
        checks.append({
            "role": item["role"], "verified": True, "bytes": actual_length,
            "sha256": actual_hash, "pinnedRef": item["ref"], "path": item["path"],
        })
    files = {item["role"]: root / Path(item["path"]).name for item in manifest["files"]}
    tree = ET.parse(files["xml"])
    branches = [el for el in tree.iter() if localname(el.tag) == "Branch"]
    nodes = [el for el in tree.iter() if localname(el.tag) == "Node"]
    stage = json.loads(files["stage_json"].read_text(encoding="utf-8-sig"))
    if not isinstance(stage, list):
        raise SystemExit("GLRD stage root is not expected top-level array")
    names = [child_text(b, "Branchname") for b in branches]
    if len(branches) != manifest["expectedXmlBranches"] or len(nodes) != manifest["expectedXmlNodes"] or len(stage) != manifest["expectedStagedArrayCount"]:
        raise SystemExit("GLRD source topology/census mismatch: "
                         + str((len(branches), len(nodes), len(stage))))
    if len(set(names)) != len(names) or any(not name for name in names):
        raise SystemExit("GLRD branch names missing/duplicated")
    for audited_name in manifest.get("expectedAuditBranches", []):
        if audited_name not in names:
            raise SystemExit("Selected 30-row GLRD audit branch missing: " + audited_name)
    audit_matrix = json.loads(Path("engineering/b313/glrd-psi02-factor-groups.json").read_text(encoding="utf-8"))
    if audit_matrix.get("sourceXmlSha256") != next(x["sha256"] for x in checks if x["role"]=="xml"):
        raise SystemExit("GLRD audit group matrix is stale relative to source XML")
    audit_rows = audit_matrix["rows"]
    if len(audit_rows) != len(names):
        raise SystemExit("GLRD audit group count differs from pinned XML")
    for index,(name,row) in enumerate(zip(names,audit_rows)):
        if row["branchName"] != name or row["sourceOrdinal"] != index:
            raise SystemExit("GLRD audit row mapping/order mismatch at "+str(index))
        if row.get("qualifiedForPull") is not False or row.get("manufacturingRoute") is not None:
            raise SystemExit("GLRD source-only group has been promoted without engineering evidence")
    counts = {g["id"]:sum(r["auditFactorGroup"]==g["id"] for r in audit_rows) for g in audit_matrix["groups"]}
    if counts != {"DSS-120":26,"LTCS-120":2,"LTCS-82":2}:
        raise SystemExit("GLRD owner-audit factor-group counts mismatch: "+str(counts))
    bm2 = ET.parse(files["historical_bm2_xml"])
    bm2_branches = [el for el in bm2.iter() if localname(el.tag) == "Branch"]
    bm2_nodes = [el for el in bm2.iter() if localname(el.tag) == "Node"]
    if len(bm2_branches) != 31 or len(bm2_nodes) != 1196:
        raise SystemExit("Historical GLRD BM2 source census changed")
    if names[0] == child_text(bm2_branches[0], "Branchname"):
        raise SystemExit("PSI-02 and BM2 model variants unexpectedly identical")

    config = {
        "status": "HOLD_EFFECTIVE_CONFIG_UNAVAILABLE_IN_THIS_RUN",
        "expectedSha256": manifest["effectiveConfig"]["expectedSha256"],
        "observedSha256": None,
        "configurationAuthority": False,
        "historicalReceiptVerified": manifest["effectiveConfig"].get("historicalReceiptVerified", False),
    }
    if args.config:
        path = Path(args.config)
        digest = sha256(path)
        if digest != config["expectedSha256"]:
            raise SystemExit("GLRD effective config does not match pinned hash: " + digest)
        config.update(status="PASS_PINNED_CONFIG_HASH", observedSha256=digest, configurationAuthority=True)
    result = {
        "schema": "glrd-b313-source-custody-report/v1",
        "sourceStatus": "PASS_PINNED_SOURCE_BYTES_CENSUS_AND_AUDIT_VARIANT",
        "inputFiles": checks,
        "census": {"branches": len(branches), "nodes": len(nodes),
                   "stagedRootEntries": len(stage), "historicalBm2Branches": 31,
                   "historicalBm2Nodes": 1196,
                   "auditAnchorsMatched": len(manifest.get("expectedAuditBranches", [])),
                   "auditFactorGroups": counts},
        "branchNames": names,
        "xmlVariant": "GLRD-1000-PSI-02.xml",
        "stageRelationshipToSelectedXml": "HOLD_NOT_PROVEN_PSI02",
        "historicalXmlVariant": "GLRD-1000-PI-01 - BM2.xml",
        "effectiveConfig": config,
        "factorQualificationStatus": "HOLD_NO_SOURCE_QUALIFIED_GLRD_S_E_W_Y",
        "realPreview30RowReplay": "NOT_RUN_EFFECTIVE_CONFIG_AND_MASTER_IMPORT_UNVERIFIED",
        "nativeCiiWallParity": "NOT_RUN_APPROVED_PULL_REQUIRED",
        "note": "Source custody is not effective Step 4, approved wall calculation, Pull or native CII output. Selected audit XML is PSI-02; original BM2 is a distinct 31-branch model."
    }
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print("GLRD pinned source integrity PASS:",
          len(branches), "branches;", len(nodes), "nodes;",
          len(stage), "staged entries;",
          "config", config["status"])
    print("Output:", output)


if __name__ == "__main__":
    main()
