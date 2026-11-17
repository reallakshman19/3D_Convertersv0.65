#!/usr/bin/env python3
"""Deliberate negative controls for GLRD physical-source and native CII proof."""
import importlib.util,hashlib,json,tempfile,unittest
from pathlib import Path
from openpyxl import Workbook

def load(path,name):
    spec=importlib.util.spec_from_file_location(name,path)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

SRC=load('scripts/glrd-r3-source-ledger.py','glrd_source_ledger')
CII=load('scripts/glrd-r3-cii-parity-oracle.py','glrd_cii_parity')

class SourceReceiptTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.book=self.root/'linelist.xlsx'
        wb=Workbook();ws=wb.active;ws.title='Linelist'
        ws['A1']='Line Key';ws['B1']='Pressure Max kPa(g)';ws['C1']='T1 (°C)'
        ws['A2']='P4110001';ws['B2']=13001;ws['C2']=120
        wb.save(self.book)
        self.rows=[{'branchName':'/GLRD/B1','lineKey':'P4110001'}]
        self.record={'sourceOrdinal':0,'branchName':'/GLRD/B1','lineKey':'P4110001',
          'lineCell':'A2','p1Cell':'B2','p1HeaderCell':'B1',
          't1Cell':'C2','t1HeaderCell':'C1','p1':13001,'p1Unit':'KPA','pressureBasis':'GAUGE','t1C':120}
        self.receipt={'schema':'glrd-psi02-line-receipt/v1','sourceXmlSha256':'TEST_XML_SHA',
           'workbookSha256':SRC.digest(self.book),'worksheet':'Linelist','rows':[self.record]}
    def tearDown(self):self.tmp.cleanup()
    def valid(self):
        return SRC.source_receipts(self.receipt,self.rows,'TEST_XML_SHA',self.book)
    def reject(self,token):
        with self.assertRaisesRegex(ValueError,token):self.valid()
    def test_positive_exact_cells(self):
        o=self.valid();self.assertEqual(o[0]['p1'],13001);self.assertEqual(o[0]['t1C'],120)
    def test_wrong_sheet(self):
        self.receipt['worksheet']='Coversheet';self.reject('WORKSHEET')
    def test_wrong_line_key(self):
        self.record['lineKey']='P4119999';self.reject('PHYSICAL_LINE')
    def test_fake_pressure_value(self):
        self.record['p1']=701.3;self.reject('DIFFERS_FROM_WORKBOOK')
    def test_no_unit_header(self):
        wb=Workbook();ws=wb.active;ws.title='Linelist'
        ws['A2']='P4110001';ws['B1']='Pressure Max';ws['B2']=13001
        ws['C1']='T1 (°C)';ws['C2']=120;wb.save(self.book)
        self.receipt['workbookSha256']=SRC.digest(self.book)
        self.reject('UNIT')
    def test_hydro_not_design(self):
        wb=Workbook();ws=wb.active;ws.title='Linelist'
        ws['A2']='P4110001';ws['B1']='Hydro Test Pressure kPa';ws['B2']=22905
        ws['C1']='T1 (°C)';ws['C2']=120;wb.save(self.book)
        self.receipt['workbookSha256']=SRC.digest(self.book)
        self.reject('DESIGN_P1')
    def test_cross_row_pressure_from_neighboring_line(self):
        self.record['p1Cell']='B3'
        self.reject('CROSS_ROW')
    def test_wrong_pressure_header_column(self):
        self.record['p1HeaderCell']='D1'
        self.reject('HEADER_NOT_BOUND')
    def test_pressure_basis_misrepresented(self):
        self.record['pressureBasis']='ABSOLUTE'
        self.reject('PRESSURE_BASIS')
    def test_wrong_workbook_hash(self):
        self.receipt['workbookSha256']='0'*64;self.reject('WORKBOOK_SHA')
    def test_duplicate_physical_occurrence(self):
        self.receipt['rows']=[self.record,dict(self.record)]
        self.reject('DUPLICATE_OCCURRENCE')

def element(wall,ident='100 110 0 0 0 168.3',other='5'):
    return [ident,f'{wall} 2 3 4 5 6']+[f'FIELD_{i}:{other}' for i in range(13)]
class NativeCiiOracleTests(unittest.TestCase):
    def setUp(self):
        self.a=[element('7.112'),element('12.700','200 210 0 0 0 168.3')]
        self.b=[element('9.500'),element('12.700','200 210')]
        self.approved=[{'elementOrdinal':1,'approvalReference':'ENG-REF-01',
          'physicalOccurrenceKey':'0|/GLRD/B1|100','baselineElementHeader':'100 110 0 0 0 168.3',
          'ciiFromNode':100,'ciiToNode':110,'sourceNodeNumber':100,
          'acceptedWallMm':9.5}]
    def reject(self,token):
        with self.assertRaisesRegex(ValueError,token):CII.compare(self.a,self.b,self.approved)
    def test_positive_one_approved_change(self):
        d=CII.compare(self.a,self.b,self.approved)
        self.assertEqual(d['changedWallFields'],1)
        self.assertEqual(d['unrelatedFieldChanges'],0)
    def test_unapproved_element_change(self):
        self.b[1]=element('13.000','200 210 0 0 0 168.3')
        self.reject('UNAPPROVED_ELEMENT')
    def test_wrong_emitted_thickness(self):
        self.b[0]=element('9.400');self.reject('DOES_NOT_MATCH')
    def test_unrelated_field_change(self):
        self.b[0][4]='DIFFERENT';self.reject('UNRELATED_CII_FIELD')
    def test_swapped_lineage(self):
        self.approved[0]['baselineElementHeader']='999 888';self.reject('LINEAGE')
    def test_duplicate_approval(self):
        self.approved.append(dict(self.approved[0]));self.reject('DUPLICATE')
    def test_wrong_native_owner_node(self):
        self.approved[0]['sourceNodeNumber']=110
        self.reject('SOURCE_FROM_NODE')
    def test_wrong_native_to_node(self):
        self.approved[0]['ciiToNode']=999
        self.reject('SOURCE_FROM_NODE')
    def test_missing_approval_reference(self):
        self.approved[0]['approvalReference']='';self.reject('APPROVAL')
    def test_unapproved_no_selection(self):
        self.approved=[];self.reject('UNAPPROVED_ELEMENT')

if __name__=='__main__':unittest.main(verbosity=2)
