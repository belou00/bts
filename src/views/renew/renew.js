// src/views/renew/renew.js
(async function(){
  console.log('[renew] boot renewal-only v2025-08-21i');

  const qs      = new URLSearchParams(location.search);

  const $banner     = document.getElementById('renewBanner');
  const $planObj    = document.getElementById('venuePlan');
  const $rowsHost   = document.getElementById('participants');
  const $orderEmail = document.getElementById('orderEmail');
  const $payerLast  = document.getElementById('payerLastName');
  const $payerFirst = document.getElementById('payerFirstName');
  const $form       = document.getElementById('renewForm');
  const $btnSubmit  = document.getElementById('btn-submit');
  const $msg        = document.getElementById('form-msg');
  const $rowTpl     = document.getElementById('participantRowTpl');

  const CTX = {
    seasonCode: null, venueSlug: null,
    subscriber: null,
    seats: [], tariffs: [], prices: [],
    allowed: new Set(), seatById: new Map()
  };

  function showBanner(kind, html) {
    if (!$banner) return;
    $banner.className = `banner ${kind}`;
    $banner.style.display = 'block';
    $banner.innerHTML = html;
  }
  function zoneFromSeatId(seatId) {
    const s = String(seatId||''); const i = s.indexOf('-'); return i>0 ? s.slice(0,i) : null;
  }
  function priceFor(zoneKey, tariffCode) {
    const tcode = String(tariffCode||'').toUpperCase();
    let p = CTX.prices.find(p => p.zoneKey === zoneKey && p.tariffCode === tcode);
    if (!p) p = CTX.prices.find(p => p.zoneKey === '*' && p.tariffCode === tcode);
    return p ? Number(p.priceCents) : null;
  }
  function getTariffMeta(zoneKey, tariffCode){
    const tcode = String(tariffCode||'').toUpperCase();
    let p = CTX.prices.find(p => p.zoneKey === zoneKey && p.tariffCode === tcode);
    if (!p) p = CTX.prices.find(p => p.zoneKey === '*' && p.tariffCode === tcode);
    const t = CTX.tariffs.find(x => x.code === tcode);
    return {
      requiresField: !!(p?.requiresField),
      fieldLabel: p?.fieldLabel || 'Justificatif',
      requiresInfo: !!(p?.requiresInfo),
      infoLabel: p?.infoLabel || 'Informations complémentaires',
      label: t?.label || tcode
    };
  }
  function refreshSubmitState() {
    const rows = Array.from($rowsHost.querySelectorAll('.row[data-seat]'));
    const kept = rows.filter(r => r.querySelector('input[data-name="keep"]')?.checked);
    const hasEmail = !!$orderEmail?.value?.trim();
    $btnSubmit.disabled = !(kept.length > 0 && hasEmail);
  }
  function populateTariffSelect(sel, zoneKey) {
    sel.innerHTML = '';
    const tariffs = (CTX.tariffs||[]).slice().sort((a,b)=>{
      const sa=+a.sortOrder||0, sb=+b.sortOrder||0; if (sa!==sb) return sa-sb;
      return String(a.code).localeCompare(String(b.code));
    });
    let first = null;
    for (const t of tariffs) {
      const code = String(t.code||'').toUpperCase();
      const cents = priceFor(zoneKey, code);
      if (cents == null) continue; // filtrage zone/* uniquement
      const meta = getTariffMeta(zoneKey, code);
      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = `${meta.label} — ${(cents/100).toFixed(2)} €`;
      sel.appendChild(opt);
      if (!first) first = code;
    }
    // défaut: ADULT ou NORMAL sinon premier
    const opts = Array.from(sel.options);
    if (opts.some(o => o.value === 'ADULT')) sel.value = 'ADULT';
    else if (opts.some(o => o.value === 'NORMAL')) sel.value = 'NORMAL';
    else sel.value = first || '';
    return sel.value || null;
  }

  function addParticipantRow(seatId){
    const seat = CTX.seatById.get(seatId) || {};
    const zoneKey = seat.zoneKey || zoneFromSeatId(seatId) || '*';
    let $row;
    if ($rowTpl && 'content' in $rowTpl) {
      const frag = $rowTpl.content.cloneNode(true);
      $rowsHost.appendChild(frag);
      $row = $rowsHost.querySelector('.row:last-child');
    } else {
      $row = document.createElement('div'); $row.className = 'row';
      $row.innerHTML = `
        <div class="cell seat">
          <label class="keep">
            <input type="checkbox" data-name="keep" checked>
            <span class="seat-label" data-role="seatLabel"></span>
          </label>
        </div>
        <div class="cell"><input type="text" data-name="firstName" placeholder="Prénom"></div>
        <div class="cell"><input type="text" data-name="lastName"  placeholder="Nom"></div>
        <div class="cell">
          <select data-name="tariff"></select>
          <input type="text" data-name="fieldValue" placeholder="Justificatif (si requis)" style="display:none; margin-top:6px">
          <textarea data-name="info" placeholder="Informations complémentaires (si requis)" style="display:none; margin-top:6px"></textarea>
        </div>`;
      $rowsHost.appendChild($row);
    }
    $row.setAttribute('data-seat', seatId);
    const $label  = $row.querySelector('[data-role="seatLabel"]');
    const $keep   = $row.querySelector('input[data-name="keep"]');
    const $tariff = $row.querySelector('select[data-name="tariff"]');
    const $just   = $row.querySelector('input[data-name="fieldValue"]');
    const $info   = $row.querySelector('textarea[data-name="info"]');

    if ($label) $label.textContent = seatId;

    // 1) Liste des tarifs de la zone (fallback * géré dans priceFor)
    populateTariffSelect($tariff, zoneKey);

    function applyTariffConds() {
      const meta = getTariffMeta(zoneKey, $tariff.value);
      if ($just) {
        const show = !!meta.requiresField;
        $just.style.display = show ? '' : 'none';
        if (show) $just.placeholder = meta.fieldLabel || 'Justificatif';
        if (!show) $just.value = '';
      }
      if ($info) {
        const show = !!meta.requiresInfo;
        $info.style.display = show ? '' : 'none';
        if (show) $info.placeholder = meta.infoLabel || 'Informations complémentaires';
        if (!show) $info.value = '';
      }
    }
    $tariff.addEventListener('change', applyTariffConds);
    applyTariffConds();

    // 2) Pré-remplir nom/prénom PAR SIÈGE si fournis par le back
    const fn = $row.querySelector('input[data-name="firstName"]');
    const ln = $row.querySelector('input[data-name="lastName"]');
    if (fn && !fn.value && seat.holderFirstName) fn.value = seat.holderFirstName;
    if (ln && !ln.value && seat.holderLastName ) ln.value = seat.holderLastName;

    $keep.addEventListener('change', refreshSubmitState);
    refreshSubmitState();
  }

  function onPlanLoaded() {
    try {
      const doc = $planObj.contentDocument; if (!doc) return;
      const $map = doc.getElementById('arena-map') || doc.documentElement;

      // Style minimal
      const style = doc.createElementNS('http://www.w3.org/2000/svg', 'style');
      style.textContent = `
        [data-seat-id][data-state="disabled"] { opacity: .25; pointer-events: none; }
        [data-seat-id][data-state="allowed"] { opacity: 1; }
        [data-seat-id].selected { stroke: #1a73e8; stroke-width: 2; }
      `;
      doc.documentElement.appendChild(style);

      const seats = Array.from(doc.querySelectorAll('[data-seat-id]'));
      for (const el of seats) {
        const sid = el.getAttribute('data-seat-id') || el.id || '';
        if (CTX.allowed.has(sid)) {
          el.setAttribute('data-state', 'allowed');
          el.classList.add('selected');  // sélection initiale
          el.addEventListener('click', () => {
            const row = $rowsHost.querySelector(`.row[data-seat="${CSS.escape(sid)}"]`);
            const cb  = row?.querySelector('input[data-name="keep"]');
            if (cb) { cb.checked = !cb.checked; }
            el.classList.toggle('selected', cb?.checked);
            refreshSubmitState();
          });
        } else {
          el.setAttribute('data-state', 'disabled');
          el.style.pointerEvents = 'none';
        }
      }

      // Pan/Zoom
      let scale=1, tx=0, ty=0;
      function apply() { $map.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`); }
      function toLocal(evt){
        const svg = doc.documentElement, pt = svg.createSVGPoint();
        pt.x = evt.clientX; pt.y = evt.clientY;
        const m = $map.getScreenCTM(); if (!m) return {x:0,y:0};
        const inv = m.inverse(), p = pt.matrixTransform(inv); return {x:p.x,y:p.y};
      }
      doc.addEventListener('wheel', (e)=>{
        e.preventDefault();
        const s0=scale, s1=Math.max(0.5, Math.min(4, s0 + (e.deltaY<0?0.1:-0.1)));
        if (s1===s0) return;
        const p=toLocal(e); tx=((p.x+tx)*s0/s1)-p.x; ty=((p.y+ty)*s0/s1)-p.y; scale=s1; apply();
      }, {passive:false});
      let dragging=false,lx=0,ly=0;
      doc.addEventListener('mousedown',(e)=>{ dragging=true; lx=e.clientX; ly=e.clientY; });
      doc.addEventListener('mouseup',  ()=>{ dragging=false; });
      doc.addEventListener('mouseleave',()=>{ dragging=false; });
      doc.addEventListener('mousemove',(e)=>{
        if (!dragging) return;
        tx += (e.clientX-lx)/scale; ty += (e.clientY-ly)/scale; lx=e.clientX; ly=e.clientY; apply();
      });

      console.log('[renew] plan ready. allowed seats:', CTX.allowed.size);
    } catch(e) { console.warn('plan load failed:', e); }
  }

  async function loadData() {
    const res = await fetch(location.href, { headers: { 'Accept': 'application/json' }, credentials: 'same-origin' });
    if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
    const data = await res.json();

    CTX.seasonCode = data.seasonCode; CTX.venueSlug = data.venueSlug;
    CTX.tariffs    = data.tariffs || []; CTX.prices = data.prices || [];
    CTX.seats      = data.seats   || [];
    CTX.subscriber = data.subscriber || (data.subscribers&&data.subscribers[0]) || null;

    CTX.seatById.clear();
    for (const s of CTX.seats) CTX.seatById.set(s.seatId, s);

    (data.allowedSeats || data.tokenSeats || []).forEach(sid => CTX.allowed.add(String(sid)));

    // Plan
    $planObj.setAttribute('data', `../public/venues/${encodeURIComponent(CTX.venueSlug)}/plan.svg`);

    // Pré-remplissage payeur
    if ($orderEmail) {
      if (data.email) $orderEmail.value = data.email;
      else if (CTX.subscriber?.email) $orderEmail.value = CTX.subscriber.email;
    }
    if ($payerFirst && CTX.subscriber?.firstName) $payerFirst.value = CTX.subscriber.firstName;
    if ($payerLast  && CTX.subscriber?.lastName ) $payerLast.value  = CTX.subscriber.lastName;

    // Lignes par siège autorisé
    CTX.allowed.forEach(sid => addParticipantRow(sid));

    if (!CTX.allowed.size) showBanner('warn', 'Aucune place à renouveler pour ce lien.');

    refreshSubmitState();
    console.log('[renew] data:', { season:CTX.seasonCode, venue:CTX.venueSlug, tariffs:CTX.tariffs.length, prices:CTX.prices.length, seats:CTX.seats.length, allowed:CTX.allowed.size });
  }

  $planObj.addEventListener('load', onPlanLoaded);
  $form.addEventListener('input', refreshSubmitState);

  $form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $btnSubmit.disabled = true; $msg.textContent = 'Validation…';
    try {
      const payerEmail = $orderEmail.value.trim();
      if (!payerEmail) throw new Error('Merci de renseigner l’email du payeur.');
      const rows = Array.from($rowsHost.querySelectorAll('.row[data-seat]'));
      const kept = rows.filter(r => r.querySelector('input[data-name="keep"]')?.checked);
      if (!kept.length) throw new Error('Sélectionnez au moins une place à renouveler.');

      const items = kept.map(r => {
        const seatId     = r.getAttribute('data-seat');
        const zoneKey    = (CTX.seatById.get(seatId)?.zoneKey) || zoneFromSeatId(seatId) || '*';
        const tariffSel  = r.querySelector('select[data-name="tariff"]');
        const justifInp  = r.querySelector('input[data-name="fieldValue"]');
        const infoArea   = r.querySelector('textarea[data-name="info"]');
        const firstName  = r.querySelector('input[data-name="firstName"]')?.value || '';
        const lastName   = r.querySelector('input[data-name="lastName"]')?.value  || '';
        return {
          seatId, zoneKey,
          tariffCode: (tariffSel?.value || 'ADULT').toUpperCase(),
          justification: justifInp?.value || '',
          info: infoArea?.value || '',
          firstName, lastName
        };
      });

      const url = new URL(location.href);
      const res = await fetch(`${url.pathname}?${url.searchParams.toString()}`, {
        method:'POST',
        headers:{ 'Content-Type':'application/json', 'Accept':'application/json' },
        body: JSON.stringify({
          seasonCode: CTX.seasonCode, venueSlug: CTX.venueSlug,
          items, payer: { email: payerEmail, firstName: $payerFirst?.value || '', lastName: $payerLast?.value || '' }
        })
      });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      const json = await res.json();
      if (!json.redirectUrl) throw new Error('Réponse inattendue du serveur.');
      location.href = json.redirectUrl;
    } catch(err) {
      alert(err.message || String(err));
      $btnSubmit.disabled = false; $msg.textContent = '';
    }
  });

  try { await loadData(); }
  catch(e) { console.error('[renew] load error', e); showBanner('error', 'Erreur lors du chargement des données.'); }
})();
