import {spawn} from 'node:child_process';
import {mkdir,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const output=resolve('docs/verification');await mkdir(output,{recursive:true});
const checks=[['syntax',['--check','operations/domain.mjs']],['syntax-ai',['--check','operations/ai.mjs']],['syntax-store',['--check','operations/store.mjs']],['syntax-server',['--check','operations/server.mjs']],['syntax-ui',['--check','ops/app.mjs']],['syntax-legacy',['--check','dist/app.mjs']],['HTTP 8',['--test','--test-reporter=spec','operations/tests/http.test.mjs']],['v4 45',['--test','--test-reporter=spec','tests/*.test.mjs']],['Chromium 9',['--test','--test-reporter=spec','operations/tests/browser.test.mjs']]];
let log=`ReLo synthetic verification\nUTC ${new Date().toISOString()}\nNode ${process.version}\nNo real model calls, credentials, customer data or external workflow sends.\n\n`,results=[];
for(const [name,args] of checks){const r=await new Promise((ok,no)=>{const child=spawn(process.execPath,args,{stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',b=>{out+=b;process.stdout.write(b);});child.stderr.on('data',b=>{out+=b;process.stderr.write(b);});child.on('error',no);child.on('close',exit=>ok({exit,out}));});log+=`${name}: node ${args.join(' ')}\n${r.out}\nExit ${r.exit}\n\n`;results.push({name,command:['node',...args],exit:r.exit});}
await writeFile(resolve(output,'test-results.txt'),log);await writeFile(resolve(output,'test-results.json'),JSON.stringify({verifiedAt:new Date().toISOString(),node:process.version,results,passed:results.every(r=>r.exit===0)},null,2)+'\n');
try{await copyFile('qa/operations/browser-evidence.json',resolve(output,'browser-evidence.json'));}catch{}
console.log(JSON.stringify({passed:results.every(r=>r.exit===0),results:results.map(({name,exit})=>({name,exit})),evidenceDirectory:'docs/verification'}));process.exitCode=results.every(r=>r.exit===0)?0:1;
