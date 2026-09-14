import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { configureWorkdaySchedule, usefulElapsedHours } from './date';
import { calculateEfficiencyTime } from './efficiency';
import { inspectDataQuality } from './dataQuality';
import { isIdleExpired, IDLE_LIMIT } from './useIdleSession';
import type { ProcessMovement } from './types';
const record = { movementId:1,caseId:1,mpNumber:'MP',judicialNumber:'0000000-00.2026.8.14.0301',className:'Apelação',subject:'Teste',receivedAt:'2026-09-14T11:00:00Z',sentAt:'2026-09-14T18:00:00Z',receivedTimePrecise:true,sentTimePrecise:true,workflowStatus:'Enviado',elapsedHours:7,assignedTo:'u',actionType:'Manifestação',deadlineAt:'',sociallyRelevant:true,extremelyComplex:true,relevanceReason:'',complexityReason:'' } as ProcessMovement;
test('1.1 rejeita intervalos negativos e mantém duração zero válida',()=>{
 assert.equal(usefulElapsedHours(record.sentAt!,record.receivedAt),null);
 assert.equal(usefulElapsedHours(record.receivedAt,record.receivedAt),0);
});
test('1.1 métricas horárias excluem horários imprecisos e respeitam jornada de 8 horas',()=>{
 configureWorkdaySchedule({workdayStart:'08:00',workdayEnd:'16:00',workdayHours:8});
 try {
  const result=calculateEfficiencyTime([record,{...record,movementId:2,sentTimePrecise:false,elapsedHours:90}],{startDate:'2026-09-01',endDate:'2026-09-30'});
  assert.equal(result.sentCount,2);assert.equal(result.preciseCount,1);assert.equal(result.median,7);assert.equal(result.withinOneDay,1);
 } finally {configureWorkdaySchedule(null);}
});
test('1.1 dados de qualidade não carregados não viram justificativas vazias',()=>{
 const unknown=inspectDataQuality([{...record,qualityDetailsLoaded:false}]);
 assert.equal(unknown.filter(i=>/Relevância social|Alta complexidade/.test(i.category)).length,0);
 const loaded=inspectDataQuality([{...record,qualityDetailsLoaded:true}]);
 assert.equal(loaded.filter(i=>/Relevância social|Alta complexidade/.test(i.category)).length,2);
});
test('1.1 inatividade vence no limite de quatro horas, inclusive ao reabrir',()=>{
 const last=100000;assert.equal(isIdleExpired(last,last+IDLE_LIMIT-1),false);assert.equal(isIdleExpired(last,last+IDLE_LIMIT),true);assert.equal(isIdleExpired(NaN,last),false);
});
test('1.1 worker aguarda confirmação antes de ativar e serve o HTML da versão instalada',async()=>{
 const listeners = new Map<string,(event:any)=>void>();let skipped=0;let response:unknown;let requested='';
 const shell={ok:true};
 const sandbox={URL,console,self:{location:{origin:'https://praxis.example.test'},addEventListener:(name:string,fn:(event:any)=>void)=>listeners.set(name,fn),skipWaiting:()=>skipped++,clients:{claim:async()=>{}}},caches:{open:async()=>({addAll:async()=>{},match:async(key:string)=>{requested=key;return shell;}})}};
 vm.runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),sandbox);
 let install:Promise<void>|undefined;listeners.get('install')!({waitUntil:(p:Promise<void>)=>install=p});await install;
 assert.equal(skipped,0);listeners.get('message')!({data:{type:'SKIP_WAITING'}});assert.equal(skipped,1);
 listeners.get('fetch')!({request:{method:'GET',url:'https://praxis.example.test/processos',mode:'navigate'},respondWith:(p:Promise<unknown>)=>response=p});
 assert.equal(await response,shell);assert.equal(requested,'/index.html');
 let intercepted=false;listeners.get('fetch')!({request:{method:'GET',url:'https://api.example.test/rest/v1/movements'},respondWith:()=>intercepted=true});assert.equal(intercepted,false);
});
