import {computeLineNoKey} from './linelist-mapping.js';

const txt=value=>value===null||value===undefined?'':String(value).trim();
const compact=value=>txt(value).toUpperCase().replace(/\s+/g,'');
function token(row,...keys){
  for(const key of keys){
    if(!key)continue;
    const value=txt(row?.[key] ?? row?._raw?.[key]);
    if(value)return value;
  }
  return '';
}
function aliases(value){
  const v=compact(value);
  return v?[...new Set([v,v.replace(/^P(?=\d{5,}$)/,'')])]:[];
}
function selectedLineListRow(lineKey,config){
  const rows=Array.isArray(config?.linelist?.masterRows)?config.linelist.masterRows:[];
  const mapped=config?.linelist?.fieldMap||{};
  const regexText=txt(config?.linelist?.linelistColumnRegex);
  const regexGroup=Number(config?.linelist?.linelistColumnGroup)||1;
  const wanted=compact(lineKey);
  const aliasWanted=new Set(aliases(lineKey));
  const exact=[],loose=[];
  for(let i=0;i<rows.length;i++){
    const row=rows[i];
    let rawKey=txt(computeLineNoKey(row,mapped));
    if(!rawKey || /^[A-Z]$/.test(compact(rawKey))){
      rawKey=token(row,mapped.lineSeqNo,'lineSeqNo','Line number','Line Number','Line No');
      if(!rawKey){
        const p1=token(row,'lineKey1','Key 1','ColumnX1','Service','Fluid');
        const p2=token(row,'lineKey2','Key 2','ColumnX2','Line number','Line Number','Line No');
        rawKey=p1||p2?p1+p2:token(row,'lineKey','LineNo','Line No','Line Number','PipelineReference');
      }
    }
    if(regexText){
      try{const match=new RegExp(regexText,'i').exec(rawKey);rawKey=txt(match?.[regexGroup])||rawKey;}catch{}
    }
    const line=compact(rawKey);
    if(line&&line===wanted)exact.push({row,index:i});
    if(aliases(line).some(a=>aliasWanted.has(a)))loose.push({row,index:i});
  }
  if(exact.length===1)return exact[0];
  if(exact.length>1)return null;
  return loose.length===1?loose[0]:null;
}
function numericSame(a,b){
  const number=v=>Number(txt(v).replace(/,/g,'').match(/[-+]?\d*\.?\d+(?:[Ee][-+]?\d+)?/)?.[0]);
  const x=number(a),y=number(b);
  return Number.isFinite(x)&&Number.isFinite(y)&&Math.abs(x-y)<=Math.max(1,Math.abs(x),Math.abs(y))*1e-9;
}
function pressureUnit(header){
  const t=txt(header).toUpperCase();
  if(/KPA/.test(t))return 'KPA';
  if(/MPA/.test(t))return 'MPA';
  if(/BARG/.test(t))return 'BARG';
  if(/\bBAR\b/.test(t))return 'BAR';
  if(/PSIG/.test(t))return 'PSIG';
  if(/\bPSI\b/.test(t))return 'PSI';
  if(/\bPA\b|PASCAL/.test(t))return 'PA';
  return '';
}
function isDesignP1Header(header){
  const t=txt(header).toUpperCase();
  return (/\bP1\b/.test(t)||(/\bPRESSURE\b/.test(t)&&/\b(?:DESIGN|MAX|MAXIMUM)\b/.test(t)))
    && !/\b(?:TEST|HYDRO)\b/.test(t);
}

/** Pull-time independent custody check; no design factor or source approval implied. */
export function verifyB313PreviewPressureUnitReceipt(row={},config={},receipt=null){
  if(!receipt)return {ok:true,code:'NOT_LINE_LIST_DERIVED'};
  const source=txt(receipt.source);
  if(source.startsWith('line-list-header-band:')){
    if(!/LINELIST|LINE.LIST/.test(txt(row.p1Source).toUpperCase()))
      return {ok:false,code:'B313_PULL_P1_UNIT_SOURCE_CHANGED'};
    const looked=selectedLineListRow(row.lineKey,config);
    const selected=looked?.row;
    const texts=Array.isArray(selected?._sourceP1HeaderTexts)
      ?selected._sourceP1HeaderTexts.map(x=>txt(x).toUpperCase()):[];
    const design=texts.some(x=>/PRESSURE\s+(MAX|MAXIMUM)|DESIGN\s+PRESSURE/.test(x));
    const working=texts.some(x=>/AT\s+WORKING\s+CONDITIONS|OPERATING\s+CONDITIONS/.test(x));
    const sameUnit=txt(selected?._sourceP1Unit).toUpperCase()===txt(receipt.unit).toUpperCase();
    const sameColumn=txt(selected?._sourceP1HeaderSource)===source;
    const sameP=selected&&numericSame(selected.p1,row.p1)
      &&numericSame(selected._sourceP1OriginalValue,row.p1);
    if(!looked||!design||working||!sameUnit||!sameColumn||!sameP)
      return {ok:false,code:'B313_PULL_P1_UNIT_SOURCE_CHANGED'};
    return {ok:true,code:'B313_PULL_P1_SOURCE_CONFIRMED',
      sourceRowIndex:looked.index,source,unit:receipt.unit,
      pressureBasis:txt(selected._sourceP1HeaderPressureBasis)};
  }
  if(!source.startsWith('line-list-column:'))return {ok:true,code:'NOT_LINE_LIST_DERIVED'};
  if(!/LINELIST|LINE.LIST/.test(txt(row.p1Source).toUpperCase()))
    return {ok:false,code:'B313_PULL_P1_UNIT_SOURCE_CHANGED'};
  const header=txt(receipt.source).slice('line-list-column:'.length);
  const looked=selectedLineListRow(row.lineKey,config);
  const value=looked?.row?.[header] ?? looked?.row?._raw?.[header];
  if(!looked||!isDesignP1Header(header)||!pressureUnit(header)||
    pressureUnit(header)!==txt(receipt.unit).toUpperCase()||!numericSame(value,row.p1))
    return {ok:false,code:'B313_PULL_P1_UNIT_SOURCE_CHANGED'};
  // Reconfirm there are no conflicting unit-bearing design P1 columns with
  // the same numeric pressure on the uniquely selected source line.
  const candidates=Object.entries(looked.row).filter(([k,v])=>
    isDesignP1Header(k)&&pressureUnit(k)&&numericSame(v,row.p1));
  if([...new Set(candidates.map(([k])=>pressureUnit(k)))].length!==1)
    return {ok:false,code:'B313_PULL_P1_UNIT_SOURCE_CHANGED'};
  return {ok:true,code:'B313_PULL_P1_SOURCE_CONFIRMED',
    sourceRowIndex:looked.index,source:receipt.source,unit:receipt.unit};
}
