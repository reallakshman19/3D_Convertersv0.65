import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mapRowsWithFieldMap} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-master-mapping-events.js';
import {prepareNormalizedDataset} from '../tabs/xml-cii-2019-standalone/workers/master-dataset-normalize.js';
import {resolvePreviewP1LineListHeaderUnit, inferPreviewPressureUnit} from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';
import {verifyB313PreviewPressureUnitReceipt} from '../converters/xml-cii2019-core/b313-preview-line-list-pressure-receipt.js';

const map={lineSeqNo:'C',p1:'W',t1:'Y',pipingClass:'V'};
function sourceRows(){
  // Actual structural shape: pressure design W5/W6/W8 vs separate
  // working-pressure K. Original actual workbook bytes are not bundled.
  const cells=Array.from({length:13},()=>({C:'',W:'',K:'',Y:'',V:''}));
  cells[3].W='DESIGN CONDITIONS';cells[4].W='Pressure Max';cells[6].W='kPa(g)';
  cells[3].K='AT WORKING CONDITIONS';cells[4].K='Pressure';cells[6].K='kPa(g)';
  cells[4].Y='Temp. Max';cells[6].Y='ºC';
  cells[7]={C:'4110001',K:'11000',V:'93833',W:'13001.3',Y:'120'};
  cells[8]={C:'4110003',K:'ambiguous',V:'11502',W:'701.3',Y:'82'};
  return cells;
}
const makeCfg=rows=>({linelist:{masterRows:rows,fieldMap:map}});
const preview=(key,p)=>({lineKey:key,p1:p,p1Source:'linelist'});

test('UI import and Worker import use identical selected-line design-pressure receipts',()=>{
  const raw=sourceRows();
  const ui=mapRowsWithFieldMap(raw,map,'lineList');
  const worker=prepareNormalizedDataset('lineList',raw,{}, {},map).rows;
  assert.deepEqual(ui,worker,'UI Apply mapping must preserve Worker verified header-band evidence');
  const selected=ui.find(r=>r.lineNoKey==='4110001');
  assert(selected, 'selected first physical line missing');
  assert.equal(selected.p1,'13001.3');
  assert.equal(selected._sourceP1Unit,'KPA');
  assert.equal(selected._sourceP1HeaderSource,'line-list-header-band:W');
  assert.equal(selected._sourceP1HeaderPressureBasis,'GAUGE');
  assert.equal(selected._sourceP1OriginalValue,'13001.3');
  assert.equal(ui.find(r=>r.lineNoKey==='4110003')._sourceP1Unit,'KPA');
});

test('source P1 and header unit follow matching effective 4 Preview line, never arbitrary working pressure',()=>{
  const cfg=makeCfg(mapRowsWithFieldMap(sourceRows(),map,'lineList'));
  const row=preview('P4110001','13001.3');
  const unit=resolvePreviewP1LineListHeaderUnit(row,cfg);
  assert.equal(unit.unit,'KPA',JSON.stringify(unit));
  assert.equal(unit.source,'line-list-header-band:W');
  assert.equal(inferPreviewPressureUnit(row,cfg,null,{},true).unit,'KPA');
  const authorized=verifyB313PreviewPressureUnitReceipt(row,cfg,unit);
  assert.equal(authorized.ok,true,JSON.stringify(authorized));
  assert.equal(resolvePreviewP1LineListHeaderUnit(preview('P4110003','701.3'),cfg).unit,'KPA');
  assert.equal(resolvePreviewP1LineListHeaderUnit(preview('P4110001','11000'),cfg).unit,'');
});

test('rounded Owner Preview 13001 differs from source 13001.3: do not claim verified source unit',()=>{
  const cfg=makeCfg(mapRowsWithFieldMap(sourceRows(),map,'lineList'));
  const edited=preview('P4110001','13001');
  const inferred=resolvePreviewP1LineListHeaderUnit(edited,cfg);
  assert.equal(inferred.unit,'');
  assert.equal(inferred.source,'LINE_LIST_P1_HEADER_BAND_STALE_OR_INCOMPLETE');
  assert.equal(inferPreviewPressureUnit(edited,cfg,null,{},true).unit,'');
  assert.equal(verifyB313PreviewPressureUnitReceipt(edited,cfg,{
    source:'line-list-header-band:W',unit:'KPA'}).ok,false);
});

test('working pressure, header conflict, absent header cannot become trusted P1 unit',()=>{
  const working=mapRowsWithFieldMap(sourceRows(),{...map,p1:'K'},'lineList');
  assert(working.every(r=>!r._sourceP1Unit));
  const mixed=sourceRows();mixed[5].W='MPa';
  const conflicting=mapRowsWithFieldMap(mixed,map,'lineList');
  assert(conflicting.every(r=>!r._sourceP1Unit));
  const noUnit=sourceRows();noUnit[6].W='';
  const notAsserted=mapRowsWithFieldMap(noUnit,map,'lineList');
  assert(notAsserted.every(r=>!r._sourceP1Unit));
});

test('source and Pages UI mapping implementation stay byte-identical',()=>{
  const p='xml-cii-adapted-master-mapping-events.js';
  const src=readFileSync(new URL('../tabs/xml-cii-2019-standalone/ui-adapted/'+p,import.meta.url));
  const pages=readFileSync(new URL('../docs/tabs/xml-cii-2019-standalone/ui-adapted/'+p,import.meta.url));
  assert.deepEqual(src,pages);
});
