#!/usr/bin/env python3
"""Independent native CII wall-field comparator for exact, approved physical occurrences.

This DOES NOT invent design approvals or infer a node-to-element mapping.
Only a separate controlled acceptance receipt can bind XML node+CI I element.
"""
import argparse,hashlib,json,xml.etree.ElementTree as ET
from pathlib import Path

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def child(e,key):
    return next(((x.text or '').strip() for x in e if x.tag.split('}')[-1].lower()==key.lower()),'')
def element_blocks(text):
    marker='#$ ELEMENTS\n'
    if marker not in text:raise ValueError('CII_ELEMENTS_SECTION_ABSENT')
    section=text.split(marker,1)[1].split('#$ AUX_DATA',1)[0]
    lines=[line.strip() for line in section.splitlines() if line.strip()]
    if not lines or len(lines)%15:raise ValueError('INVALID_CII_ELEMENT_RECORD_WIDTH')
    return [lines[i:i+15] for i in range(0,len(lines),15)]

def compare(before,after,approved):
    if len(before)!=len(after):raise ValueError('ELEMENT_COUNT_CHANGED')
    selected={}
    for r in approved:
        i=r.get('elementOrdinal')
        if type(i) is not int or i<1 or i>len(before) or i in selected:
            raise ValueError('BAD_OR_DUPLICATE_APPROVED_ELEMENT')
        if not r.get('approvalReference') or not r.get('physicalOccurrenceKey'):
            raise ValueError('APPROVAL_AND_PHYSICAL_KEY_REQUIRED')
        # The native CII geometry line is FROM TO DX DY DZ OD.
        # The emitted wall lives on line two and belongs to the FROM node.
        # A receipt that names only an element index can swap physical owners.
        tokens=before[i-1][0].split()
        if len(tokens)!=6:
            raise ValueError('BAD_NATIVE_CII_GEOMETRY_ROW')
        try:
            cii_from=int(float(tokens[0]));cii_to=int(float(tokens[1]))
        except ValueError:
            raise ValueError('NATIVE_CII_FROM_TO_NOT_NUMERIC')
        if (r.get('ciiFromNode')!=cii_from or r.get('ciiToNode')!=cii_to or
            str(r.get('sourceNodeNumber'))!=str(cii_from)):
            raise ValueError('SOURCE_FROM_NODE_TO_EMITTED_CII_OWNER_MISMATCH')
        if r.get('baselineElementHeader')!=before[i-1][0]:
            raise ValueError('BASELINE_ELEMENT_LINEAGE_NOT_PROVEN')
        selected[i]=r
    changes=0
    for i,(a,b) in enumerate(zip(before,after),1):
        if len(a)!=15 or len(b)!=15 or a[0]!=b[0] or a[2:]!=b[2:]:
            raise ValueError('UNRELATED_CII_FIELD_MODIFIED_AT_ELEMENT_'+str(i))
        av=a[1].split();bv=b[1].split()
        if len(av)!=6 or len(bv)!=6 or av[1:]!=bv[1:]:
            raise ValueError('UNRELATED_CII_WALL_RECORD_COLUMN_CHANGED_'+str(i))
        altered=av[0]!=bv[0]
        if i not in selected and altered:raise ValueError('UNAPPROVED_ELEMENT_WALL_CHANGE_'+str(i))
        if i in selected:
            expected=selected[i].get('acceptedWallMm')
            if type(expected) not in (int,float) or not 0<expected<500:
                raise ValueError('INVALID_APPROVED_WALL')
            if abs(float(bv[0])-expected)>1e-5:
                raise ValueError('APPROVED_WALL_DOES_NOT_MATCH_EMITTED_CII_'+str(i))
            if altered:changes+=1
    return {'elements':len(before),'acceptedPhysicalElements':len(selected),
            'changedWallFields':changes,'unapprovedWallChanges':0,'unrelatedFieldChanges':0}

def verified_source_receipt(receipt,source_xml,enriched_xml,config,factor_master,code_rules):
    if receipt.get('schema')!='glrd-r3-approved-native-parity-receipt/v1':
        raise ValueError('NOT_AN_APPROVED_CII_RECEIPT')
    for k,f in [('sourceXmlSha256',source_xml),('effectiveConfigSha256',config),
                ('materialFactorPackSha256',factor_master),('codeRulePackSha256',code_rules)]:
        if receipt.get(k)!=sha(f):raise ValueError('STALE_OR_WRONG_'+k.upper())
    rules=json.loads(Path(code_rules).read_text())
    if not rules.get('records'):raise ValueError('CODE_RULES_UNQUALIFIED_EMPTY')
    orig=[x for x in ET.parse(source_xml).iter() if x.tag.split('}')[-1]=='Branch']
    new=[x for x in ET.parse(enriched_xml).iter() if x.tag.split('}')[-1]=='Branch']
    if len(orig)!=len(new):raise ValueError('ENRICHED_XML_BRANCH_COUNT_MISMATCH')
    identities=[child(x,'Branchname') for x in orig]
    if identities!=[child(x,'Branchname') for x in new]:
        raise ValueError('ENRICHED_XML_BRANCH_REORDERED')
    if len(set(identities))!=len(identities):raise ValueError('SOURCE_BRANCH_DUPLICATION')
    seen=set()
    for row in receipt.get('rows',[]):
        idx=row.get('sourceOrdinal')
        if type(idx) is not int or idx<0 or idx>=len(orig):
            raise ValueError('UNKNOWN_APPROVED_BRANCH_ORDINAL')
        if row.get('branchName')!=identities[idx]:raise ValueError('WRONG_APPROVED_BRANCH_NAME')
        node_no=str(row.get('sourceNodeNumber',''))
        physical_key=f'{idx}|{identities[idx]}|{node_no}'
        if not node_no or physical_key in seen or row.get('physicalOccurrenceKey')!=physical_key:
            raise ValueError('APPROVAL_NOT_UNIQUE_PHYSICAL_NODE')
        seen.add(physical_key)
        old_nodes=[x for x in orig[idx].iter() if x.tag.split('}')[-1]=='Node' and child(x,'NodeNumber')==node_no]
        new_nodes=[x for x in new[idx].iter() if x.tag.split('}')[-1]=='Node' and child(x,'NodeNumber')==node_no]
        if len(old_nodes)!=1 or len(new_nodes)!=1:raise ValueError('NODE_LINEAGE_NOT_UNIQUE')
        wall=child(new_nodes[0],'WallThickness')
        try:matches=abs(float(wall)-float(row['acceptedWallMm']))<=1e-5
        except (TypeError,ValueError,KeyError):matches=False
        if not matches:raise ValueError('ENRICHED_XML_WALL_DIFFERS_FROM_APPROVAL')
        if not row.get('approvalReference') or not row.get('factorApprovalReference'):
            raise ValueError('SIGNED_WALL_AND_FACTOR_APPROVAL_REQUIRED')
    if not receipt.get('rows'):raise ValueError('NO_APPROVED_GL RD_PULL_RECORDS'.replace(' ',''))
    return identities

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--receipt',required=True);ap.add_argument('--source-xml',required=True)
    ap.add_argument('--enriched-xml',required=True);ap.add_argument('--cii-before',required=True)
    ap.add_argument('--cii-after',required=True);ap.add_argument('--effective-config',required=True)
    ap.add_argument('--factor-master',default='docs/Masters/b313-material-factor-master.json')
    ap.add_argument('--code-rules',default='docs/Masters/b313-code-factor-rules.json')
    ap.add_argument('--out',default='out/glrd-r3-source-to-cii/approved-native-cii-parity.json')
    a=ap.parse_args()
    receipt=json.loads(Path(a.receipt).read_text())
    verified_source_receipt(receipt,a.source_xml,a.enriched_xml,a.effective_config,a.factor_master,a.code_rules)
    before=element_blocks(Path(a.cii_before).read_text())
    after=element_blocks(Path(a.cii_after).read_text())
    result=compare(before,after,receipt['rows'])
    result.update(schema='glrd-r3-approved-native-cii-parity/v1',sourceXmlSha256=sha(a.source_xml),
                  afterCiiSha256=sha(a.cii_after),status='PASS_RECEIPT_BOUND_NATIVE_WALL_PARITY_ENGINEERING_APPROVAL_REQUIRES_SEPARATE_ATTESTATION')
    target=Path(a.out);target.parent.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(result,indent=2)+'\n')
    print(json.dumps(result,indent=2))
if __name__=='__main__':main()
