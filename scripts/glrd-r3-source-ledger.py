#!/usr/bin/env python3
"""Independent GLRD PSI-02 source-to-design-input ledger. Never fabricates missing P1/T1."""
import argparse,csv,hashlib,json,re,xml.etree.ElementTree as ET
from pathlib import Path

def digest(path):
    h=hashlib.sha256()
    with open(path,'rb') as f:
        for block in iter(lambda:f.read(1<<20),b''):h.update(block)
    return h.hexdigest()

def child_text(e,key):
    return next(((v.text or '').strip() for v in e if v.tag.split('}')[-1].lower()==key.lower()),'')

def source_receipts(receipt,rows,xml_sha,workbook):
    """Check exact worksheet, cells, design-pressure header/units, and numerical source bytes."""
    from openpyxl import load_workbook
    from openpyxl.utils.cell import coordinate_from_string
    if receipt.get('schema')!='glrd-psi02-line-receipt/v1' or receipt.get('sourceXmlSha256')!=xml_sha:
        raise ValueError('RECEIPT_XML_OR_SCHEMA_WRONG')
    if receipt.get('workbookSha256')!=digest(workbook):
        raise ValueError('RECEIPT_WORKBOOK_SHA_WRONG')
    name=receipt.get('worksheet')
    if not name:raise ValueError('WORKSHEET_NOT_DECLARED')
    wb=load_workbook(workbook,read_only=True,data_only=True)
    try:
        if name not in wb.sheetnames:raise ValueError('WORKSHEET_NOT_PRESENT')
        ws=wb[name];seen=set();result={}
        for rec in receipt.get('rows',[]):
            i=rec.get('sourceOrdinal')
            if type(i) is not int or i<0 or i>=len(rows) or i in seen:raise ValueError('BAD_OR_DUPLICATE_OCCURRENCE')
            seen.add(i)
            if rec.get('branchName')!=rows[i]['branchName'] or rec.get('lineKey')!=rows[i]['lineKey']:
                raise ValueError('WRONG_PHYSICAL_LINE_IDENTITY')
            keys=('lineCell','p1Cell','p1HeaderCell','t1Cell','t1HeaderCell')
            cells=[rec.get(k) for k in keys]
            if any(not isinstance(c,str) or not re.fullmatch(r'[A-Z]{1,3}[1-9]\d*',c) for c in cells) or len(set(cells))!=len(cells):
                raise ValueError('MISSING_OR_DUPLICATE_SOURCE_CELL')
            # An exact line-key cell does NOT authorize taking P1/T1 from a
            # different physical workbook row or from unrelated header columns.
            line_col,line_row=coordinate_from_string(rec['lineCell'])
            p_col,p_row=coordinate_from_string(rec['p1Cell'])
            t_col,t_row=coordinate_from_string(rec['t1Cell'])
            ph_col,ph_row=coordinate_from_string(rec['p1HeaderCell'])
            th_col,th_row=coordinate_from_string(rec['t1HeaderCell'])
            if line_row != p_row or line_row != t_row:
                raise ValueError('CROSS_ROW_PROCESS_DATA_SUBSTITUTION')
            if ph_col != p_col or th_col != t_col or ph_row >= p_row or th_row >= t_row:
                raise ValueError('HEADER_NOT_BOUND_TO_SOURCE_VALUE_COLUMN')
            if p_col == t_col or p_col == line_col or t_col == line_col:
                raise ValueError('SOURCE_LINE_PRESSURE_TEMPERATURE_COLUMN_COLLISION')
            def cell(key):
                raw=ws[rec[key]].value
                return str(raw if raw is not None else '').strip()
            if cell('lineCell').upper()!=rows[i]['lineKey'].upper():
                raise ValueError('SOURCE_WORKBOOK_LINE_KEY_NOT_EXACT')
            p_header=cell('p1HeaderCell').upper()
            if not re.search(r'\b(P1|DESIGN\s+PRESSURE|MAX(?:IMUM)?\s+PRESSURE|PRESSURE\s+MAX)\b',p_header):
                raise ValueError('PRESSURE_HEADER_NOT_DESIGN_P1')
            if re.search(r'HYDRO|TEST|OPERATING|PROOF',p_header):
                raise ValueError('PRESSURE_HEADER_IS_HYDRO_OR_OPERATING')
            found=re.findall(r'KPA|MPA|PSIA|PSIG|PSI|BARG|BAR(?:\s*\(G\))?',p_header)
            found={f.replace(' ','').replace('(G)','G').replace('PSIA','PSI').replace('PSIG','PSI') for f in found}
            if len(found)!=1 or next(iter(found))!=str(rec.get('p1Unit','')).upper():
                raise ValueError('P1_UNIT_NOT_EXACT_HEADER_UNIT')
            t_header=cell('t1HeaderCell').upper()
            if not re.search(r'\b(T1|DESIGN\s+TEMP(?:ERATURE)?|TEMP(?:ERATURE)?\s+DESIGN)\b',t_header):
                raise ValueError('NOT_A_DESIGN_T1_HEADER')
            if not re.search(r'\bC\b|CELSIUS|°C',t_header):
                raise ValueError('T1_TEMPERATURE_UNIT_UNRESOLVED')
            try:p1=float(cell('p1Cell'));t1=float(cell('t1Cell'))
            except ValueError:raise ValueError('NON_NUMERIC_P1_OR_T1')
            if not 0<p1<1e12 or not -273.15<t1<2000:raise ValueError('PHYSICAL_P1_T1_RANGE_FAILURE')
            try:agree=abs(float(rec.get('p1'))-p1)<1e-8 and abs(float(rec.get('t1C'))-t1)<1e-8
            except (TypeError,ValueError):agree=False
            if not agree:raise ValueError('SOURCE_RECEIPT_DIFFERS_FROM_WORKBOOK')
            # Gauge-vs-absolute pressure is part of the source authority.
            # It must not be guessed from the numerical P1 magnitude.
            gauge=bool(re.search(r'\(G\)|\bGAUGE\b|\bPSIG\b|\bBARG\b',p_header))
            absolute=bool(re.search(r'\(A\)|\bABS(?:OLUTE)?\b|\bPSIA\b',p_header))
            if gauge == absolute:
                raise ValueError('P1_GAUGE_ABSOLUTE_SOURCE_UNRESOLVED')
            if rec.get('pressureBasis') != ('GAUGE' if gauge else 'ABSOLUTE'):
                raise ValueError('P1_PRESSURE_BASIS_RECEIPT_MISMATCH')
            result[i]={'p1':p1,'p1Unit':next(iter(found)),'pressureBasis':rec['pressureBasis'],'t1C':t1,'worksheet':name,
                       'lineCell':rec['lineCell'],'p1Cell':rec['p1Cell'],'t1Cell':rec['t1Cell']}
        return result
    finally:wb.close()

def produce(manifest_file,matrix_file,source_dir,out_dir,line_receipt=None,line_master=None):
    manifest=json.loads(Path(manifest_file).read_text())
    matrix=json.loads(Path(matrix_file).read_text())
    paths={e['role']:Path(source_dir)/Path(e['path']).name for e in manifest['files']}
    for e in manifest['files']:
        f=paths[e['role']]
        if not f.is_file() or f.stat().st_size!=e['bytes'] or digest(f)!=e['sha256']:
            raise ValueError('PINNED_SOURCE_CUSTODY_FAIL_'+e['role'])
    source_xml_sha=digest(paths['xml'])
    if source_xml_sha!=matrix.get('sourceXmlSha256'):raise ValueError('SOURCE_MATRIX_SHA_MISMATCH')
    tree=ET.parse(paths['xml'])
    branches=[e for e in tree.iter() if e.tag.split('}')[-1]=='Branch']
    nodes=[e for e in tree.iter() if e.tag.split('}')[-1]=='Node']
    if len(branches)!=30 or len(nodes)!=1224 or len(matrix.get('rows',[]))!=30:
        raise ValueError('WRONG_XML_MODEL_VARIANT')
    rows=[]
    for i,(branch,expected) in enumerate(zip(branches,matrix['rows'])):
        name=child_text(branch,'Branchname')
        if not name or expected.get('sourceOrdinal')!=i or expected.get('branchName')!=name:
            raise ValueError('XML_BRANCH_IDENTITY_OR_ORDER_MISMATCH')
        line_key=expected.get('lineKey')
        if not line_key:raise ValueError('SOURCE_LINE_KEY_MISSING')
        rows.append({'sourceOrdinal':i,'branchName':name,'lineKey':line_key,
          'sourceXmlSha256':source_xml_sha,'ownerAuditFactorGroup':expected.get('auditFactorGroup'),
          'p1':None,'p1Unit':None,'p1PressureBasis':None,'t1C':None,'selectedWorksheet':None,'lineListSourceCell':None,
          'processEvidenceStatus':'HOLD_LINE_LIST_RECEIPT_NOT_PROVIDED',
          'b313AuthorityStatus':'HOLD_PRODUCT_ROUTE_AND_S_E_W_Y_UNQUALIFIED',
          'acceptedPull':False,'finalWallMm':None,'nativeCiiVerified':False})
    receipts={}
    if line_receipt:
        if not line_master:raise ValueError('LINE_MASTER_PATH_REQUIRED')
        receipts=source_receipts(json.loads(Path(line_receipt).read_text()),rows,source_xml_sha,line_master)
    for i,e in receipts.items():
        rows[i].update(p1=e['p1'],p1Unit=e['p1Unit'],p1PressureBasis=e['pressureBasis'],t1C=e['t1C'],selectedWorksheet=e['worksheet'],
          lineListSourceCell=e['lineCell'],
          processEvidenceStatus='EXACT_WORKBOOK_CELLS_MATCH_NOT_ENGINEERING_APPROVAL')
    summary={'schema':'glrd-psi02-source-to-cii-physical-ledger/v1',
       'sourceStatus':'PASS_PINNED_PSI02_XML_AND_LINEAGE',
       'sourceXmlSha256':source_xml_sha,'physicalOccurrences':30,
       'distinctLineKeys':len({r['lineKey'] for r in rows}),
       'rowsWithIndependentlyVerifiedSourceCells':len(receipts),
       'rowsWithLineListHold':30-len(receipts),
       'stageApplicability':'HOLD_BM2_NAMED_STAGE_NOT_PROVEN_FOR_PSI02',
       'effectiveConfigStatus':'HOLD_EFFECTIVE_PSI02_CONFIG_NOT_SUPPLIED',
       'engineeringBasis':'HOLD_QUALIFIED_S_E_W_Y_AND_MANUFACTURING_ROUTE',
       'nativeApprovedPullCiiParity':'HOLD_NO_APPROVED_PULL_PROVIDED',
       'sourceToCiiAcceptance':'FAIL_CLOSED_NOT_30_DESIGN_VERIFIED'}
    out=Path(out_dir);out.mkdir(parents=True,exist_ok=True)
    (out/'physical-source-ledger.json').write_text(json.dumps({'summary':summary,'rows':rows},indent=2)+'\n')
    with (out/'physical-source-ledger.csv').open('w',newline='',encoding='utf-8') as f:
        writer=csv.DictWriter(f,fieldnames=list(rows[0]));writer.writeheader();writer.writerows(rows)
    (out/'source-to-cii-acceptance.json').write_text(json.dumps(summary,indent=2)+'\n')
    return summary

def main():
    a=argparse.ArgumentParser()
    a.add_argument('--manifest',default='engineering/b313/glrd-pinned-source-manifest.json')
    a.add_argument('--matrix',default='engineering/b313/glrd-psi02-factor-groups.json')
    a.add_argument('--source-dir',default='.cache/glrd-b313-source')
    a.add_argument('--out-dir',default='out/glrd-r3-source-to-cii')
    a.add_argument('--line-receipt');a.add_argument('--line-master')
    opts=a.parse_args()
    print(json.dumps(produce(opts.manifest,opts.matrix,opts.source_dir,opts.out_dir,opts.line_receipt,opts.line_master),indent=2))

if __name__=='__main__':main()
