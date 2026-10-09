import {readdir,readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const source=resolve(fileURLToPath(new URL('..',import.meta.url))),destination=resolve(process.argv[2]||'');
if(!process.argv[2]||destination===source||destination.startsWith(source+'/')||destination.startsWith(source+'\\'))throw Error('Provide a separate reviewed export directory');
const files=['.gitattributes','.gitignore','.env.example','package.json','package-lock.json','README.md','G2A_QA.md','server.mjs'];
async function walk(dir){for(const entry of await readdir(join(source,dir),{withFileTypes:true})){const path=dir+'/'+entry.name;if(entry.isSymbolicLink())throw Error('Symlinks are not exported');if(entry.isDirectory())await walk(path);else if(entry.isFile())files.push(path);}}
for(const dir of ['dist','ops','operations','tests','scripts','docs'])await walk(dir);
const forbidden=/(^|\/)(\.git|\.openai|\.agents|\.codex|node_modules|qa|data|backups|private-backups|exports|\.relo[^/]*)\/|\.(sqlite|db|pem|key|p12|pfx)(-|$)|(^|\/)\.env($|\.(?!example$))/i;
const secret=[/sk-[A-Za-z0-9_-]{16,}/,/gh[pousr]_[A-Za-z0-9]{20,}/,/github_pat_[A-Za-z0-9_]{20,}/,/AKIA[0-9A-Z]{16}/,/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,/eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/,/OPENAI_API_KEY\s*=\s*["']?sk-/];
// Patterns in this scanner's own source are literal regex examples, not credentials.
const manifest=[];
for(const path of files.sort()){if(forbidden.test(path))throw Error('Excluded path was selected: '+path);const bytes=await readFile(join(source,path));if(!/\.(png|jpg|jpeg|webp|pdf|ico)$/i.test(path)&&secret.some(pattern=>pattern.test(bytes.toString('utf8'))))throw Error('Potential credential detected in '+path+' (value withheld)');manifest.push({path,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
await mkdir(destination,{recursive:true});for(const entry of manifest){const target=join(destination,entry.path);if(relative(destination,target).startsWith('..'))throw Error('Export path escaped target');await mkdir(resolve(target,'..'),{recursive:true});await copyFile(join(source,entry.path),target);}
await writeFile(join(destination,'SOURCE_MANIFEST.json'),JSON.stringify({format:'relo-reviewed-source-v1',createdAt:new Date().toISOString(),scope:'synthetic source/tests/reviewed evidence only; no prior Sites Git history',files:manifest},null,2)+'\n');
console.log(JSON.stringify({files:manifest.length,totalBytes:manifest.reduce((n,f)=>n+f.size,0),secretScan:'PASS',dataExclusions:'PASS',destination}));
