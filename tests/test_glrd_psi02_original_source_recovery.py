"""Negative controls for PSI-02 original-source recovery. No project data is approved."""
import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location(
    "glrd_psi02_source_recovery",
    ROOT/"scripts/glrd-psi02-original-source-recovery.py")
module=importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def row(c,k="",y="",v=""):
    return {
      "C":{"coordinate":"C9","value":c},
      "K":{"coordinate":"K9","value":k},
      "Y":{"coordinate":"Y9","value":y},
      "V":{"coordinate":"V9","value":v},
    }


class RecoveryTests(unittest.TestCase):
    def test_p_pipe_unique_numeric_sequence_candidate_but_not_B(self):
        cells={9:row("4110001","11000","120","93833")}
        p=module.candidate_for_line("P4110001",cells)
        self.assertEqual(len(p),1)
        self.assertEqual(p[0]["method"],"P_ONLY_NUMERIC_ALIAS")
        self.assertEqual(p[0]["KWorkingPressureCandidate"],"11000")
        self.assertEqual(p[0]["WDesignPressureCandidateValue"],"")
        self.assertEqual(p[0]["Y9ProfileTemperatureCandidate"],"120")
        self.assertEqual(p[0]["authority"],
                         "HISTORICAL_BM2_UNQUALIFIED_CANDIDATE_ONLY")
        self.assertEqual(module.candidate_for_line("B4110001",cells),[])
        self.assertEqual(module.candidate_for_line("XP4110001",cells),[])
        self.assertEqual(module.candidate_for_line("P4110002",cells),[])

    def test_exact_precedence_and_duplicate_ambiguity(self):
        cells={
          9:row("4110001","11000","120","93833"),
          10:row("P4110001","13001","120","93833"),
        }
        candidates=module.candidate_for_line("P4110001",cells)
        self.assertEqual(len(candidates),1)
        self.assertEqual(candidates[0]["method"],"EXACT")
        self.assertEqual(candidates[0]["worksheetRow"],10)
        cells[11]=row("P4110001","9999","120","93833")
        self.assertEqual(len(module.candidate_for_line("P4110001",cells)),2)
        self.assertEqual(len(module.candidate_for_line("B4110001",cells)),0)

    def test_unrelated_from_to_or_partial_digits_are_never_line_receipts(self):
        cells={
          9:{"C":{"coordinate":"C9","value":"41100010"},
             "D":{"coordinate":"D9","value":"P4110001"},
             "K":{"coordinate":"K9","value":"11000"},
             "Y":{"coordinate":"Y9","value":"120"}},
          10:row(" 4110001 OTHER ","13001","120","93833"),
        }
        self.assertEqual(module.candidate_for_line("P4110001",cells),[])

    def test_b313_factors_cannot_be_approved_by_screening_or_empty_rules(self):
        master=json.loads((ROOT/"docs/Masters/b313-material-factor-master.json").read_text())
        rules=json.loads((ROOT/"docs/Masters/b313-code-factor-rules.json").read_text())
        res=module.factor_census(master,rules)
        self.assertEqual(res["SApprovedRecordCount"],0)
        self.assertEqual(res["E_W_YApprovedRuleCount"],0)
        self.assertFalse(res["factorReleaseEligible"])

    def test_worksheet_cell_provenance_and_stacked_headers(self):
        workbook_xml=(
         '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
         'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
         '<sheets><sheet name="Linelist" sheetId="3" r:id="rId3"/></sheets></workbook>')
        rel_xml=(
         '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
         '<Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>')
        rows={
          5:{"K":"DESIGN CONDITIONS","Y":"DESIGN CONDITIONS"},
          6:{"K":"Pressure Max","Y":"Temp. Max"},
          7:{"K":"kPa(g)","Y":"ºC"},
          9:{"C":"4110001","K":"11000","Y":"120","V":"93833"},
        }
        def cell(col,num,value):
            return ('<c r="'+col+str(num)+'" t="inlineStr"><is><t>'+
                    value+'</t></is></c>')
        row_elems=[]
        for num,cols in rows.items():
            row_elems.append('<row r="'+str(num)+'">'+
              ''.join(cell(k,num,v) for k,v in cols.items())+'</row>')
        sheet_xml=(
          '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
          '<sheetData>'+''.join(row_elems)+'</sheetData></worksheet>')
        with tempfile.TemporaryDirectory() as temp:
            path=Path(temp)/"sample.xlsx"
            with ZipFile(path,"w") as out:
                out.writestr("xl/workbook.xml",workbook_xml)
                out.writestr("xl/_rels/workbook.xml.rels",rel_xml)
                out.writestr("xl/worksheets/sheet3.xml",sheet_xml)
            result=module.workbook_sheet_rows(path)
        self.assertEqual(result["workbookSheet"],"Linelist")
        self.assertEqual(result["rows"][9]["C"]["value"],"4110001")
        self.assertEqual(result["rows"][9]["K"]["value"],"11000")
        self.assertEqual(result["headerByColumn"]["K"][1]["text"],"Pressure Max")
        self.assertEqual(result["headerByColumn"]["K"][2]["text"],"kPa(g)")
        self.assertEqual(result["headerByColumn"]["Y"][2]["text"],"ºC")


if __name__=="__main__":
    unittest.main()
