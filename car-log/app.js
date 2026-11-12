// ---- Settings -------------------------------------------------------------
var DATA_URL   = 'https://ruthbloch.app.n8n.cloud/webhook/car-log-data';   // GET ?home=X -> {vehicles, staff, yps}
var SUBMIT_URL = 'https://ruthbloch.app.n8n.cloud/webhook/car-log-submit'; // POST one sign-out
var FLEET_URL  = 'https://ruthbloch.app.n8n.cloud/webhook/fleet-data';     // fallback for the car list
var HOMES = ['Aurora','Cygnus','Leo','Lynx','Lyra','Orion'];
var NO_YP = 'No YP - errand';
var OTHER = '__other__';
var DONE_SECONDS = 4;
var VERSION = 'v0.2';

// ---- Helpers --------------------------------------------------------------
function el(id){ return document.getElementById(id); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];}); }
function store(k,v){ try{ if(v===undefined) return localStorage.getItem(k); if(v===null) localStorage.removeItem(k); else localStorage.setItem(k,v); }catch(e){ return null; } }
function show(id){ ['s0','s1','s2','s3'].forEach(function(s){ el(s).classList.toggle('on', s===id); }); window.scrollTo(0,0); }
function uid(){ return 'cl-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8); }
function fmtWhen(iso){ var d=new Date(iso); return d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'short'}) + ' at ' + d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); }
var COLOURS = { white:'#fff', silver:'#c0c4c8', grey:'#808890', gray:'#808890', black:'#111', red:'#d22', blue:'#2563eb', yellow:'#facc15', green:'#16a34a', orange:'#f97316', brown:'#7c4a1e' };
function colourDot(c){ var k=String(c||'').toLowerCase(); for(var n in COLOURS){ if(k.indexOf(n)>=0) return '<span class="dot" style="background:'+COLOURS[n]+'"></span>'; } return ''; }
function normHome(h){ h=String(h||'').trim().toLowerCase().replace(/\s*house$/,''); for(var i=0;i<HOMES.length;i++) if(HOMES[i].toLowerCase()===h) return HOMES[i]; return null; }

// ---- Which home? ----------------------------------------------------------
// Each home has its own page (car-log/aurora/ etc.) that sets window.CARLOG_HOME.
// The top car-log/ page is only a chooser that sends you to a home's page.
var BASE = window.CARLOG_BASE || './';           // path back to the car-log folder
var HOME = normHome(window.CARLOG_HOME);
function homeUrl(h){ return BASE + h.toLowerCase() + '/'; }

var DATA = { vehicles:[], staff:[], yps:[] };
var car = null;

function start(){
  el('foot').textContent = 'Heart & Home Living - Car Log ' + VERSION;
  if (!HOME){
    var asked = normHome(new URLSearchParams(location.search).get('home'));
    if (asked){ location.replace(homeUrl(asked)); return; }   // old ?home= links still work
    el('homeList').innerHTML = HOMES.map(function(h){ return '<a class="homebtn" href="'+homeUrl(h)+'">'+h+'</a>'; }).join('');
    show('s0'); return;
  }
  el('homeTag').textContent = HOME;
  document.title = 'Car Log - ' + HOME;
  show('s1');
  load();
  flushQueue();
}

// ---- Load cars, staff, YPs ------------------------------------------------
function load(){
  var cacheKey = 'carlog_data_' + HOME;
  var cached = store(cacheKey);
  if (cached){ try{ DATA = JSON.parse(cached); render(); }catch(e){} }
  fetch(DATA_URL + '?home=' + encodeURIComponent(HOME), {cache:'no-store'})
    .then(function(r){ if(!r.ok) throw new Error(r.status); return r.json(); })
    .then(function(j){ DATA = { vehicles:j.vehicles||[], staff:j.staff||[], yps:j.yps||[] }; store(cacheKey, JSON.stringify(DATA)); render(); })
    .catch(function(){
      // Main feed not ready / offline: fall back to the fleet feed for the cars.
      if (cached) return;
      fetch(FLEET_URL, {cache:'no-store'}).then(function(r){ return r.json(); }).then(function(j){
        DATA.vehicles = (j.vehicles||[]).map(function(v){ var c=v.compliance||{}; return { reg:v.Registration||c.vehicleName, home:c.home, make:c.make, model:c.model, colour:c.colour }; })
          .filter(function(v){ return normHome(v.home)===HOME; });
        render();
      }).catch(function(){ el('cars').innerHTML = '<div class="loading">Could not load the cars. Check the signal and pull down to refresh.</div>'; });
    });
}

function render(){
  var vs = DATA.vehicles.slice().sort(function(a,b){ return String(a.reg).localeCompare(String(b.reg)); });
  if (!vs.length){ el('cars').innerHTML = '<div class="loading">No cars are set up for '+esc(HOME)+'. Tell the office.</div>'; return; }
  el('cars').innerHTML = vs.map(function(v,i){
    return '<button class="car" data-i="'+i+'"><span class="plate">'+esc(v.reg)+'</span><span class="desc"><b>'+colourDot(v.colour)+esc(v.colour||'')+'</b>'+esc([v.make,v.model].filter(Boolean).join(' '))+'</span></button>';
  }).join('');
  el('cars').onclick = function(e){ var b=e.target.closest('.car'); if(!b) return; pickCar(vs[+b.getAttribute('data-i')]); };

  var staff = (DATA.staff||[]).slice().sort();
  el('driver').innerHTML = '<option value="">Pick your name&hellip;</option>' + staff.map(function(n){ return '<option>'+esc(n)+'</option>'; }).join('') + '<option value="'+OTHER+'">Other (not listed)</option>';
  var yps = (DATA.yps||[]).slice().sort();
  el('yp').innerHTML = '<option value="">Pick one&hellip;</option>' + yps.map(function(n){ return '<option>'+esc(n)+'</option>'; }).join('') + '<option>'+NO_YP+'</option>';
}

// ---- Screen 2 -------------------------------------------------------------
function pickCar(v){
  car = v;
  el('picked').innerHTML = '<span class="plate">'+esc(v.reg)+'</span><span class="desc">'+colourDot(v.colour)+esc([v.colour,v.make,v.model].filter(Boolean).join(' '))+'</span>';
  el('driver').value=''; el('yp').value=''; el('driverOther').value=''; el('otherWrap').style.display='none';
  el('driverErr').style.display='none'; el('ypErr').style.display='none';
  el('submit').disabled = false;
  showQ();
  show('s2');
}
el('back').onclick = function(){ car=null; show('s1'); };
el('driver').onchange = function(){ var o=this.value===OTHER; el('otherWrap').style.display=o?'block':'none'; if(o) el('driverOther').focus(); el('driverErr').style.display='none'; };
el('yp').onchange = function(){ el('ypErr').style.display='none'; };

el('submit').onclick = function(){
  var d = el('driver').value, other = d===OTHER;
  var driver = other ? el('driverOther').value.trim() : d;
  var yp = el('yp').value, ok = true;
  if (!driver || (other && driver.length < 3)){ el('driverErr').style.display='block'; ok=false; }
  if (!yp){ el('ypErr').style.display='block'; ok=false; }
  if (!ok || !car) return;
  this.disabled = true;
  var rec = {
    id: uid(),
    home: HOME,
    registration: car.reg,
    vehicle: [car.colour, car.make, car.model].filter(Boolean).join(' '),
    driver: driver,
    driver_other: other,
    yp: yp === NO_YP ? '' : yp,
    no_yp_errand: yp === NO_YP,
    signed_out_at: new Date().toISOString(),
    app_version: VERSION
  };
  send(rec).then(function(){ done(rec, true); }).catch(function(e){
    if (e && e.rejected){ rejected(rec, e.errors); return; }
    queue(rec); done(rec, false);
  });
};
function rejected(rec, errs){
  el('submit').disabled = false;
  var b = el('queueNote'); b.className = 'notice bad'; b.style.display = 'block';
  b.textContent = 'Not saved: ' + ((errs||[]).join(', ') || 'please check and try again') + '. If this car is wrong for this home, tell the office.';
  window.scrollTo(0,0);
  load();
}

// ---- Sending + offline queue ----------------------------------------------
function send(rec){
  return fetch(SUBMIT_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(rec) })
    .then(function(r){
      if (r.ok) return r;
      // 422 = server checked it and said no (e.g. car moved to another home). Retrying will not help.
      if (r.status === 422) return r.json().catch(function(){ return {}; }).then(function(j){ var e = new Error('rejected'); e.rejected = true; e.errors = j.errors; throw e; });
      throw new Error(r.status);
    });
}
function getQ(){ try{ return JSON.parse(store('carlog_queue')||'[]'); }catch(e){ return []; } }
function setQ(q){ store('carlog_queue', q.length ? JSON.stringify(q) : null); showQ(); }
function queue(rec){ var q=getQ(); q.push(rec); setQ(q); }
function showQ(){
  var n = getQ().length, b = el('queueNote');
  if (!n){ b.style.display='none'; return; }
  b.className='notice'; b.style.display='block';
  b.textContent = n + (n===1?' sign-out is':' sign-outs are') + ' saved on this phone and waiting for signal. They send by themselves. Times are kept as they were.';
}
var flushing = false;
function flushQueue(){
  if (flushing) return; var q=getQ(); if(!q.length){ showQ(); return; }
  flushing = true;
  var rec = q[0];
  var drop = function(){ var q2=getQ().filter(function(r){ return r.id!==rec.id; }); setQ(q2); flushing=false; if(q2.length) flushQueue(); };
  send(rec).then(drop).catch(function(e){ if (e && e.rejected) { drop(); return; } flushing=false; showQ(); });
}
window.addEventListener('online', flushQueue);
setInterval(flushQueue, 60000);

// ---- Screen 3 -------------------------------------------------------------
var doneTimer = null;
function done(rec, sent){
  el('tick').className = 'tick' + (sent ? '' : ' warn');
  el('tick').innerHTML = sent ? '&#10003;' : '!';
  el('doneTitle').textContent = sent ? 'Car signed out' : 'Saved on this phone';
  el('doneWhen').textContent = rec.registration + ' - ' + fmtWhen(rec.signed_out_at);
  el('doneText').textContent = sent
    ? (rec.driver + (rec.no_yp_errand ? ' - errand' : ' with ' + rec.yp) + '. Drive safely.')
    : 'No signal right now. It will send by itself when the phone is back online. You can go.';
  show('s3');
  clearTimeout(doneTimer);
  doneTimer = setTimeout(reset, DONE_SECONDS*1000);
}
function reset(){ car=null; show('s1'); load(); }
el('s3').onclick = reset;

if ('serviceWorker' in navigator) navigator.serviceWorker.register(BASE + 'service-worker.js', {scope: BASE}).catch(function(){});
start();
