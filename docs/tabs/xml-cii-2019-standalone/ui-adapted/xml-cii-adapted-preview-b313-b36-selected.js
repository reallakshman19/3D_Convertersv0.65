/**
 * Explicit, dimension-master-derived nominal PIPE wall for 4 Preview.
 * ASME B36.10M/B36.19M supply nominal OD/schedules; B31.3 supplies
 * required design thickness. This is not factor qualification or a
 * construction/manufacturing certification.
 */
import {listPipeWallsForSize,selectRequiredPipeWall} from '../../../converters/pipe-wall-master/index.js';
import {
  buildPreviewB313CalculatedWallDisplay,
  inferPreviewDimensionStandard,
} from './xml-cii-adapted-preview-b313-wall-update.js?v=20261119-b36-selected-1';

const t=x=>String(x??'').trim();
const positive=x=>{const n=Number(x);return Number.isFinite(n)&&n>0?n:null;};
const token=x=>t(x).toUpperCase().replace(/^SCH(?:EDULE)?\.?\s*/,'').replace(/[\s.-]/g,'');
const fail=(code,message,details={})=>({
  ok:false,code,message,eligibleForManualPreviewPull:false,...details,
});

/**
 * Each result binds a physical Preview occurrence to the exact applicable
 * project B36 master row. If a Piping Class product/schedule is present,
 * it is the selected schedule (when adequate), NOT an automatic downgrade
 * to a thinner but otherwise adequate catalog entry.
 */
export function buildPreviewB36SelectedThickness({
  row={},config={},previewNodeRows=[],rowIndex=0,calculatedWallDisplay=null,
}={}){
  const calculated=calculatedWallDisplay||buildPreviewB313CalculatedWallDisplay({
    row,config,previewNodeRows,rowIndex,
  });
  const hypothetical=calculated?.ok!==true &&
    calculated?.hypotheticalScenario?.ok===true;
  const calculation=hypothetical?calculated.hypotheticalScenario:calculated;
  if(calculation?.ok!==true) return fail('B36_REQUIRED_WALL_UNAVAILABLE',
    'A numerical B31.3 required nominal thickness is needed before standard selection.',
    {requiredReason:t(calculated?.reason)||t(calculated?.code)});

  const required=positive(calculation.requiredNominalThicknessMm);
  const dn=positive(row?.sizeMm??row?.boreMm);
  const dimension=inferPreviewDimensionStandard(row,{},null);
  if(!required||!dn||!dimension.standard) return fail('B36_SIZE_OR_STANDARD_REQUIRED',
    'Required nominal wall, Preview DN and applicable pipe dimension standard are needed.');
  const nearest=selectRequiredPipeWall({
    dn,dimensionStandard:dimension.standard,requiredNominalThicknessMm:required,
  });
  if(!nearest.ok) return fail(nearest.code||'B36_NO_ADEQUATE_WALL',
    'No acceptable B36 nominal wall in the active dimension master.',
    {requiredNominalThicknessMm:required,dimensionStandard:dimension.standard,dn});

  const cls=t(row.pipingClass);
  const clsDn=positive(row.pipingClassPipeDnMm);
  const clsWall=positive(row.pipingClassPipeWallMm);
  const clsSch=t(row.pipingClassPipeSchedule);
  const clsProduct=t(row.pipingClassPipeMaterial);
  let chosen=nearest.selected;
  let selectionAuthority='B36_MINIMUM_STANDARD_SCHEDULE';
  let classSourceRow=t(row.pipingClassPipeSourceRow);
  if(cls){
    if(!clsDn||Math.abs(clsDn-dn)>0.000001||!clsWall||!clsSch||!clsProduct)
      return fail('B36_CLASS_PRODUCT_OR_DN_UNRESOLVED',
        'Exact-DN Piping Class product, schedule and wall must be reconciled before selection.',
        {dn,pipingClass:cls,requiredNominalThicknessMm:required});
    const listed=listPipeWallsForSize({dn,dimensionStandard:dimension.standard});
    const matches=(listed.ok?listed.rows:[]).filter(item=>token(item.schedule)===token(clsSch));
    if(matches.length!==1||Math.abs(Number(matches[0].nominalWallMm)-clsWall)>0.08)
      return fail('B36_CLASS_SCHEDULE_WALL_CONFLICT',
        'The Piping Class schedule and wall do not match a unique B36 master row.',
        {dn,pipingClass:cls,classSchedule:clsSch,classNominalWallMm:clsWall});
    if(positive(matches[0].outsideDiameterMm)&&positive(calculation.outsideDiameterMm)
       &&Math.abs(Number(matches[0].outsideDiameterMm)-Number(calculation.outsideDiameterMm))
         >Math.max(1.5,Number(matches[0].outsideDiameterMm)*0.02))
      return fail('B36_CLASS_OD_CONFLICT',
        'B36 dimension OD disagrees with the effective 4 Preview calculation OD.');
    if(Number(matches[0].nominalWallMm)+0.000001<required)
      return fail('B36_CLASS_WALL_INSUFFICIENT',
        'Exact Piping Class schedule is thinner than the B31.3 numerical required nominal wall; do not silently increase schedule.',
        {requiredNominalThicknessMm:required,classNominalWallMm:clsWall,
          nearestAdequateNominalWallMm:nearest.selected.nominalWallMm,
          nearestAdequateSchedule:nearest.selected.schedule});
    chosen=matches[0];
    selectionAuthority='EXACT_DN_PIPING_CLASS_MATCHED_B36_MASTER';
  }
  const selected=positive(chosen.nominalWallMm);
  const outsideDiameter=positive(chosen.outsideDiameterMm);
  if(!selected||!outsideDiameter||selected*2>=outsideDiameter)
    return fail('B36_MASTER_GEOMETRY_INVALID','Selected nominal wall does not form a valid pipe geometry.');
  const deviation=cls?Math.abs(selected-clsWall):0;
  // A manual Preview Pull can be a no-op numerically (the Piping Class
  // already prescribed the same wall). Keep its non-qualified user action
  // visibly distinct from source derivation and governed B31.3 acceptance.
  const overrideKey=t(row?.wallThicknessKey)
    ||(cls?'PC:'+cls.toUpperCase().replace(/\\s+/g,'')+'|DN:'+Math.round(dn)
      :t(row.lineKey||row.branchName));
  const receipt=config?.b313WallUpdate?.selectedWallManualByOverrideKey?.[overrideKey];
  const manuallyPulled=receipt?.status==='MANUAL_PREVIEW_ONLY_NOT_B313_APPROVED'
    &&Math.abs(Number(receipt.selectedNominalWallMm)-selected)<=0.00001
    &&t(receipt.selectedSchedule)===t(chosen.schedule)
    &&t(receipt.dimensionStandard)===t(dimension.standard)
    &&t(config?.overrides?.wallThickness?.[overrideKey])!=='' 
    &&Math.abs(Number(config.overrides.wallThickness[overrideKey])-selected)<=0.00001;
  return {
    ok:true,code:hypothetical?'B36_HYPOTHETICAL_SELECTION':'B36_STANDARD_SELECTION',
    rowIndex,dn,dimensionStandard:dimension.standard,dimensionStandardSource:dimension.source,
    selectedNominalWallMm:selected,selectedSchedule:chosen.schedule,
    equivalentSchedules:[chosen.schedule],selectionAuthority,
    catalogMinimumWallMm:nearest.selected.nominalWallMm,
    catalogMinimumSchedule:nearest.selected.schedule,
    requiredNominalThicknessMm:required,marginMm:selected-required,
    outsideDiameterMm:outsideDiameter,
    material:t(row.material),pipingClass:cls,
    classSchedule:clsSch||null,classWallMm:clsWall,
    classSourceRow:classSourceRow||null,classProduct:clsProduct||null,
    classMasterDeviationMm:deviation,
    manuallyPulled,manualPullReceipt:manuallyPulled
      ?{status:receipt.status,sourceBranch:receipt.sourceBranch,
        timestamp:receipt.timestamp,affectedRows:receipt.affectedRows}:null,
    masterSourcePath:t(chosen.sourcePath),
    masterSourceBlobSha:t(chosen.sourceBlobSha),
    masterDataStatus:t(chosen.dataStatus),
    hypothetical,pressureUnitUnverified:hypothetical||calculation.pressureUnitAssumed===true,
    pressureUnit:t(calculation.pressureUnit),pressureUnitSource:t(calculation.pressureUnitSource),
    factorQualification:'NOT_ESTABLISHED',
    eligibleForB313GovernedPull:false,
    // User-controlled MANUAL override only; never an approved B31.3 Pull.
    eligibleForManualPreviewPull:!cls||deviation<=0.01,
    manualPullReason:cls&&deviation>0.01?
      'Piping Class wall differs from dimension master beyond strict 0.01-mm manual-Pull parity.':null,
    calculation,
  };
}

/** Class+DN wall override keys can affect several physical occurrences. */
export function planPreviewB36SelectedPull({rows=[],rowIndex,config={},previewNodeRows=[]}={}){
  if(!Number.isInteger(rowIndex)||rowIndex<0||rowIndex>=rows.length)
    return fail('B36_PULL_ROW_INVALID','A current physical Preview row is required.');
  const row=rows[rowIndex];
  const selection=buildPreviewB36SelectedThickness({row,config,previewNodeRows,rowIndex});
  if(!selection.ok||!selection.eligibleForManualPreviewPull)
    return fail(selection.code||'B36_PULL_UNAVAILABLE',
      selection.message||selection.manualPullReason||'Selected B36 wall is not eligible for manual Preview Pull.',
      {selection});
  const key=t(row?.wallThicknessKey)
    || (t(row?.pipingClass)&&positive(row?.sizeMm)
      ? 'PC:'+t(row.pipingClass).toUpperCase().replace(/\s+/g,'')+'|DN:'+Math.round(Number(row.sizeMm)):t(row.lineKey||row.branchName));
  if(!key)return fail('B36_PULL_OVERRIDE_KEY_REQUIRED','No stable Preview wall override key.');
  const group=rows.map((r,i)=>({row:r,index:i})).filter(x=>{
    const r=x.row;
    const k=t(r.wallThicknessKey)
      ||(t(r.pipingClass)&&positive(r.sizeMm)
      ?'PC:'+t(r.pipingClass).toUpperCase().replace(/\s+/g,'')+'|DN:'+Math.round(Number(r.sizeMm)):t(r.lineKey||r.branchName));
    return k===key;
  });
  for(const entry of group){
    if(config?.b313WallUpdate?.acceptedWallByBranch?.[String(entry.index)])
      return fail('B36_PULL_GOVERNED_WALL_EXISTS',
        'A governed B31.3 accepted wall exists in the shared override scope.',
        {key,affectedRows:group.map(x=>x.index)});
    if(entry.index===rowIndex)continue;
    const other=entry.row;
    const sameClass=t(other.pipingClass)===t(row.pipingClass)
      &&Number(other.sizeMm)===Number(row.sizeMm)
      &&token(other.pipingClassPipeSchedule)===token(row.pipingClassPipeSchedule)
      &&Math.abs(Number(other.pipingClassPipeWallMm)-Number(row.pipingClassPipeWallMm))<=0.01
      &&t(other.pipingClassPipeMaterial)===t(row.pipingClassPipeMaterial);
    if(!sameClass) return fail('B36_PULL_SHARED_SCOPE_CONFLICT',
      'This wall override key also covers a different product/schedule/wall. Do not overwrite the other branch.',
      {key,affectedRows:group.map(x=>x.index)});
  }
  const old=config?.overrides?.wallThickness?.[key];
  return {ok:true,code:'B36_MANUAL_PULL_PREPARED',key,rowIndex,
    affectedRows:group.map(x=>x.index),selectedNominalWallMm:selection.selectedNominalWallMm,
    selectedSchedule:selection.selectedSchedule,dimensionStandard:selection.dimensionStandard,
    requiredNominalThicknessMm:selection.requiredNominalThicknessMm,
    selection,priorOverride:old===undefined?null:old,
    replacesExistingOverride:old!==undefined,
    // Caller must confirm, persist, rebuild, verify all affected and rollback on failure.
    engineeringApproved:false,governedB313Pull:false};
}
