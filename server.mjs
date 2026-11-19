import { createServer } from 'node:http';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID as uuid } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { token, digest, hashPassword, validPassword, fail, string } from './security.mjs';

const directory = resolve(process.env.DATA_DIR || './data');
mkdirSync(directory, { recursive: true });
const db = new DatabaseSync(resolve(directory, 'central.sqlite'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));
const get = (sql, ...args) => db.prepare(sql).get(...args);
const all = (sql, ...args) => db.prepare(sql).all(...args);
const run = (sql, ...args) => db.prepare(sql).run(...args);
function transaction(action) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = action(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
transaction(()=>{
  if(all('PRAGMA table_info(account_handles)').some(column=>column.name==='role')) {
    db.exec('ALTER TABLE account_handles DROP COLUMN role');
  }
  db.exec('PRAGMA user_version=4');
});
const now = Date.now;
const audit = (c,a,k,r=null,d={}) => run('INSERT INTO audit(campaign,actor,action,resource,timestamp,detail) VALUES(?,?,?,?,?,?)',c,a,k,r,now(),JSON.stringify(d));
const emailOf = (value) => {
  const email = string(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith('@accounts.invalid')) fail(400,'E-mail inválido.');
  return email;
};
const nameKey=(name)=>name.normalize('NFC').replace(/\s+/g,' ').toLowerCase();
function createRoomCode(campaign) {
  let code;
  do { code=token().slice(0,16).toUpperCase(); } while(get('SELECT 1 FROM room_codes WHERE code=?',code));
  run('INSERT INTO room_codes VALUES(?,?)',campaign,code);
  return code;
}
function invite(user) {
  const key = token();
  run('UPDATE users SET invite=?,expires=? WHERE id=?',digest(key),now()+86_400_000,user);
  return key;
}
if (process.argv[2] === 'bootstrap' || process.argv[2] === 'recover') {
  const identifier = process.argv[3];
  const email = process.argv[2]==='bootstrap' ? emailOf(identifier) : null;
  const key = transaction(() => {
    if (process.argv[2] === 'recover') {
      const key=nameKey(string(identifier,254));
      const user = get('SELECT user AS id FROM account_handles WHERE handle=?',key) ||
        get('SELECT id FROM users WHERE email=? AND email NOT LIKE ?',key,'%@accounts.invalid');
      if (!user) fail(404,'Conta inexistente.');
      run('DELETE FROM sessions WHERE user=?', user.id);
      return invite(user.id);
    }
    if (get('SELECT 1 FROM users LIMIT 1')) fail(409,'Já existe uma conta inicial.');
    const id = uuid();
    run('INSERT INTO users(id,email,name) VALUES(?,?,?)',id,email,string(process.argv[4],100));
    return invite(id);
  });
  console.log('Código de acesso de uso único, válido por 24 horas: ' + key);
  process.exit(0);
}
function membership(id,user) {
  const member = get('SELECT m.*,c.slug,c.name,c.description,c.theme,c.zone FROM campaigns c JOIN members m ON c.id=m.campaign WHERE c.slug=? AND m.user=? AND m.active=1',id,user);
  if (!member) fail(404,'Campanha indisponível.');
  return member;
}
function onlyMaster(m) { if (m.role !== 'gm') fail(403,'Apenas o mestre pode executar esta ação.'); }
function resource(id,m) {
  const row = get('SELECT * FROM resources WHERE id=? AND campaign=?',id,m.campaign);
  if (!row || row.kind!=='mission' || row.status!=='published' || row.release>now() ||
    (m.role!=='gm' && !get('SELECT 1 FROM deliveries WHERE resource=? AND user=?',id,m.user))) fail(404,'Missão indisponível.');
  return row;
}
function serialize(r,m, expanded=false) {
  const master = m.role === 'gm';
  const stored = JSON.parse(r.detail);
  const progress = stored.progress==='individual'?'individual':'shared';
  const individual = !master && progress==='individual';
  const hasRead = get('SELECT 1 FROM deliveries WHERE resource=? AND read IS NOT NULL'+(individual?' AND user=?':''),r.id,...(individual?[m.user]:[]));
  const completed = stored.state==='completed' || (individual && stored.individual?.[m.user]?.state==='completed');
  const detail = {progress,state:completed?'completed':hasRead?'in_progress':'available'};
  const own = get('SELECT read FROM deliveries WHERE resource=? AND user=?',r.id,m.user);
  const counts=master ? get('SELECT count(*) AS recipientCount,count(read) AS readCount FROM deliveries WHERE resource=?',r.id) : {};
  return {
    id:r.id, title:r.title, created:r.created, published:r.published,
    ...counts,
    unread:Boolean(own && own.read===null), detail,
    receipts:expanded && (master || r.author===m.user) ? all('SELECT u.id,u.name,d.read FROM deliveries d JOIN users u ON u.id=d.user WHERE d.resource=? ORDER BY u.name',r.id):undefined,
    history:expanded && master ? all("SELECT action,timestamp FROM audit WHERE campaign=? AND resource=? AND action IN ('registro criado','missão publicada','revelação publicada','missão atualizada','missão concluída') ORDER BY id DESC LIMIT 100",m.campaign,r.id):undefined
  };
}
function list(m,url) {
  const filters = ["r.campaign=?","r.kind='mission'","r.status='published'","r.release<=?"];
  const args = [m.campaign,now()];
  if (m.role!=='gm') {
    filters.push('EXISTS(SELECT 1 FROM deliveries d WHERE d.resource=r.id AND d.user=?)');
    args.push(m.user);
  }
  const q = (url.searchParams.get('q') || '').slice(0,200);
  const cursor = url.searchParams.get('before');
  if (q) { filters.push("instr(lower(r.title),lower(?))>0"); args.push(q); }
  const state=url.searchParams.get('state');
  if (states.includes(state)) {
    const personal=m.role!=='gm';
    const completed=personal?" OR (json_extract(r.detail,'$.progress')='individual' AND json_extract(r.detail,?)='completed')":'';
    const read=personal?" AND (coalesce(json_extract(r.detail,'$.progress'),'shared')<>'individual' OR d.user=?)":'';
    filters.push(`(CASE WHEN json_extract(r.detail,'$.state')='completed'${completed} THEN 'completed'
      WHEN EXISTS(SELECT 1 FROM deliveries d WHERE d.resource=r.id AND d.read IS NOT NULL${read}) THEN 'in_progress'
      ELSE 'available' END)=?`);
    if(personal) args.push('$.individual."'+m.user+'".state',m.user);
    args.push(state);
  }
  if (cursor) {
    const [time,id] = cursor.split(',');
    filters.push('(coalesce(r.published,r.created),r.id)<(?,?)');
    args.push(Number(time)||0,id||'');
  }
  const rows = all('SELECT r.* FROM resources r WHERE '+filters.join(' AND ')+' ORDER BY coalesce(r.published,r.created) DESC,r.id DESC LIMIT 26',...args);
  const page = rows.slice(0,25);
  const last = page.at(-1);
  return { items:page.map(r=>serialize(r,m)), next:rows.length>25?[last.published||last.created,last.id].join(','):null };
}
const states = ['available','in_progress','completed'];
function missionHistory(m,url) {
  const before=Number(url.searchParams.get('before')) || Number.MAX_SAFE_INTEGER;
  const rows=all(`WITH latest AS (
      SELECT r.id AS mission,r.title,max(a.id) AS event
      FROM audit a JOIN resources r ON r.id=a.resource AND r.campaign=a.campaign
      WHERE a.campaign=? AND r.kind='mission' AND r.status='published' AND r.release<=?
        AND (a.action IN ('missão publicada','revelação publicada','missão atualizada','missão concluída')
          OR (a.action='registro criado' AND json_extract(a.detail,'$.status')='published'))
        AND (?='gm' OR (
          EXISTS(SELECT 1 FROM deliveries d WHERE d.resource=r.id AND d.user=?)
          AND (json_extract(a.detail,'$.target') IS NULL OR json_extract(a.detail,'$.target')=?)))
      GROUP BY r.id
    )
    SELECT a.id,a.timestamp,l.mission,l.title,
      CASE a.action WHEN 'missão atualizada' THEN 'Missão atualizada' WHEN 'missão concluída' THEN 'Missão concluída' ELSE 'Missão publicada' END AS action
    FROM latest l JOIN audit a ON a.id=l.event
    WHERE a.id<? ORDER BY a.id DESC LIMIT 26`,m.campaign,now(),m.role,m.user,m.user,before);
  const items=rows.slice(0,25);
  return {items,next:rows.length>25?items.at(-1).id:null};
}
function createMission(m,b) {
  onlyMaster(m);
  if ((b.kind && b.kind!=='mission') || b.draft || b.release || b.persona || b.reply) fail(400,'A Central permite apenas missões com publicação imediata.');
  const mode=b.mode==='all'?'all':'broadcast';
  const active=all('SELECT user FROM members WHERE campaign=? AND active=1 AND role=?',m.campaign,'player').map(row=>row.user);
  const recipients=mode==='all'?active:[...new Set(Array.isArray(b.targets)?b.targets:[])];
  if (!recipients.length || recipients.length>250 || recipients.some(id=>!active.includes(id))) fail(400,'Selecione jogadores ativos para receber a missão.');
  const title=string(b.title,160);
  if (b.files!==undefined) fail(400,'Missões não aceitam anexos.');
  const detail={progress:b.progress==='individual'?'individual':'shared'};
  const id=uuid();
  const timestamp=now();
  run("INSERT INTO resources(id,campaign,author,kind,mode,title,body,status,created,release,published,detail) VALUES(?,?,?,'mission',?,?,'','published',?,?,?,?)",id,m.campaign,m.user,mode,title,timestamp,timestamp,timestamp,JSON.stringify(detail));
  for (const user of recipients) run('INSERT INTO deliveries(resource,user) VALUES(?,?)',id,user);
  audit(m.campaign,m.user,'missão publicada',id);
  return {id,count:recipients.length};
}
function updateMission(m,r,b) {
  const title=string(b.title??r.title,160);
  if (title===r.title) return {ok:true};
  run('UPDATE resources SET title=? WHERE id=?',title,r.id);
  audit(m.campaign,m.user,'missão atualizada',r.id);
  return {ok:true};
}
function completeMission(m,r) {
  const detail=JSON.parse(r.detail);
  if(detail.state!=='completed') {
    detail.state='completed';
    run('UPDATE resources SET detail=? WHERE id=?',JSON.stringify(detail),r.id);
    audit(m.campaign,m.user,'missão concluída',r.id);
  }
  return {ok:true};
}
const rate = new Map();
function limit(key,max) {
  const cutoff=now()+60_000;
  const entry=rate.get(key);
  const current=entry && entry.until>now()?entry:{count:0,until:cutoff};
  current.count++; rate.set(key,current);
  if (current.count>max) fail(429,'Muitas solicitações. Tente novamente em um minuto.');
}
setInterval(()=>{for(const [key,entry] of rate) if(entry.until<now()) rate.delete(key);},60_000).unref();
async function jsonBody(req) {
  if (!req.headers['content-type']?.startsWith('application/json')) fail(415,'Use JSON.');
  const chunks=[]; let size=0;
  for await (const chunk of req) {
    size+=chunk.length;
    if(size>8_500_000) fail(413,'Solicitação muito grande.');
    chunks.push(chunk);
  }
  let value;
  try { value=JSON.parse(Buffer.concat(chunks)); } catch { fail(400,'JSON inválido.'); }
  if(!value || typeof value!=='object' || Array.isArray(value)) fail(400,'Corpo inválido.');
  return value;
}
const cookieOptions='; Path=/; HttpOnly; SameSite=Strict'+(process.env.SECURE_COOKIE==='1'?'; Secure':'');
function session(req) {
  const raw = /(?:^|;\s*)central=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];
  return raw ? get('SELECT u.id,u.name,u.email,s.token FROM sessions s JOIN users u ON u.id=s.user WHERE s.token=? AND s.expires>?',digest(raw),now()):null;
}
function login(res,user) {
  const key=token(); run('INSERT INTO sessions VALUES(?,?,?)',digest(key),user.id,now()+604_800_000);
  res.setHeader('Set-Cookie','central='+key+'; Max-Age=604800'+cookieOptions);
  return {ok:true};
}
function theme(value) {
  if (!value || typeof value!=='object') fail(400,'Tema inválido.');
  const themes=['terminal','modern','archive','arcane'];
  const preset=themes.includes(value.preset)?value.preset:'arcane';
  const color = (key) => /^#[0-9a-f]{6}$/i.test(value[key]||'') ? value[key] : null;
  return {preset,primary:color('primary'),secondary:color('secondary'),accent:color('accent'),
    radius:[4,8,12,18,24].includes(value.radius)?value.radius:12,mode:value.mode==='light'?'light':'dark'};
}
const staticFiles = new Map([
  ['/app.js',['application/javascript','app.js']],
  ['/style.css',['text/css','style.css']],
  ['/favicon.svg',['image/svg+xml','favicon.svg']]
]);
function eventStream(req,res,m) {
  function fingerprint() {
    const rows=all(`SELECT r.id,r.status,r.published,d.read,
      (SELECT max(a.id) FROM audit a WHERE a.resource=r.id AND
        (?='gm' OR a.action<>'missão atualizada' OR json_extract(a.detail,'$.target') IS NULL OR json_extract(a.detail,'$.target')=?)) AS revision,
      CASE WHEN ?='gm' OR coalesce(json_extract(r.detail,'$.progress'),'shared')<>'individual' THEN (SELECT max(read) FROM deliveries WHERE resource=r.id) END AS receipts
      FROM resources r LEFT JOIN deliveries d ON d.resource=r.id AND d.user=?
      WHERE r.campaign=? AND r.kind='mission' AND r.status='published' AND r.release<=? AND (?='gm' OR d.user IS NOT NULL)
      ORDER BY r.id`,m.role,m.user,m.role,m.user,m.campaign,now(),m.role);
    return digest(JSON.stringify(rows.map(row=>[row.id,row.status,row.published,row.read,row.revision,row.receipts])));
  }
  let last=fingerprint();
  res.writeHead(200,{'Content-Type':'text/event-stream','X-Accel-Buffering':'no','Connection':'keep-alive'});
  res.write(': conectado\n\n');
  let ticks=0;
  const timer=setInterval(()=>{
    try {
      if(!session(req) || membership(m.slug,m.user).role!==m.role) return res.end();
      const next=fingerprint();
      if(next!==last) {last=next;res.write('event: change\ndata: {}\n\n');}
      else if(++ticks%12===0) res.write(': ativo\n\n');
    } catch {res.end();}
  },1500);
  res.on('close',()=>clearInterval(timer));
}
const server=createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  res.setHeader('Cache-Control','no-store');
  function send(payload,status=200) { res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'}); res.end(JSON.stringify(payload)); }
  try {
    const url=new URL(req.url,'http://localhost');
    const parts=url.pathname.split('/').filter(Boolean);
    const write=req.method==='POST';
    if (!write && req.method!=='GET') fail(405,'Método inválido.');
    if (parts[0]!=='api') {
      if (write) fail(405,'Método inválido.');
      const file=staticFiles.get(url.pathname) || ['text/html','index.html'];
      res.writeHead(200,{'Content-Type':file[0]+'; charset=utf-8'});
      return res.end(readFileSync(new URL('./public/'+file[1],import.meta.url)));
    }
    if (write && (req.headers['sec-fetch-site']==='cross-site' || (req.headers.origin && new URL(req.headers.origin).host!==req.headers.host))) fail(403,'Origem inválida.');
    const auth=session(req);
    const route=parts[1];
    if (route==='login' && write) {
      limit('login:'+req.socket.remoteAddress,12);
      const b=await jsonBody(req);
      const identifier=string(b.identifier??b.email,254);
      const key=nameKey(identifier);
      const user=get('SELECT u.* FROM account_handles h JOIN users u ON u.id=h.user WHERE h.handle=?',key) ||
        get('SELECT * FROM users WHERE email=? AND email NOT LIKE ?',key,'%@accounts.invalid');
      if(!validPassword(string(b.password,200),user?.hash)) fail(401,'Nome ou senha inválidos.');
      return send(login(res,user));
    }
    if(route==='register' && write) {
      limit('register:'+req.socket.remoteAddress,12);
      const b=await jsonBody(req);
      const name=string(b.name,100);
      const handle=nameKey(name);
      const password=string(b.password,200);
      if(password.length<12) fail(400,'Use ao menos 12 caracteres na senha.');
      const user=transaction(()=>{
        if(get('SELECT 1 FROM account_handles WHERE handle=?',handle) || get('SELECT 1 FROM users WHERE email=?',handle)) fail(409,'Esse nome de personagem já está em uso.');
        const id=uuid();
        run('INSERT INTO users(id,email,name,hash) VALUES(?,?,?,?)',id,id+'@accounts.invalid',name,hashPassword(password));
        run('INSERT INTO account_handles(user,handle) VALUES(?,?)',id,handle);
        return {id};
      });
      return send(login(res,user),201);
    }
    if (route==='activate' && write) {
      limit('activate:'+req.socket.remoteAddress,12);
      const b=await jsonBody(req);
      const password=string(b.password,200);
      if(password.length<12) fail(400,'Use ao menos 12 caracteres na senha.');
      const key=digest(string(b.code,100));
      const user=transaction(()=>{
        const target=get('SELECT id FROM users WHERE invite=? AND expires>?',key,now());
        if(!target) fail(400,'Código inválido ou expirado.');
        run('UPDATE users SET hash=?,invite=NULL,expires=NULL WHERE id=?',hashPassword(password),target.id);
        run('DELETE FROM sessions WHERE user=?',target.id);
        return target;
      });
      return send(login(res,user));
    }
    if (!auth) fail(401,'Entre para continuar.');
    if(write) limit('write:'+auth.id,90);
    if(route==='logout' && write) {
      run('DELETE FROM sessions WHERE token=?',auth.token);
      res.setHeader('Set-Cookie','central=; Max-Age=0'+cookieOptions);
      return send({ok:true});
    }
    if(route==='campaigns') {
      if(!write) return send({user:{id:auth.id,name:auth.name},
        campaigns:all("SELECT c.*,m.role,m.character,CASE WHEN m.role='gm' THEN codes.code END AS roomCode FROM campaigns c JOIN members m ON m.campaign=c.id LEFT JOIN room_codes codes ON codes.campaign=c.id WHERE m.user=? AND m.active=1 ORDER BY c.name",auth.id)});
      const b=await jsonBody(req);
      if(!session(req)) fail(401,'Entre para continuar.');
      return send(transaction(()=>{
        const name=string(b.name,100);
        const base=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
        const slug=(base||'campanha')+'-'+uuid().slice(0,8);
        const id=uuid();
        run('INSERT INTO campaigns VALUES(?,?,?,?,?,?)',id,slug,name,string(b.description??'',2000,false),JSON.stringify(theme({})),'America/Sao_Paulo');
        run("INSERT INTO members(campaign,user,role) VALUES(?,?,'gm')",id,auth.id);
        const roomCode=createRoomCode(id);
        audit(id,auth.id,'campanha criada');
        return {slug,roomCode};
      }),201);
    }
    if(route==='join' && write) {
      limit('join:'+auth.id,12);
      limit('join-ip:'+req.socket.remoteAddress,30);
      const b=await jsonBody(req);
      if(!session(req)) fail(401,'Entre para continuar.');
      const code=string(b.code,30).replace(/[\s-]/g,'').toUpperCase();
      const character=string(b.character,100);
      return send(transaction(()=>{
        const room=get('SELECT c.id,c.slug FROM room_codes rc JOIN campaigns c ON c.id=rc.campaign WHERE rc.code=?',code);
        if(!room) fail(404,'Código de sala inválido.');
        const prior=get('SELECT active FROM members WHERE campaign=? AND user=?',room.id,auth.id);
        if(prior && !prior.active) fail(403,'Peça ao mestre para reativar seu acesso.');
        if(!prior) {
          run("INSERT INTO members(campaign,user,role,character) VALUES(?,?,'player',?)",room.id,auth.id,character);
          audit(room.id,auth.id,'participante entrou pelo código',auth.id);
        }
        return {slug:room.slug};
      }));
    }
    if(route!=='c' || !parts[2]) fail(404,'Rota indisponível.');
    const b=write ? await jsonBody(req) : null;
    if (!session(req)) fail(401,'Entre para continuar.');
    const m=membership(parts[2],auth.id);
    const action=parts[3];
    const id=parts[4];
    if (!write) {
      if(action==='events') {limit('events:'+auth.id,30); return eventStream(req,res,m);}
      if(action==='summary') return send({name:m.name,description:m.description,role:m.role,character:m.character,theme:JSON.parse(m.theme),zone:m.zone,
        roomCode:m.role==='gm'?get('SELECT code FROM room_codes WHERE campaign=?',m.campaign)?.code:undefined,
        unread:get("SELECT count(*) AS total FROM deliveries d JOIN resources r ON r.id=d.resource WHERE r.campaign=? AND d.user=? AND d.read IS NULL AND r.kind='mission' AND r.status='published' AND r.release<=?",m.campaign,m.user,now()).total});
      if(action==='roster') return send({members:m.role==='gm'?all('SELECT u.id,u.name,coalesce(h.handle,u.email) AS login,u.hash IS NOT NULL AS activated,m.role,m.active,m.character FROM members m JOIN users u ON u.id=m.user LEFT JOIN account_handles h ON h.user=u.id WHERE m.campaign=? ORDER BY u.name',m.campaign):all("SELECT u.id,u.name FROM members m JOIN users u ON u.id=m.user WHERE m.campaign=? AND m.active=1 AND m.role='gm' ORDER BY u.name",m.campaign)});
      if(action==='resources' && !id) return send(list(m,url));
      if(action==='resources') return send(serialize(resource(id,m),m,true));
      if(action==='history') return send(missionHistory(m,url));
      fail(404,'Rota indisponível.');
    }
    return send(transaction(()=>{
      if(action==='resources') {
        onlyMaster(m);
        const key=b.requestKey ? 'mission:'+string(b.requestKey,80) : null;
        const existing=key && get('SELECT response FROM dispatch_keys WHERE campaign=? AND actor=? AND key=?',m.campaign,m.user,key);
        if(existing) return JSON.parse(existing.response);
        const result=createMission(m,b);
        if(key) run('INSERT INTO dispatch_keys VALUES(?,?,?,?)',m.campaign,m.user,key,JSON.stringify(result));
        return result;
      }
      if(action==='read') {
        const r=resource(id,m);
        run('UPDATE deliveries SET read=coalesce(read,?) WHERE resource=? AND user=?',now(),id,m.user);
        return {ok:true,state:serialize(r,m).detail.state};
      }
      if(['mission','complete-mission','delete-mission'].includes(action)) {
        onlyMaster(m);
        const mission=resource(id,m);
        if(action==='mission') return updateMission(m,mission,b);
        if(action==='complete-mission') return completeMission(m,mission);
        run("UPDATE resources SET status='deleted' WHERE id=?",id);
        audit(m.campaign,m.user,'missão apagada',id);
        return {ok:true};
      }
      if(action==='character') {
        run('UPDATE members SET character=? WHERE campaign=? AND user=?',string(b.name,100,false),m.campaign,m.user);
        return {ok:true};
      }
      onlyMaster(m);
      if(action==='room-code') {
        const existing=get('SELECT code FROM room_codes WHERE campaign=?',m.campaign);
        if(existing && b.rotate!==true) return {code:existing.code};
        if(existing) run('DELETE FROM room_codes WHERE campaign=?',m.campaign);
        const code=createRoomCode(m.campaign);
        audit(m.campaign,m.user,existing?'código da sala trocado':'código da sala criado');
        return {code};
      }
      if(action==='member') {
        const email=emailOf(b.email);
        if(get('SELECT 1 FROM account_handles WHERE handle=?',email)) fail(409,'Identificador já utilizado.');
        let target=get('SELECT id FROM users WHERE email=?',email);
        let code;
        if(!target) {
          target={id:uuid()};
          run('INSERT INTO users(id,email,name) VALUES(?,?,?)',target.id,email,string(b.name,100));
          code=invite(target.id);
        }
        if(get('SELECT 1 FROM members WHERE campaign=? AND user=?',m.campaign,target.id)) fail(409,'A conta já pertence a esta campanha.');
        run("INSERT INTO members(campaign,user,role,character) VALUES(?,?,'player',?)",m.campaign,target.id,string(b.character??'',100,false));
        audit(m.campaign,m.user,'participante adicionado',target.id);
        return {code};
      }
      if(action==='member-status') {
        const target=get('SELECT role,active FROM members WHERE campaign=? AND user=?',m.campaign,id);
        if(!target || id===m.user) fail(400,'Participante inválido.');
        run('UPDATE members SET active=?,character=coalesce(?,character) WHERE campaign=? AND user=?',typeof b.active==='boolean'?Number(b.active):target.active,b.character===undefined?null:string(b.character,100,false),m.campaign,id);
        audit(m.campaign,m.user,'participante atualizado',id);
        return {ok:true};
      }
      if(action==='renew-invite') {
        if(!get('SELECT 1 FROM members m JOIN users u ON u.id=m.user WHERE m.campaign=? AND u.id=? AND u.hash IS NULL',m.campaign,id)) fail(400,'Somente convites ainda não ativados podem ser renovados pelo mestre.');
        const code=invite(id);
        audit(m.campaign,m.user,'convite renovado',id);
        return {code};
      }
      if(action==='theme') {
        const zone=string(b.zone??m.zone,100);
        try { new Intl.DateTimeFormat('pt-BR',{timeZone:zone}).format(); } catch { fail(400,'Informe um fuso IANA válido.'); }
        run('UPDATE campaigns SET theme=?,zone=? WHERE id=?',JSON.stringify(theme(b)),zone,m.campaign);
        audit(m.campaign,m.user,'tema atualizado');
        return {ok:true};
      }
      fail(404,'Rota indisponível.');
    }));
  } catch(error) {
    if(!error.status) console.error(error.code || error.message);
    if(!res.headersSent) send({error:error.status?error.message:'Erro interno. Tente novamente.'},error.status||500);
    else res.end();
  }
});
server.listen(Number(process.env.PORT??3000),process.env.HOST||'127.0.0.1',()=>console.log('Central RPG em http://'+(process.env.HOST||'127.0.0.1')+':'+server.address().port));

