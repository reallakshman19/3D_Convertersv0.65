#!/usr/bin/env python3
"""Synthetic physical-wall-to-native-CII writer parity on pinned GLRD PSI-02.

This tests CII serialization only. It does NOT calculate/approve B31.3 walls
or simulate a production-approved Pull; those require exact run configuration
and qualified factor source records.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET


def localname(tag):
    return tag.split("}", 1)[-1] if "}" in tag else tag


def child(element, name):
    return next((x for x in element if localname(x.tag) == name), None)


def element_blocks(contents):
    marker = "#$ ELEMENTS\n"
    if marker not in contents:
        raise ValueError("Native CII ELEMENTS section absent")
    segment = contents.split(marker, 1)[1].split("#$ AUX_DATA", 1)[0]
    lines = [x for x in segment.splitlines() if x.strip()]
    if not lines or len(lines) % 15:
        raise ValueError("Native CII element record width is not 15 lines")
    return [lines[n:n+15] for n in range(0, len(lines), 15)]


def run_converter(converter, input_xml, output_cii):
    proc = subprocess.run([sys.executable, str(converter),
        "--input", str(input_xml), "--output", str(output_cii),
        "--coords-mode", "none"], text=True, capture_output=True, timeout=240)
    if proc.returncode:
        raise RuntimeError(f"Native patched converter failed ({proc.returncode}): "
                           + proc.stdout[-1500:] + "\n" + proc.stderr[-2200:])
    return output_cii.read_text(encoding="utf-8")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--xml", default=".cache/glrd-b313-source/GLRD-1000-PSI-02.xml")
    parser.add_argument("--output", default="out/glrd-b313-synthetic-native-wall-parity.json")
    args = parser.parse_args()
    src = Path(args.xml)
    if not src.is_file():
        raise SystemExit("Authentic PSI-02 XML not available; run source custody first")
    converter = Path("converters/scripts/xml_to_cii2019_patched.py")
    original_bytes = src.read_bytes()
    expected_sha = "164163380dccffb8f9d6bd7853eabd36eea89e508da2215443e81969144d4a45"
    if hashlib.sha256(original_bytes).hexdigest() != expected_sha:
        raise SystemExit("Refuse native parity test on unpinned XML")

    ET.register_namespace("", "http://aveva.com/pipeStress116.xsd")
    tree = ET.parse(src)
    selected = None
    for branch in tree.iter():
        if localname(branch.tag) != "Branch":
            continue
        name = child(branch, "Branchname")
        nodes = [n for n in branch if localname(n.tag) == "Node"]
        eligible = [n for n in nodes
                    if (child(n, "ComponentType") is not None
                        and (child(n, "ComponentType").text or "").strip().upper()
                            in {"PIPE", "PCOM", "BRAN", "TUBE"})
                    and child(n, "WallThickness") is not None
                    and child(n, "OutsideDiameter") is not None]
        if len(eligible) >= 2:
            selected = (name.text if name is not None else "", eligible)
            break
    if not selected:
        raise SystemExit("No eligible pipe source nodes for synthetic CII test")

    synthetic_mm = 9.8765
    for node in selected[1]:
        child(node, "WallThickness").text = str(synthetic_mm)

    with tempfile.TemporaryDirectory(prefix="glrd-cii-parity-") as td:
        root = Path(td)
        altered_xml = root / "PSI02_SYNTHETIC_WALL_ONLY.xml"
        tree.write(altered_xml, encoding="utf-8", xml_declaration=True)
        original_cii = run_converter(converter, src, root / "PSI02_BEFORE.cii")
        modified_cii = run_converter(converter, altered_xml, root / "PSI02_SYNTHETIC_AFTER.cii")
    a, b = element_blocks(original_cii), element_blocks(modified_cii)
    if len(a) != len(b):
        raise SystemExit("Native CII element count changed due to synthetic wall input")
    diffs = 0
    for i,(before,after) in enumerate(zip(a,b)):
        if before[0] != after[0] or before[2:] != after[2:]:
            raise SystemExit(f"Non-wall CII element field changed at element #{i+1}")
        old_line, new_line = before[1].split(), after[1].split()
        if len(old_line) != 6 or len(new_line) != 6:
            raise SystemExit("Unexpected native CII second element record")
        if old_line[1:] != new_line[1:]:
            raise SystemExit(f"Non-wall CII second-record column changed at element #{i+1}")
        if old_line[0] != new_line[0]:
            if abs(float(new_line[0])-synthetic_mm) > 1e-6:
                raise SystemExit(f"Emitted CII wall disagrees with synthetic modified XML at element #{i+1}")
            diffs += 1
    if not diffs:
        raise SystemExit("Native CII did not emit any synthetic changed wall; parity FAIL")
    report = {
        "schema": "glrd-b313-synthetic-native-wall-parity/v1",
        "sourceXmlSha256": expected_sha, "sourceBranch": selected[0],
        "syntheticInputWallMm": synthetic_mm,
        "syntheticNodesEdited": len(selected[1]),
        "elementsEmitted": len(a), "elementWallFieldsChanged": diffs,
        "unrelatedElementFieldChanges": 0,
        "writerStatus": "PASS_TEST_ONLY_NATIVE_CII_WALL_FIELD_PARITY",
        "engineeringStatus": "NOT_APPROVED_MANUAL_TEST_WALL_ONLY",
        "realOwnerPullParity": "HOLD_NO_QUALIFIED_S_E_W_Y_AND_EFFECTIVE_CONFIG",
        "note": "This witness verifies patched native writer input-to-field mapping, not production pressure design."
    }
    output = Path(args.output);output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2)+"\n", encoding="utf-8")
    print("Native patched CII synthetic wall parity PASS:",
          len(a), "ELEMENTs", diffs, "wall fields changed; other fields unchanged")
    print("Output:", output)


if __name__ == "__main__":
    main()
