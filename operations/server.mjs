import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,dirname,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {timingSafeEqual} from 'node:crypto';
import {Store} from './store.mjs';
import {AppError,id,reject} from './domain.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const MIME={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
async function body(req,limit=1024*1024){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;reject(size>limit,'요청 크기를 줄여 주세요.','too_large',413);chunks.push(chunk);}return Buffer.concat(chunks);}
async function json(req){try{return JSON.parse((await body(req)).toString()||'{}');}catch(e){if(e instanceof AppError)throw e;throw new AppError(400,'invalid_json','요청 형식을 확인하세요.');}}
const cookie=req=>(req.headers.cookie||'').split(';').map(s=>s.trim().split('=')).find(([key])=>key==='relo_session')?.[1];
export function createOperationsServer({dataDir=joinData(),mode='synthetic',sessionMs,seed=true}={}){
  reject(mode!=='synthetic','실제 운영 모드는 인증 제공자·개인정보 처리·인프라 게이트 승인 전에는 시작할 수 없습니다.','production_gate',500);
  const store=new Store(dataDir,{sessionMs,seed}),attempts=new Map();
  const server=http.createServer(async(req,res)=>{
    const requestId=id();const security={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'",'X-Frame-Options':'DENY','X-Request-Id':requestId};
    const send=(status,value,extra={})=>{res.writeHead(status,{...security,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(value));};
    try{
      const host=req.headers.host||'',port=server.address()?.port;reject(![`127.0.0.1:${port}`,`localhost:${port}`].includes(host),'허용된 로컬 주소로 접속하세요.','invalid_host',403);
      const url=new URL(req.url,'http://'+host),path=decodeURIComponent(url.pathname);
      const isWrite=!['GET','HEAD'].includes(req.method);if(isWrite)reject(req.headers.origin!=='http://'+host,'요청 출처를 확인할 수 없습니다.','origin_denied',403);
      if(path==='/api/health'&&req.method==='GET')return send(200,{ok:true,mode:'synthetic-local',externalSending:false,aiProvider:'unconfigured'});
      if(path==='/api/login'&&req.method==='POST'){
        const input=await json(req),key=req.socket.remoteAddress+':'+String(input.email).toLowerCase(),time=Date.now(),prior=attempts.get(key);if(prior&&prior.until>time&&prior.count>=8)return send(429,{error:'too_many_attempts',message:'잠시 후 다시 로그인하세요.',requestId});
        const next=prior&&prior.until>time?prior:{count:0,until:time+5*60*1000};next.count++;attempts.set(key,next);
        const session=await store.login(input.email,input.password);attempts.delete(key);return send(200,{user:session.user,csrf:session.csrf},{'Set-Cookie':`relo_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${Math.floor(store.sessionMs/1000)}`});
      }
      if(path.startsWith('/api/')){
        const session=store.session(cookie(req));reject(!session,'로그인이 만료됐습니다. 다시 로그인해 주세요.','session_expired',401);const u=session.user;
        if(isWrite)reject(!same(req.headers['x-csrf-token'],session.csrf),'로그인 상태를 다시 확인하세요.','csrf_denied',403);
        const key=req.headers['idempotency-key'],version=Number(String(req.headers['if-match']||'').replaceAll('"',''));
        if(path==='/api/logout'&&req.method==='POST'){store.logout(cookie(req));return send(200,{ok:true},{'Set-Cookie':'relo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
        if(path==='/api/me'&&req.method==='GET')return send(200,{...store.metadata(u),csrf:session.csrf});
        if(path==='/api/claims'&&req.method==='GET')return send(200,{claims:store.list(u,{q:url.searchParams.get('q')||'',state:url.searchParams.get('state')||'',deleted:url.searchParams.get('deleted')==='1'})});
        if(path==='/api/claims'&&req.method==='POST')return send(201,{claim:store.create(u,await json(req),key)});
        let match=path.match(/^\/api\/files\/([a-zA-Z0-9-]+)$/);
        if(match&&req.method==='GET'){const f=store.file(u,match[1]);res.writeHead(200,{...security,'Content-Type':f.mime,'Content-Length':f.size,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`});res.end(Buffer.from(f.bytes));return;}
        match=path.match(/^\/api\/claims\/([a-zA-Z0-9-]+)(?:\/(files|receipts|transition|reply|draft|approve|manual-submit|restore|ai-test|draft-template))?$/);
        if(match){const cid=match[1],action=match[2];store.raw(u,cid,action==='restore');
          if(!action&&req.method==='GET')return send(200,{claim:store.detail(u,cid)});
          if(!action&&req.method==='PATCH')return send(200,{claim:store.update(u,cid,version,await json(req))});
          if(!action&&req.method==='DELETE'){const input=await json(req);return send(200,{claim:store.remove(u,cid,version,input.reason)});}
          if(action==='files'&&req.method==='POST'){
            reject(!['admin','agent'].includes(u.role),'변경 권한이 없습니다.','forbidden',403);
            const bytes=await body(req,10*1024*1024);return send(201,store.upload(u,cid,version,{name:decodeURIComponent(req.headers['x-file-name']||'evidence'),mime:req.headers['content-type']||'',bytes},key));
          }
          if(action==='draft-template'&&req.method==='GET')return send(200,store.draftTemplate(u,cid));
          if(action==='ai-test'&&req.method==='POST'){const input=await json(req);return send(200,store.testExtract(u,cid,input.fileId));}
          if(req.method==='POST'){const input=await json(req);if(action==='receipts')return send(201,store.receipt(u,cid,version,input,key));if(action==='transition')return send(200,{claim:store.transition(u,cid,version,input)});if(action==='reply')return send(200,{claim:store.reply(u,cid,version,input)});if(action==='draft')return send(201,{claim:store.draft(u,cid,version,input,key)});if(action==='approve'){reject(input.confirmed!==true,'최신 문의 내용을 직접 검토해야 합니다.');return send(200,{claim:store.approve(u,cid,version,input.draftId,key)});}if(action==='manual-submit')return send(200,{claim:store.submit(u,cid,version,input,key)});if(action==='restore')return send(200,{claim:store.restoreClaim(u,cid,version)});}
        }
        if(path==='/api/admin/backups'&&req.method==='GET')return send(200,{backups:store.backups(u)});
        if(path==='/api/admin/backups'&&req.method==='POST')return send(201,store.backup(u));
        match=path.match(/^\/api\/admin\/backups\/([a-zA-Z0-9-]+)\/restore$/);if(match&&req.method==='POST'){const input=await json(req);return send(200,store.restoreBackup(u,match[1],input.confirmed));}
        if(path==='/api/admin/audit-check'&&req.method==='GET')return send(200,store.verifyAudit(u));
        return send(404,{error:'not_found',message:'요청을 찾을 수 없습니다.',requestId});
      }
      reject(!['GET','HEAD'].includes(req.method),'지원하지 않는 요청입니다.','method_denied',405);
      let staticRoot=resolve(root,'ops'),relative=path==='/'?'/index.html':path;
      if(path.startsWith('/assets/')){staticRoot=resolve(root,'dist');relative=path.slice(7);}
      if(path==='/legacy'||path.startsWith('/legacy/')){staticRoot=resolve(root,'dist');relative=path==='/legacy'||path==='/legacy/'?'/index.html':path.slice(7);}
      const filename=resolve(staticRoot,'.'+relative);reject(!filename.startsWith(staticRoot+sep)||!MIME[extname(filename)],'파일을 찾을 수 없습니다.','not_found',404);const bytes=await readFile(filename);res.writeHead(200,{...security,'Content-Type':MIME[extname(filename)]});res.end(req.method==='HEAD'?undefined:bytes);
    }catch(error){const status=error instanceof AppError?error.status:error.code==='ENOENT'?404:500;send(status,{error:error instanceof AppError?error.code:status===404?'not_found':'server_error',message:error instanceof AppError?error.message:status===404?'파일을 찾을 수 없습니다.':'저장 결과를 확인하지 못했습니다. 같은 재시도 키로 다시 확인해 주세요.',requestId});}
  });
  return {server,store,async listen(port=4180){await new Promise((ok,no)=>{server.once('error',no);server.listen(port,'127.0.0.1',ok);});return 'http://127.0.0.1:'+server.address().port;},async close(){await new Promise(ok=>server.close(ok));store.close();}};
}
function joinData(){return resolve(root,'.relo-data');}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){const app=createOperationsServer({mode:process.env.RELO_MODE||'synthetic'});const url=await app.listen(Number(process.env.PORT||4180));console.log(`ReLo G2-A local synthetic environment: ${url}`);const stop=()=>app.close().then(()=>process.exit(0));process.on('SIGINT',stop);process.on('SIGTERM',stop);}
