import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildGLRDB313QualificationReadiness}
  from '../scripts/glrd-b313-qualification-readiness.mjs';

const model=JSON.parse(readFileSync(new URL('../engineering/b313/glrd-psi02-factor-groups.json',import.meta.url),'utf8'));
test('30 authentic PSI-02 branches group into exactly 26+2+2 provisional factors',()=>{
  const r=buildGLRDB313QualificationReadiness();
  assert.equal(r.inputRows,30);
  assert.equal(r.rows.length,30);
  assert.equal(r.groupCount,3);
  assert.deepEqual(r.groups.map(g=>[g.id,g.occurrences]),[
    ['DSS-120',26],['LTCS-120',2],['LTCS-82',2]]);
  assert.equal(r.qualifiedCodeRuleRecords,0);
  assert.equal(r.externalReferenceIntake.activeFactorsPromoted,0);
  assert.equal(r.externalReferenceIntake.originalCodeSourceSha256Verified,false);
  assert.equal(r.groups.find(g=>g.id==='DSS-120').externalReferenceCandidate.sourceStatus,
    'HOLD_UPSTREAM_UNVERIFIED_AND_T1_BELOW_SOURCE_RANGE');
  assert.equal(r.groups.find(g=>g.id==='DSS-120').externalReferenceCandidate.candidateAllowableStressMPa,null);
  for(const id of ['LTCS-120','LTCS-82']){
    const candidate=r.groups.find(g=>g.id===id).externalReferenceCandidate;
    assert.equal(candidate.candidateAllowableStressMPa,138);
    assert.equal(candidate.qualifiedForStrictMaster,false);
    assert.equal(candidate.sourceApplicabilityAtT1,true);
  }
  assert.equal(r.totals.calculated,0);
  assert.equal(r.totals.pullReady,0);
  assert.equal(r.totals.pulled,0);
  assert.equal(r.engineeringRelease,'HOLD');
  for(const g of r.groups){
    assert.equal(g.factors.S.status,'HOLD');
    assert.equal(g.factors.S.reason,'QUALIFIED_ALLOWABLE_STRESS_AT_T1_MISSING');
    assert.equal(g.factors.E.reason,'PHYSICAL_MANUFACTURING_ROUTE_UNVERIFIED');
    assert.deepEqual(g.missingQualifiedFactors,['S','E','W','Y']);
    assert.equal(g.pullReady,0);
    assert.equal(g.emittedCiiVerified,0);
  }
  assert.equal(r.rows.filter(row=>row.status==='HOLD_POTENTIAL_LINE_LIST_CLASS_MATERIAL_CONFLICT').length,2);
});
test('audit-only source cannot be promoted to Pull ready by changing a status flag',()=>{
  const modified=structuredClone(model);
  modified.rows[0].qualifiedForPull=true;
  assert.throws(()=>buildGLRDB313QualificationReadiness({matrix:modified}),/approval custody/);
});
test('source digest, physical ordinal and group count contradictions fail closed',()=>{
  let altered=structuredClone(model);
  altered.sourceXmlSha256='bad';
  assert.throws(()=>buildGLRDB313QualificationReadiness({matrix:altered}),/source digest/);
  altered=structuredClone(model);
  altered.rows[0].sourceOrdinal=10;
  assert.throws(()=>buildGLRDB313QualificationReadiness({matrix:altered}),/ordinal/);
  altered=structuredClone(model);
  altered.groups[0].occurrences=30;
  assert.throws(()=>buildGLRDB313QualificationReadiness({matrix:altered}),/count mismatch/);
});

test('pinned external reference receipt cannot promote unapproved source entries',()=>{
  const receipt=JSON.parse(readFileSync(new URL('../engineering/b313/glrd-b313-2024-external-reference-intake-v1.json',import.meta.url),'utf8'));
  const promoted=structuredClone(receipt);
  promoted.groups[1].qualifiedForStrictMaster=true;
  assert.throws(()=>buildGLRDB313QualificationReadiness({externalReferenceIntake:promoted}),/cannot be promoted/);
  const unrelated=structuredClone(receipt);
  unrelated.groups[0].sourceSpec='A333';
  unrelated.groups[0].materialId='LTCS-A333-6';
  assert.throws(()=>buildGLRDB313QualificationReadiness({externalReferenceIntake:unrelated}),/not reconciled/);
  const r=buildGLRDB313QualificationReadiness();
  assert(r.groups.every(g=>g.calculated===0&&g.pullReady===0));
});
