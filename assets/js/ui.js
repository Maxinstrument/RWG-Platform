/* ============================================================
   RWG CRM — small UI helpers (formatting + reusable HTML bits)
   ============================================================ */
window.RWG = window.RWG || {};
RWG.ui = (function () {

  const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const money = (n) => n == null || n === '' ? '—' : '$' + Number(n).toLocaleString('en-US');
  const moneyK = (n) => n == null || n === '' ? '—' : '$' + Math.round(Number(n) / 1000) + 'k';

  const initials = (name) => (name || '?').split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  function fmtDate(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function fmtDateTime(ts) {
    if (!ts) return '—';
    return new Date(ts).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function fmtRelative(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts, day = 86400000;
    const d = Math.floor(diff / day);
    if (d <= 0) {
      const h = Math.floor(diff / 3600000);
      if (h <= 0) return 'just now';
      return h + 'h ago';
    }
    if (d === 1) return 'yesterday';
    if (d < 7) return d + 'd ago';
    return fmtDate(ts);
  }

  function avatar(user, size) {
    if (!user) return '';
    const s = size || 32;
    return `<span class="avatar" style="width:${s}px;height:${s}px;font-size:${Math.round(s * 0.4)}px;background:${user.color || '#0E2440'}">${esc(initials(user.name))}</span>`;
  }

  const tierFill = { GOLD: '#C2A14D', HIGH: '#2E7D5B', MEDIUM: '#B0691F', LOW: '#5C6B7E' };

  function tierChip(scoreObj, withNum) {
    const m = RWG.scoring.tierMeta[scoreObj.tier];
    return `<span class="chip ${m.cls}"><span class="tier-dot ${m.dot}"></span>${m.label}${withNum ? ' · ' + scoreObj.score : ''}</span>`;
  }
  function scoreBar(scoreObj) {
    const c = tierFill[scoreObj.tier];
    return `<span class="score-bar"><span class="track"><span class="fill" style="width:${scoreObj.score}%;background:${c}"></span></span><span class="num" style="font-size:12px;color:var(--muted);font-weight:700">${scoreObj.score}</span></span>`;
  }
  function stageChip(stage) {
    return `<span class="stage-chip ${RWG.data.stageClass[stage] || ''}">${esc(stage)}</span>`;
  }

  // Callback flag: detected from the "CALLBACK REQUESTED" marker in notes (or an explicit field),
  // so it works on import without an extra column. Kept separate from the quality tier.
  function isCallback(l) {
    return !!(l && (l.callbackRequested || /callback requested/i.test(l.notes || '')));
  }
  function callbackChip(l) {
    return isCallback(l)
      ? `<span class="chip chip-callback" title="This person asked us to call them to schedule an appointment">📞 Callback</span>`
      : '';
  }

  // Clicked-but-never-registered cohort: detected from the "did not sign up" marker in notes
  // (or an explicit field). Lets agents tell these apart from people who actually signed up.
  function isClickedNoSignup(l) {
    return !!(l && (l.clickedNoSignup || /did not sign up/i.test(l.notes || '')));
  }
  function clickedChip(l) {
    return isClickedNoSignup(l)
      ? `<span class="chip chip-clicked" title="Clicked the seminar invite but did not register">👀 Clicked, no signup</span>`
      : '';
  }

  function ring(percent, big, small) {
    const r = 54, c = 2 * Math.PI * r, off = c * (1 - Math.min(1, percent / 100));
    return `<div class="ring"><svg width="128" height="128" viewBox="0 0 128 128">
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="rgba(14,36,64,.10)" stroke-width="12"/>
      <circle cx="64" cy="64" r="${r}" fill="none" stroke="url(#goldgrad)" stroke-width="12" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset .8s cubic-bezier(.2,.8,.2,1)"/>
      <defs><linearGradient id="goldgrad" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#C2A14D"/><stop offset="1" stop-color="#D8BC78"/></linearGradient></defs>
    </svg><div class="ring-center"><span class="big">${big}</span><span class="small">${small}</span></div></div>`;
  }

  let toastTimer;
  function toast(msg, good) {
    let wrap = document.getElementById('toast-wrap');
    if (!wrap) { wrap = document.createElement('div'); wrap.id = 'toast-wrap'; document.body.appendChild(wrap); }
    const t = document.createElement('div');
    t.className = 'toast' + (good ? ' good' : '');
    t.innerHTML = (good ? '✓ ' : '') + esc(msg);
    wrap.appendChild(t);
    clearTimeout(toastTimer);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(8px)'; t.style.transition = '.3s'; setTimeout(() => t.remove(), 300); }, 2600);
  }

  return { esc, money, moneyK, initials, fmtDate, fmtDateTime, fmtRelative, avatar, tierChip, scoreBar, stageChip, isCallback, callbackChip, isClickedNoSignup, clickedChip, ring, toast, tierFill };
})();
