import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateAndSelectPreviewB313Wall } from '../converters/xml-cii2019-core/b313-preview-wall-update.js';
import { qualifyPreviewB313ClassWall, resolvePreviewP1LineListHeaderUnit,
  inferPreviewPressureUnit, buildPreviewB313WallUpdateReport, previewB313BasisKey
} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';

const base = {
  dn:150,outsideDiameterMm:168.3,designPressure:1000,pressureUnit:'PSIG',
  corrosionAllowanceMm:1.5,allowableStress:138,stressUnit:'MPa',
  qualityFactorE:1,weldStrengthReductionW:1,coefficientY:0.4,
  dimensionStandard:'ASME B36.10M',
  negativeMillTolerance:{basis:'percent',value:12.5},
};
const pipe={
  sizeMm:150,pipingClass:'93833',pipingClassPipeDnMm:150,
  pipingClassPipeSourceRow:10558,pipingClassPipeSchedule:'40',
  pipingClassPipeWallMm:7.112,pipingClassPipeMaterial:'ASTM A106 Gr B',
};
const calc=calculateAndSelectPreviewB313Wall(base);
assert.equal(calc.ok,true,JSON.stringify(calc));

test('exact DN Piping Class wall controls proposal, even when generic master offers other schedules',()=>{
  const governed=qualifyPreviewB313ClassWall(pipe,calc);
  assert.equal(governed.ok,true,JSON.stringify(governed));
  assert.equal(governed.authority,'PIPING_CLASS_EXACT_DN_PRODUCT');
  assert.equal(governed.selectedSchedule,'40');
  assert.equal(governed.selectedNominalWallMm,7.112);
  assert.ok(governed.marginMm>0);
});

test('fail closed on wrong DN, wall, absent source or a fabricated schedule',()=>{
  const specs=[
    [{...pipe,pipingClassPipeDnMm:200},'B313_PREVIEW_CLASS_EXACT_DN_WALL_EVIDENCE_REQUIRED'],
    [{...pipe,pipingClassPipeSourceRow:''},'B313_PREVIEW_CLASS_EXACT_DN_WALL_EVIDENCE_REQUIRED'],
    [{...pipe,pipingClassPipeSchedule:'UNAPPROVED-XYZ'},'B313_PREVIEW_CLASS_SCHEDULE_NOT_IN_MASTER'],
    [{...pipe,pipingClassPipeWallMm:3.9116},'B313_PREVIEW_CLASS_WALL_DIMENSION_CONFLICT'],
  ];
  for(const [r,expected] of specs) assert.equal(qualifyPreviewB313ClassWall(r,calc).code,expected);
});

test('pressure-underthick class wall is HOLD, never silently upgraded to alternate master schedule',()=>{
  const higher=calculateAndSelectPreviewB313Wall({...base,designPressure:2500});
  assert.equal(higher.ok,true,JSON.stringify(higher));
  const governed=qualifyPreviewB313ClassWall(pipe,higher);
  assert.equal(governed.ok,false);
  assert.equal(governed.code,'B313_PREVIEW_CLASS_WALL_INSUFFICIENT');
  assert.equal(governed.details.classNominalWallMm,7.112);
  assert.ok(governed.details.requiredNominalWallMm>7.112);
});

test('P1 header is accepted only from matching selected source row',()=>{
  const config={linelist:{masterRows:[{'Line number':'P4110001','Pressure Max kPa(g)':5110,'Hydro test MPa':9000}]}};
  const row={lineKey:'P4110001',p1:'5110',p1Source:'linelist'};
  assert.equal(resolvePreviewP1LineListHeaderUnit(row,config).unit,'KPA');
  assert.equal(inferPreviewPressureUnit(row,config,{pressureUnit:''},{pressureUnit:'AUTO'},true).unit,'KPA');
  assert.equal(inferPreviewPressureUnit({...row,p1:'5111'},config,null,{},true).unit,'');
  assert.equal(inferPreviewPressureUnit(row,config,null,{pressureUnit:'PSIG'},true).unit,'');
});

test('real 4 Preview calculate path uses header unit + exact class wall and creates proposal, never changes Preview',()=>{
  const row={
    branchName:'PIPE-A',lineKey:'P4110001',sizeMm:150,material:'ASTM A106-B',
    materialSource:'process-linelist-material',
    t1:'120',t1Source:'linelist',p1:'5110',p1Source:'linelist',
    corrosion:'1.5',pipingClass:'31441C4',
    pipingClassPipeDnMm:150,pipingClassPipeSchedule:'40',
    pipingClassPipeWallMm:7.112,pipingClassPipeMaterial:'ASTM A106 Gr B',
    pipingClassPipeSourceRow:31441,
  };
  const cfg={
    linelist:{masterRows:[{'Line number':'P4110001','Pressure Max kPa(g)':5110}]},
    b313WallUpdate:{millTolerance:{basis:'percent',value:12.5},
      materialFallback:{enabled:false},bases:{},proposalsByBranch:{}},
    overrides:{wallThickness:{'PIPE-A':'10.97'}},
  };
  const key=previewB313BasisKey(row,cfg);
  cfg.b313WallUpdate.bases[key]={
    allowableStress:138,stressUnit:'MPa',qualityFactorE:1,
    weldStrengthReductionW:1,coefficientY:0.4,
    sourceReference:'CONTROLLED-SYNTHETIC-FACTOR-TEST-ONLY',
    designApproved:true,pressureUnit:'AUTO',dimensionStandard:'ASME B36.10M',
  };
  const preview={branchRows:[row],nodeBoreWallRows:[
    {branchOccurrenceIndex:0,nodeOrdinal:0,nodeNumber:'100',componentRefNo:'R1',
     endpoint:'A',componentType:'PIPE',boreMm:150,outsideDiameterMm:168.3},
  ]};
  const report=buildPreviewB313WallUpdateReport({
    rows:[row],config:cfg,xmlText:'',host:{dataset:{},__xmlCiiPreviewResult:preview}
  });
  assert.equal(report.summary.calculatedRows,1,JSON.stringify(report.rows[0]));
  assert.equal(report.summary.updatedRows,0);
  assert.equal(report.rows[0].status,'CALCULATED');
  assert.equal(report.rows[0].result.classSelection.authority,'PIPING_CLASS_EXACT_DN_PRODUCT');
  assert.equal(report.rows[0].result.selectedSchedule,'40');
  assert.equal(report.rows[0].result.selectedNominalWallMm,7.112);
  assert.equal(cfg.b313WallUpdate.proposalsByBranch['0'].nominalWallMm,7.112);
  assert.equal(cfg.b313WallUpdate.proposalsByBranch['0'].evidence.pressureUnitSource,
    'line-list-column:Pressure Max kPa(g)');
  assert.equal(cfg.overrides.wallThickness['PIPE-A'],'10.97','Calculate cannot overwrite manual Preview wall');
});
