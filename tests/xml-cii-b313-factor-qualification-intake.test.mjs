import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { resolveB313DesignFactors } from '../converters/b313-material-factors/index.js';
import { resolveXmlCiiB313ClassMaterialEvidence } from '../converters/xml-cii2019-core/branch-process-resolver.js';

const source = (path) => JSON.parse(fs.readFileSync(new URL(path, import.meta.url), 'utf8'));
const manifest = source('../engineering/b313/material-factor-qualification-intake-v1.json');
const classFiles = {
  '13831': source('../docs/Masters/SpecwisePipingClass/13831.json'),
  '11472': source('../docs/Masters/SpecwisePipingClass/11472.json'),
};
test('intake is source-bound and contains every material/DN transition', () => {
  assert.equal(manifest.authority,'REVIEW_ONLY_NOT_ACTIVE_MASTER');
  assert.equal(manifest.reviewStatus,'ENGINEERING_HOLD');
  assert.equal(manifest.targetCodeEdition,'2024');
  assert.equal(manifest.qualificationCases.length,4);
  for (const [classId, file] of Object.entries(classFiles)) {
    const cases = manifest.qualificationCases.filter(x=>x.pipingClass===classId);
    const expected = file.rows.map(row=>Number(row.convertedBore)).sort((a,b)=>a-b);
    const actual = cases.flatMap(x=>x.sizeDNmm).sort((a,b)=>a-b);
    assert.deepEqual(actual,expected,'DN custody must be lossless: '+classId);
    for (const c of cases) for (const dn of c.sizeDNmm) {
      const row = file.rows.find(r=>Number(r.convertedBore)===dn);
      assert(row,'Unmapped size '+classId+' DN'+dn);
      const candidate = resolveXmlCiiB313ClassMaterialEvidence({
        pipingClass:classId,pipingClassRow:row,sizeMm:dn,
        config:{useDefaultPipingClassMaterialCodeMap:true},
      });
      assert.equal(candidate.materialCodeCorroborationCandidate,row.Material_Name,
        'Do not reuse class-wide grade at another physical size');
      if (candidate.materialCodeCorroborationCompositeSpecification) {
        assert.equal(candidate.materialCodeCorroborationNeedsReview,true);
      }
    }
  }
});
test('unapproved factor placeholders cannot become active factor data', () => {
  for (const c of manifest.qualificationCases) {
    assert.equal(c.materialIdentityVerifiedForOwnerOccurrence,false);
    assert.equal(c.qualifiesForPull,false);
    assert.equal(c.manufacturingRoute,null);
    assert.equal(c.factorRecords.length,4);
    for (const factor of c.factorRecords) {
      assert.equal(factor.value,null);
      assert.equal(factor.sourceReference,null);
      assert.equal(factor.approvalReference,null);
      assert.equal(factor.status,'SOURCE_AND_APPROVAL_REQUIRED');
    }
  }
  for (const [id,t] of [['DSS-A790-S31803',120],['LTCS-A333-6',82]]) {
    const r=resolveB313DesignFactors({
      material:{materialId:id},designTemperature:t,temperatureUnit:'C',
      manufacturingRoute:'SEAMLESS',qualificationMode:'strict',
    });
    assert.equal(r.ok,false,'No screening data may qualify '+id+' at '+t+' C');
    assert.equal(r.code,'B313_FACTOR_DATA_INCOMPLETE');
  }
});
test('explicit size-specific material changes cannot be collapsed into one class', () => {
  const differentProduct = (cls,small,large)=> {
    const a=classFiles[cls].rows.find(r=>Number(r.convertedBore)===small);
    const b=classFiles[cls].rows.find(r=>Number(r.convertedBore)===large);
    assert(a&&b);
    assert.notEqual(a.Material_Name,b.Material_Name);
  };
  differentProduct('11472',600,750);
  differentProduct('13831',200,250);
});
