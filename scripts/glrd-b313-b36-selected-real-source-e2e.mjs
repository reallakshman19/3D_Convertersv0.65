/**
 * GLRD PSI-02 public original-source browser replay.
 * Not an owner session replay: original effective config/session is unavailable.
 * Does not inject P1, T1, stage JSON or wall overrides.
 */
import {chromium} from 'playwright';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';

const src=process.env.GLRD_PUBLIC_SOURCE_ROOT||'glrd-source';
const masters=process.env.GLRD_PUBLIC_MASTER_ROOT||'glrd-masters';
const target=process.env.GLRD_BROWSER_TARGET||'http://127.0.0.1:4173/index.html';
const out=process.env.GLRD_EVIDENCE_DIR||'glrd-b36-evidence';
const manifest=JSON.parse(await readFile('engineering/b313/glrd-pinned-source-manifest.json','utf8'));
const manifestFiles=manifest.files;
const get=(role)=>manifestFiles.find(x=>x.role===role);
const fileRoot={xml:src,line_list:src,stage_json:src,piping_class:masters,material_map:masters,valve_weights:masters};
const sha=(b)=>createHash('sha256').update(b).digest('hex');
const paths={},hashes={};
for(const role of ['xml','line_list','piping_class','material_map','valve_weights']){
  const spec=get(role);
  if(!spec)throw Error('missing pinned role '+role);
  paths[role]=path.join(fileRoot[role],spec.path);
  const bytes=await readFile(paths[role]);
  hashes[role]={sha256:sha(bytes),bytes:bytes.length,expected:spec.sha256};
  if(hashes[role].sha256!==spec.sha256)throw Error('HASH_MISMATCH '+role);
}
await mkdir(out,{recursive:true});
const record={
  schema:'GLRD-B313-PSI02-B36-SELECTED-PULL-LOCAL-REAL-SOURCE-E2E/v1',
  label:'EXACT PR-HEAD LOCAL SITE / PUBLIC PINNED GLRD PSI-02 SOURCE; NOT OWNER SAVED CONFIG/SESSION',
  target,manifestProject:manifest.project,
  xmlSha256:hashes.xml.sha256,actualSourceHashes:hashes,
  stageJsonExcluded:'BM2-NAMED STAGE TO PSI-02 APPLICABILITY UNVERIFIED',
  savedConfigUnavailable:true,ownerSessionReplayed:false,
  timestamp:new Date().toISOString(),steps:[],pageErrors:[],consoleErrors:[],
  sourceP1T1Injected:false,wallOverrideModified:false,
  wallOutputCiiModified:false,pass:false,
};
const browser=await chromium.launch({headless:true});
const page=await browser.newPage({acceptDownloads:true});
page.setDefaultTimeout(60000);
page.on('pageerror',e=>record.pageErrors.push(String(e.stack||e)));
page.on('console',m=>{if(m.type()==='error')record.consoleErrors.push(m.text().slice(0,600));});
async function stage(name,fn){try{const data=await fn();record.steps.push({name,ok:true,data});return data;}catch(e){record.steps.push({name,ok:false,error:String(e?.stack||e).slice(0,2700)});throw e;}}
try{
 await stage('open_deployed_application',async()=>{
   const res=await page.goto(target,{waitUntil:'domcontentloaded',timeout:120000});
   if(res?.status()!==200)throw Error('Pages HTTP '+res?.status());
   await page.locator('[data-tab="xml-cii-2019-standalone"]').click();
   return {http:res.status(),url:page.url()};
 });
 await stage('import_authentic_PSI02_XML',async()=>{
   await page.locator('[data-phase="source"]').click();
   await page.locator('[data-field="source-file"]').setInputFiles(paths.xml);
   return {path:get('xml').path,sha256:hashes.xml.sha256,bytes:hashes.xml.bytes};
 });
 for(const [kind,role,subTab] of [
   ['lineList','line_list','linelist'],
   ['pipingClass','piping_class','pipingClass'],
   ['materialMap','material_map','materialMap'],
 ]){
   await stage('import_authentic_'+kind,async()=>{
     await page.locator('[data-sub-tab="'+subTab+'"]').click();
     await page.locator('input[data-master-file="'+kind+'"]').setInputFiles(paths[role]);
     await page.waitForFunction((k)=>{
       const s=[...document.querySelectorAll('[data-master-mapping-status]')]
         .find(el=>el.dataset.masterMappingStatus===k)?.textContent||'';
       return /APPLIED/.test(s)||/Import error/.test(document.body.innerText);
     },kind,{timeout:120000});
     const data=await page.evaluate(k=>{
       const selector=document.querySelector('[data-master-sheet-select="'+k+'"]');
       const options=selector?[...selector.options].map(o=>({value:o.value,label:o.textContent})):null;
       const status=document.querySelector('[data-master-mapping-status="'+k+'"]')?.textContent||'';
       return {status,sheet:selector?.value||null,options};
     },kind);
     if(kind==='lineList'&&data.options?.length){
       const match=data.options.find(o=>/^linelist$/i.test(o.value.trim())||/^linelist$/i.test(o.label.trim()));
       if(match&&match.value!==data.sheet){
         await page.locator('[data-master-sheet-select="lineList"]').selectOption(match.value);
         await page.waitForFunction(()=>/APPLIED/.test(document.querySelector('[data-master-mapping-status="lineList"]')?.textContent||''),null,{timeout:120000});
         data.sheet=match.value;
       }
     }
     return {...data,path:get(role).path,sha256:hashes[role].sha256};
   });
 }
 await stage('manual_rebuild_4_preview',async()=>{
   await page.locator('[data-phase="preview"]').click();
   const host=page.locator('#mc-preview-table-host');
   const btn=host.locator('[data-mc-preview-build]').first();
   await btn.waitFor({timeout:120000});
   const before=await host.evaluate(h=>({
     autoBuildButtonPresent:!!h.querySelector('[data-mc-preview-build]'),
     branchRows:h.__xmlCiiPreviewResult?.branchRows?.length||0,
     cacheStatus:h.dataset.mcPreviewCacheStatus||'',
     sourceSha:h.dataset.mcPreviewOriginalJsonSha256||null,
   }));
   await btn.click(); // Only explicit Preview rebuild
   await page.waitForFunction(()=>{
     const h=document.querySelector('#mc-preview-table-host');
     const rows=h?.__xmlCiiPreviewResult?.branchRows?.length||0;
     const cells=h?.querySelectorAll('[data-mc-b313-calculated-row]').length||0;
     // The deployed app's user-visible "Verified original engineering
     // Preview" has a distinct source-status field in XML-only mode.
     // Completion is the real 30-row table + physical B31.3 cells.
     return (rows===30 && cells===rows)||
       /Preview failed|Preview build failed/i.test(h?.innerText||'');
   },null,{timeout:120000});
   await page.waitForTimeout(800);
   const status=await host.evaluate(h=>({
     jsonSource:h.dataset.mcPreviewJsonSource||null,
     cacheStatus:h.dataset.mcPreviewCacheStatus||null,
     basisId:h.dataset.mcPreviewBasisId||null,
     rowCount:h.__xmlCiiPreviewResult?.branchRows?.length||0,
     headerCount:h.querySelectorAll('table[data-resizable-table="branch-preview"] thead th').length,
     calculatedCellCount:h.querySelectorAll('[data-mc-b313-calculated-row]').length,
     lineListStatus:(h.parentElement?.innerText||'').match(/Line List:\s*\d+\s*row\(s\)/)?.[0]||null,
     error:(h.innerText||'').match(/Preview failed.{0,500}/)?.[0]||null,
   }));
   if(!status.rowCount)throw Error('No actual Preview rows after manual Build '+JSON.stringify(status));
   return {before,after:status};
 });
 const result=await stage('capture_30_row_numeric_wall_and_custody',async()=>{
   await page.waitForFunction(()=>{
     const h=document.querySelector('#mc-preview-table-host');
     const cells=[...h?.querySelectorAll('[data-mc-b313-calculated-row]')||[]];
     return cells.length>0&&cells.every(c=>Boolean(c.dataset.mcB313CalculatedStatus));
   },null,{timeout:45000});
   return await page.evaluate(()=>{
     const host=document.querySelector('#mc-preview-table-host');
     const rows=host?.__xmlCiiPreviewResult?.branchRows||[];
     const cells=[...host.querySelectorAll('[data-mc-b313-calculated-row]')];
     const rowsOut=rows.map((r,i)=>{
       const c=cells[i],value=c?.querySelector('[data-mc-b313-calculated-value]')?.textContent?.trim()||null;
       const detail=c?.querySelector('[data-mc-b313-calculated-detail]')?.textContent?.trim()||null;
       return {index:i+1,lineKey:r.lineKey||'',branchName:r.branchName||'',p1:r.p1??null,
         t1:r.t1??null,p1Unit:r.p1Unit||'',p1UnitSource:r.p1UnitSource||null,
         sizeMm:r.sizeMm??null,material:r.material??null,
         wallThickness:r.wallThickness??null,
         pressureUnitSource:r._sourceP1HeaderSource||null,
         requiredValue:value,
         calculatedStatus:c?.dataset.mcB313CalculatedStatus||null,detail,
         tooltip:c?.title?.slice(0,1100)||null};
     });
     const unit=host.querySelector('[data-b313-common-pressure-unit]');
     const numeric=rowsOut.filter(r=>/^\d+(?:\.\d+)?$/.test(r.requiredValue||''));
     const four=[0,1,28,29].map(i=>rowsOut[i]||null);
     return {effectiveRowCount:rows.length,calculatedCellCount:cells.length,
       rows:rowsOut,numericCount:numeric.length,numericRows:numeric.map(x=>x.index),
       originalFourLocations:four,selectedCommonP1:unit?.value||null,
       B313ReportPresent:!!host.querySelector('[data-mc-b313-report]'),
       reportedCacheStatus:host.dataset.mcPreviewCacheStatus,
       reportedInputJsonSha:host.dataset.mcPreviewOriginalJsonSha256||null,
       previewDirty:host.dataset.mcB313PreviewDirty||null,
       activeResultSignature:host.dataset.mcPreviewBasisId||null};
   });
 });

 const selected=await stage('B36_selected_nominal_wall_on_actual_30_row_preview',async()=>{
   const summary=await page.evaluate(()=>{
     const host=document.querySelector('#mc-preview-table-host');
     const tbl=host.querySelector('table[data-resizable-table="branch-preview"]');
     const headers=[...tbl.querySelectorAll('th[data-col-id]')].map(h=>h.dataset.colId);
     const rows=[...tbl.querySelectorAll('tbody tr.mc-preview-row')];
     return {headers,total:rows.length,results:rows.map((tr,index)=>{
       const cell=tr.querySelector('[data-mc-b36-selected-row]');
       const button=cell?.querySelector('[data-mc-b36-selected-pull-row]');
       return {index:index+1,value:cell?.querySelector('[data-mc-b36-selected-value]')?.textContent?.trim()||'',
         detail:cell?.querySelector('[data-mc-b36-selected-detail]')?.textContent?.trim()||'',
         status:cell?.dataset.mcB36SelectedStatus||'',disabled:button?.disabled??true,
         title:cell?.title||''};
     })};
   });
   if(summary.total!==30||summary.results.length!==30
      ||summary.headers.indexOf('b36SelectedWall')!==summary.headers.indexOf('b313CalculatedWall')+1)
     throw Error('B36 Selected Thickness missing from exact physical table '+JSON.stringify(summary.headers));
   const expected=[
     {index:1,mm:12.7,sch:'80S',std:'B36.19M'},
     {index:2,mm:7.112,sch:'40S',std:'B36.19M'},
     {index:29,mm:6.0198,sch:'40',std:'B36.10M'},
     {index:30,mm:7.9248,sch:'20',std:'B36.10M'},
   ];
   const checks=expected.map(w=>{
     const row=summary.results[w.index-1];
     const ok=Math.abs(Number(row.value)-w.mm)<0.013
       &&row.detail.includes(w.sch)&&row.detail.includes(w.std)
       &&row.disabled===false;
     return {...w,actual:row,ok};
   });
   if(!checks.every(c=>c.ok))throw Error('Real-source B36 class selection incorrect '+JSON.stringify(checks));
   const other=summary.results.filter(r=>![1,2,29,30].includes(r.index));
   if(other.some(r=>r.disabled===false))
     throw Error('Incomplete GLRD required-wall rows exposed an enabled Pull');
   return {total:summary.total,headers:summary.headers,
     selections:checks,unavailableRows:other.length,
     allIncompletePullDisabled:other.every(r=>r.disabled)};
 });
 const changedWall=await stage('seed_distinct_wall_using_real_4Preview_override_editor',async()=>{
   const previewBefore=await page.evaluate(()=>{
     const h=document.querySelector('#mc-preview-table-host');
     globalThis.__b36EditedPreviewBefore=h.__xmlCiiPreviewResult;
     return {row2:h.__xmlCiiPreviewResult?.branchRows?.[1]?.wallThickness,
       otherWalls:h.__xmlCiiPreviewResult?.branchRows?.map(r=>String(r.wallThickness??''))};
   });
   if(Math.abs(Number(previewBefore.row2)-7.112)>0.013)
     throw Error('Unexpected original class wall for GLRD row 2: '+previewBefore.row2);
   await page.locator('#mc-preview-table-host [data-mc-edit-type="wallThickness"][data-mc-edit-row="1"]').click();
   await page.locator('#mc-ov-input').fill('8.18');
   await page.locator('#mc-ov-save').click();
   const dirty=await page.evaluate(()=>{
     const h=document.querySelector('#mc-preview-table-host');
     return {dirty:h.dataset.mcB313PreviewDirty,
       selected:h.querySelector('[data-mc-b36-selected-row="1"] [data-mc-b36-selected-value]')?.textContent,
       pullDisabled:h.querySelector('[data-mc-b36-selected-pull-row="1"]')?.disabled};
   });
   if(dirty.dirty!=='true'||dirty.pullDisabled!==true)
     throw Error('Editing Wall Thk must mark Preview dirty and disable selection Pull '+JSON.stringify(dirty));
   await page.locator('#mc-preview-table-host [data-mc-preview-build]').click();
   await page.waitForFunction(()=>{
     const h=document.querySelector('#mc-preview-table-host');
     return h?.__xmlCiiPreviewResult!==globalThis.__b36EditedPreviewBefore
       &&Math.abs(Number(h.__xmlCiiPreviewResult?.branchRows?.[1]?.wallThickness)-8.18)<0.001;
   },null,{timeout:180000});
   const after=await page.evaluate(()=>{
     const h=document.querySelector('#mc-preview-table-host');
     return {dirty:h.dataset.mcB313PreviewDirty,
       row2:h.__xmlCiiPreviewResult?.branchRows?.[1]?.wallThickness,
       otherWalls:h.__xmlCiiPreviewResult?.branchRows?.map(r=>String(r.wallThickness??'')),
       selected:h.querySelector('[data-mc-b36-selected-row="1"] [data-mc-b36-selected-value]')?.textContent,
       pullDisabled:h.querySelector('[data-mc-b36-selected-pull-row="1"]')?.disabled};
   });
   if(after.otherWalls.some((v,i)=>i!==1&&v!==previewBefore.otherWalls[i]))
     throw Error('Seed editor affected a different GLRD wall');
   if(after.pullDisabled!==false||Math.abs(Number(after.selected)-7.112)>0.013)
     throw Error('Rebuilt Preview did not preserve independent B36 class selection '+JSON.stringify(after));
   return {before:previewBefore,dirty,after};
 });
 const manualPull=await stage('B36_pull_selected_into_Preview_and_verify_scope',async()=>{
   const before=await page.evaluate(()=>{
     const host=document.querySelector('#mc-preview-table-host');
     globalThis.__b36ReplayBeforePreview=host.__xmlCiiPreviewResult;
     const rows=host.__xmlCiiPreviewResult.branchRows||[];
     return {wallValues:rows.map(r=>String(r.wallThickness??'')),
       beforeWallSource:rows[1]?.wallThicknessSource||null,
       selectedValue:host.querySelector('[data-mc-b36-selected-row="1"] [data-mc-b36-selected-value]')?.textContent||'',
       ready:!host.querySelector('[data-mc-b36-selected-pull-row="1"]')?.disabled};
   });
   if(!before.ready||Math.abs(Number(before.selectedValue)-7.112)>0.013)
     throw Error('Row 2 selected Pull cannot be safely clicked');
   if(Math.abs(Number(before.wallValues[1])-8.18)>0.001)
     throw Error('Manual Pull did not start from independently edited 8.18 mm wall');
   page.once('dialog',async(dialog)=>{await dialog.accept();});
   await page.locator('[data-mc-b36-selected-pull-row="1"]').click();
   await page.waitForFunction(()=>{
     const host=document.querySelector('#mc-preview-table-host');
     return host?.__xmlCiiPreviewResult
       &&host.__xmlCiiPreviewResult!==globalThis.__b36ReplayBeforePreview;
   },null,{timeout:180000});
   await page.waitForTimeout(750);
   const after=await page.evaluate(()=>{
     const host=document.querySelector('#mc-preview-table-host');
     const rows=host?.__xmlCiiPreviewResult?.branchRows||[];
     return {wallValues:rows.map(r=>String(r.wallThickness??'')),
       afterWallSource:rows[1]?.wallThicknessSource||null,
       acceptedStatus:rows[1]?.b313PullStatus||null,
       pullNote:(host?.innerText||'').includes('manually pulled to Preview only'),
       selectedValue:host?.querySelector('[data-mc-b36-selected-row="1"] [data-mc-b36-selected-value]')?.textContent||'',
       manualSelectionStatus:host?.querySelector('[data-mc-b36-selected-row="1"]')?.dataset.mcB36SelectedStatus||null,
       manualSelectionDetail:host?.querySelector('[data-mc-b36-selected-row="1"] [data-mc-b36-selected-detail]')?.textContent||'',
       rowCount:rows.length};
   });
   if(after.rowCount!==30||Math.abs(Number(after.wallValues[1])-7.112)>0.013)
     throw Error('Selected wall was not retained in rebuilt GLRD Preview '+JSON.stringify(after));
   if(Math.abs(Number(after.wallValues[1])-Number(before.wallValues[1]))<0.5)
     throw Error('Pull selected did not actually replace the distinct existing 8.18 mm Preview wall');
   if(after.wallValues.some((v,i)=>i!==1&&v!==before.wallValues[i]))
     throw Error('Manual Pull modified another source-backed GLRD row '+JSON.stringify(after));
   if(after.acceptedStatus==='ACCEPTED')
     throw Error('Manual B36 Pull improperly became B31.3 governed accepted record');
   if(!after.pullNote)
     throw Error('Manual B36 Pull did not record user-visible Preview save receipt');
   if(after.manualSelectionStatus!=='MANUAL_PULLED'
      ||!after.manualSelectionDetail.includes('MANUAL PULLED'))
     throw Error('No distinct persistent unqualified manual-Pull source receipt in selected cell '
       +JSON.stringify(after));
   return {before,after,sourceRowsUnaffected:29,governedAccepted:false};
 });

 const numeric=result.rows.filter(r=>/^\d+(?:\.\d+)?$/.test(r.requiredValue||''));
 const rowsWithBoth=result.rows.filter(r=>String(r.p1??'').trim()&&String(r.t1??'').trim());
 record.analysis={actualBranchCount:result.effectiveRowCount,
   actualNumericCount:result.numericCount,rowsWithBothP1T1:rowsWithBoth.length,
   '30Rows':result.effectiveRowCount===30,allCellsPresent:result.calculatedCellCount===result.effectiveRowCount,
   numericalRows:numeric.map(r=>({index:r.index,lineKey:r.lineKey,p1:r.p1,t1:r.t1,
     nominal:r.requiredValue,status:r.calculatedStatus})),
   noneWithoutP1T1:numeric.every(r=>String(r.p1??'').trim()&&String(r.t1??'').trim()),
   note:'Numerical values must be interpreted from effective actual Preview inputs; no source P1/T1 injected.'};
 // A table full of dashes is NOT a B31.3 acceptance pass. Derive
 // decisive four witnesses from actual source-backed Preview values, not
 // assumed row indices or artificial P1/T1 injection.
 const witnesses=[
   {line:'P4110001',dn:200,expected:7.800},
   {line:'P4110001',dn:150,expected:5.983},
   {line:'B4110003',dn:100,expected:3.759},
   {line:'B4110003',dn:400,expected:4.606},
 ];
 record.analysis.fourNumericalWitnesses=witnesses.map(w=>{
   const matching=result.rows.filter(r=>
     String(r.lineKey||'').replace(/[^A-Za-z0-9]/g,'').toUpperCase()===w.line
     &&Number(r.sizeMm)===w.dn);
   const actual=matching[0]||null;
   const nominal=Number(actual?.requiredValue);
   const valid=Boolean(actual&&matching.length===1&&
     /^\d+(?:\.\d+)?$/.test(actual.requiredValue||'')&&
     Math.abs(nominal-w.expected)<=0.03);
   return {...w,actual,nominal:Number.isFinite(nominal)?nominal:null,
     comparison:valid?'MATCH':'NOT_ESTABLISHED'};
 });
 record.analysis.fourWitnessesPass=record.analysis.fourNumericalWitnesses.every(x=>x.comparison==='MATCH');
 record.pass=record.analysis['30Rows']&&record.analysis.allCellsPresent&&
   record.analysis.noneWithoutP1T1&&record.analysis.fourWitnessesPass&&
   selected.selections.every(x=>x.ok)&&manualPull.after.rowCount===30&&
   record.pageErrors.length===0;
}catch(e){record.failed=String(e?.stack||e).slice(0,4500);process.exitCode=1;}
finally{
 try{await page.screenshot({path:path.join(out,'GLRD-PSI02-B36-selected-pull.png'),fullPage:true,timeout:20000});}catch(e){record.screenshotError=String(e);}
 record.completedAt=new Date().toISOString();
 await writeFile(path.join(out,'GLRD-PSI02-B36-selected-pull.json'),JSON.stringify(record,null,2));
 console.log('GLRD_PSI02_B36_SELECTED_PULL_BROWSER_REPLAY',JSON.stringify(record).slice(0,13000));
 await browser.close();
 if(!record.pass)process.exitCode=1;
}
