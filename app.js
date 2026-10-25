/* sport-track — logique de la maquette validée, avec Supabase à la place du localStorage. */
(function(){
const SUPABASE_URL='https://rwsfkihoudtfobeiumrx.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ3c2ZraWhvdWR0Zm9iZWl1bXJ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3OTM2NzQsImV4cCI6MjA5MjM2OTY3NH0._psSFL4bQI8nIoWxb1D9Qpfj3eVq56yV-Z3xUB6s9B4';
// projet partagé aimeri-unique : tables st_ du schéma public ; storageKey par défaut = session commune aux apps
const sb=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

const ICONS=['fitness_center','exercise','directions_run','sprint','directions_bike','pool','self_improvement','sports_tennis','sports_volleyball','sports_soccer','sports_basketball','sports_handball','sports_rugby','sports_martial_arts','hiking','rowing','downhill_skiing','surfing','sports_gymnastics','nordic_walking'];
const TYPES={distance:{label:'Distance',unit:'km'},duration:{label:'Durée',unit:'h:mm:ss'},pace:{label:'Allure (calculée)',unit:'min/km'},speed:{label:'Vitesse (calculée)',unit:'km/h'},sets:{label:'Séries × kg × reps',unit:'séries × kg × reps'},number:{label:'Nombre libre',unit:''}};
const DN=['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];
const DL=['Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi','Dimanche'];
const MS=['janv.','févr.','mars','avr.','mai','juin','juil.','août','sept.','oct.','nov.','déc.'];
const ML=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
const COLORS=[['c1','Bleu'],['c2','Ciel'],['c3','Turquoise'],['c4','Vert'],['c5','Olive'],['c6','Moutarde'],['c7','Orange'],['c8','Rouge'],['c9','Framboise'],['c10','Rose'],['c11','Violet'],['c12','Ardoise']];
const AUTO=['pace','speed'];
const tileH=a=>`<span class="tile" style="--c:var(--${a.color||'c1'})"><span class="ms">${a.icon}</span></span>`;

/* ---------- dates (aujourd'hui = Europe/Paris) ---------- */
const pad=n=>String(n).padStart(2,'0');
const iso=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const pISO=s=>{const[y,m,d]=s.split('-').map(Number);return new Date(y,m-1,d)};
const addD=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return x};
const monday=d=>{const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());return addD(x,-((x.getDay()+6)%7))};
const isoWeek=d=>{const t=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=t.getUTCDay()||7;t.setUTCDate(t.getUTCDate()+4-day);const y0=new Date(Date.UTC(t.getUTCFullYear(),0,1));return Math.ceil(((t-y0)/864e5+1)/7)};
const parisISO=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Paris',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
let TODAY_ISO,CUR_MON;
function refreshToday(){const t=parisISO();if(t===TODAY_ISO)return false;TODAY_ISO=t;CUR_MON=monday(pISO(t));return true}
refreshToday();
const rangeLabel=m=>{const s=addD(m,6);return m.getMonth()===s.getMonth()?`${m.getDate()} au ${s.getDate()} ${MS[s.getMonth()]}`:`${m.getDate()} ${MS[m.getMonth()]} au ${s.getDate()} ${MS[s.getMonth()]}`};
const shortDate=s=>{const d=pISO(s);return `${d.getDate()} ${MS[d.getMonth()]}`};

/* ---------- valeurs ---------- */
const num=v=>Number(v).toLocaleString('fr-FR',{maximumFractionDigits:2});
const fDur=sec=>{sec=Math.round(sec);const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60),s=sec%60;return h?`${h}:${pad(m)}:${pad(s)}`:`${m}:${pad(s)}`};
const fPace=sec=>{sec=Math.round(sec);return `${Math.floor(sec/60)}:${pad(sec%60)}`};
function fmt(m,v){switch(m.type){
  case'distance':return num(v)+' km';case'duration':return fDur(v);case'pace':return fPace(v)+' /km';
  case'speed':return num(v)+' km/h';case'sets':return `${v.s} × ${num(v.kg)} kg × ${v.r}`;
  default:return num(v)+(m.unit?' '+m.unit:'')}}
const yOf=(m,v)=>m.type==='sets'?v.kg:v;
function fmtY(m,y){switch(m.type){case'duration':return fDur(y);case'pace':return fPace(y);case'sets':return num(y)+' kg';default:return num(y)}}
function toRaw(m,v){if(v==null)return m.type==='sets'?{s:'',kg:'',r:''}:'';
  switch(m.type){case'duration':return fDur(v);case'pace':return fPace(v);case'sets':return{s:String(v.s),kg:num(v.kg),r:String(v.r)};default:return num(v).replace(/\s/g,'')}}
const pNum=s=>{s=String(s||'').trim().replace(/\s/g,'').replace(',','.');if(!s)return null;const n=Number(s);return isFinite(n)&&n>=0?n:NaN};
const pInt=s=>{const n=pNum(s);return n==null||isNaN(n)||Number.isInteger(n)?n:NaN};
const pTime=s=>{s=String(s||'').trim();if(!s)return null;const p=s.split(':');if(p.length>3||p.some(x=>!/^\d+$/.test(x.trim())))return NaN;return p.reduce((a,x)=>a*60+Number(x),0)};
function fromRaw(m,r){
  if(m.type==='sets'){const s=pInt(r.s),kg=pNum(r.kg),rp=pInt(r.r);if(s==null&&kg==null&&rp==null)return null;if([s,kg,rp].some(x=>x==null||isNaN(x)))return NaN;return{s,kg,r:rp}}
  if(m.type==='duration'||m.type==='pace')return pTime(r);return pNum(r)}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

/* ---------- données (Supabase) ---------- */
let S={activities:[],metrics:[],entries:[]},user=null;
const act=id=>S.activities.find(a=>a.id===id)||{name:'Activité supprimée',sub:'',icon:'help',color:'c12'};
const met=id=>S.metrics.find(m=>m.id===id);

// PostgREST plafonne à 1000 lignes par requête : on pagine
async function fetchAll(build){const out=[];for(let from=0;;from+=1000){const{data,error}=await build().range(from,from+999);if(error)throw error;out.push(...data);if(data.length<1000)return out}}
async function load(){
  const[acts,mets,sess]=await Promise.all([
    fetchAll(()=>sb.from('st_activities').select('id,name,subtitle,icon,color,position').order('position').order('created_at')),
    fetchAll(()=>sb.from('st_metrics').select('id,name,type,unit,position').order('position').order('created_at')),
    fetchAll(()=>sb.from('st_sessions').select('id,date,activity_id,description,rating,st_session_values(metric_id,value,sets,kg,reps)').order('date').order('id'))]);
  S.activities=acts.map(a=>({id:a.id,name:a.name,sub:a.subtitle||'',icon:a.icon,color:a.color,position:a.position}));
  S.metrics=mets.map(m=>({id:m.id,name:m.name,type:m.type,unit:m.unit||'',position:m.position}));
  S.entries=sess.map(e=>{const values={};for(const v of e.st_session_values)values[v.metric_id]=v.value!=null?Number(v.value):{s:v.sets,kg:Number(v.kg),r:v.reps};
    return{id:e.id,date:e.date,activityId:e.activity_id,desc:e.description||'',rating:e.rating||0,values}});
}
function errMsg(e){const c=e&&e.code;
  if(c==='23505')return'Cette activité est déjà déclarée ce jour-là.';
  if(c==='23514'&&/future/.test(e.message||''))return'Impossible de déclarer une séance à une date future.';
  if(c==='23514')return'Une valeur saisie est hors limites.';
  if(/fetch|network/i.test((e&&e.message)||''))return'Pas de connexion au serveur. Réessaie.';
  return'Erreur : '+((e&&e.message)||'inconnue')}
const nextPos=list=>list.reduce((mx,x)=>Math.max(mx,x.position??-1),-1)+1;

/* ---------- état UI ---------- */
let tab='week', wkIdx=null, statMetric=null, busy=false;
const $app=document.getElementById('app'),$sheet=document.getElementById('sheet'),$sb=document.getElementById('sheetBody'),$scrim=document.getElementById('scrim'),$tabbar=document.getElementById('tabbar');
let toastT;function toast(t){const el=document.getElementById('toast');el.textContent=t;el.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>el.hidden=true,1800)}

function weekList(){let first=addD(CUR_MON,-7*8);for(const e of S.entries){const m=monday(pISO(e.date));if(m<first)first=m}
  const out=[];for(let m=first;m<=CUR_MON;m=addD(m,7))out.push(m);return out}
const byDate=()=>{const o={};for(const e of S.entries)(o[e.date]=o[e.date]||[]).push(e);return o};

/* ---------- connexion ---------- */
function renderLogin(err){
  $tabbar.hidden=true;closeSheet();
  $app.innerHTML=`<div class="auth"><div class="brand"><b>sport-track</b></div><h1>Connexion</h1>
    <form id="login" novalidate>
      <div class="fs"><label class="fl" for="lEmail">Adresse e-mail</label><input class="inp" id="lEmail" type="email" autocomplete="email" required></div>
      <div class="fs"><label class="fl" for="lPass">Mot de passe</label><input class="inp" id="lPass" type="password" autocomplete="current-password" required></div>
      ${err?`<p class="err">${esc(err)}</p>`:''}
      <button class="btn primary" type="submit">Se connecter</button>
    </form></div>`;
  document.getElementById('login').addEventListener('submit',async e=>{e.preventDefault();
    const email=document.getElementById('lEmail').value.trim(),password=document.getElementById('lPass').value;
    if(!email||!password)return renderLogin('Renseigne ton e-mail et ton mot de passe.');
    const btn=e.target.querySelector('button');btn.disabled=true;btn.textContent='Connexion…';
    const{error}=await sb.auth.signInWithPassword({email,password});
    if(error){renderLogin(/invalid/i.test(error.message)?'E-mail ou mot de passe incorrect.':errMsg(error));document.getElementById('lEmail').value=email}
  });
}

async function boot(){
  $tabbar.hidden=true;$app.innerHTML='<div class="loading">Chargement…</div>';
  try{
    await load();
    if(!S.activities.length){const{error}=await sb.rpc('st_ensure_defaults');if(error)throw error;await load()}
  }catch(e){$app.innerHTML=`<div class="page"><div class="empty">${esc(errMsg(e))}<br><br><button class="lbtn" data-retry>Réessayer</button></div></div>`;return}
  $tabbar.hidden=false;wkIdx=null;render();
}

sb.auth.onAuthStateChange((event,session)=>{
  // pas d'appel Supabase attendu dans ce callback : on diffère
  if(session){if(!user||user.id!==session.user.id){user=session.user;setTimeout(boot,0)}}
  else{user=null;S={activities:[],metrics:[],entries:[]};setTimeout(()=>renderLogin(),0)}
});

/* ---------- vue Semaine ---------- */
function stars(n){let h='';for(let i=1;i<=5;i++)h+=`<span class="ms${i<=n?' fill':''}">star</span>`;return h}
function entryChip(e){const a=act(e.activityId);
  const sum=S.metrics.filter(m=>e.values[m.id]!=null).slice(0,2).map(m=>fmt(m,e.values[m.id])).join(' · ');
  return `<button class="entry" data-entry="${e.id}">${tileH(a)}
  <span class="et"><b>${esc(a.name)}${a.sub?` <em>· ${esc(a.sub)}</em>`:''}</b><span>${sum?esc(sum):esc(e.desc||'')}</span></span>
  <span class="minis" aria-label="${e.rating} sur 5">${stars(e.rating)}</span></button>`}
function renderWeek(){
  const weeks=weekList(),bd=byDate();if(wkIdx==null||wkIdx>=weeks.length)wkIdx=weeks.length-1;
  const counts=weeks.map(m=>{let n=0;for(let i=0;i<7;i++)n+=(bd[iso(addD(m,i))]||[]).length;return n});
  const maxC=Math.max(4,...counts);const start=Math.max(0,weeks.length-9);
  let strip='';for(let i=start;i<weeks.length;i++)strip+=`<button class="bar${i===wkIdx?' on':''}" data-goto="${i}" aria-label="Semaine ${isoWeek(weeks[i])}, ${counts[i]} séances"><i style="height:${Math.round(4+counts[i]/maxC*34)}px"></i><span>S${isoWeek(weeks[i])}</span></button>`;
  let slides='';weeks.forEach(m=>{let h='<div class="wk">';for(let i=0;i<7;i++){const d=addD(m,i),s=iso(d),list=bd[s]||[],fut=s>TODAY_ISO;
      h+=`<div class="day${s===TODAY_ISO?' today':''}${fut?' future':''}"><div class="dl"><small>${DN[i]}</small><b>${d.getDate()}</b></div>
      <div class="db">${list.length?list.map(entryChip).join(''):`<div class="rest">${fut?'À venir':'Repos'}</div>`}</div>
      ${fut?'<span></span>':`<button class="add" data-add="${s}" aria-label="Ajouter une activité le ${DL[i]} ${d.getDate()}"><span class="ms">add</span></button>`}</div>`}
    slides+=h+'</div>'});
  $app.innerHTML=`<header class="top"><div class="brand"><b>sport-track</b><button class="pill" data-today ${wkIdx===weeks.length-1?'hidden':''}>Cette semaine</button></div>
    <div class="wkrow"><div class="wkt"><h1 id="wkT"></h1><p id="wkR" class="num"></p></div>
    <button class="nav" data-step="-1" aria-label="Semaine précédente"><span class="ms">chevron_left</span></button>
    <button class="nav" data-step="1" aria-label="Semaine suivante"><span class="ms">chevron_right</span></button></div>
    <div class="strip">${strip}</div></header><div class="weeks" id="weeks">${slides}</div>`;
  const W=document.getElementById('weeks');
  const head=()=>{const m=weeks[wkIdx];document.getElementById('wkT').textContent=`Semaine ${isoWeek(m)}`;
    document.getElementById('wkR').textContent=`${rangeLabel(m)} · ${counts[wkIdx]} séance${counts[wkIdx]>1?'s':''}`;
    $app.querySelector('[data-step="1"]').disabled=wkIdx===weeks.length-1;$app.querySelector('[data-step="-1"]').disabled=wkIdx===0;
    $app.querySelector('[data-today]').hidden=wkIdx===weeks.length-1;
    $app.querySelectorAll('.bar').forEach(b=>b.classList.toggle('on',+b.dataset.goto===wkIdx))};
  W.style.scrollBehavior='auto';W.scrollLeft=wkIdx*W.clientWidth;W.style.scrollBehavior='';head();
  let raf;W.addEventListener('scroll',()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>{const i=Math.round(W.scrollLeft/W.clientWidth);if(i!==wkIdx){wkIdx=i;head()}})});
}
function goWeek(i){const W=document.getElementById('weeks');if(!W)return;const n=W.children.length;i=Math.max(0,Math.min(n-1,i));W.scrollTo({left:i*W.clientWidth})}

/* ---------- vue Activités ---------- */
function renderActs(){
  $app.innerHTML=`<div class="page">
   <div class="ph"><h1>Activités</h1><button class="lbtn" data-newact><span class="ms">add</span>Nouvelle</button></div>
   <div class="list">${S.activities.map(a=>`<button class="row" data-act="${a.id}">${tileH(a)}
     <span class="et"><b>${esc(a.name)}</b><span>${a.sub?esc(a.sub):'Pas de sous-titre'}</span></span><span class="ms chev">chevron_right</span></button>`).join('')}</div>
   <div class="ph"><h2>Metrics</h2><button class="lbtn" data-newmet><span class="ms">add</span>Nouveau</button></div>
   <div class="list">${S.metrics.map(m=>`<button class="row" data-met="${m.id}"><span class="tile"><span class="ms">${{distance:'straighten',duration:'timer',pace:'speed',speed:'speed',sets:'fitness_center',number:'tag'}[m.type]}</span></span>
     <span class="et"><b>${esc(m.name)}</b><span>${TYPES[m.type].label}${m.type==='number'&&m.unit?' ('+esc(m.unit)+')':m.type!=='number'&&m.type!=='sets'?' ('+TYPES[m.type].unit+')':''}${AUTO.includes(m.type)?' · depuis distance et durée':''}</span></span><span class="ms chev">chevron_right</span></button>`).join('')}</div>
   <p class="hint">Connecté : ${esc(user&&user.email)}. <button data-logout>Se déconnecter</button></p></div>`}

/* ---------- vue Stats ---------- */
function niceStep(r){const p=Math.pow(10,Math.floor(Math.log10(r)));const f=r/p;return(f<=1?1:f<=2?2:f<=2.5?2.5:f<=5?5:10)*p}
function renderStats(){
  if(!statMetric||!met(statMetric))statMetric=S.metrics[0]&&S.metrics[0].id;
  const m=met(statMetric);
  let body='';
  if(!m){body='<div class="empty">Ajoute un metric dans l\'onglet Activités pour suivre ton évolution.</div>'}
  else{
    const pts=S.entries.filter(e=>e.values[m.id]!=null).sort((a,b)=>a.date<b.date?-1:1).map(e=>({d:e.date,t:pISO(e.date).getTime(),v:e.values[m.id],y:yOf(m,e.values[m.id]),a:e.activityId}));
    if(pts.length<2){body=`<div class="empty">${pts.length?'Une seule valeur pour l\'instant.':'Aucune valeur déclarée pour ce metric.'} Il en faut au moins deux pour tracer une courbe.</div>`}
    else{
      const lowBetter=m.type==='pace';
      const ys=pts.map(p=>p.y);const best=lowBetter?Math.min(...ys):Math.max(...ys);const last=pts[pts.length-1],first=pts[0];
      const diff=last.y-first.y;const good=lowBetter?diff<0:diff>0;
      const dTxt=(diff>0?'+':diff<0?'−':'±')+fmtY(m,Math.abs(diff)).replace(/^0:/,'0:');
      body+=`<div class="tiles"><div class="st"><small>Dernière</small><b>${esc(fmtY(m,last.y))}</b></div>
        <div class="st"><small>Record</small><b>${esc(fmtY(m,best))}</b></div>
        <div class="st"><small>Évolution</small><b class="${good?'good':''}">${esc(dTxt)}</b></div></div>`;
      // graphique
      const W=340,H=200,L=46,R=14,T=14,B=28;
      let lo=Math.min(...ys),hi=Math.max(...ys);if(lo===hi){lo-=1;hi+=1}
      const step=niceStep((hi-lo)/3);lo=Math.floor(lo/step)*step;hi=Math.ceil(hi/step)*step;
      const t0=first.t,t1=last.t;
      const X=t=>L+(t-t0)/(t1-t0||1)*(W-L-R);
      const Y=y=>{const f=(y-lo)/(hi-lo);return lowBetter?T+f*(H-T-B):H-B-f*(H-T-B)};
      let g='';for(let v=lo;v<=hi+step/2;v+=step){const yy=Y(v).toFixed(1);g+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="var(--line)" stroke-width="1"/><text x="${L-6}" y="${+yy+4}" text-anchor="end" font-size="11" fill="var(--muted)" font-family="Barlow, sans-serif">${esc(fmtY(m,v).replace(' kg',''))}</text>`}
      const line=pts.map((p,i)=>`${i?'L':'M'}${X(p.t).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
      const base=(H-B).toFixed(1);
      const area=`${line}L${X(t1).toFixed(1)},${base}L${X(t0).toFixed(1)},${base}Z`;
      const mid=pts[Math.floor(pts.length/2)];
      // avec 2 points, la date du milieu se superposerait à la dernière
      const xl=(pts.length>2?[[first,'start'],[mid,'middle'],[last,'end']]:[[first,'start'],[last,'end']]).map(([p,anchor])=>`<text x="${X(p.t).toFixed(1)}" y="${H-8}" text-anchor="${anchor}" font-size="11" fill="var(--muted)" font-family="Barlow, sans-serif">${shortDate(p.d)}</text>`).join('');
      const dots=pts.map((p,i)=>i===pts.length-1?`<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="6" fill="var(--surface)" stroke="var(--accent)" stroke-width="2.5"/>`:`<circle cx="${X(p.t).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.6" fill="var(--accent)"/>`).join('');
      body+=`<div class="chart"><div class="cap"><span>${esc(m.name)}${m.type==='sets'?' · charge (kg)':''}</span><span>${lowBetter?'plus haut = plus rapide':pts.length+' valeurs'}</span></div>
        <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Évolution de ${esc(m.name)}">${g}
        <path d="${area}" fill="var(--accent)" fill-opacity=".12"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${dots}${xl}</svg></div>`;
      body+=`<div class="ph"><h2>Historique</h2></div><div class="list hist">${pts.slice(-8).reverse().map(p=>{const a=act(p.a);return `<div class="row"><span><b style="font-weight:500;color:var(--ink)">${shortDate(p.d)}</b><br><span>${esc(a.name)}${a.sub?' · '+esc(a.sub):''}</span></span><b>${esc(fmt(m,p.v))}</b></div>`}).join('')}</div>`;
    }
  }
  $app.innerHTML=`<div class="page"><div class="ph"><h1>Statistiques</h1></div>
    <div class="chips">${S.metrics.map(x=>`<button class="chip${x.id===statMetric?' on':''}" data-stat="${x.id}">${esc(x.name)}</button>`).join('')}</div>${body}</div>`;
}

function render(){refreshToday();document.querySelectorAll('.tab').forEach(t=>t.classList.toggle('on',t.dataset.tab===tab));
  if(tab==='week')renderWeek();else if(tab==='acts')renderActs();else renderStats();}

/* ---------- feuilles ---------- */
let draft=null,sheetKind=null;
function openSheet(kind){sheetKind=kind;$scrim.hidden=false;$sheet.hidden=false;document.body.style.overflow='hidden'}
function closeSheet(){if(busy)return;$scrim.hidden=true;$sheet.hidden=true;draft=null;sheetKind=null;document.body.style.overflow=''}
const head=t=>`<div class="sh"><h2>${t}</h2><button class="x" data-close aria-label="Fermer"><span class="ms">close</span></button></div>`;
const delBtn=`<button class="btn danger" data-del>Supprimer</button>`;

// Écrit en base, recharge tout, puis ferme la feuille. En cas d'échec la feuille reste ouverte avec le message.
async function persist(work,okMsg,redraw){
  if(busy)return;busy=true;$sb.querySelectorAll('.foot .btn').forEach(b=>b.disabled=true);
  const p=$sb.querySelector('[data-save]');if(p)p.textContent='Enregistrement…';
  try{await work();await load()}catch(e){busy=false;return redraw(errMsg(e))}
  busy=false;closeSheet();render();toast(okMsg);
}

/* séance */
function openEntry(date,id){
  if(date>TODAY_ISO)return;
  const e=id&&S.entries.find(x=>x.id===id);
  if(e){draft={id:e.id,isNew:false,date:e.date,activityId:e.activityId,desc:e.desc||'',rating:e.rating||0,order:Object.keys(e.values).filter(k=>met(k)&&!AUTO.includes(met(k).type)),raw:{}};
    draft.order.forEach(k=>draft.raw[k]=toRaw(met(k),e.values[k]))}
  else{draft={id:null,isNew:true,date,activityId:null,desc:'',rating:0,order:[],raw:{}}}
  openSheet('entry');drawEntry();
}
function lastMetricsFor(aid){const l=S.entries.filter(e=>e.activityId===aid).sort((a,b)=>a.date<b.date?1:-1)[0];return l?Object.keys(l.values).filter(k=>met(k)&&!AUTO.includes(met(k).type)):[]}
function drawEntry(err){
  const d=pISO(draft.date);const wd=(d.getDay()+6)%7;
  const avail=S.metrics.filter(m=>!draft.order.includes(m.id)&&!AUTO.includes(m.type));
  const taken=new Set(S.entries.filter(x=>x.date===draft.date&&x.id!==draft.id).map(x=>x.activityId));
  $sb.innerHTML=head(`${DL[wd]} ${d.getDate()} ${ML[d.getMonth()]}`)+
  `<div class="fs"><div class="fl">Activité</div><div class="agrid">${S.activities.map(a=>`<button class="ach${a.id===draft.activityId?' on':''}" data-pick="${a.id}" ${taken.has(a.id)?'disabled':''}>${tileH(a)}<span style="min-width:0"><b>${esc(a.name)}</b><span>${taken.has(a.id)?'Déjà déclarée ce jour':esc(a.sub)||'&nbsp;'}</span></span></button>`).join('')}</div></div>
  <div class="fs"><label class="fl" for="fDesc">Description <span id="cDesc">${draft.desc.length}/250</span></label><textarea class="inp" id="fDesc" maxlength="250" placeholder="Comment s'est passée la séance ?">${esc(draft.desc)}</textarea></div>
  <div class="fs"><div class="fl">Sensation</div><div class="stars">${[1,2,3,4,5].map(i=>`<button class="${i<=draft.rating?'on':''}" data-rate="${i}" aria-label="${i} étoile${i>1?'s':''}"><span class="ms${i<=draft.rating?' fill':''}">star</span></button>`).join('')}</div></div>
  <div class="fs"><div class="fl">Metrics</div>${draft.order.map(k=>metInput(met(k))).join('')}
   <div class="calc" id="calc">${calcTxt()}</div>
   ${avail.length?`<select class="inp" id="fAddMet"><option value="">+ Ajouter un metric…</option>${avail.map(m=>`<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select>`:''}</div>
  ${err?`<p class="err">${esc(err)}</p>`:''}
  <div class="foot">${draft.isNew?'':delBtn}<button class="btn primary" data-save>Enregistrer</button></div>`;
}
function metInput(m){const r=draft.raw[m.id];const t=TYPES[m.type];
  let inp;if(m.type==='sets')inp=`<div class="sets"><label><input class="inp num" inputmode="numeric" id="ms-${m.id}-s" data-mi="${m.id}" data-part="s" value="${esc(r.s)}" placeholder="3">séries</label><i>×</i><label><input class="inp num" inputmode="decimal" id="ms-${m.id}-kg" data-mi="${m.id}" data-part="kg" value="${esc(r.kg)}" placeholder="12">kg</label><i>×</i><label><input class="inp num" inputmode="numeric" id="ms-${m.id}-r" data-mi="${m.id}" data-part="r" value="${esc(r.r)}" placeholder="10">reps</label></div>`;
  else{const ph={distance:'8,5',duration:'48:30',pace:'5:42',speed:'10,5',number:'0'}[m.type];
    inp=`<input class="inp num" id="mi-${m.id}" data-mi="${m.id}" inputmode="${m.type==='duration'||m.type==='pace'?'text':'decimal'}" value="${esc(r)}" placeholder="${ph}">`}
  const unit=m.type==='number'?m.unit:m.type==='sets'?'':t.unit;
  return `<div class="mrow"><header><span>${esc(m.name)}${unit?`<small>${esc(unit)}</small>`:''}</span><button data-rmmet="${m.id}" aria-label="Retirer ${esc(m.name)}"><span class="ms">remove_circle_outline</span></button></header>${inp}</div>`}
// allure = durée / distance (s/km, arrondi à la seconde) ; vitesse = distance / heures (1 décimale)
function compute(values){const d=S.metrics.find(m=>m.type==='distance'&&values[m.id]>0),t=S.metrics.find(m=>m.type==='duration'&&values[m.id]>0);
  if(!d||!t)return null;const km=values[d.id],sec=values[t.id];return{pace:Math.round(sec/km),speed:Math.round(km/(sec/3600)*10)/10}}
function isTaken(dr){return S.entries.some(x=>x.date===dr.date&&x.id!==dr.id&&x.activityId===dr.activityId)}
function calcTxt(){if(!S.metrics.some(m=>AUTO.includes(m.type)))return'';const vals={};for(const k of draft.order){const m=met(k);if(m.type==='distance'||m.type==='duration'){const v=fromRaw(m,draft.raw[k]);if(v>0)vals[k]=v}}
  const c=compute(vals);if(!c)return draft.order.some(k=>['distance','duration'].includes(met(k).type))?'<span>Allure et vitesse calculées dès que distance et durée sont remplies.</span>':'';
  return `<span>Calculé :</span><b>${fPace(c.pace)} /km</b><span>·</span><b>${num(c.speed)} km/h</b>`}
function saveEntry(){
  if(!draft.activityId)return drawEntry('Choisis une activité.');
  if(draft.date>TODAY_ISO)return drawEntry('Impossible de déclarer une séance à une date future.');
  const values={};for(const k of draft.order){const m=met(k);const v=fromRaw(m,draft.raw[k]);
    if(v===null)continue;if(isNaN(v)||(v&&typeof v==='object'&&Object.values(v).some(isNaN)))return drawEntry(`Valeur invalide pour « ${m.name} »${m.type==='duration'||m.type==='pace'?' (format attendu : 5:42 ou 1:02:10)':m.type==='sets'?' (séries et reps en nombres entiers)':''}.`);
    values[k]=v}
  if(isTaken(draft))return drawEntry('Cette activité est déjà déclarée ce jour-là.');
  const c=compute(values);S.metrics.forEach(m=>{if(m.type==='pace'&&c)values[m.id]=c.pace;if(m.type==='speed'&&c)values[m.id]=c.speed});
  const rows=Object.entries(values).map(([id,v])=>typeof v==='object'?{metric_id:id,sets:v.s,kg:v.kg,reps:v.r}:{metric_id:id,value:v});
  const isNew=draft.isNew,dr=draft;
  persist(async()=>{const{error}=await sb.rpc('st_save_session',{p_id:dr.id,p_activity_id:dr.activityId,p_date:dr.date,p_description:dr.desc.slice(0,250),p_rating:dr.rating,p_values:rows});if(error)throw error},
    isNew?'Séance ajoutée':'Séance mise à jour',drawEntry);
}

/* activité */
function openAct(id){const a=id&&S.activities.find(x=>x.id===id);
  draft=a?{color:'c1',...a,isNew:false}:{id:null,name:'',sub:'',icon:ICONS[0],color:'c1',isNew:true};openSheet('act');drawAct()}
function drawAct(err){
  $sb.innerHTML=head(draft.isNew?'Nouvelle activité':'Modifier l\'activité')+
  `<div class="fs"><label class="fl" for="aName">Nom</label><input class="inp" id="aName" maxlength="40" value="${esc(draft.name)}" placeholder="Ex. Natation"></div>
   <div class="fs"><label class="fl" for="aSub">Sous-titre <span id="cSub">${draft.sub.length}/80</span></label><input class="inp" id="aSub" maxlength="80" value="${esc(draft.sub)}" placeholder="Ex. Crawl, bassin 25 m"></div>
   <div class="fs"><div class="fl">Couleur <span id="cName">${COLORS.find(c=>c[0]===draft.color)[1]}</span></div><div class="sw">${COLORS.map(([k,n])=>`<button class="swb${k===draft.color?' on':''}" style="--c:var(--${k})" data-color="${k}" aria-label="${n}"></button>`).join('')}</div></div>
   <div class="fs"><div class="fl">Icône</div><div class="icgrid" id="icg" style="--c:var(--${draft.color})">${ICONS.map(ic=>`<button class="ic${ic===draft.icon?' on':''}" data-icon="${ic}" aria-label="${ic.replace(/_/g,' ')}"><span class="ms">${ic}</span></button>`).join('')}</div></div>
   ${err?`<p class="err">${esc(err)}</p>`:''}
   <div class="foot">${draft.isNew?'':delBtn}<button class="btn primary" data-save>Enregistrer</button></div>`}
function saveAct(){if(!draft.name.trim())return drawAct('Donne un nom à l\'activité.');
  const rec={name:draft.name.trim().slice(0,40),subtitle:draft.sub.trim().slice(0,80)||null,icon:draft.icon,color:draft.color};
  const dr=draft;
  persist(async()=>{const{error}=dr.isNew?await sb.from('st_activities').insert({...rec,position:nextPos(S.activities)}):await sb.from('st_activities').update(rec).eq('id',dr.id);if(error)throw error},
    'Activité enregistrée',drawAct)}

/* metric */
function openMet(id){const m=id&&S.metrics.find(x=>x.id===id);
  const used=m?S.entries.some(e=>e.values[m.id]!=null):false;
  draft=m?{...m,isNew:false,used}:{id:null,name:'',type:'distance',unit:'',isNew:true,used:false};openSheet('met');drawMet()}
function drawMet(err){
  $sb.innerHTML=head(draft.isNew?'Nouveau metric':'Modifier le metric')+
  `<div class="fs"><label class="fl" for="mName">Nom</label><input class="inp" id="mName" maxlength="40" value="${esc(draft.name)}" placeholder="Ex. Développé couché"></div>
   <div class="fs"><label class="fl" for="mType">Type de valeur</label><select class="inp" id="mType" ${draft.used?'disabled':''}>${Object.entries(TYPES).map(([k,t])=>`<option value="${k}"${k===draft.type?' selected':''}>${t.label}${t.unit&&k!=='sets'?' ('+t.unit+')':''}</option>`).join('')}</select>
   ${draft.used?'<p class="hint">Le type est figé car des valeurs ont déjà été déclarées.</p>':''}${AUTO.includes(draft.type)?'<p class="hint">Pas de saisie : calculé à partir de la distance et de la durée de la séance.</p>':''}</div>
   ${draft.type==='number'?`<div class="fs"><label class="fl" for="mUnit">Unité</label><input class="inp" id="mUnit" maxlength="15" value="${esc(draft.unit)}" placeholder="Ex. points, matchs, étages"></div>`:''}
   ${err?`<p class="err">${esc(err)}</p>`:''}
   <div class="foot">${draft.isNew?'':delBtn}<button class="btn primary" data-save>Enregistrer</button></div>`}
function saveMet(){if(!draft.name.trim())return drawMet('Donne un nom au metric.');
  const rec={name:draft.name.trim().slice(0,40),type:draft.type,unit:draft.type==='number'&&draft.unit.trim()?draft.unit.trim().slice(0,15):null};
  const dr=draft;
  persist(async()=>{const{error}=dr.isNew?await sb.from('st_metrics').insert({...rec,position:nextPos(S.metrics)}):await sb.from('st_metrics').update(rec).eq('id',dr.id);if(error)throw error},
    'Metric enregistré',drawMet)}

// les séances d'une activité et les valeurs d'un metric partent en cascade côté base
function doDelete(){
  const table={entry:'st_sessions',act:'st_activities',met:'st_metrics'}[sheetKind];
  const msg={entry:'Séance supprimée',act:'Activité supprimée',met:'Metric supprimé'}[sheetKind];
  const redraw={entry:drawEntry,act:drawAct,met:drawMet}[sheetKind];const id=draft.id;
  persist(async()=>{const{error}=await sb.from(table).delete().eq('id',id);if(error)throw error},msg,redraw)}

/* ---------- événements ---------- */
document.getElementById('tabs').addEventListener('click',e=>{const b=e.target.closest('[data-tab]');if(!b)return;tab=b.dataset.tab;window.scrollTo(0,0);render()});
$app.addEventListener('click',e=>{const t=e.target;let b;
  if(t.closest('[data-retry]'))return boot();
  if(!user)return;
  if(b=t.closest('[data-step]'))return goWeek(wkIdx+ +b.dataset.step);
  if(b=t.closest('[data-goto]'))return goWeek(+b.dataset.goto);
  if(t.closest('[data-today]'))return goWeek(1e9);
  if(b=t.closest('[data-add]'))return openEntry(b.dataset.add);
  if(b=t.closest('[data-entry]')){const en=S.entries.find(x=>x.id===b.dataset.entry);return openEntry(en.date,en.id)}
  if(b=t.closest('[data-act]'))return openAct(b.dataset.act);
  if(t.closest('[data-newact]'))return openAct();
  if(b=t.closest('[data-met]'))return openMet(b.dataset.met);
  if(t.closest('[data-newmet]'))return openMet();
  if(b=t.closest('[data-stat]')){statMetric=b.dataset.stat;return renderStats()}
  if(t.closest('[data-logout]'))return sb.auth.signOut();
});
$scrim.addEventListener('click',closeSheet);
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$sheet.hidden)closeSheet()});
$sb.addEventListener('click',e=>{const t=e.target;let b;
  if(busy)return;
  if(t.closest('[data-close]'))return closeSheet();
  if(b=t.closest('[data-del]')){if(b.classList.contains('armed'))return doDelete();b.classList.add('armed');b.textContent=sheetKind==='act'?'Supprimer aussi ses séances ?':'Confirmer';return}
  if(t.closest('[data-save]'))return sheetKind==='entry'?saveEntry():sheetKind==='act'?saveAct():saveMet();
  if(sheetKind==='entry'){
    if(b=t.closest('[data-pick]')){const was=draft.activityId;draft.activityId=b.dataset.pick;
      const empty=draft.order.every(k=>{const r=draft.raw[k];return typeof r==='object'?!r.s&&!r.kg&&!r.r:!r});
      if(draft.isNew&&empty&&was!==draft.activityId){draft.order=lastMetricsFor(draft.activityId);draft.raw={};draft.order.forEach(k=>draft.raw[k]=toRaw(met(k),null))}
      return drawEntry()}
    if(b=t.closest('[data-rate]')){const v=+b.dataset.rate;draft.rating=draft.rating===v?v-1:v;return drawEntry()}
    if(b=t.closest('[data-rmmet]')){const k=b.dataset.rmmet;draft.order=draft.order.filter(x=>x!==k);delete draft.raw[k];return drawEntry()}
  }
  if(sheetKind==='act'&&(b=t.closest('[data-color]'))){draft.color=b.dataset.color;$sb.querySelectorAll('.swb').forEach(x=>x.classList.toggle('on',x===b));document.getElementById('icg').style.setProperty('--c',`var(--${draft.color})`);document.getElementById('cName').textContent=COLORS.find(c=>c[0]===draft.color)[1];return}
  if(sheetKind==='act'&&(b=t.closest('[data-icon]'))){draft.icon=b.dataset.icon;$sb.querySelectorAll('.ic').forEach(x=>x.classList.toggle('on',x===b))}
});
$sb.addEventListener('input',e=>{const t=e.target;
  if(t.id==='fDesc'){draft.desc=t.value;document.getElementById('cDesc').textContent=`${t.value.length}/250`}
  else if(t.dataset.mi){const k=t.dataset.mi;if(t.dataset.part)draft.raw[k][t.dataset.part]=t.value;else draft.raw[k]=t.value;const c=document.getElementById('calc');if(c)c.innerHTML=calcTxt()}
  else if(t.id==='aName')draft.name=t.value;
  else if(t.id==='aSub'){draft.sub=t.value;document.getElementById('cSub').textContent=`${t.value.length}/80`}
  else if(t.id==='mName')draft.name=t.value;
  else if(t.id==='mUnit')draft.unit=t.value;
});
$sb.addEventListener('change',e=>{const t=e.target;
  if(t.id==='fAddMet'&&t.value){draft.order.push(t.value);draft.raw[t.value]=toRaw(met(t.value),null);drawEntry();const f=$sb.querySelector(`[data-mi="${t.value}"]`);f&&f.focus()}
  if(t.id==='mType'){draft.type=t.value;drawMet()}
});
let rT;window.addEventListener('resize',()=>{clearTimeout(rT);rT=setTimeout(()=>{if(user&&tab==='week'&&!$tabbar.hidden)renderWeek()},150)});
// app laissée ouverte (écran d'accueil iPhone) : au retour, nouveau jour = nouvelle semaine possible, et données d'un autre appareil
document.addEventListener('visibilitychange',async()=>{if(document.hidden||!user||$tabbar.hidden||!$sheet.hidden||busy)return;
  if(refreshToday())wkIdx=null;try{await load()}catch(e){return}if($sheet.hidden&&!busy)render()});
})();
