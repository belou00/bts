(function () {
  const qs = new URLSearchParams(location.search);
  const token = qs.get('id');

  const $error = document.getElementById('errorBox');
  const $dbg = document.getElementById('dbg');

  function showError(msg) {
    console.error('[renew] ', msg);
    $error.textContent = msg;
    $error.style.display = 'block';
  }
  function logDbg(obj) {
    try { $dbg.textContent = JSON.stringify(obj, null, 2); }
    catch { $dbg.textContent = String(obj); }
  }
  function euro(cents) { const v=(cents||0)/100; return Number.isInteger(v)?String(v):v.toFixed(2); }

  // Préfixe d’URL ('' ou '/bts')
  function basePrefix() {
    const parts = location.pathname.split('/s/');
    return parts.length > 1 ? parts[0] : '';
  }

  // URL plan (on essaie d’abord avec le préfixe, sinon sans préfixe)
  async function computePlanUrl(venueSlug) {
    const pref = basePrefix();
    const candidateA = `${pref}/venues/${venueSlug}/plan.svg`;
    try {
      const r = await fetch(candidateA, { method: 'HEAD' });
      if (r.ok) return candidateA;
    } catch {}
    const candidateB = `/venues/${venueSlug}/plan.svg`;
    return candidateB;
  }

  async function loadData() {
    if (!token) throw new Error('Lien invalide ou expiré (token manquant).');
    const url = location.pathname + location.search; // ex: /bts/s/renew?id=...
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) {
      let t=''; try { t = await res.text(); } catch {}
      throw new Error(`Erreur API ${res.status} ${t}`);
    }
    const json = await res.json();
    if (!json || !json.ok) throw new Error('Réponse invalide');
    return json;
  }

  function render(data) {
    // Infos
    const $info = document.getElementById('userInfo');
    const seatsFromToken = (data.tokenSeats||[]).filter(Boolean);
    const seatsFromSubs  = (data.subscribers||[]).flatMap(s => s.previousSeasonSeats||[]);
    const seats = seatsFromToken.length ? seatsFromToken : seatsFromSubs;
    const group = data.groupKey || data.email || '(groupe inconnu)';

    $info.innerHTML = `
      <p><strong>Saison :</strong> ${data.seasonCode}</p>
      <p><strong>Lieu :</strong> ${data.venueSlug}</p>
      <p><strong>Groupe :</strong> ${group}</p>
      <p><strong>Sièges concernés :</strong> ${seats.join(', ') || '(non précisé)'}</p>
    `;

    // Lines (1 ligne par siège)
    const $lines = document.getElementById('lines');
    $lines.innerHTML = '';
    const tariffsByCode = new Map((data.tariffs||[]).map(t => [t.code, t]));
    const priceMap = new Map((data.prices||[]).map(p => [`${p.zoneKey}:${p.tariffCode}`, p.priceCents]));
    let total = 0;

    seats.forEach(seatId => {
      const zoneKey = String(seatId).split('-')[0].toUpperCase(); // robuste: S1 / N1 / S4A …
      const options = (data.tariffs||[]).filter(t => Number.isFinite(priceMap.get(`${zoneKey}:${t.code}`)));

      const sel = document.createElement('select');
      options.forEach(o => {
        const pc = priceMap.get(`${zoneKey}:${o.code}`) || 0;
        const opt = document.createElement('option');
        opt.value = o.code;
        opt.textContent = `${o.label || o.code} — ${euro(pc)} €`;
        sel.appendChild(opt);
      });

      const line = document.createElement('div');
      line.className = 'line';
      line.innerHTML = `
        <div class="seat-label">${seatId} <span class="zone">(${zoneKey})</span></div>
        <div class="tariff"></div>
        <div class="extra">
          <input class="holder-fn" placeholder="Prénom porteur" />
          <input class="holder-ln" placeholder="Nom porteur" />
          <input class="justif" placeholder="Justificatif (si requis)" style="display:none" />
          <input class="info" placeholder="Information complémentaire" style="display:none" />
        </div>
      `;
      line.querySelector('.tariff').appendChild(sel);
      $lines.appendChild(line);
    });

    function recomputeTotal() {
      total = 0;
      document.querySelectorAll('#lines .line').forEach(line => {
        const seatId = line.querySelector('.seat-label').textContent.split(' ')[0];
        const zoneKey = String(seatId).split('-')[0].toUpperCase();
        const code = line.querySelector('select').value;
        const pc = priceMap.get(`${zoneKey}:${code}`) || 0;
        total += pc;

        const t = tariffsByCode.get(code);
        const just = line.querySelector('.justif');
        const info = line.querySelector('.info');

        if (t && t.requiresField) {
          just.style.display = 'inline-block';
          just.placeholder = t.fieldLabel || 'Justificatif';
        } else { just.style.display = 'none'; just.value = ''; }

        if (t && t.requiresInfo) {
          info.style.display = 'inline-block';
          info.placeholder = 'Information complémentaire';
        } else { info.style.display = 'none'; info.value = ''; }
      });
      document.getElementById('total').textContent = euro(total);
    }
    document.querySelectorAll('#lines select').forEach(sel => sel.addEventListener('change', recomputeTotal));
    recomputeTotal();

    // Plan (on calcule l’URL, on tente, sinon on affiche un message)
    computePlanUrl(data.venueSlug).then(url => {
      const img = document.getElementById('plan');
      img.src = url;
      img.onload = () => { /* ok */ };
      img.onerror = () => { showError('Plan indisponible pour ce lieu.'); };
    });

    // Paiement (POST sur la même route)
    document.getElementById('checkoutBtn').addEventListener('click', async () => {
      try {
        const lines = [];
        document.querySelectorAll('#lines .line').forEach(line => {
          const seatId = line.querySelector('.seat-label').textContent.split(' ')[0];
          const code = line.querySelector('select').value;
          const holderFirstName = line.querySelector('.holder-fn').value.trim();
          const holderLastName  = line.querySelector('.holder-ln').value.trim();
          const justificationField = line.querySelector('.justif').offsetParent ? line.querySelector('.justif').value.trim() : '';
          const info = line.querySelector('.info').offsetParent ? line.querySelector('.info').value.trim() : '';
          lines.push({ seatId, tariffCode: code, holderFirstName, holderLastName, justificationField, info });
        });

        const postUrl = location.pathname + location.search;
        const r = await fetch(postUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ installments: 1, payer: { email: (data.email || '') }, lines })
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j && j.error ? j.error : `HTTP ${r.status}`);
        if (j.redirectUrl) location.href = j.redirectUrl;
        else alert(JSON.stringify(j, null, 2));
      } catch (e) {
        showError(`Erreur paiement: ${e.message || e}`);
      }
    });

    // Debug (désactivé par défaut ; ouvre le <details> si besoin)
    logDbg({
      page: location.href,
      prefix: basePrefix(),
      tokenSeats: seatsFromToken,
      subSeats: seatsFromSubs,
      zonesPrices: (data.prices||[]).slice(0,3)
    });
  }

  // Boot
  loadData()
    .then(render)
    .catch(err => {
      console.error(err);
      showError('Impossible de charger vos données de renouvellement. Lien invalide, expiré ou ressource introuvable.');
    });
})();
