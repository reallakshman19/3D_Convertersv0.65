#!/usr/bin/env python3
"""Read-only metadata census of the pinned GLRD Line List XLSX.

Uses only Python standard library ZIP/XML. No design values are saved,
changed, approved or substituted. Results are source investigation only.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path
from urllib.parse import unquote
import zipfile
import xml.etree.ElementTree as ET

NS={'x':'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
    'p':'http://schemas.openxmlformats.org/package/2006/relationships'}
NSR='{'+NS['r']+'}id'
LINE=re.compile(r'(?<![A-Z0-9])(?:P|B)411\d{4}(?![A-Z0-9])',re.I)


def sheet_inventory(filename, expected_line_keys):
    f=Path(filename)
    with zipfile.ZipFile(f) as archive:
        workbook=ET.fromstring(archive.read('xl/workbook.xml'))
        rels=ET.fromstring(archive.read('xl/_rels/workbook.xml.rels'))
        targets={x.attrib['Id']:x.attrib['Target'] for x in rels}
        shared=[]
        if 'xl/sharedStrings.xml' in archive.namelist():
            strings=ET.fromstring(archive.read('xl/sharedStrings.xml'))
            for si in strings.findall('x:si',NS):
                shared.append(''.join(t.text or '' for t in si.iter('{'+NS['x']+'}t')))
        results=[]
        for sheet in workbook.findall('x:sheets/x:sheet',NS):
            name=sheet.attrib['name']
            target=targets[sheet.attrib[NSR]].lstrip('/')
            if not target.startswith('xl/'): target='xl/'+target
            if '/..' in target: raise ValueError('unsafe worksheet relationship target')
            root=ET.fromstring(archive.read(target))
            rows=root.findall('x:sheetData/x:row',NS)
            seen=set()
            for row in rows:
                for cell in row.findall('x:c',NS):
                    value=cell.find('x:v',NS)
                    if value is None:
                        inline=cell.find('x:is',NS)
                        value=''.join(t.text or '' for t in inline.iter('{'+NS['x']+'}t')) if inline is not None else ''
                    elif cell.attrib.get('t')=='s':
                        idx=int(value.text or -1)
                        value=shared[idx] if 0<=idx<len(shared) else ''
                    else: value=value.text or ''
                    seen.update(k.upper() for k in LINE.findall(str(value)))
            results.append({'name':name,'populatedSheetRows':len(rows),
                            'candidatePhysicalLineKeys':sorted(seen & expected_line_keys),
                            'candidatePhysicalLineKeyCount':len(seen & expected_line_keys),
                            'evidenceType':'UNSTRUCTURED_CELL_STRING_MATCH_NOT_LINE_LIST_MAPPING'})
        names=[r['name'] for r in results]
        exact=next((n for n in names if n.strip().lower()=='linelist'),None)
        return {'schema':'glrd-b313-linelist-workbook-census/v1',
                'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),
                'worksheetNames':names,'worksheets':results,
                'preferredNamedWorksheet':exact,
                'preferredWorksheetRequiresManualVerification':True,
                'effectiveBrowserWorksheetNotKnown':True,
                'engineeringAuthority':'READ_ONLY_SOURCE_INVESTIGATION_NOT_P1_T1_AUTHORITY'}


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--input',default='.cache/glrd-b313-source/LL_BM2.xlsx')
    parser.add_argument('--matrix',default='engineering/b313/glrd-psi02-factor-groups.json')
    parser.add_argument('--output',default='out/glrd-b313-linelist-workbook-census.json')
    args=parser.parse_args()
    matrix=json.loads(Path(args.matrix).read_text())
    if matrix.get('expectedBranches')!=30: raise SystemExit('GLRD source-ordered audit expected 30 physical branches')
    expected={r['lineKey'] for r in matrix['rows']}
    inventory=sheet_inventory(args.input,expected)
    target=Path(args.output);target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(inventory,indent=2)+'\n')
    print('GLRD pinned Line List XLSX source worksheet inventory:')
    for s in inventory['worksheets']:
        print(f"  {s['name']}: {s['populatedSheetRows']} populated sheet rows, {s['candidatePhysicalLineKeyCount']}/{len(expected)} candidate distinct GLRD physical line keys")
    print('Named Linelist available:',bool(inventory['preferredNamedWorksheet']))
    print('No browser active-sheet inference or process-design approval performed.')
    print('Report:',target)


if __name__=='__main__': main()
