/* ============================================================
   RWG Platform — All Cases (the old "Team Cases", carried over)

   The whole team's book in one filterable, sortable, exportable table.
   Everyone can browse and search (read-only); the case owner and admins
   can edit; admins can delete and correct the weeks. This is what "see
   all the cases we have" was asking for.

   Money + week rules come from RWG.scorecard. Data from RWG.scorecardData.
   ============================================================ */
window.RWG = window.RWG || {};

(function () {
  const S = () => RWG.scorecard;
  const D = () => RWG.scorecardData;
  const U = () => RWG.ui;
  const esc = (s) => U().esc(s);
  const money = (n) => U().money(n);

  // Column schema: label, how to read the value, how to sort, and whether it filters.
  function columns() {
    const sc = S();
    return [
      { key: 'client', label: 'Client', val: c => c.clientName || '(no name)', str: true },
      { key: 'agent', label: 'Agent', val: c => c.agentName || '', str: true, filter: true },
      { key: 'product', label: 'Product', val: c => sc.productName(c.product), str: true, filter: true },
      { key: 'source', label: 'Source', val: c => sc.sourceLabel(c.source), str: true, filter: true },
      { key: 'state', label: 'Stage', val: c => c.state || '', str: true, filter: true, cell: c => `<span class="chip ${stageChipClass(c.state)}">${esc(c.state || '')}</span>` },
      { key: 'money', label: 'Amount / AUM', num: true, val: c => sc.usesAum(c.product) ? (Number(c.aum) || 0) : (Number(c.amount) || 0), cell: c => `<span class="num">${money(sc.usesAum(c.product) ? c.aum : c.amount)}</span>` },
      { key: 'ann', label: 'Ann. premium', num: true, val: c => sc.annualizedPremium(c.product, c.amount), cell: c => `<span class="num">${sc.annualizedPremium(c.product, c.amount) ? money(sc.annualizedPremium(c.product, c.amount)) : '—'}</span>` },
      { key: 'rev', label: 'Revenue', num: true, val: c => sc.revenue(c.product, c.amount, c.aum), cell: c => `<span class="num">${money(sc.revenue(c.product, c.amount, c.aum))}</span>` },
      { key: 'openedWeek', label: 'Opened', str: true, val: c => c.openedWeek || '', filter: true },
      { key: 'submittedWeek', label: 'Submitted', str: true, val: c => sc.deriveWeeks(c).submittedWeek || '' },
      { key: 'closedWeek', label: 'Closed', str: true, val: c => sc.deriveWeeks(c).closedWeek || '' }
    ];
  }
  const COL = (key) => columns().filter(c => c.key === key)[0];
  const stageChipClass = (s) => ({ Opened: 'tier-medium', Submitted: 'tier-high', Closed: 'tier-gold', Lost: 'tier-low' }[s] || 'pill-soft');

  function distinct(rows, key) {
    const col = COL(key), seen = {}, out = [];
    rows.forEach(c => { const v = col.val(c); if (v && !seen[v]) { seen[v] = 1; out.push(v); } });
    return out.sort();
  }

  function filtered(st) {
    const sc = S();
    let rows = D().cases();
    if (!st.viewAll) rows = rows.filter(c => sc.activeInWeek(c, st.week));
    if (st.search) {
      const q = st.search.toLowerCase();
      rows = rows.filter(c => String(c.clientName || '').toLowerCase().indexOf(q) >= 0 || String(c.agentName || '').toLowerCase().indexOf(q) >= 0);
    }
    ['agent', 'product', 'source', 'state', 'openedWeek'].forEach(k => {
      const want = st.f[k];
      if (want) { const col = COL(k); rows = rows.filter(c => col.val(c) === want); }
    });
    const col = COL(st.sortKey) || COL('openedWeek');
    rows.sort((a, b) => {
      let r;
      if (col.num) r = (col.val(a) || 0) - (col.val(b) || 0);
      else { const x = String(col.val(a)).toLowerCase(), y = String(col.val(b)).toLowerCase(); r = x < y ? -1 : (x > y ? 1 : 0); }
      return st.sortDir === 'desc' ? -r : r;
    });
    return rows;
  }

  function recentWeeks(count) {
    const cur = S().currentWeekEnding();
    const all = S().fridaysOfYear(Number(cur.slice(0, 4)));
    const idx = all.indexOf(cur);
    return (idx >= 0 ? all.slice(0, idx + 1) : all).slice(-count).reverse();
  }

  function toCSV(rows) {
    const cols = columns();
    const cell = (v) => { v = (v == null) ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const header = cols.map(c => cell(c.label)).join(',');
    const body = rows.map(c => cols.map(col => cell(col.num ? Math.round(col.val(c)) : col.val(c))).join(',')).join('\r\n');
    return header + '\r\n' + body;
  }

  // ── the edit / view modal ──
  function canEdit(c, user) { return user.role === 'admin' || c.agentUid === user.id; }

  function openModal(id) {
    const c = D().caseById(id); if (!c) return;
    const user = RWG.auth.currentUser();
    const sc = S(), editable = canEdit(c, user), isAdmin = user.role === 'admin';
    const prodOpts = sc.PRODUCTS.map(p => `<option value="${p.id}" ${p.id === c.product ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
    const srcOpts = sc.SOURCES.map(s => `<option value="${s.id}" ${s.id === c.source ? 'selected' : ''}>${esc(s.label)}</option>`).join('');
    const stateOpts = sc.STATES.map(s => `<option value="${s}" ${s === c.state ? 'selected' : ''}>${s}</option>`).join('');
    const inp = sc.inputFor(c.product), moneyVal = sc.usesAum(c.product) ? c.aum : c.amount;
    const w = sc.deriveWeeks(c);
    const weekOpts = (sel) => ['<option value="">—</option>'].concat(recentWeeks(20).map(fri => `<option value="${fri}" ${fri === sel ? 'selected' : ''}>${fri}</option>`)).join('');

    const fields = `
      <div class="cs-modal-grid">
        <div><label>Client</label><input id="cm-client" value="${esc(c.clientName || '')}" ${editable ? '' : 'disabled'}></div>
        <div><label>Product</label><select id="cm-prod" ${editable ? '' : 'disabled'}>${prodOpts}</select></div>
        <div><label>Source</label><select id="cm-src" ${editable ? '' : 'disabled'}>${srcOpts}</select></div>
        <div><label>Stage</label><select id="cm-state" ${editable ? '' : 'disabled'}>${stateOpts}</select></div>
        <div><label id="cm-money-label">${esc(inp.label)}</label><input id="cm-money" type="number" value="${esc(moneyVal || 0)}" ${editable ? '' : 'disabled'}><div class="hint" id="cm-money-hint">${esc(inp.hint)}</div></div>
      </div>`;

    const correct = isAdmin ? `
      <div class="cs-correct">
        <div class="cs-correct-h">Correct the weeks <span class="muted">(admin)</span></div>
        <div class="cs-modal-grid">
          <div><label>Opened week</label><select id="cm-ow">${weekOpts(w.openedWeek)}</select></div>
          <div><label>Submitted week</label><select id="cm-sw">${weekOpts(w.submittedWeek)}</select></div>
          <div><label>Closed week</label><select id="cm-cw">${weekOpts(w.closedWeek)}</select></div>
        </div>
      </div>` : '';

    const foot = editable
      ? `<div class="modal-foot">
          ${isAdmin ? `<button class="btn btn-danger" data-action="cs-delete" data-id="${esc(id)}">Delete</button>` : ''}
          <span class="topbar-spacer"></span>
          <button class="btn btn-ghost" data-action="close-modal">Cancel</button>
          <button class="btn btn-gold" data-action="cs-save" data-id="${esc(id)}">Save</button>
        </div>`
      : `<div class="modal-foot"><span class="topbar-spacer"></span><button class="btn btn-ghost" data-action="close-modal">Close</button></div>`;

    const mount = document.getElementById('modal-mount');
    mount.innerHTML = `<div class="scrim" data-action="close-modal"></div>
      <div class="modal-card">
        <div class="modal-head"><h3>${editable ? 'Edit case' : 'Case'}</h3><button class="drawer-close" data-action="close-modal">✕</button></div>
        <div class="modal-body">${fields}${correct}${editable ? '' : '<p class="muted" style="font-size:12.5px;margin-top:10px">Read-only. Only the case owner or an admin can edit.</p>'}</div>
        ${foot}
      </div>`;
  }

  function saveModal(id) {
    const c = D().caseById(id); if (!c) return;
    const user = RWG.auth.currentUser();
    const g = (i) => { const el = document.getElementById(i); return el ? el.value : ''; };
    const prod = g('cm-prod'), usesAum = S().usesAum(prod), mv = Number(g('cm-money')) || 0;
    const patch = {
      recordId: id, agentUid: c.agentUid, agentName: c.agentName,
      clientName: g('cm-client').trim(), product: prod, source: g('cm-src'), state: g('cm-state'),
      amount: usesAum ? 0 : mv, aum: usesAum ? mv : 0,
      coCreditUids: c.coCreditUids, coCreditNames: c.coCreditNames
    };
    D().saveCase(patch).then(() => {
      // admin week correction, if changed
      if (user.role === 'admin') {
        const ow = g('cm-ow'), sw = g('cm-sw'), cw = g('cm-cw');
        const w = S().deriveWeeks(c);
        if (ow !== w.openedWeek || sw !== w.submittedWeek || cw !== w.closedWeek) {
          return D().adminSetStamps(id, { openedWeek: ow || w.openedWeek, submittedWeek: sw, closedWeek: cw });
        }
      }
    }).then(() => { document.getElementById('modal-mount').innerHTML = ''; U().toast('Case saved', true); })
      .catch(err => U().toast('Could not save: ' + err.message));
  }

  RWG.modules.register({
    id: 'cases',
    title: 'All Cases',
    enabled: true,
    roles: ['admin', 'agent'],
    nav: [{ view: 'cases', label: 'All Cases', icon: 'cases' }],
    meta: { cases: { t: 'All Cases', s: 'The whole team\'s book' } },

    state: { search: '', f: { agent: '', product: '', source: '', state: '', openedWeek: '' }, viewAll: true, week: null, sortKey: 'openedWeek', sortDir: 'desc' },

    home: { tile: () => ({ icon: 'cases', title: 'All Cases', desc: 'Browse, search, and filter the whole team\'s book.', view: 'cases' }) },

    onEnter(view, ctx) {
      if (!D().isStarted()) D().init(ctx.userObj || RWG.auth.currentUser(), RWG.app.renderMain);
      if (!this.state.week) this.state.week = S().currentWeekEnding();
    },

    onInput(e, st) { if (e.target.id === 'cs-search') { st.search = e.target.value; refreshBody(); } },

    onChange(e, st) {
      const id = e.target.id;
      if (id === 'cs-week') { st.week = e.target.value; RWG.app.renderMain(); return; }
      if (id && id.indexOf('csf-') === 0) { st.f[id.slice(4)] = e.target.value; refreshBody(); return; }
      // live money-label swap in the modal
      if (id === 'cm-prod') {
        const inp = S().inputFor(e.target.value);
        const l = document.getElementById('cm-money-label'); if (l) l.textContent = inp.label;
        const h = document.getElementById('cm-money-hint'); if (h) h.textContent = inp.hint;
      }
    },

    actions: {
      'cs-sort': (el, e, st) => { const k = el.dataset.key; if (st.sortKey === k) st.sortDir = st.sortDir === 'asc' ? 'desc' : 'asc'; else { st.sortKey = k; st.sortDir = COL(k).num ? 'desc' : 'asc'; } RWG.app.renderMain(); },
      'cs-toggle-all': (el, e, st) => { st.viewAll = !st.viewAll; RWG.app.renderMain(); },
      'cs-clear': (el, e, st) => { st.search = ''; st.f = { agent: '', product: '', source: '', state: '', openedWeek: '' }; RWG.app.renderMain(); },
      'cs-export': (el, e, st) => {
        const csv = toCSV(filtered(st)); const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
        a.download = 'RWG_cases_' + S().currentWeekEnding() + '.csv'; document.body.appendChild(a); a.click(); a.remove();
      },
      'cs-open': (el) => openModal(el.dataset.id),
      'cs-save': (el) => saveModal(el.dataset.id),
      'cs-delete': (el) => { if (confirm('Delete this case? Admins only.')) D().deleteCase(el.dataset.id).then(() => { document.getElementById('modal-mount').innerHTML = ''; U().toast('Case deleted'); }); }
    },

    render(view, user, ctx) {
      const st = this.state;
      const all = D().cases();
      const rows = filtered(st);
      const sel = (id, cur, opts) => `<select id="csf-${id}" class="fbar-select"><option value="">All ${id}</option>${opts.map(o => `<option value="${esc(o)}" ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      const weekOpts = recentWeeks(20).map(w => `<option value="${w}" ${w === st.week ? 'selected' : ''}>Week ending ${w}${w === S().currentWeekEnding() ? ' (this week)' : ''}</option>`).join('');

      const bar = `<div class="filterbar cs-bar">
        <div class="cs-bar-row">
          <input id="cs-search" class="input cs-search" type="search" placeholder="Search client or agent…" value="${esc(st.search)}">
          <button class="btn btn-quiet btn-sm" data-action="cs-toggle-all">${st.viewAll ? 'All weeks' : 'This week only'}</button>
          ${st.viewAll ? '' : `<select id="cs-week" class="fbar-select">${weekOpts}</select>`}
        </div>
        <div class="cs-bar-row">
          ${sel('agent', st.f.agent, distinct(all, 'agent'))}
          ${sel('product', st.f.product, distinct(all, 'product'))}
          ${sel('state', st.f.state, distinct(all, 'state'))}
          ${sel('source', st.f.source, distinct(all, 'source'))}
          <span class="topbar-spacer"></span>
          <button class="btn btn-quiet btn-sm" data-action="cs-clear">Clear</button>
          <button class="btn btn-ghost btn-sm" data-action="cs-export">⬇ Export</button>
        </div>
      </div>`;

      return `<div class="card">
        <div class="card-head"><h3>All Cases</h3><span class="sub" id="cs-count">${rows.length} of ${all.length}</span></div>
        ${bar}
        <div id="cs-body">${tableHtml(rows, st, user)}</div>
      </div>`;
    }
  });

  function tableHtml(rows, st, user) {
    const cols = columns();
    const head = cols.map(c => {
      const arrow = st.sortKey === c.key ? (st.sortDir === 'asc' ? ' ▲' : ' ▼') : '';
      return `<th class="${c.num ? 'num' : ''}"><span class="cs-th" data-action="cs-sort" data-key="${c.key}">${esc(c.label)}${arrow}</span></th>`;
    }).join('');
    if (!rows.length) return `<div class="empty" style="padding:40px"><div class="ec">🔍</div><h3>No cases match</h3><p>Adjust the filters or Clear.</p></div>`;
    const body = rows.map(c => `<tr data-action="cs-open" data-id="${esc(c.recordId)}" class="cs-row">${cols.map(col => `<td class="${col.num ? 'num' : ''}">${col.cell ? col.cell(c) : esc(col.val(c))}</td>`).join('')}</tr>`).join('');
    return `<div class="table-wrap"><table class="data cs-table"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
  }

  function refreshBody() {
    const st = RWG.modules.get('cases').state, user = RWG.auth.currentUser();
    const rows = filtered(st);
    const body = document.getElementById('cs-body'); if (body) body.innerHTML = tableHtml(rows, st, user);
    const cnt = document.getElementById('cs-count'); if (cnt) cnt.textContent = rows.length + ' of ' + D().cases().length;
  }

  RWG._casesModule = { filtered, toCSV, columns };
})();
