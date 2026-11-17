import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {resolveB313QualifiedTemperatureFactor, B313_MATERIAL_FACTOR_MASTER}
  from '../converters/b313-material-factors/index.js';
import {resolvePublishedB313CodeFactor, B313_GOVERNED_CODE_RULE_PACK}
  from '../converters/b313-material-factors/code-factor-rule-engine.js';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>JSON.parse(fs.readFileSync(path.join(ROOT,relative),'utf8'));
const model=read('engineering/b313/glrd-psi02-factor-groups.json');
const source=read('engineering/b313/glrd-pinned-source-manifest.json');
const sourceCandidates=read('engineering/b313/glrd-b313-2024-external-reference-intake-v1.json');
const validCodes=new Set(['VERIFIED','PROJECT_APPROVED']);
const SUPPORTED=new Set(['S','E','W','Y']);
function factorStatus(factor,group,route){
  const records=B313_MATERIAL_FACTOR_MASTER.factors[factor].records;
  const materialId=group.materialId;
  const temperatureC=group.temperatureC;
  const master=resolveB313QualifiedTemperatureFactor({
    factor,records,materialId,temperatureC,manufacturingRoute:route,
    edition:B313_MATERIAL_FACTOR_MASTER.edition,
  });
  const material=B313_MATERIAL_FACTOR_MASTER.materials.find(m=>m.materialId===materialId);
  const governed=factor==='S' ? null : resolvePublishedB313CodeFactor({
    factor,materialId,materialFamily:material?.family,productForm:material?.productForm||'PIPE',
    manufacturingRoute:route,temperatureC,edition:B313_MATERIAL_FACTOR_MASTER.edition
  });
  const screening=records.filter(r=>r.materialId===materialId
    && !validCodes.has(r.status)
    && Number(r.temperatureC)===Number(temperatureC));
  const satisfied=!!master || governed?.ok===true;
  return {
    factor,status:satisfied?'SOURCE_QUALIFIED':'HOLD',
    reason:satisfied?'MATCHED_QUALIFIED_SOURCE':factor==='E'&&!route
      ? 'PHYSICAL_MANUFACTURING_ROUTE_UNVERIFIED'
      :factor==='S' ? 'QUALIFIED_ALLOWABLE_STRESS_AT_T1_MISSING'
      : 'QUALIFIED_CODE_RULE_OR_ACTIVE_FACTOR_MISSING',
    resolution:master?.resolution||(governed?.ok?'GOVERNED_CODE_RULE':null),
    sourceReference:master?.record?.sourceReference || governed?.factorSource?.sourceReference||null,
    screeningCandidatesExcluded:screening.length,
    reviewedFactorValue:satisfied ? (factor==='S'
      ? (master.record.unit==='ksi'?Number(master.record.value)*6.894757293168361:Number(master.record.value))
      : Number(master?.record?.value??governed.value)) : null,
  };
}
/**
 * Produce a reproducible source-readiness assessment. This is deliberately
 * not the accepted 4 Preview run and may NEVER set Pull-ready on audit-only
 * rows, even if qualified code records later become available.
 */
export function buildGLRDB313QualificationReadiness({
  matrix=model,pinned=source,externalReferenceIntake=sourceCandidates,
}={}){
  // External GitHub reference texts are evidence for an intake worklist ONLY.
  // They never become qualified S/E/W/Y rows or design-authoritative Pulls.
  if(externalReferenceIntake.schema!=='glrd-b313-external-reference-intake/v1'
      || externalReferenceIntake.reviewDisposition!=='REFERENCE_CANDIDATES_ONLY_NOT_ACTIVE_FACTORS'
      || externalReferenceIntake.codeEditionClaim!==B313_MATERIAL_FACTOR_MASTER.edition
      || !Array.isArray(externalReferenceIntake.groups)
      || externalReferenceIntake.groups.length!==3
      || !externalReferenceIntake.sources.some(s=>s.sourceId==='EPCC_B313_FULL_A1')
      || !externalReferenceIntake.sources.some(s=>s.sourceId==='EPCC_B313_SUBSET')
      || externalReferenceIntake.groups.some(g=>g.qualifiedForStrictMaster!==false)) {
    throw Error('Unqualified external reference receipt cannot be promoted to an active factor master');
  }
  if(matrix.schema!=='glrd-psi02-b313-audit-factor-groups/v1'
      || matrix.expectedBranches!==30 || !Array.isArray(matrix.rows)
      || matrix.rows.length!==30 || matrix.groups.length<1)
    throw Error('GLRD audit matrix lacks exact 30-row custody');
  if(matrix.sourceXmlSha256!==pinned.files.find(f=>f.role==='xml')?.sha256)
    throw Error('GLRD matrix and authentic XML source digest disagree');
  for(const [i,row] of matrix.rows.entries()){
    if(row.sourceOrdinal!==i || !row.branchName || row.qualifiedForPull!==false)
      throw Error('GLRD audit-only branch ordinal/approval custody violation at '+i);
  }
  const groups=matrix.groups.map(group=>{
    const own=matrix.rows.filter(r=>r.auditFactorGroup===group.id);
    if(own.length!==group.occurrences)throw Error('GLRD group count mismatch '+group.id);
    const route=group.manufacturingRoute && !['UNKNOWN','UNVERIFIED','UNRESOLVED'].includes(group.manufacturingRoute)
      ? group.manufacturingRoute:null;
    const receipt=externalReferenceIntake.groups.find(g=>g.groupId===group.id);
    if(!receipt || receipt.materialId!==group.materialId
        || receipt.temperatureC!==group.temperatureC
        || receipt.occurrences!==group.occurrences)
      throw Error('External reference receipt is not reconciled with the exact GLRD group '+group.id);
    const factors=Object.fromEntries([...SUPPORTED].map(f=>[f,factorStatus(f,group,route)]));
    const missing=Object.values(factors).filter(f=>f.status!=='SOURCE_QUALIFIED').map(f=>f.factor);
    const flags=[
      'EFFECTIVE_PSI02_STEP4_CONFIG_NOT_RECONCILED',
      'CODE_EDITION_NOT_PROJECT_CONFIRMED',
      'DESIGN_PRESSURE_UNIT_NOT_INDEPENDENTLY_CONFIRMED',
      'PIPE_PRODUCT_ROUTE_NOT_INDEPENDENTLY_CONFIRMED',
    ];
    if(own.some(r=>r.lineKey==='P4110003'&&r.classCodeFromBranchName==='93833'))
      flags.push('LTCS_LINE_LIST_VS_CLASS_93833_DSS_CONFLICT_REVIEW');
    if(receipt.sourceApplicabilityAtT1===true)
      flags.push('EXTERNAL_STRESS_REFERENCE_LOCATED_AWAITING_CODE_SOURCE_AND_PROJECT_APPROVAL');
    else flags.push('EXTERNAL_STRESS_ROW_HELD_OR_T1_NOT_COVERED');
    return {id:group.id,materialId:group.materialId,temperatureC:group.temperatureC,
      occurrences:own.length,manufacturingRoute:route,
      factors,missingQualifiedFactors:missing,sourceIssues:flags,
      externalReferenceCandidate:{
        sourceSpec:receipt.sourceSpec,
        sourceGrade:receipt.sourceGrade||null,
        sourceUns:receipt.sourceUns||null,
        sourceStatus:receipt.candidateStatus,
        upstreamVerifiedClaim:receipt.fullPackUpstreamVerified===true,
        sourceApplicabilityAtT1:receipt.sourceApplicabilityAtT1===true,
        candidateAllowableStressMPa:receipt.candidateAllowableStressMPa,
        qualifiedForStrictMaster:false,
      },
      calculated:0,pullReady:0,pulled:0,emittedCiiVerified:0,
      status:'HOLD_REAL_PREVIEW_AND_ENGINEERING_AUTHORITY'};
  });
  return {
    schema:'glrd-b313-factor-qualification-readiness/v1',
    sourceModel:matrix.modelXml,sourceSha256:matrix.sourceXmlSha256,
    recordedCodeEdition:B313_MATERIAL_FACTOR_MASTER.edition,
    governingProjectEditionConfirmed:false,
    sourceCodePackRevision:B313_GOVERNED_CODE_RULE_PACK.edition,
    qualifiedCodeRuleRecords:B313_GOVERNED_CODE_RULE_PACK.records.length,
    externalReferenceIntake:{
      disposition:externalReferenceIntake.reviewDisposition,
      sources:externalReferenceIntake.sources.map(s=>({
        sourceId:s.sourceId,repository:s.repository,commit:s.commit,
        path:s.path,gitBlobSha1:s.gitBlobSha1
      })),
      originalCodeSourceSha256Verified:false,
      activeFactorsPromoted:0,
    },
    sourceStatus:'PINNED_SOURCE_CUSTODY_SEPARATE',
    effectivePreviewStatus:'NOT_REPLAYED_WITH_AUTHORIZED_PSI02_CONFIG',
    inputRows:matrix.rows.length,
    groupCount:groups.length,groups,
    rows:matrix.rows.map(row=>({
      ordinal:row.sourceOrdinal,branchName:row.branchName,lineKey:row.lineKey,
      pipingClassFromName:row.classCodeFromBranchName,
      factorGroup:row.auditFactorGroup,
      status:row.lineKey==='P4110003'&&row.classCodeFromBranchName==='93833'
        ? 'HOLD_POTENTIAL_LINE_LIST_CLASS_MATERIAL_CONFLICT'
        : 'HOLD_FACTOR_AND_EFFECTIVE_PREVIEW_EVIDENCE',
      calculated:false,pullReady:false,pulled:false,ciiVerified:false,
    })),
    totals:{evaluated:matrix.rows.length,qualifiedSourceRows:0,
      calculated:0,pullReady:0,pulled:0,ciiVerified:0},
    engineeringRelease:'HOLD',
    note:'Audit labels originate in owner-provided Step 4 diagnostics; this report is NOT a substituted live Preview, qualified factor approval or CII Pull acceptance.',
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const outIndex=process.argv.indexOf('--output');
  const out=path.resolve(ROOT,outIndex>=0?process.argv[outIndex+1]:'out/glrd-b313-factor-qualification-readiness.json');
  const report=buildGLRDB313QualificationReadiness();
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log('GLRD factor qualification readiness: '+report.inputRows+' physical rows / '+report.groupCount+' provisional groups; qualified Pulls '+report.totals.pulled);
  for(const g of report.groups)console.log(g.id+': '+g.occurrences+' rows, missing '+g.missingQualifiedFactors.join(',')+', '+g.sourceIssues.join('; '));
  console.log('Report: '+out);
}
