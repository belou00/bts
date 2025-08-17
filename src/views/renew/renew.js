// src/views/renew/renew.js
(async function(){
  const qs = new URLSearchParams(location.search);
  const token = qs.get('id');
  const seasonFromUrl = qs.get('season') || null;
  if (!token) {
    alert("Lien invalide ou expiré (id manquant).");
    return;
  }

  const $subInfo = document.getElementById('sub-info');
  const $obj = document.getElementById('arena-obj') || null;        // si on passe par <object>
  let $map = document.getElementById('arena-map') || null;          // fallback: inline SVG
  const $selList = document.getElementById('selection-list');
  const $btnSubmit = document.getElementById('btn-submit');
  const $msg = document.getElementById('form-msg');
  const $buyerFirst = document.getElementById('buyer-first');
  const $buyerLast = document.getElementById('buyer-last');
  const $buyerEmail = document.getElementById('buyer-email');
  const $installments = document.getElementById('installments');

  let ctx = { seasonCode: null, venueSlug: null, subscriber: null, seats: [], prefSeatId: null };
  let seatById = new Map();
  let selected = new Map();

  function setMapFromObject() {
    try {
      const doc = $obj?.contentDocument;
      $map = doc && doc.querySelector('svg');
    } catch {}
  }

  function addBadgeFor(elem, label) {
    const bb = elem.getBBox();
    const r = Math.max(6, Math.min(bb.width, bb.height) * 0.20);
    const cx = bb.x + bb.width - r - 1;
    const cy = bb.y + r + 1;

    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','badge');

    const c = document.createElementNS('http://www.w3.org/2000/svg','circle');
    c.setAttribute('cx', cx); c.setAttribute('cy', cy); c.setAttribute('r', r);

    const t = document.createElementNS('http://www.w3.org/2000/svg','text');
    t.setAttribute('x', cx); t.setAttribute('y', cy); t.textContent = label;

    g.appendChild(c); g.appendChild(t);
    elem.parentNode.insertBefore(g, elem.nextSibling);
  }
  function clearBadges() { $map?.querySelectorAll('g.badge').forEach(n => n.remove()); }

  function applySeatStates() {
    if (!$map) return;
    clearBadges();
    const elems = $map.querySelectorAll('[data-seat-id]');
    elems.forEach(el => {
      const sid = el.getAttribute('data-seat-id');
      const rec = seatById.get(sid);
      const state = rec ? rec.status : 'available';
      el.dataset.state = state;
      el.classList.add('seat');

      if (state === 'provisioned') addBadgeFor(el, 'P');
      else if (state === 'held') addBadgeFor(el, 'H');
      else if (state === 'booked') addBadgeFor(el, 'X');

      if (ctx.prefSeatId && sid === ctx.prefSeatId) {
        trySelectSeat(el, true);
      }
    });
  }

  function isSelectable(seatId) {
    const rec = seatById.get(seatId);
    if (!rec) return false;
    const state = rec.status;
    const ownedProvision = (state === 'provisioned' && rec.provisionedFor && String(rec.provisionedFor) === String(ctx.subscriber.id));
    const isAvail = state === 'available';
    return ownedProvision || isAvail;
  }

  function trySelectSeat(el, silent=false) {
    const seatId = el.getAttribute('data-seat-id');
    if (!isSelectable(seatId)) {
      if (!silent) alert(`Place ${seatId} non sélectionnable pour votre renouvellement.`);
      return false;
    }
    const was = el.classList.toggle('selected');
    if (was) {
      if (!selected.has(seatId)) selected.set(seatId, { tariffCode:'ADULT', justification:'' });
    } else {
      selected.delete(seatId);
    }
    renderSelection();
    return true;
  }

  function renderSelection() {
    $selList.innerHTML = '';
    if (selected.size === 0) {
      $selList.classList.add('empty');
      $selList.innerHTML = '<p class="muted">Aucune place sélectionnée.</p>';
      $btnSubmit.disabled = true;
      return;
    }
    $selList.classList.remove('empty');
    $btnSubmit.disabled = false;

    for (const [seatId, cfg] of selected.entries()) {
      const row = document.createElement('div');
      row.className = 'selection-item';
      row.innerHTML = `
        <div class="row">
          <span class="seat-label">Place ${seatId}</span>
          <button class="remove" type="button" data-seat="${seatId}">Retirer</button>
        </div>
        <div class="controls">
          <label>Tarif
            <select data-seat="${seatId}" data-field="tariffCode">
              <option value="ADULT"${cfg.tariffCode==='ADULT'?' selected':''}>Adulte</option>
              <option value="TEEN"${cfg.tariffCode==='TEEN'?' selected':''}>12–18 ans</option>
              <option value="CHILD"${cfg.tariffCode==='CHILD'?' selected':''}>Enfant</option>
              <option value="REDUCED"${cfg.tariffCode==='REDUCED'?' selected':''}>Réduit</option>
            </select>
          </label>
          <label>Justification
            <input type="text" placeholder="Pièce justificative (si tarif réduit)" data-seat="${seatId}" data-field="justification" value="${cfg.justification || ''}"/>
          </label>
        </div>
      `;
      $selList.appendChild(row);
    }

    $selList.querySelectorAll('button.remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const sid = btn.getAttribute('data-seat');
        selected.delete(sid);
        const el = $map?.querySelector(`[data-seat-id="${CSS.escape(sid)}"]`);
        if (el) el.classList.remove('selected');
        renderSelection();
      });
    });

    $selList.querySelectorAll('select, input').forEach(inp => {
      inp.addEventListener('input', () => {
        const sid = inp.getAttribute('data-seat');
        const field = inp.getAttribute('data-field');
        const cfg = selected.get(sid);
        if (!cfg) return;
        cfg[field] = inp.value;
        const justInput = $selList.querySelector(`input[data-seat="${sid}"][data-field="justification"]`);
        if (field === 'tariffCode' && justInput) {
          const need = inp.value !== 'ADULT';
          justInput.placeholder = need ? 'Justificatif requis (étudiant, -18, etc.)' : 'Pièce justificative (si tarif réduit)';
        }
      });
    });
  }

  function bindMapHandlers() {
    if (!$map) return;
    $map.addEventListener('click', (e) => {
      const target = e.target.closest('[data-seat-id]');
      if (!target) return;
      trySelectSeat(target);
    });
  }

  document.getElementById('renew-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    $btnSubmit.disabled = true; $msg.textContent = 'Initialisation du paiement…'; $msg.className = 'form-msg';

    const selections = Array.from(selected.entries()).map(([seatId, cfg]) => ({
      seatId,
      tariffCode: cfg.tariffCode || 'ADULT',
      justification: (cfg.tariffCode && cfg.tariffCode !== 'ADULT') ? (cfg.justification || '').trim() : ''
    }));

    const missing = selections.find(s => s.tariffCode !== 'ADULT' && !s.justification);
    if (missing) {
      $msg.textContent = `Justification manquante pour ${missing.seatId}.`;
      $msg.className = 'form-msg error';
      $btnSubmit.disabled = false;
      return;
    }

    const payload = {
      selections,
      installmentsCount: parseInt($installments.value, 10) || 1,
      buyer: {
        firstName: $buyerFirst.value.trim() || undefined,
        lastName: $buyerLast.value.trim() || undefined,
        email: $buyerEmail.value.trim() || undefined
      }
    };

    try {
      const res = await fetch(`/s/renew?id=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const t = await res.text();
        throw new Error(t || `HTTP ${res.status}`);
      }
      const json = await res.json();
      if (json.checkoutUrl) {
        location.href = json.checkoutUrl;
      } else {
        throw new Error('Réponse inattendue du serveur');
      }
    } catch (err) {
      $msg.textContent = `Erreur: ${err.message || err}`;
      $msg.className = 'form-msg error';
      $btnSubmit.disabled = false;
    }
  });

  // Chargement initial
  try {
    const url = new URL(`/s/renew`, location.origin);
    url.searchParams.set('id', token);
    if (seasonFromUrl) url.searchParams.set('season', seasonFromUrl);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    ctx = data;

    $subInfo.textContent = `${data.subscriber.firstName || ''} ${data.subscriber.lastName || ''} – Saison ${data.seasonCode}`;
    if (data.subscriber.email) $buyerEmail.value = data.subscriber.email;

    // Si venue fournie → charger le SVG via <object>
    if ($obj && data.venueSlug) {
      $obj.data = `/public/venues/${encodeURIComponent(data.venueSlug)}/plan.svg`;
      $obj.addEventListener('load', () => {
        setMapFromObject();
        if ($map) {
          seatById = new Map((data.seats || []).map(s => [s.seatId, s]));
          ctx.prefSeatId = data.prefSeatId || null;
          bindMapHandlers();
          applySeatStates();
          renderSelection();
        }
      }, { once: true });
    } else {
      // fallback: inline <svg id="arena-map">
      seatById = new Map((data.seats || []).map(s => [s.seatId, s]));
      ctx.prefSeatId = data.prefSeatId || null;
      bindMapHandlers();
      applySeatStates();
      renderSelection();
    }
  } catch (err) {
    console.error(err);
    alert("Impossible de charger vos données de renouvellement. Lien invalide ou expiré ?");
  }

  // (facultatif) refresh état toutes les 15s
  setInterval(async () => {
    try {
      const url = new URL(`/s/renew`, location.origin);
      url.searchParams.set('id', token);
      const res = await fetch(url);
      if (!res.ok) return;
      const data = await res.json();
      seatById = new Map((data.seats || []).map(s => [s.seatId, s]));
      applySeatStates();
    } catch {}
  }, 15000);
})();

