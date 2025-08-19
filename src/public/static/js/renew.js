// static/js/renew.js

/* -----------------------------------------------------------
 * Utilitaires
 * --------------------------------------------------------- */
function cur2str(cents){ return (cents/100).toLocaleString('fr-FR', {style:'currency', currency:'EUR'}); }
function qs(sel, root=document){ return root.querySelector(sel); }
function qsa(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }
function el(tag, attrs={}, ...kids){
  const n = document.createElement(tag);
  for (const [k,v] of Object.entries(attrs)){
    if (k === 'class') n.className = v;
    else if (k === 'dataset') Object.assign(n.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const k of kids){ if (k!=null) n.append(k); }
  return n;
}

/* -----------------------------------------------------------
 * State
 * --------------------------------------------------------- */
const STATE = {
  seasonCode:null,
  venueSlug:null,
  groupKey:null,
  email:null,
  tokenSeats:[],
  focusSeatId:null,
  subscribers:[],
  seats:[],
  tariffs:[],
  prices:[], // [{zoneKey, tariffCode, priceCents}]
  priceTable:{}, // zoneKey -> code -> priceCents
  rows:[],       // [{root, inputs..., seatId, zoneKey, currentTariff, priceCents}]
  svg:null,      // <svg> inside <object>
  viewbox:null   // {x,y,w,h}
};

/* -----------------------------------------------------------
 * Fetch JSON de la même URL (content-negotiation)
 * --------------------------------------------------------- */
async function loadRenewData() {
  const res = await fetch(window.location.href, { headers: { 'Accept':'application/json' }, credentials:'same-origin' });
  if (!res.ok) throw new Error('Renew JSON failed: ' + res.status);
  return res.json();
}

/* -----------------------------------------------------------
 * Build table de prix: priceTable[zoneKey][tariffCode] = cents
 * --------------------------------------------------------- */
function buildPriceTable() {
  const t = {};
  for (const p of STATE.prices) {
    if (!t[p.zoneKey]) t[p.zoneKey] = {};
    t[p.zoneKey][p.tariffCode] = p.priceCents;
  }
  STATE.priceTable = t;
}

/* -----------------------------------------------------------
 * Déduire la zone à partir du seatId (ex: "S1-A-001" -> "S1" ; "S4A-X-007" -> "S4A")
 * fallback sur seat.zoneKey si non matché
 * --------------------------------------------------------- */
function zoneFromSeat(seatId, fallbackZoneKey) {
  const m = /^([A-Z]\d+[A-Z]?)-/.exec(seatId);
  return (m && m[1]) || fallbackZoneKey || null;
}

/* -----------------------------------------------------------
 * Récupère le prix d’un (seatId, tariffCode)
 * --------------------------------------------------------- */
function getPriceFor(seatId, fallbackZoneKey, tariffCode){
  const z = zoneFromSeat(seatId, fallbackZoneKey);
  const zonePrices = STATE.priceTable[z];
  if (zonePrices && zonePrices[tariffCode] != null) return zonePrices[tariffCode];
  return null;
}

/* -----------------------------------------------------------
 * UI : Participants
 * --------------------------------------------------------- */
function addParticipantRow(sub, index){
  // Trouver le siège provisionné correspondant (par défaut: previousSeasonSeats[0] / prefSeatId)
  const seatId = sub.prefSeatId || (sub.previousSeasonSeats && sub.previousSeasonSeats[0]) || STATE.tokenSeats[index] || STATE.tokenSeats[0];
  const seat = STATE.seats.find(s => s.seatId === seatId);
  const zone = zoneFromSeat(seatId, seat && seat.zoneKey);

  // Tarifs disponibles sur la zone (filtre: il faut un prix)
  const availableTariffs = STATE.tariffs.filter(t => getPriceFor(seatId, zone, t.code) != null);

  // Par défaut: NORMAL si prix dispo, sinon premier dispo
  let defaultTariff = availableTariffs.find(t => t.code === 'NORMAL') || availableTariffs[0];
  let defaultPrice = defaultTariff ? getPriceFor(seatId, zone, defaultTariff.code) : 0;

  // DOM
  const root = el('div',{class:'row','data-seat':seatId});

  const head = el('div',{class:'row-head'},
    el('span',{class:'seat'}, seatId || '—'),
    el('span',{class:'zone badge'}, zone || '—'),
    el('span',{class:'hint'}, seat && seat.status ? ` (${seat.status})` : '')
  );

  // infos identité
  const idGrid = el('div',{class:'form-row'},
    el('div',{},
      el('label',{},'Prénom'),
      el('input',{type:'text', value: sub.firstName || '', placeholder:'Prénom', 'data-name':'firstName'})
    ),
    el('div',{},
      el('label',{},'Nom'),
      el('input',{type:'text', value: sub.lastName || '', placeholder:'Nom', 'data-name':'lastName'})
    )
  );

  // tarifs + justificatifs conditionnels
  const tariffSel = el('select',{'data-name':'tariff'});
  for (const t of availableTariffs){
    tariffSel.append(el('option', {value:t.code}, t.label));
  }
  if (defaultTariff) tariffSel.value = defaultTariff.code;

  const priceOut = el('div',{class:'row-price'}, defaultPrice ? cur2str(defaultPrice) : '—');

  const tariffRow = el('div',{class:'form-row'},
    el('div',{},
      el('label',{},'Tarif'),
      tariffSel,
      el('div',{class:'hint'}, 'Choisissez le tarif applicable')
    ),
    el('div',{}, priceOut)
  );

  // champs conditionnels
  const justifWrap = el('div',{class:'form-row hidden', 'data-cond':'field'});
  const justifInput = el('input',{type:'text', placeholder:'', 'data-name':'fieldValue'});
  justifWrap.append(
    el('div',{style:'grid-column:1 / -1'},
      el('label',{'data-label':'fieldLabel'}, 'Justificatif'),
      justifInput,
      el('div',{class:'hint'}, 'Renseignez le justificatif requis (si demandé).')
    )
  );

  const infoWrap = el('div',{class:'form-row hidden', 'data-cond':'info'});
  const infoInput = el('textarea',{'data-name':'extraInfo', placeholder:"Information complémentaire…"});
  infoWrap.append(
    el('div',{style:'grid-column:1 / -1'},
      el('label',{}, 'Information complémentaire'),
      infoInput
    )
  );

  root.append(head, idGrid, tariffRow, justifWrap, infoWrap);
  qs('#participants').append(root);

  // Enregister la ligne en state
  const rowState = {
    root, seatId, zoneKey:zone,
    inputs:{
      firstName: qs('input[data-name="firstName"]', root),
      lastName:  qs('input[data-name="lastName"]', root),
      tariff:    tariffSel,
      fieldValue:justifInput,
      extraInfo: infoInput
    },
    priceOut
  };
  STATE.rows.push(rowState);

  // Appliquer conditions selon tarif
  function applyTariffConditions(){
    const code = tariffSel.value;
    const t = STATE.tariffs.find(x => x.code === code);
    // toggle champs conditionnels
    if (t && t.requiresField){
      justifWrap.classList.remove('hidden');
      const lbl = qs('[data-label="fieldLabel"]', justifWrap);
      lbl.textContent = t.fieldLabel || 'Justificatif';
      justifInput.placeholder = t.fieldLabel || 'Justificatif';
    } else {
      justifWrap.classList.add('hidden');
      justifInput.value = '';
    }
    if (t && t.requiresInfo){
      infoWrap.classList.remove('hidden');
    } else {
      infoWrap.classList.add('hidden');
      infoInput.value = '';
    }
    // prix
    const pc = getPriceFor(seatId, zone, code);
    rowState.priceOut.textContent = pc!=null ? cur2str(pc) : '—';
    updateTotals();
  }

  tariffSel.addEventListener('change', applyTariffConditions);
  applyTariffConditions();

  // Hover → highlight seat
  root.addEventListener('mouseenter', () => highlightSeat(seatId, true));
  root.addEventListener('mouseleave', () => highlightSeat(seatId, false));
}

/* -----------------------------------------------------------
 * Totaux
 * --------------------------------------------------------- */
function computeTotal(){
  let sum = 0;
  for (const r of STATE.rows){
    const code = r.inputs.tariff.value;
    const pc = getPriceFor(r.seatId, r.zoneKey, code);
    if (pc!=null) sum += pc;
  }
  return sum;
}
function updateTotals(){
  const cents = computeTotal();
  qs('#totalAmount').textContent = cur2str(cents);
}

/* -----------------------------------------------------------
 * Seatmap (dans <object>) — inline zoom/pan via viewBox
 * --------------------------------------------------------- */
function setupSeatmap(){
  const obj = qs('#planObject');
  if (!obj) return;
  obj.addEventListener('load', () => {
    const doc = obj.contentDocument;
    if (!doc) return;
    const svg = doc.querySelector('svg');
    if (!svg) return;
    STATE.svg = svg;

    // init viewBox si absent
    const vb = svg.viewBox && svg.viewBox.baseVal;
    if (!vb || !vb.width || !vb.height){
      // fallback: utilise la bbox globale
      const bbox = svg.getBBox();
      svg.setAttribute('viewBox', `${bbox.x} ${bbox.y} ${bbox.width} ${bbox.height}`);
    }
    const base = svg.viewBox.baseVal;
    STATE.viewbox = { x:base.x, y:base.y, w:base.width, h:base.height };

    // marquer les seats du token
    for (const sid of STATE.tokenSeats){
      const el = doc.getElementById(sid);
      if (el){ el.classList.add('seat--token'); }
    }

    // focus par défaut si donné
    const target = STATE.focusSeatId || STATE.tokenSeats[0];
    if (target) zoomToSeat(target, 1.8);

    // interactions
    attachZoomPan(svg);
  });
}

/* Zoom centré sur la souris via viewBox */
function attachZoomPan(svg){
  const doc = svg.ownerDocument;

  function getVB(){
    const b = svg.viewBox.baseVal;
    return { x:b.x, y:b.y, w:b.width, h:b.height };
  }
  function setVB(v){ svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`); }

  function clientToSvgPoint(evt){
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX; pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  svg.addEventListener('wheel', (e)=>{
    e.preventDefault();
    const factor = e.deltaY < 0 ? (1/1.15) : 1.15;
    const loc = clientToSvgPoint(e);
    const vb = getVB();

    const newW = vb.w * factor;
    const newH = vb.h * factor;

    const kx = (loc.x - vb.x)/vb.w;
    const ky = (loc.y - vb.y)/vb.h;

    const nx = loc.x - kx * newW;
    const ny = loc.y - ky * newH;

    setVB({ x:nx, y:ny, w:newW, h:newH });
  }, { passive:false });

  // pan (drag)
  let dragging = false, startPt=null, startVB=null;
  svg.addEventListener('mousedown', (e)=>{
    if (e.button !== 0) return;
    dragging = true;
    startPt = { x:e.clientX, y:e.clientY };
    startVB = getVB();
  });
  doc.addEventListener('mouseup', ()=> dragging=false);
  doc.addEventListener('mousemove', (e)=>{
    if (!dragging) return;
    // convertir delta client -> delta svg en se basant sur ratio viewBox/screen
    const inv = svg.getScreenCTM().inverse();
    const p1 = svg.createSVGPoint(); p1.x = startPt.x; p1.y = startPt.y;
    const p2 = svg.createSVGPoint(); p2.x = e.clientX; p2.y = e.clientY;
    const s1 = p1.matrixTransform(inv);
    const s2 = p2.matrixTransform(inv);
    const dx = s1.x - s2.x;
    const dy = s1.y - s2.y;
    setVB({ x:startVB.x + dx, y:startVB.y + dy, w:startVB.w, h:startVB.h });
  });

  // toolbar + / -
  qs('#zoomIn')?.addEventListener('click', ()=>{
    const ctr = { clientX: window.innerWidth/2, clientY: window.innerHeight/2 };
    const evt = new MouseEvent('wheel', { clientX: ctr.clientX, clientY: ctr.clientY, deltaY:-120 });
    svg.dispatchEvent(evt);
  });
  qs('#zoomOut')?.addEventListener('click', ()=>{
    const ctr = { clientX: window.innerWidth/2, clientY: window.innerHeight/2 };
    const evt = new MouseEvent('wheel', { clientX: ctr.clientX, clientY: ctr.clientY, deltaY:120 });
    svg.dispatchEvent(evt);
  });
}

/* Surligner un siège */
function highlightSeat(seatId, on){
  const obj = qs('#planObject');
  const doc = obj?.contentDocument;
  const el = doc?.getElementById(seatId);
  if (!el) return;
  if (on) el.classList.add('seat--hover');
  else    el.classList.remove('seat--hover');
}

/* Zoomer vers un seat ciblé */
function zoomToSeat(seatId, scale=2){
  const obj = qs('#planObject');
  const doc = obj?.contentDocument;
  const svg = STATE.svg;
  const el = doc?.getElementById(seatId);
  if (!svg || !el) return;
  const b = el.getBBox();
  const vb = svg.viewBox.baseVal;
  const cx = b.x + b.width/2;
  const cy = b.y + b.height/2;
  const newW = vb.width / scale;
  const newH = vb.height / scale;
  const nx = cx - newW/2;
  const ny = cy - newH/2;
  svg.setAttribute('viewBox', `${nx} ${ny} ${newW} ${newH}`);
}

/* -----------------------------------------------------------
 * Initialisation
 * --------------------------------------------------------- */
async function init(){
  try{
    // 1) Charger JSON
    const data = await loadRenewData();
    Object.assign(STATE, data);

    // 2) Construire la table de prix
    buildPriceTable();

    // 3) Entête
    qs('#seasonLabel').textContent = STATE.seasonCode || '';
    qs('#orderEmail').value = STATE.email || '';

    // 4) Charger plan.svg (on fixe la src de l’<object>)
    const planPath = `/venues/${STATE.venueSlug}/plan.svg`;
    qs('#planObject').setAttribute('data', planPath);
    setupSeatmap();

    // 5) Créer les lignes participants
    qs('#participants').innerHTML = '';
    for (let i=0; i<STATE.subscribers.length; i++){
      addParticipantRow(STATE.subscribers[i], i);
    }

    updateTotals();
  }catch(err){
    console.error(err);
    const dbg = qs('#debugArea');
    if (dbg){
      dbg.classList.remove('hidden');
      dbg.textContent = String(err);
    }
  }
}

document.addEventListener('DOMContentLoaded', init);
