/* ============================================================
   RWG CRM — Agent cockpit views: board / list / today / stats
   Filtering, sorting, and the table come from RWG.leadtable.
   ============================================================ */
window.RWG = window.RWG || {};
RWG.views = RWG.views || {};
RWG.views.agent = (function () {
  const U = RWG.ui, D = RWG.data, A = RWG.analytics, LT = RWG.leadtable;

  function leadCard(l, draggable) {
    const s = l._score;
    return `<div class="lead-card${draggable ? ' draggable' : ''}" draggable="${draggable ? 'true' : 'false'}" data-action="open-lead" data-id="${l.id}">
      <div class="lc-top">
        <span class="lc-name">${U.esc(D.fullName(l))}${l.returning ? ` <span title="Returning · ${l.seminarCount || 2} seminars">🔁</span>` : ''}</span>
        ${U.tierChip(s)}
      </div>
      <div class="lc-meta">
        <span>${l.age != null ? l.age + ' yrs' : '—'}</span>
        <span>${l.yos != null ? l.yos + ' YOS' : '—'}</span>
        <span>${U.esc(RWG.scoring.normPlan(l.planType))}</span>
        <span>${U.moneyK(l.afc)}</span>
      </div>
      <div class="lc-why">${U.esc(s.headline)}</div>
      <div class="lc-foot">
        <span class="attempts">${l.attempts || 0} attempt${l.attempts === 1 ? '' : 's'}</span>
        <span class="attempts">${l.activities && l.activities.length ? U.fmtRelative(l.activities[l.activities.length - 1].at) : 'new'}</span>
      </div>
    </div>`;
  }

  function board(user, f) {
    const all = D.leadsFor(user.id);
    // board is grouped by stage already, so drop any stage column-filter
    const bf = Object.assign({}, f, { colFilters: Object.assign({}, f.colFilters, { stage: [] }) });
    const filtered = LT.applyFilter(all, bf);
    const cols = D.BOARD_STAGES.map(stage => {
      const items = filtered.filter(l => l.stage === stage);   // sort order preserved from applyFilter
      const dot = D.stageDotColor[stage] || '#5C6B7E';
      return `<div class="board-col" data-stage="${stage}">
        <div class="board-col-head"><span class="bar" style="background:${dot}"></span><span class="ttl">${stage}</span><span class="cnt">${items.length}</span></div>
        <div class="board-col-body">${items.map(l => leadCard(l, true)).join('') || `<p class="muted center drop-hint" style="font-size:12.5px;padding:14px 0">Drop here</p>`}</div>
      </div>`;
    }).join('');
    return LT.filterBar(all, bf, filtered.length, { onBoard: true }) + `<div class="board">${cols}</div>`;
  }

  function mylist(user, f, cols) {
    const all = D.leadsFor(user.id);
    const filtered = LT.applyFilter(all, f);
    return LT.filterBar(all, f, filtered.length, { columns: cols })
      + `<div id="leads-body">${LT.leadsView(filtered, f, { columns: cols, allLeads: all, empty: 'Try removing a filter, or hit Clear all.' })}</div>`;
  }

  function today(user) {
    const leads = D.leadsFor(user.id);
    const appts = leads.filter(l => l.stage === 'Appointment Set' && l.apptDate).sort((a, b) => a.apptDate - b.apptDate);
    const nowTs = Date.now();
    const eod = new Date(); eod.setHours(23, 59, 59, 999); const endToday = eod.getTime();
    const liveStage = (l) => !['Appointment Set', 'Appointment Kept', 'Opportunity Opened', 'No Opportunity'].includes(l.stage);
    const callbacks = leads.filter(l => liveStage(l) && ((l.callbackAt && l.callbackAt <= endToday) || (!l.callbackAt && l.disposition === 'Call Back')))
      .sort((a, b) => (a.callbackAt || Infinity) - (b.callbackAt || Infinity));
    const fresh = leads.filter(l => l.stage === 'New').sort((a, b) => b._score.score - a._score.score);

    const apptRow = (l) => `<div class="lead-card" data-action="open-lead" data-id="${l.id}" style="cursor:pointer">
        <div class="lc-top"><span class="lc-name">${U.esc(D.fullName(l))}</span>${U.tierChip(l._score)}</div>
        <div class="lc-meta"><span>📅 ${U.fmtDateTime(l.apptDate)}</span></div></div>`;
    const cbRow = (l) => {
      const t = l.callbackAt, overdue = t && t < nowTs;
      const when = t ? (overdue ? '⚠ Overdue · ' : '') + U.fmtDateTime(t) : 'No time set';
      return `<div class="lead-card" data-action="open-lead" data-id="${l.id}" style="cursor:pointer">
        <div class="lc-top"><span class="lc-name">${U.esc(D.fullName(l))}</span>${U.tierChip(l._score)}</div>
        <div class="lc-meta"><span style="${overdue ? 'color:var(--bad);font-weight:700' : ''}">📞 ${U.esc(when)}</span>${l.phone ? ` · <a href="tel:${U.esc(l.phone)}" onclick="event.stopPropagation()">${U.esc(l.phone)}</a>` : ''}</div></div>`;
    };

    const block = (title, color, items, render, empty) => `
      <div class="card mb-16">
        <div class="card-head"><span class="bar" style="width:9px;height:9px;border-radius:50%;background:${color}"></span>
          <h3>${title}</h3><span class="pill-soft">${items.length}</span></div>
        ${items.length ? `<div class="grid grid-2">${items.map(x => render(x)).join('')}</div>` : `<p class="muted mb-0" style="font-size:13.5px">${empty}</p>`}
      </div>`;

    return block('Upcoming appointments', '#C2A14D', appts, apptRow, 'No appointments booked yet — go set some!')
      + block('Callbacks due', '#B0691F', callbacks, cbRow, 'No callbacks due. Nice and clear.')
      + block('Fresh leads to work (best first)', '#2E7D5B', fresh.slice(0, 8), leadCard, 'No new leads — nice work clearing them!');
  }

  function stats(user) {
    const leads = D.leadsFor(user.id);
    const w = A.activityStats(leads, null, user.id);
    const f = A.funnel(leads);
    const mix = A.tierMix(leads);

    const statCard = (label, val, ic) => `<div class="stat"><div class="ic-wrap">${ic}</div><div class="label">${label}</div><div class="value num">${val}</div></div>`;
    const funnelRows = f.map(row => {
      const max = f[0].count || 1, pct = Math.round((row.count / max) * 100);
      return `<div class="funnel-row"><div class="fl">${row.label}</div>
        <div class="ftrack"><div class="ffill" style="width:${Math.max(pct, 6)}%;background:${row.color}">${row.count}</div></div>
        <div class="fv num">${pct}%</div></div>`;
    }).join('');
    const mixRow = (k) => {
      const m = RWG.scoring.tierMeta[k], total = leads.length || 1;
      return `<div class="funnel-row"><div class="fl"><span class="tier-dot ${m.dot}"></span>${m.label}</div>
        <div class="ftrack"><div class="ffill" style="width:${Math.max((mix[k] / total) * 100, 5)}%;background:${U.tierFill[k]}">${mix[k]}</div></div>
        <div class="fv num">${mix[k]}</div></div>`;
    };

    return `
      <div class="grid grid-4 mb-16">
        ${statCard('Dials this week', w.dials, '📞')}
        ${statCard('Reaches this week', w.reaches, '🎯')}
        ${statCard('Appts set this week', w.apptSet, '📅')}
        ${statCard('Reach rate', (w.dials ? Math.round(w.reaches / w.dials * 100) : 0) + '%', '%')}
      </div>
      <div class="grid grid-2">
        <div class="card"><div class="card-head"><h3>My pipeline funnel</h3></div><div class="funnel">${funnelRows}</div></div>
        <div class="card"><div class="card-head"><h3>My lead quality mix</h3><span class="sub">${leads.length} leads</span></div><div class="funnel">${['GOLD', 'HIGH', 'MEDIUM', 'LOW'].map(mixRow).join('')}</div></div>
      </div>`;
  }

  function render(view, user, ctx) {
    ctx = ctx || {};
    const f = Object.assign(LT.defaultFilter(), ctx.filter || {}, { search: ctx.search || '' });
    if (view === 'mylist') return mylist(user, f, ctx.columns);
    if (view === 'today') return today(user);
    if (view === 'stats') return stats(user);
    return board(user, f);
  }

  return { render, leadCard };
})();
