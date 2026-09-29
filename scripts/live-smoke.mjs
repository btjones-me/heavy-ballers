// Opt-in real API test. Builds are separate; this runs the actual built Worker and local D1.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,writeFile,mkdir,open,unlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {parseEnv} from 'node:util';
import {randomUUID} from 'node:crypto';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
const root=process.cwd(), args=process.argv.slice(2);
if(!args.includes('--live'))throw Error('Explicit --live is required; this test spends real API credits.');
const ledgerPath=resolve('qa/live-smoke-budget.json'), reportPath=resolve('qa/live-smoke-report.json');
await mkdir(resolve('qa'),{recursive:true});
const credentials=parseEnv(await readFile('.dev.vars','utf8').catch(e=>{if(e.code==='ENOENT')return '';throw e;}));
const key=process.env.OPENAI_API_KEY||credentials.OPENAI_API_KEY;if(!key)throw Error('OPENAI_API_KEY is required.');
// One cumulative ledger for this authorized run, including failed attempts. Never auto-reset it.
let ledger;try{ledger=JSON.parse(await readFile(ledgerPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;ledger={runId:randomUUID(),capUsd:0.20,chargedUsd:0,calls:[]};}
assert.equal(ledger.capUsd,0.20);assert.ok(ledger.chargedUsd>=0 && ledger.chargedUsd<=0.20);
const report={runId:ledger.runId,startedAt:new Date().toISOString(),cases:[],passed:false};
const persist=()=>writeFile(ledgerPath,JSON.stringify(ledger,null,2),{mode:0o600});
const temp=await mkdtemp(join(tmpdir(),'heavy-ballers-live-smoke-'));const proxySecret=randomUUID();
// Prevent two test processes from spending against the same allowance concurrently.
const lockPath=resolve('qa/live-smoke-budget.lock');
const budgetLock=await open(lockPath,'wx').catch(()=>{throw Error('Another smoke run owns the budget lock. Do not start concurrent runs.');});
// Reload after locking so no earlier process can have changed our balance.
try{ledger=JSON.parse(await readFile(ledgerPath,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
let worker, proxy;
const listen=server=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>resolve(server.address().port)));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
let proxyBusy=false;
try{
 proxy=createServer(async(req,res)=>{
  if(req.url!=='/v1/responses'||req.headers.authorization!==`Bearer ${proxySecret}`){res.writeHead(403).end();return;}
  if(proxyBusy){res.writeHead(429).end();return;}proxyBusy=true;
  let entry;
  try{
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>24000)throw Error('Request exceeds byte ceiling');}
   const input=JSON.parse(body);
   assert.equal(input.model,'gpt-6-luna');assert.equal(input.service_tier,'default');assert.equal(input.max_output_tokens,1200);assert.equal(input.store,false);
   // Above published standard input/cache-write rates, no cached discount. Input byte bound + protocol margin.
   // Every failed/uncertain request keeps its full reservation; no retries occur inside the proxy.
   const reserve=(Buffer.byteLength(body)+4096)*0.125/1e6+1200*0.50/1e6;
   if(ledger.chargedUsd+reserve>0.20){res.writeHead(429,{'Content-Type':'application/json'}).end(JSON.stringify({error:{code:'smoke_budget',message:'The $0.20 live test budget is exhausted.'}}));return;}
   entry={startedAt:new Date().toISOString(),reservedUsd:reserve,chargedUsd:reserve};ledger.calls.push(entry);ledger.chargedUsd+=reserve;await persist();
   const upstream=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body,signal:AbortSignal.timeout(35000)});
   const response=await upstream.text();entry.status=upstream.status;entry.durationMs=Date.now()-Date.parse(entry.startedAt);
   let parsed;try{parsed=JSON.parse(response);}catch{}
   if(upstream.ok&&Number.isInteger(parsed?.usage?.input_tokens)&&Number.isInteger(parsed?.usage?.output_tokens)){
    entry.usage=parsed.usage;entry.chargedUsd=parsed.usage.input_tokens*0.125/1e6+parsed.usage.output_tokens*0.50/1e6;
    assert.ok(entry.chargedUsd<=reserve,'Usage exceeded reserved bound');ledger.chargedUsd-=reserve-entry.chargedUsd;
   }
   await persist();res.writeHead(upstream.status,{'Content-Type':'application/json'}).end(response);
  }catch(e){if(entry){entry.failure=e.message;await persist();}res.writeHead(502,{'Content-Type':'application/json'}).end(JSON.stringify({error:{message:'Smoke gateway failed; reservation retained.'}}));}
  finally{proxyBusy=false;}
 });
 const proxyPort=await listen(proxy), portProbe=createServer(), workerPort=await listen(portProbe);await new Promise(r=>portProbe.close(r));
 const origin=`http://127.0.0.1:${workerPort}`;
 const config=JSON.parse(await readFile('dist/server/wrangler.json','utf8'));
 config.main=resolve('dist/server/index.js');config.assets.directory=resolve('dist/client');
 config.vars={APP_ORIGIN:origin,OPENAI_MODEL:'gpt-6-luna',OPENAI_API_KEY:proxySecret,OPENAI_TEST_PROXY:`http://127.0.0.1:${proxyPort}/v1/responses`,MCP_TOKEN:randomUUID(),ADMIN_PASSWORD:randomUUID()};
 config.d1_databases[0].migrations_dir=resolve('drizzle');delete config.build;delete config.dev;
 const configPath=join(temp,'wrangler.json');await writeFile(configPath,JSON.stringify(config),{mode:0o600});
 const cli=resolve('node_modules/wrangler/bin/wrangler.js'), state=join(temp,'state');
 const env={...process.env,WRANGLER_SEND_METRICS:'false',CLOUDFLARE_CF_FETCH_ENABLED:'false'};delete env.OPENAI_API_KEY;
 const migrate=spawnSync(process.execPath,[cli,'d1','migrations','apply','DB','--local','--config',configPath,'--persist-to',state],{cwd:temp,env,encoding:'utf8'});
 if(migrate.status!==0)throw Error('Local smoke database migration failed: '+migrate.stderr);
 let workerLogs='';worker=spawn(process.execPath,[cli,'dev','--local','--config',configPath,'--persist-to',state,'--port',String(workerPort),'--ip','127.0.0.1','--inspector-port','0'],{cwd:temp,env,stdio:['ignore','pipe','pipe']});
 worker.stdout.on('data',b=>{workerLogs+=b.toString();});worker.stderr.on('data',b=>{workerLogs+=b.toString();});
 for(let i=0;;i++){try{if((await fetch(origin+'/api/bootstrap')).ok)break;}catch{}if(i>=80)throw Error('Smoke Worker did not become ready: '+workerLogs.slice(-3000));await delay(250);}
 const api=async(path,token,body)=>{const response=await fetch(origin+'/api/'+path,{method:body===undefined?'GET':'POST',headers:{Origin:origin,'Content-Type':'application/json',...(token?{'x-demo-token':token}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{})});const data=await response.json();assert.ok(response.ok,`${path}: HTTP ${response.status} ${JSON.stringify(data)}`);return data;};
 const fresh=async()=> (await api('demo/start',null,{})).token;
 const saved=async token=>(await api('bootstrap',token)).fixtures.find(f=>f.id==='demo-gw7-1');
 const send=async(token,senderId,text)=>{
  let finished=false,pollError;const acks=new Set();
  const poll=(async()=>{while(!finished){try{const state=await api('demo/state',token);if(state.presentation&&!acks.has(state.presentation.runId)){// Real read-before-write baseline and same owner acknowledgement endpoint as the UI.
    await api('bootstrap',token);await api('demo/present',token,{runId:state.presentation.runId});acks.add(state.presentation.runId);
   }}catch(e){pollError=e;}await delay(100);}})();
  const messageId=randomUUID();try{await api('demo/message',token,{conversationId:'queens-pork-demo',fixtureId:'demo-gw7-1',senderId,text,messageId,timestamp:new Date().toISOString()});}finally{finished=true;await poll;}
  if(pollError)throw pollError;
  const state=await api('demo/state',token),fixture=await saved(token);
  const outcome={input:{senderId,text},fixture,reply:state.messages.filter(m=>m.role==='assistant').at(-1)?.text,trace:state.events.filter(e=>e.runId?.endsWith(messageId))};
  report.cases.push(outcome);await writeFile(reportPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify({message:text,reply:outcome.reply,score:[fixture.homeScore,fixture.awayScore],homeScorers:fixture.homeScorers,awayScorers:fixture.awayScorers,shootout:fixture.shootoutWinnerId,chargedUsd:ledger.chargedUsd}));
  return {fixture,state,messageId};
 };
 // Import the exact client script, not a hand-maintained approximation.
 const scriptModule=join(temp,'demo-script.mjs');await build({entryPoints:[resolve('lib/demo-script.ts')],bundle:true,platform:'node',format:'esm',outfile:scriptModule});
 const {DEMO_SCRIPT}=await import(pathToFileURL(scriptModule).href);
 const a=await fresh(), b=await fresh();
 const scorerMap=xs=>Object.fromEntries(xs.map(x=>[x.playerId,x.goals]));
 for(const [i,step]of DEMO_SCRIPT.entries()){
  const {fixture,state}=await send(a,step.senderId,step.text);
  assert.deepEqual([fixture.homeScore,fixture.awayScore],[4,2]);
  if(i>=1)assert.equal(scorerMap(fixture.homeScorers)['qpr-alfie'],2);
  if(i===2)assert.match(state.messages.at(-1).text,/NetSix/);
  if(i>=2)assert.deepEqual(scorerMap(fixture.homeScorers),{'qpr-alfie':2,'qpr-sam':1,'qpr-ben':1});
  if(i>=3)assert.deepEqual(scorerMap(fixture.awayScorers),{'net-leo':1,'net-jamie':1});
  if(i<4)assert.equal(state.messages.filter(m=>m.role==='image').length,0);
  if(i===4){const cards=state.messages.filter(m=>m.role==='image');assert.equal(cards.length,1);const card=JSON.parse(cards[0].text);assert.equal(card.homeScore,4);assert.equal(card.awayScore,2);assert.equal(card.standings.find(r=>r.teamId==='net').points,8);assert.equal(card.homeScorers.length,3);assert.equal(card.awayScorers.length,2);assert.equal(fixture.shootoutWinnerId,'net');assert.deepEqual([state.match.homePoints,state.match.awayPoints],[3,1]);assert.doesNotMatch(state.messages.at(-1).text,/which.*scorer|can.t match/i);}
 }
 assert.equal((await saved(b)).homeScore,null);
 const lastVersion=(await saved(a)).version;
 const beforeCalls=ledger.calls.length;
 // Duplicate delivery is a no-op and makes no paid call.
 const last=(await api('demo/state',a)).messages.filter(m=>m.role==='user').at(-1);
 await api('demo/message',a,{conversationId:'queens-pork-demo',fixtureId:'demo-gw7-1',senderId:'ben',text:last.text,messageId:last.id.split(':').at(-1),timestamp:new Date().toISOString()});
 assert.equal(ledger.calls.length,beforeCalls);assert.equal((await saved(a)).version,lastVersion);assert.equal((await api('demo/state',a)).messages.filter(m=>m.role==='image').length,1);
 await send(b,'ben','We won 4-2.');
 let r=await send(b,'ben','Sam scored one for Queens.');assert.deepEqual(r.fixture.homeScorers,[]);assert.match(r.state.messages.at(-1).text,/Sam K|Sam R/);
 r=await send(b,'ben','Dave scored two for Queens.');assert.deepEqual(r.fixture.homeScorers,[]);assert.match(r.state.messages.at(-1).text,/Dave|squad|roster/i);
 r=await send(b,'ben','NetSix won the penalty shootout.');assert.equal(r.fixture.shootoutWinnerId,'net');assert.deepEqual(r.fixture.homeScorers,[]);assert.doesNotMatch(r.state.messages.at(-1).text,/can.t match that scorer/i);
 r=await send(b,'alfie','I bagged a brace for Queens.');assert.equal(scorerMap(r.fixture.homeScorers)['qpr-alfie'],2);
 r=await send(b,'sam','Sam K got one, Ben got the other.');assert.deepEqual(scorerMap(r.fixture.homeScorers),{'qpr-alfie':2,'qpr-sam':1,'qpr-ben':1});
 r=await send(b,'leo','Me and Jamie scored one each for NetSix.');assert.deepEqual(scorerMap(r.fixture.awayScorers),{'net-leo':1,'net-jamie':1});
 r=await send(b,'ben','Correction: the correct score was 5-2. Alfie actually scored three, Sam K and Ben J one each.');assert.equal(r.fixture.homeScore,5);assert.equal(scorerMap(r.fixture.homeScorers)['qpr-alfie'],3);
 const reset=await api('demo/reset',a,{});assert.equal((await saved(reset.token)).homeScore,null);assert.equal((await saved(b)).homeScore,5);
 const traces=report.cases.flatMap(c=>c.trace);assert.ok(traces.some(t=>t.tool==='update_match_report'&&t.httpStatus===200&&t.result?.structuredContent?.saved));
 report.passed=true;console.log('PASS: real OpenAI → built Worker → HTTP MCP → D1 → public bootstrap; scripted and adversarial reports, duplicates, isolation, reset.');
}catch(e){report.failure=e.message;console.error('FAIL:',e.message);process.exitCode=1;}
finally{report.finishedAt=new Date().toISOString();report.budget={capUsd:0.20,chargedUsd:ledger.chargedUsd,calls:ledger.calls.length};await writeFile(reportPath,JSON.stringify(report,null,2));console.log(JSON.stringify(report.budget));worker?.kill('SIGTERM');proxy?.closeAllConnections();proxy?.close();await budgetLock.close();await unlink(lockPath);}
