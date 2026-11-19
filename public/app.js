const root = document.querySelector('#app');
const notice = document.querySelector('#notice');
const dialog = document.querySelector('#dialog');
const dialogBody = document.querySelector('#dialog-body');
let page = {};
let generation = 0;
let noticeTimer;
let refreshTimer;
let stream;
let readObserver;
const readPending = new Set();
const esc = (v='') => String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {locked:'Bloqueada',available:'Disponível',in_progress:'Em andamento',completed:'Concluída',failed:'Falhou',archived:'Arquivada',pending:'Pendente',active:'Ativo',low:'Baixa',normal:'Normal',high:'Alta',shared:'Compartilhado',individual:'Individual',terminal:'Terminal Sombrio',modern:'Mensageiro Moderno',archive:'Arquivo Confidencial',arcane:'Fantasia Arcana'};
const titleOf = k=>labels[k]||k;
const options = (items,selected) => items.map(v=>`<option value="${esc(v)}" ${v===selected?'selected':''}>${esc(titleOf(v))}</option>`).join('');
const states=['locked','available','in_progress','completed','failed','archived'];
const objectiveStates=['pending','active','completed','failed'];
function date(value) {
  return value ? new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:page.summary?.zone}).format(value) : '—';
}
function zonedTime(value) {
  if (!value) return null;
  const desired = Date.parse(value+'Z');
  const formatter = new Intl.DateTimeFormat('sv-SE',{timeZone:page.summary.zone,dateStyle:'short',timeStyle:'medium'});
  let result=desired;
  for(let i=0;i<3;i++) result+=desired-Date.parse(formatter.format(result).replace(' ','T')+'Z');
  if(formatter.format(result).slice(0,16).replace(' ','T')!==value) throw Error('Esse horário não existe no fuso da campanha.');
  return result;
}
function localInput(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('sv-SE',{timeZone:page.summary.zone,dateStyle:'short',timeStyle:'short'}).format(value).replace(' ','T');
}
function flash(text) {
  notice.textContent=text;
  clearTimeout(noticeTimer);
  noticeTimer=setTimeout(()=>{ notice.textContent=''; },5500);
}
function showDialog(title,content) {
  dialogBody.innerHTML=`<h2 id="dialog-title">${esc(title)}</h2>${content}`;
  if (!dialog.open) dialog.showModal();
}
dialog.addEventListener('close',()=>{ dialogBody.replaceChildren(); });
async function api(path, data) {
  const response=await fetch('/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const result=await response.json();
  if(!response.ok) throw Object.assign(new Error(result.error),{status:response.status});
  return result;
}
const endpoint=(path)=>'c/'+page.slug+'/'+path;
const href=(path)=>'/c/'+page.slug+'/'+path;
const link=(path,text,cls='')=>`<a class="${cls}" href="${href(path)}" data-route>${esc(text)}</a>`;
const badge=(title)=>`<span class="badge">${esc(title)}</span>`;
const field=(text,name,attrs='')=>`<label>${text}<input name="${name}" ${attrs}></label>`;
const select=(text,name,values,current)=>`<label>${text}<select name="${name}">${options(values,current)}</select></label>`;
const area=(text,name,value='',required='')=>`<label>${text}<textarea name="${name}" maxlength="12000" ${required}>${esc(value)}</textarea></label>`;
const submit=(text)=>`<button class="primary" type="submit">${text}</button>`;
const action=(name,text,id='')=>`<button type="button" data-action="${name}" data-id="${esc(id)}">${text}</button>`;
const brand='<span class="brand"><img src="/favicon.svg" alt=""><span class="wordmark">Central RPG</span></span>';
const filesInput=field('Anexos · até 3 arquivos de 2 MB','files','type="file" multiple accept=".png,.jpg,.jpeg,.pdf,.txt"');
const role=()=>page.summary?.role==='gm';
const heading=(title,description='',extra='')=>`<header class="heading"><div>${page.summary?`<p class="kicker">${esc(page.summary.name)}</p>`:''}<h1>${esc(title)}</h1>${description?`<p class="muted">${esc(description)}</p>`:''}</div>${extra}</header>`;
const empty=(text)=>`<div class="panel muted">${esc(text)}</div>`;
function authView(mode='login') {
  page={};
  applyTheme({});
  const activate=mode==='activate';
  const register=mode==='register';
  root.innerHTML=`<div class="auth"><main id="main">${brand}
  <div class="panel"><h2>${register?'Criar conta':activate?'Ativar ou recuperar acesso':'Entrar na Central'}</h2>
  <form class="stack" data-form="${mode}">
  ${activate?field('Código de acesso','code','required autocomplete="one-time-code" maxlength="100"'):field('Nome do Personagem',register?'name':'identifier',`required autocomplete="username" maxlength="${register?100:254}"`)}
  ${field(activate||register?'Senha · mínimo de 12 caracteres':'Senha','password',`required type="password" autocomplete="${activate||register?'new-password':'current-password'}" maxlength="200" ${activate||register?'minlength="12"':''}`)}
  <div class="row">${submit(register?'Criar conta':activate?'Definir senha':'Entrar')} ${register||activate?'<a href="/login" data-route>Voltar ao login</a>':'<a href="/login?cadastro=1" data-route>Criar conta</a>'}</div>
  </form></div></main></div>`;
}
function shell(content) {
  const navigation=[['missions','Missões'],['history','Histórico'],['settings','Configurações']];
  const master=[['master','Painel do mestre'],['master/members','Participantes']];
  const nav=(items,label)=>`<nav aria-label="${label}">${items.map(([path,name])=>`<a href="${href(path)}" data-route ${page.route===path?'aria-current="page"':''}>${name}</a>`).join('')}</nav>`;
  root.innerHTML=`<div class="shell"><aside>${brand}${nav(navigation,'Campanha')}${role()?nav(master,'Área do mestre'):''}</aside><div class="stage"><header class="topbar"><div class="row"><a href="/campaigns" data-route>Campanhas</a><span class="muted">${role()?'Mestre':'Jogador'}</span><span id="unread" class="badge">${page.summary.unread} não lidas</span></div>${action('logout','Sair')}</header><main id="main">${content}</main></div></div>`;
}
function applyTheme(theme) {
  document.body.dataset.preset=theme.preset||'arcane';
  document.body.classList.toggle('light',theme.mode==='light');
  document.body.classList.toggle('reduced',localStorage.getItem('central-reduced')==='true');
  for(const key of ['primary','secondary','accent']) {
    document.body.style.removeProperty('--'+key);
    const color=theme[key];
    if(!color || !/^#[\da-f]{6}$/i.test(color)) continue;
    const lum=(hex)=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((a,v,i)=>a+v*[.2126,.7152,.0722][i],0);
    const surfaces=theme.mode==='light'?['#fffFFF','#f6f1f9']:{arcane:['#121019','#1b1725'],terminal:['#101a15','#17271f'],modern:['#101824','#182337'],archive:['#1b1713','#282019']}[theme.preset||'arcane'];
    if(surfaces.every(s=>(Math.max(lum(s),lum(color))+.05)/(Math.min(lum(s),lum(color))+.05)>=4.5)) document.body.style.setProperty('--'+key,color);
  }
  document.body.style.setProperty('--radius', (theme.radius||12)+'px');
}
async function campaigns() {
  const data=await api('campaigns');
  applyTheme({});
  root.innerHTML=`<header class="topbar">${brand}<div class="row"><span>${esc(data.user.name)}</span>${action('logout','Sair')}</div></header><main id="main">${heading('Suas salas')}
  <div class="grid">${data.campaigns.map(c=>`<article class="panel">${badge(c.role==='gm'?'Mestre':'Jogador')}<h2>${esc(c.name)}</h2><p class="muted">${esc(c.description)}</p>${c.character?`<p>Personagem · ${esc(c.character)}</p>`:''}<a class="button" href="/c/${esc(c.slug)}/${c.role==='gm'?'master':'missions'}" data-route>Abrir sala</a></article>`).join('')}</div>
  ${data.campaigns.length?'':empty('Você ainda não participa de nenhuma sala.')}
  <section class="panel"><h2>Criar sala</h2><p class="muted">Você será o mestre desta sala.</p><form class="stack" data-form="campaign">${field('Nome da sala','name','required maxlength="100"')}${area('Descrição','description')}${submit('Criar sala')}</form></section>
  <section class="panel"><h2>Entrar em uma sala</h2><p class="muted">Use o código da sala para entrar como jogador.</p><form class="stack" data-form="join">${field('Código da sala','code','required maxlength="30" autocapitalize="characters" spellcheck="false"')}${field('Nome do personagem','character','required maxlength="100"')}${submit('Entrar na sala')}</form></section></main>`;
}
function card(r) {
  return `<li class="item ${r.unread?'unread':''}"><div><b>${link('missions/'+r.id,r.title)}</b><div class="muted">${esc(titleOf(r.detail.state)+' · '+titleOf(r.detail.priority))}${r.unread?' · Não lida':''}</div><p>${esc(r.body)}</p></div><time>${date(r.published||r.created)}</time></li>`;
}
function filters() {
  const query=new URLSearchParams(location.search);
  return `<form class="toolbar" data-form="search">${field('Buscar missões','q',`type="search" maxlength="200" value="${esc(query.get('q')||'')}"`)}
  ${select('Situação','state',['',...states],query.get('state')||'')}${select('Prioridade','priority',['','low','normal','high'],query.get('priority')||'')}<button>Buscar</button></form>`;
}
async function feed(before='') {
  const history=page.route==='history';
  const query=history?new URLSearchParams():new URLSearchParams(location.search);
  if(before) query.set('before',before);
  return api(endpoint((history?'history':'resources')+'?'+query));
}
function historyCard(event) {
  return `<li class="item"><div><b>${link('missions/'+event.mission,event.title)}</b><div class="muted">${esc(event.action)}</div></div><time>${date(event.timestamp)}</time></li>`;
}
function feedHTML(data) {
  const history=page.route==='history';
  return `<ul class="list">${data.items.map(history?historyCard:card).join('')}</ul>${data.items.length?'':empty(history?'Nenhuma atividade de missão.':'Nenhuma missão nesta seleção.')}${data.next?action('more','Carregar anteriores',data.next):''}`;
}
async function feedPage() {
  const data=await feed();
  const history=page.route==='history';
  return (history?heading('Histórico','Publicações e atualizações das missões.'):heading('Missões','',role()?link('master/missions','Nova missão','button primary'):''))+
    (history?'':filters())+`<div id="live-list">${feedHTML(data)}</div>`;
}
function fileLinks(files) {
  return files?.length?`<ul>${files.map(f=>`<li><a href="/api/${endpoint('files/'+f.id)}" download>${esc(f.name)}</a> ${['image/png','image/jpeg'].includes(f.mime)?action('preview','Visualizar',f.id):''}</li>`).join('')}</ul>`:'';
}
function receipts(r) {
  return r.receipts?.length?`<details><summary>Confirmações de leitura</summary><ul>${r.receipts.map(x=>`<li>${esc(x.name)} · ${x.read?date(x.read):'Não lida'}</li>`).join('')}</ul></details>`:'';
}
function objectiveEditor(o={}) {
  return `<fieldset class="stack" data-objective data-id="${esc(o.id||'')}"><legend>Objetivo</legend>
  ${field('Título','objective-title',`required maxlength="160" value="${esc(o.title)}"`)}
  ${field('Descrição','objective-description',`maxlength="2000" value="${esc(o.description)}"`)}
  ${select('Estado','objective-state',objectiveStates,o.state||'pending')}
  <label><input type="checkbox" name="objective-hidden" ${o.hidden?'checked':''}>Oculto para jogadores</label>
  <div>${action('remove-objective','Remover objetivo')}</div></fieldset>`;
}
function missionEditor(r) {
  return `<form class="panel stack" data-form="mission-edit" data-id="${r.id}"><h2>Editar missão</h2>
  ${field('Título','title',`required maxlength="160" value="${esc(r.title)}"`)}${area('Descrição','body',r.body)}
  ${select('Situação','state',states,r.detail.state)}${select('Prioridade','priority',['low','normal','high'],r.detail.priority)}
  ${field('Prazo','due',`type="datetime-local" value="${localInput(r.detail.due)}"`)}
  <p class="muted">Fuso da campanha · ${esc(page.summary.zone)}</p>
  <div class="stack" data-objectives>${r.detail.objectives.map(objectiveEditor).join('')}</div>
  <div class="row">${action('add-objective','Adicionar objetivo')}${submit('Salvar alterações')}</div></form>`;
}
async function missionDetail(id) {
  const r=await api(endpoint('resources/'+id));
  if(r.unread) readPending.add(r.id);
  const d=r.detail;
  return heading(r.title,'Missão',link('missions','Todas as missões','button'))+
  `<section class="panel" data-readable="${r.id}"><div class="row">${badge(titleOf(d.state))}${badge('Prioridade '+titleOf(d.priority))}${badge('Progresso '+titleOf(d.progress).toLowerCase())}</div>
  <div class="message">${esc(r.body)}</div><p class="muted">Prazo · ${date(d.due)}</p>${fileLinks(r.files)}${receipts(r)}</section>
  <section class="panel"><h2>Objetivos</h2>${d.objectives.length?`<ul>${d.objectives.map(o=>`<li><strong>${esc(o.title)}</strong> · ${esc(titleOf(o.state))}${o.hidden?' · Oculto':''}${o.description?`<p class="muted">${esc(o.description)}</p>`:''}</li>`).join('')}</ul>`:'<p class="muted">Nenhum objetivo disponível.</p>'}</section>
  ${role()?missionEditor(r):''}
  ${role()&&d.progress==='individual'&&r.receipts.length?`<form class="panel stack" data-form="personal" data-id="${r.id}"><h2>Progresso individual</h2><label>Participante<select name="target">${r.receipts.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>${select('Situação','state',['',...states],'')}
  <label>Objetivo<select name="objective"><option value=""></option>${d.objectives.map(o=>`<option value="${o.id}">${esc(o.title)}</option>`).join('')}</select></label>${select('Estado do objetivo','objectiveState',objectiveStates,'pending')}${submit('Atualizar progresso individual')}
  <details><summary>Progresso registrado</summary><ul>${r.receipts.map(p=>`<li>${esc(p.name)} · ${esc(titleOf(d.individual[p.id]?.state||d.state))}${d.objectives.map(o=>`<div>${esc(o.title)} · ${esc(titleOf(d.individual[p.id]?.objectives?.[o.id]||o.state))}</div>`).join('')}</li>`).join('')}</ul></details></form>`:''}
  ${r.history?.length?`<section class="panel"><h2>Histórico de alterações</h2><ul>${r.history.map(a=>`<li>${esc(a.action)} · ${date(a.timestamp)}</li>`).join('')}</ul></section>`:''}`;
}
async function compose() {
  const roster=await api(endpoint('roster'));
  const players=roster.members.filter(u=>u.active&&u.role==='player');
  const people=players.map(u=>`<label><input type="checkbox" name="targets" value="${u.id}">${esc(u.character||u.name)}</label>`).join('');
  return heading('Nova missão')+`<form class="panel stack" data-form="compose" data-active="${players.length}">
  ${field('Título','title','required maxlength="160"')}${area('Descrição','body')}
  <label>Audiência<select name="mode"><option value="broadcast">Jogadores selecionados</option><option value="all">Todos os jogadores</option></select></label>
  <fieldset data-targets><legend>Destinatários</legend>${people||'<p class="muted">Nenhum jogador disponível.</p>'}</fieldset><p id="audience" class="muted"></p>
  ${select('Prioridade','priority',['low','normal','high'],'normal')}${select('Progresso','progress',['shared','individual'],'shared')}${select('Situação inicial','state',states,'available')}
  ${field('Prazo','due','type="datetime-local"')}<div class="stack" data-objectives></div><div>${action('add-objective','Adicionar objetivo')}</div>
  ${filesInput}<div>${submit('Publicar missão')}</div></form>`;
}
async function participants() {
  const roster=await api(endpoint('roster'));
  return heading('Participantes','Convide jogadores com o código da sala.',link('master','Código da sala','button'))+
  `<ul class="list">${roster.members.map(u=>`<li class="item"><div><b>${esc(u.name)}</b><div class="muted">${u.role==='gm'?'Mestre':'Jogador'}${u.active?'':' · Suspenso'}</div>
  ${u.id!==page.user.id?`<form class="toolbar" data-form="character-admin" data-id="${u.id}">${field('Personagem','character',`maxlength="100" value="${esc(u.character)}"`)}<button>Salvar</button></form>`:''}</div>
  <div class="row">${u.id!==page.user.id?action(u.active?'suspend':'restore',u.active?'Suspender':'Reativar',u.id):''}</div></li>`).join('')}</ul>`;
}
function dashboard() {
  const code=page.summary.roomCode;
  return heading('Painel do mestre')+`<section class="panel"><h2>Código da sala</h2><p class="muted">Compartilhe com os jogadores que você quer convidar.</p><div class="row">${code?`<strong><code>${esc(code.match(/.{4}/g).join('-'))}</code></strong>${action('copy-room','Copiar código')}${action('rotate-room','Trocar código')}`:action('create-room-code','Gerar código')}</div></section>`;
}
function themePage() {
  const t=page.summary.theme;
  const colorField=(label,key,fallback)=>field(label,key,`pattern="#[0-9A-Fa-f]{6}" placeholder="${fallback}" value="${esc(t[key]||'')}"`);
  return `<form class="panel stack" data-form="theme"><h2>Tema da campanha</h2>
  ${select('Preset','preset',['arcane','terminal','modern','archive'],t.preset)}
  <label>Aparência<select name="mode"><option value="dark">Escura</option><option value="light" ${t.mode==='light'?'selected':''}>Clara</option></select></label>
  ${colorField('Cor primária em hexadecimal','primary','#bda0ef')}${colorField('Cor secundária em hexadecimal','secondary','#d4a9db')}${colorField('Destaque em hexadecimal','accent','#f0b864')}
  ${select('Arredondamento','radius',['4','8','12','18','24'],String(t.radius))}
  ${field('Fuso horário IANA','zone',`required value="${esc(page.summary.zone)}"`)}
  <div class="row">${submit('Salvar tema')}${action('export-theme','Exportar JSON')}</div>
  ${field('Importar JSON','import','type="file" accept="application/json,.json"')}</form>`;
}
async function content() {
  const [first,second]=page.route.split('/');
  if(first==='missions') return second?missionDetail(second):feedPage();
  if(first==='history') return feedPage();
  if(first==='settings') return heading('Configurações')+`<form class="panel stack" data-form="settings"><h2>Seu personagem</h2>${field('Nome do personagem','name',`value="${esc(page.summary.character)}" maxlength="100"`)}<label><input name="reduced" type="checkbox" ${localStorage.getItem('central-reduced')==='true'?'checked':''}>Desativar animações nesse dispositivo</label><div>${submit('Salvar preferências')}</div></form>${role()?themePage():''}`;
  if(first==='master'&&role()) {
    if(second==='members') return participants();
    if(second==='missions') return compose();
    if(!second) return dashboard();
  }
  return heading('Página indisponível')+link('missions','Voltar às missões','button');
}
function markDisplayed() {
  if(document.visibilityState!=='visible' || !page.slug) return;
  const current=generation;
  readObserver?.disconnect();
  readObserver=new IntersectionObserver(entries=>{
    if(current!==generation || document.visibilityState!=='visible') return;
    for(const {target,isIntersecting} of entries) {
      const id=target.dataset.readable;
      if(!isIntersecting || !readPending.delete(id)) continue;
      readObserver.unobserve(target);
      api(endpoint('read/'+id),{}).catch(()=>{if(current===generation) readPending.add(id);});
    }
  });
  for(const node of document.querySelectorAll('[data-readable]')) if(readPending.has(node.dataset.readable)) readObserver.observe(node);
}
function syncAudience(form) {
  if(!form) return;
  const mode=form.elements.mode.value;
  const target=form.querySelector('[data-targets]');
  target.hidden=mode==='all';
  const chosen=form.querySelectorAll('[name=targets]:checked').length;
  form.querySelector('#audience').textContent=mode==='all'?form.dataset.active+' jogadores ativos.':chosen+' destinatário(s) selecionado(s).';
}
async function render() {
  const seq=++generation;
  clearInterval(refreshTimer);
  stream?.close();
  stream=null;
  readObserver?.disconnect();
  readPending.clear();
  if(dialog.open) dialog.close();
  const [,first,slug,...segments]=location.pathname.split('/');
  if(first==='login') {
    const query=new URLSearchParams(location.search);
    return authView(query.has('cadastro')?'register':query.has('ativar')?'activate':'login');
  }
  root.innerHTML='<main id="main" aria-busy="true">Carregando…</main>';
  try {
    if(first!=='c'||!slug) { page={}; await campaigns(); return; }
    page={slug,route:segments.join('/')||'missions'};
    const [summary,identity]=await Promise.all([api(endpoint('summary')),api('campaigns')]);
    if(seq!==generation) return;
    page.summary=summary;
    page.user=identity.user;
    applyTheme(summary.theme);
    const markup=await content();
    if(seq!==generation) return;
    shell(markup);
    syncAudience(document.querySelector('[data-form=compose]'));
    markDisplayed();
    refreshTimer=setInterval(()=>refresh(seq),15000);
    stream=new EventSource('/api/'+endpoint('events'));
    stream.addEventListener('change',()=>refresh(seq));
  } catch(error) {
    if(seq!==generation) return;
    if(error.status===401) {history.replaceState({},'','/login'); authView(); return;}
    if(page.summary) shell(heading('Página indisponível',error.message)+link('missions','Voltar às missões','button'));
    else root.innerHTML=`<main id="main">${empty(error.message)}<a href="/campaigns" data-route>Voltar às campanhas</a></main>`;
  }
}
let refreshing=false;
async function refresh(seq) {
  if(seq!==generation || refreshing || document.visibilityState!=='visible') return;
  refreshing=true;
  try {
    const summary=await api(endpoint('summary'));
    if(seq!==generation) return;
    document.querySelector('#unread').textContent=summary.unread+' missões não lidas';
    if(document.querySelector('#live-list')&&!page.paged) {
      const data=await feed();
      if(seq===generation && !page.paged) {
        const target=document.querySelector('#live-list');
        const markup=feedHTML(data);
        if(target.innerHTML!==markup && !target.contains(document.activeElement)) target.innerHTML=markup;
      }
    }
  } catch(error) { if(seq===generation && [401,404].includes(error.status)) render(); }
  finally { refreshing=false; }
}
function go(path) {
  history.pushState({},'',path);
  window.scrollTo(0,0);
  render();
}
async function attachments(form) {
  const files=[...(form.elements.files?.files||[])];
  if(files.length>3||files.some(f=>f.size>2_000_000)) throw Error('Envie até três anexos, cada um com até 2 MB.');
  return Promise.all(files.map(async f=>{
    const buffer=new Uint8Array(await f.arrayBuffer());
    const slices=[];
    for(let i=0;i<buffer.length;i+=16384) slices.push(String.fromCharCode(...buffer.subarray(i,i+16384)));
    return {name:f.name,data:btoa(slices.join(''))};
  }));
}
function objectives(form) {
  return [...form.querySelectorAll('[data-objective]')].map(el=>({
    id:el.dataset.id,title:el.querySelector('[name=objective-title]').value,
    description:el.querySelector('[name=objective-description]').value,
    hidden:el.querySelector('[name=objective-hidden]').checked,state:el.querySelector('[name=objective-state]').value
  }));
}
document.addEventListener('submit',async event=>{
  const form=event.target;
  const type=form.dataset.form;
  if(!type) return;
  event.preventDefault();
  const data=new FormData(form);
  const values=Object.fromEntries(data);
  const button=event.submitter;
  if(button) button.disabled=true;
  try {
    if(['login','activate','register'].includes(type)) {await api(type,values); go('/campaigns');}
    else if(type==='campaign') {const result=await api('campaigns',values); go('/c/'+result.slug+'/master');}
    else if(type==='join') {const result=await api('join',values); go('/c/'+result.slug+'/missions');}
    else if(type==='search') {
      const query=new URLSearchParams(location.search);
      for(const [key,value] of data) value?query.set(key,value):query.delete(key);
      go(location.pathname+'?'+query);
    } else if(type==='compose') {
      const targets=data.getAll('targets');
      if((values.mode==='all'||targets.length>1)&&!confirm('Confirmar publicação para '+(values.mode==='all'?form.dataset.active:targets.length)+' jogadores?')) return;
      form.dataset.requestKey ||= globalThis.crypto.randomUUID();
      const result=await api(endpoint('resources'),{
        ...values,requestKey:form.dataset.requestKey,targets,files:await attachments(form),
        due:zonedTime(values.due),objectives:objectives(form)
      });
      delete form.dataset.requestKey;
      flash('Missão publicada.');
      go(href('missions/'+result.id));
    } else {
      const id=form.dataset.id;
      const paths={theme:'theme',settings:'character','character-admin':'member-status/'+id,'mission-edit':'mission/'+id,personal:'mission/'+id};
      if(type==='theme') {values.radius=Number(values.radius); delete values.import;}
      if(type==='settings') localStorage.setItem('central-reduced',String(data.has('reduced')));
      if(type==='mission-edit') {values.due=zonedTime(values.due); values.objectives=objectives(form);}
      await api(endpoint(paths[type]),values);
      await render();
      flash('Alterações salvas.');
    }
  } catch(error) {flash(error.message);}
  finally {if(button) button.disabled=false;}
});
document.addEventListener('click',async event=>{
  const link=event.target.closest('a[data-route]');
  if(link && !event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey&&event.button===0) {event.preventDefault();go(link.getAttribute('href'));return;}
  const button=event.target.closest('[data-action]');
  if(!button) return;
  const {action:name,id}=button.dataset;
  const seq=generation;
  button.disabled=true;
  try {
    if(name==='logout') {await api('logout',{}); go('/login');}
    else if(name==='copy-room') {await navigator.clipboard.writeText(page.summary.roomCode.match(/.{4}/g).join('-')); flash('Código copiado.');}
    else if(name==='create-room-code'||name==='rotate-room') {
      if(name==='rotate-room'&&!confirm('Trocar o código? O anterior deixará de aceitar entradas.')) return;
      await api(endpoint('room-code'),{rotate:name==='rotate-room'});
      await render();
    }
    else if(name==='more') {
      const result=await feed(id);
      if(seq!==generation) return;
      page.paged=true;
      document.querySelector('#live-list ul').insertAdjacentHTML('beforeend',result.items.map(page.route==='history'?historyCard:card).join(''));
      if(result.next) button.dataset.id=result.next; else button.remove();
    } else if(name==='preview') {
      showDialog('Prévia do anexo',`<img alt="Imagem anexada à campanha" src="/api/${endpoint('files/'+id)}?preview=1">`);
    } else if(name==='add-objective') button.closest('form').querySelector('[data-objectives]').insertAdjacentHTML('beforeend',objectiveEditor());
    else if(name==='remove-objective') { if(confirm('Remover este objetivo?')) button.closest('[data-objective]').remove(); }
    else if(name==='export-theme') {
      const url=URL.createObjectURL(new Blob([JSON.stringify({...page.summary.theme,zone:page.summary.zone},null,2)],{type:'application/json'}));
      const a=document.createElement('a'); a.href=url;a.download='tema-central-rpg.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    } else if(name==='suspend'||name==='restore') {
      if(!confirm(name==='suspend'?'Suspender acesso à campanha?':'Reativar acesso à campanha?')) return;
      await api(endpoint('member-status/'+id),{active:name==='restore'});
      await render();
    }
  } catch(error) {flash(error.message);}
  finally {button.disabled=false;}
});
document.addEventListener('change',async event=>{
  const input=event.target;
  const form=input.form;
  if(form?.dataset.form==='compose') syncAudience(form);
  if(form?.dataset.form!=='theme') return;
  try {
    if(input.name==='import'&&input.files.length) {
      if(input.files[0].size>5000) throw Error('O tema deve ter até 5 KB.');
      const theme=JSON.parse(await input.files[0].text());
      const keys=['preset','mode','primary','secondary','accent','radius','zone'];
      if(!theme||Array.isArray(theme)||typeof theme!=='object'||Object.keys(theme).some(k=>!keys.includes(k))||
        !['arcane','terminal','modern','archive'].includes(theme.preset)||!['dark','light'].includes(theme.mode)||
        ![4,8,12,18,24].includes(theme.radius)||['primary','secondary','accent'].some(k=>theme[k]!=null&&!/^#[\da-f]{6}$/i.test(theme[k]))) throw Error('Arquivo de tema inválido.');
      if(theme.zone) new Intl.DateTimeFormat('pt-BR',{timeZone:theme.zone}).format();
      for(const key of keys) if(key in theme) form.elements[key].value=theme[key]??'';
    }
    const preview=Object.fromEntries(new FormData(form));
    applyTheme({...preview,radius:Number(preview.radius)});
  } catch(error) {flash(error.message);}
});
window.addEventListener('popstate',render);
document.addEventListener('visibilitychange',()=>{markDisplayed();if(document.visibilityState==='visible')refresh(generation);});
render();

