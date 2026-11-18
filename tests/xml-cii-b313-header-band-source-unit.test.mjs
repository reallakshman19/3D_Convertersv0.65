import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareNormalizedDataset} from '../tabs/xml-cii-2019-standalone/workers/master-dataset-normalize.js';
import {resolveLineListDesignPressureHeaderBand}
  from '../tabs/xml-cii-2019-standalone/xml-cii-linelist-header-band.js';
import {_xmlCiiFindLineListRow}
  from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-dryrun-core.js';
import {resolvePreviewP1LineListHeaderUnit,inferPreviewPressureUnit}
  from '../tabs/xml-cii-2019-standalone/ui-adapted/xml-cii-adapted-preview-b313-wall-update.js';
import {verifyB313PreviewPressureUnitReceipt}
  from '../converters/xml-cii2019-core/b313-preview-line-list-pressure-receipt.js';

const fieldMap={lineSeqNo:'C',p1:'W',t1:'Y',pipingClass:'V'};
function headerRows(){
 const cells=Array.from({length:13},()=>({C:'',W:'',K:'',Y:'',V:''}));
 cells[3].W='DESIGN CONDITIONS';
 cells[4].W='Pressure Max';
 cells[6].W='kPa(g)';
 cells[3].K='AT WORKING CONDITIONS';
 cells[4].K='Pressure';
 cells[6].K='kPa(g)';
 cells[4].Y='Temp. Max';
 cells[6].Y='ºC';
 cells[7]={C:'4110001',K:'11000',V:'93833',W:'13001.3',Y:'120'};
 cells[8]={C:'4110003',K:'atm',V:'11502',W:'701.3',Y:'82'};
 return cells;
}

test('real BM2-like W5/W6/W8 header supplies design kPa(g), never working K8',()=>{
 const raw=headerRows();
 const ok=resolveLineListDesignPressureHeaderBand(raw,fieldMap);
 assert.equal(ok.ok,true,JSON.stringify(ok));
 assert.equal(ok.unit,'KPA');
 assert.equal(ok.pressureBasis,'GAUGE');
 assert.equal(ok.source,'line-list-header-band:W');
 assert.equal(ok.designBandPresent,true);
 assert(ok.headerFragments.some(x=>x.text==='DESIGN CONDITIONS'));
 assert(ok.headerFragments.some(x=>x.text==='Pressure Max'));
 assert(ok.headerFragments.some(x=>x.text==='kPa(g)'));
 const wrong=resolveLineListDesignPressureHeaderBand(raw,{...fieldMap,p1:'K'});
 assert.equal(wrong.ok,false);
 assert.equal(wrong.code,'WORKING_PRESSURE_COLUMN_NOT_DESIGN_P1');
});

test('imported normalized line retains exact full-precision design P1 and header source',()=>{
 const prepared=prepareNormalizedDataset('lineList',headerRows(),{}, {},fieldMap);
 const row=prepared.rows.find(x=>String(x.lineNoKey)==='4110001');
 assert(row,JSON.stringify(prepared.rows.slice(7,9)));
 assert.equal(String(row.p1),'13001.3');
 assert.equal(String(row.t1),'120');
 assert.equal(row._sourceP1Unit,'KPA');
 assert.equal(row._sourceP1HeaderSource,'line-list-header-band:W');
 assert.equal(row._sourceP1HeaderPressureBasis,'GAUGE');
 assert.equal(row._sourceP1OriginalValue,'13001.3');
 const cfg={linelist:{masterRows:prepared.rows,fieldMap}};
 assert.equal(_xmlCiiFindLineListRow('P4110001',cfg)?.row, row);
 assert.equal(_xmlCiiFindLineListRow('B4110001',cfg),null);
 const preview={lineKey:'P4110001',p1:'13001.3',p1Source:'linelist'};
 const source=resolvePreviewP1LineListHeaderUnit(preview,cfg);
 assert.equal(source.unit,'KPA',JSON.stringify(source));
 assert.equal(source.source,'line-list-header-band:W');
 assert.equal(inferPreviewPressureUnit(preview,cfg,null,{},true).unit,'KPA');
 const permit=verifyB313PreviewPressureUnitReceipt(preview,cfg,source);
 assert.equal(permit.ok,true,JSON.stringify(permit));
 assert.equal(permit.code,'B313_PULL_P1_SOURCE_CONFIRMED');
});

test('source 13001.3 must not verify rounded or edited Preview P1=13001',()=>{
 const prepared=prepareNormalizedDataset('lineList',headerRows(),{},{},fieldMap);
 const cfg={linelist:{masterRows:prepared.rows,fieldMap}};
 const stale={lineKey:'P4110001',p1:'13001',p1Source:'linelist'};
 const checked=resolvePreviewP1LineListHeaderUnit(stale,cfg);
 assert.equal(checked.unit,'');
 assert.equal(checked.source,'LINE_LIST_P1_HEADER_BAND_STALE_OR_INCOMPLETE');
 assert.equal(verifyB313PreviewPressureUnitReceipt(stale,cfg,{
   unit:'KPA',source:'line-list-header-band:W'}).ok,false);
 assert.equal(inferPreviewPressureUnit(stale,cfg,null,{},true).unit,'');
});

test('wrong header, wrong line and missing current master fail closed at Pull-time',()=>{
 const prepared=prepareNormalizedDataset('lineList',headerRows(),{},{},fieldMap);
 const row={lineKey:'P4110003',p1:'701.3',p1Source:'linelist'};
 const cfg={linelist:{masterRows:prepared.rows,fieldMap}};
 const proof={unit:'KPA',source:'line-list-header-band:W'};
 assert.equal(verifyB313PreviewPressureUnitReceipt(row,cfg,proof).ok,true);
 const mismatched={...row,lineKey:'B4110003'};
 assert.equal(verifyB313PreviewPressureUnitReceipt(mismatched,cfg,proof).ok,false);
 const unrelated={...row,p1:'700.0'};
 assert.equal(verifyB313PreviewPressureUnitReceipt(unrelated,cfg,proof).ok,false);
 const staleCfg={linelist:{masterRows:prepared.rows.map(x=>({...x,
   ...(String(x.lineNoKey)==='4110003'?{_sourceP1HeaderSource:'line-list-header-band:K'}:{})})),fieldMap}};
 assert.equal(verifyB313PreviewPressureUnitReceipt(row,staleCfg,proof).ok,false);
 const withoutSource={linelist:{masterRows:[],fieldMap}};
 assert.equal(verifyB313PreviewPressureUnitReceipt(row,withoutSource,proof).ok,false);
});

test('source header with unrelated working-pressure column can never yield P1 unit',()=>{
 const raw=headerRows();
 const mapped={...fieldMap,p1:'K'};
 const prepared=prepareNormalizedDataset('lineList',raw,{}, {},mapped);
 assert(prepared.rows.every(row=>!row._sourceP1HeaderSource));
});
