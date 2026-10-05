import Papa from 'papaparse';
import type {Account,CsvResult,RowDiagnostic} from '../shared/types';
// Papa Parse accepts bare quotes in unquoted fields; reject those malformed CSV
// inputs before parsing. This scanner validates quoting only, never splits records.
function validateQuotes(text:string):void{
 let state:'start'|'plain'|'quoted'|'closed'='start';
 for(let i=0;i<text.length;i++){const c=text[i];
  if(state==='quoted'){if(c==='"'){if(text[i+1]==='"')i++;else state='closed';}continue;}
  if(c===','||c==='\n'||c==='\r'){state='start';continue;}
  if(c==='"'){if(state!=='start')throw new Error('CSV has malformed quoting.');state='quoted';}
  else {if(state==='closed')throw new Error('CSV has malformed quoting.');state='plain';}
 }
 if(state==='quoted')throw new Error('CSV has malformed quoting.');
}
// @spec R-2.1..R-2.7: parse first, then validate identities without exposing row text.
export function parseCsv(bytes:Uint8Array):CsvResult{
 if(bytes.byteLength>2*1024*1024)throw new Error('CSV exceeds the 2 MiB file limit.');
 let text:string;try{text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw new Error('CSV must use valid UTF-8.');}
 validateQuotes(text);
 const result=Papa.parse<string[]>(text,{delimiter:',',header:false,dynamicTyping:false,skipEmptyLines:false});
 if(result.errors.length)throw new Error('CSV has malformed quoting.');
 const rows=result.data;const header=rows.shift()?.map(s=>s.trim().toLowerCase());
 if(!header||header.length>100||header.some(s=>!s)||new Set(header).size!==header.length||!['account_id','username','password'].every(s=>header.includes(s)))throw new Error('CSV requires unique headers: account_id, username, password (100 columns maximum).');
 const idIndex=header.indexOf('account_id'),userIndex=header.indexOf('username'),passIndex=header.indexOf('password');
 const records=rows.map((cells,index)=>({cells,row:index+2})).filter(({cells})=>!cells.every(s=>!s.trim()));
 if(records.length>10000||records.some(r=>r.cells.length>100))throw new Error('CSV exceeds 10,000 rows or 100 columns.');
 const frequencies=new Map<string,number>();for(const {cells}of records){const id=cells[idIndex]?.trim();if(id)frequencies.set(id,(frequencies.get(id)??0)+1);}
 const accounts:Account[]=[],diagnostics:RowDiagnostic[]=[];
 for(const {cells,row}of records){const accountId=cells[idIndex]?.trim()??'',username=cells[userIndex]?.trim()??'',password=cells[passIndex]??'';
 const code=frequencies.get(accountId)!>1?'DUPLICATE_ACCOUNT_ID':cells.length!==header.length?'FIELD_COUNT_MISMATCH':!accountId?'EMPTY_ACCOUNT_ID':!username?'EMPTY_USERNAME':password===''?'EMPTY_PASSWORD':null;
 if(code){diagnostics.push({row,code});continue;}
 const metadata:Record<string,string>=Object.fromEntries(header.flatMap((key,index)=>[idIndex,userIndex,passIndex].includes(index)?[]:[[key,cells[index]!]]));accounts.push({accountId,username,password,metadata});}
 return {accounts,found:records.length,valid:accounts.length,invalid:diagnostics.length,diagnostics};
}
