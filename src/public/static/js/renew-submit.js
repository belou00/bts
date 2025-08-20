// src/public/static/js/renew-submit.js
(function(){
  const $btn = document.getElementById('btnNext');
  if (!$btn) return;

  function zoneFromSeatId(seatId){
    const m = /^([A-Z]\d+[A-Z]?)-/.exec(String(seatId||''));
    return (m && m[1]) || null;
  }

  async function onContinue(){
    $btn.disabled = true;

    try{
      const seasonCode = (document.getElementById('seasonLabel')?.textContent || '').trim() || '2025-2026';
      const planData = document.getElementById('planObject')?.getAttribute('data') || '';
      const m = /\/venues\/([^/]+)\/plan\.svg$/.exec(planData);
      const venueSlug = m ? m[1] : 'patinoire-blagnac';

      const payerEmail = (document.getElementById('orderEmail')?.value || '').trim();
      if (!payerEmail) throw new Error('Merci de renseigner l’email de la commande.');

      const rows = Array.from(document.querySelectorAll('#participants .row[data-seat]'));
      if (!rows.length) throw new Error('Aucune ligne participant / place sélectionnée.');

      const items = rows.map(r => {
        const seatId = r.getAttribute('data-seat');
        const zoneKey = zoneFromSeatId(seatId);
        const tariffSel = r.querySelector('select[data-name="tariff"]');
        const justifInp = r.querySelector('input[data-name="fieldValue"]');
        const firstName = r.querySelector('input[data-name="firstName"]')?.value || '';
        const lastName  = r.querySelector('input[data-name="lastName"]')?.value || '';
        return {
          seatId,
          zoneKey,
          tariffCode: (tariffSel?.value || 'ADULT').trim().toUpperCase(),
          justification: justifInp?.value || '',
          firstName, lastName
        };
      });

      const payload = { seasonCode, venueSlug, items, payer: { email: payerEmail } };

      const res = await fetch('/s/renew', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text() || `HTTP ${res.status}`);
      const json = await res.json();
      if (!json.redirectUrl) throw new Error('Réponse inattendue du serveur.');
      location.href = json.redirectUrl;
    }catch(e){
      alert(e.message || String(e));
      $btn.disabled = false;
    }
  }

  $btn.addEventListener('click', onContinue);
})();
