import {createHash,randomUUID} from 'node:crypto';
export const id=()=>randomUUID();
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const now=()=>new Date().toISOString();
export class AppError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code;}}
export const reject=(condition,message,code='validation',status=422)=>{if(condition)throw new AppError(status,code,message);};
export const text=(value,max=1000)=>String(value??'').trim().slice(0,max);
export function money(value){const s=String(value??'');reject(!/^\d{1,8}(\.\d{1,2})?$/.test(s),'금액은 USD, 0 이상, 소수점 두 자리까지 입력하세요.');const [a,b='']=s.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));}
export const amount=cents=>(cents/100).toFixed(2);
export function date(value){const s=String(value??'');reject(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s,'날짜를 YYYY-MM-DD로 확인하세요.');return s;}
export function pastDate(value){const d=date(value);reject(d>now().slice(0,10),'실제 확인일은 미래 날짜일 수 없습니다.');return d;}
export function claimInput(input){
  const title=text(input.title,150),orderRef=text(input.orderRef,100),issue=text(input.issue,3000);
  reject(!title||!orderRef||!issue,'상품/사건명, 주문 참조, 문제 설명은 필수입니다.');
  reject(input.currency!=='USD','초기 범위는 USD 한 통화입니다.');
  reject(!['refund','exchange','repair'].includes(input.kind),'반품·환불, 교환, AS 중 선택하세요.');
  reject(!Array.isArray(input.items)||!input.items.length||input.items.length>30,'주문 품목을 1~30개 입력하세요.');
  const items=input.items.map(item=>{const sku=text(item.sku,100),name=text(item.name,150),orderedQty=Number(item.orderedQty),claimQty=Number(item.claimQty);reject(!sku||!name||!Number.isInteger(orderedQty)||!Number.isInteger(claimQty)||orderedQty<1||orderedQty>100000||claimQty<1||claimQty>orderedQty,'품목 코드·명칭과 주문/클레임 수량을 확인하세요.');return {sku,name,orderedQty,claimQty,unitPrice:money(item.unitPrice)};});
  const claimed=money(input.claimedAmount),agreed=input.agreedAmount===''||input.agreedAmount==null?null:money(input.agreedAmount);
  reject(claimed===0,'청구액은 0보다 커야 합니다.');reject(agreed!==null&&agreed>claimed,'합의액은 청구액을 초과할 수 없습니다.');
  return {title,orderRef,issue,issueEnglish:text(input.issueEnglish,3000),currency:'USD',kind:input.kind,orderedOn:pastDate(input.orderedOn),items,claimed,agreed,deadline:input.deadline?date(input.deadline):null,deadlineQuote:text(input.deadlineQuote,1000),deadlineZone:['UTC','Asia/Seoul','America/Los_Angeles'].includes(input.deadlineZone)?input.deadlineZone:'UTC'};
}
export const STATES={preparing:'자료 준비',review:'문의 검토',awaiting:'공급처 답변 대기',negotiating:'합의 진행',partial:'부분 회수',disputed:'분쟁',waived:'포기 기록',recovered:'회수 확인',completed:'종료'};
export function totals(claim,ledger){const cash=ledger.reduce((sum,r)=>sum+(r.kind==='cash'?r.amount:r.kind==='reversal'?-r.amount:0),0),goods=ledger.reduce((sum,r)=>sum+(r.kind==='goods'?r.quantity:r.kind==='reversal'?-r.quantity:0),0),repair=ledger.some(r=>r.kind==='repair'&&!ledger.some(x=>x.reverses===r.id));return {cash,goods,repair,remaining:Math.max(0,(claim.agreed??claim.claimed)-cash),requestedQty:claim.items.reduce((n,i)=>n+i.claimQty,0)};}
export function recovered(claim,summary){return claim.kind==='refund'?claim.agreed!==null&&claim.agreed>0&&summary.cash===claim.agreed:claim.kind==='exchange'?summary.goods===summary.requestedQty:summary.repair;}
export function restoreState(claim,saved,summary){if(['disputed','waived'].includes(saved))return saved;if(recovered(claim,summary))return saved==='completed'?'completed':'recovered';if(['completed','recovered','partial'].includes(saved))return summary.cash||summary.goods||summary.repair?'partial':'negotiating';return saved;}
export function factualSnapshot(claim,files){return hash(JSON.stringify({title:claim.title,orderRef:claim.orderRef,issue:claim.issue,issueEnglish:claim.issueEnglish,kind:claim.kind,items:claim.items,claimed:claim.claimed,agreed:claim.agreed,currency:claim.currency,files:files.filter(f=>!f.deleted).map(f=>[f.id,f.sha]).sort()}));}
export function nextStep(c){if(c.deleted)return '관리자가 삭제 기록을 검토하고 복원할 수 있어요.';if(c.state==='waived')return '포기 사유를 검토하거나 재개하세요. 회수 원장은 남아 있어요.';if(c.state==='disputed')return '쟁점과 근거를 추가하고 다음 합의 조건을 기록하세요.';if(c.state==='completed')return '종료 근거와 회수 원장을 확인하세요.';if(c.state==='recovered')return '실제 확인 근거를 검토하고 종료하세요.';if(c.summary.remaining&&c.summary.cash)return '남은 회수액과 공급처 기한을 확인하세요.';if(c.state==='awaiting')return '공급처 답변을 기록하고 합의 조건을 갱신하세요.';if(!c.files.length)return '주문·불량 증빙을 비공개로 저장하세요.';if(c.agreed===null)return '문의 내용을 검토하고 공급처 합의액을 별도로 기록하세요.';return '실제 입금·수령을 증빙과 함께 기록하세요.';}
