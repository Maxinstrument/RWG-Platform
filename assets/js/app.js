/* ============================================================
   RWG CRM — App controller (boot, routing, interactions)
   ============================================================ */
window.RWG = window.RWG || {};
RWG.app = (function () {
  const U = RWG.ui, D = RWG.data;

  const ICONS = {
    dashboard: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
    leads: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3.5" cy="6" r="1.2"/><circle cx="3.5" cy="12" r="1.2"/><circle cx="3.5" cy="18" r="1.2"/></svg>',
    team: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.2 3.2 0 0 1 0 7"/><path d="M18 20c0-2.5-1-4.5-2.5-5.6"/></svg>',
    upload: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V5"/><path d="M8 9l4-4 4 4"/><path d="M5 19h14"/></svg>',
    settings: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg>',
    archive: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M10 12h4"/></svg>',
    reports: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="3" width="17" height="18" rx="2"/><path d="M8 16v-4M12 16V8M16 16v-6"/></svg>',
    board: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="5" height="16" rx="1.3"/><rect x="9.5" y="4" width="5" height="11" rx="1.3"/><rect x="16" y="4" width="5" height="14" rx="1.3"/></svg>',
    today: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/></svg>',
    stats: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/></svg>',
    logout: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/></svg>',
    home: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1V9.5"/></svg>',
    scorecard: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
    cases: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
    club: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="9" r="5.5"/><path d="M8.5 13.5 7 22l5-2.6L17 22l-1.5-8.5"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/></svg>'
  };

  // Sidebar entries and page titles now live with their modules (assets/js/modules/*.js).
  // The kernel asks RWG.modules for both, so adding a module never touches this file.

  const newFilter = () => RWG.leadtable.defaultFilter();
  const loadCols = (k, def) => { try { const r = localStorage.getItem(k); if (r) return JSON.parse(r); } catch (e) {} return def.slice(); };
  const saveCols = (k, arr) => { try { localStorage.setItem(k, JSON.stringify(arr)); } catch (e) {} };

  const state = {
    view: null, search: '', leadId: null, editing: false, importRows: null, importName: '', dragId: null,
    viewAs: null,   // admin impersonation: the agent id being viewed (or null)
    archiveRows: null,   // deletion archive (fetched on demand; not in the live cache)
    assignTarget: null,  // agent we're prepping to hand pooled leads to (pre-selects the bulk reassign)
    reportWeekStart: null, reportCache: {}, lastReport: null,   // weekly reports (live current week + frozen past)
    agentFilter: newFilter(), adminFilter: newFilter(), selected: new Set(),
    adminCols: loadCols('rwg_cols_admin_v3', RWG.leadtable.defaultVisible(true)),
    agentCols: loadCols('rwg_cols_agent_v3', RWG.leadtable.defaultVisible(false))
  };

  // "Effective" identity — usually the logged-in user, but an admin can view-as an agent.
  function effectiveUser() {
    const real = RWG.auth.currentUser();
    if (state.viewAs && real && real.role === 'admin') { const a = D.user(state.viewAs); if (a) return a; }
    return real;
  }
  function effectiveRole() {
    const real = RWG.auth.currentUser();
    if (state.viewAs && real && real.role === 'admin') return 'agent';
    return real ? real.role : 'agent';
  }
  // Set (or clear, with a falsy id) who an admin is viewing, staying on the
  // current page. Used by the scorecard's agent picker so you can flip between
  // agents without going back to Team. Only admins may impersonate.
  function setViewAs(id) {
    if (!RWG.auth.isAdmin()) return;
    state.viewAs = id || null;
    state.search = '';
    clearSelection();
    render();
  }

  // Which filter / column set is active depends on context: admin "All Leads" vs the agent's views.
  const isAdminLeads = () => effectiveRole() === 'admin' && state.view === 'leads';
  const currentFilter = () => isAdminLeads() ? state.adminFilter : state.agentFilter;
  const currentCols = () => isAdminLeads() ? state.adminCols : state.agentCols;
  const currentColsKey = () => isAdminLeads() ? 'rwg_cols_admin_v3' : 'rwg_cols_agent_v3';

  // Leads + filter for whatever lead table is currently on screen.
  // effectiveUser (not currentUser): in View As mode the table must show the
  // impersonated agent's leads, or filter repaints come up empty for admins.
  function currentTableLeads() {
    const u = effectiveUser();
    const adminLeads = isAdminLeads();
    const base = adminLeads ? D.leads() : D.leadsFor(u.id);
    const f = Object.assign(newFilter(), currentFilter(), { search: state.search });
    return { adminLeads, f, base, total: base.length, filtered: RWG.leadtable.applyFilter(base, f) };
  }
  const tableOpts = (c) => ({ showOwner: c.adminLeads, columns: currentCols(), selectable: c.adminLeads, selected: state.selected, allLeads: c.base, empty: 'Try a different filter, or Clear all.' });

  // Position a fixed popover panel just under its trigger button, clamped to the viewport
  function positionPanel(btn, panel) {
    panel.hidden = false;
    const r = btn.getBoundingClientRect();
    const pw = panel.offsetWidth || 210;
    let left = Math.min(r.right - pw, window.innerWidth - pw - 8);
    if (left < 8) left = 8;
    panel.style.top = (r.bottom + 8) + 'px';
    panel.style.left = left + 'px';
  }

  // Update count, summary chips, header funnels, board tier-chips + Clear visibility without re-rendering
  function updateFilterChrome() {
    const c = currentTableLeads(), f = currentFilter(), cf = f.colFilters || {};
    const cnt = document.querySelector('.fbar-count');
    if (cnt) cnt.textContent = `${c.filtered.length} of ${c.total} lead${c.total === 1 ? '' : 's'}`;
    const chipRow = document.querySelector('.chip-row');
    if (chipRow) chipRow.innerHTML = RWG.leadtable.summaryChips(f) || '<span class="muted" style="font-size:13px">None — click a column ▾ to sort &amp; filter</span>';
    document.querySelectorAll('.th-filter[data-col]').forEach(b => b.classList.toggle('on', (cf[b.dataset.col] || []).length > 0));
    document.querySelectorAll('.fbar-tier[data-tier]').forEach(b => b.classList.toggle('on', (cf.tier || []).includes(b.dataset.tier)));
    const active = Object.keys(cf).some(k => cf[k] && cf[k].length) || f.search || f.sortKey !== 'score' || f.sortDir !== 'desc';
    document.querySelectorAll('.fbar-clear').forEach(clr => clr.style.display = active ? '' : 'none');
  }

  // Rebuild the whole table (headers + body) — used for column-chooser changes (its popover lives in the bar)
  function refreshLeadsBody() {
    const body = $('#leads-body'); if (!body) return;
    const c = currentTableLeads();
    body.innerHTML = RWG.leadtable.leadsView(c.filtered, c.f, tableOpts(c));
    updateFilterChrome();
  }
  // Rebuild ONLY the rows — used for column-filter changes so the header's open popover survives
  function refreshLeadsRows() {
    const tbody = document.querySelector('#leads-body tbody');
    if (!tbody) { refreshLeadsBody(); return; }
    const c = currentTableLeads();
    tbody.innerHTML = RWG.leadtable.bodyFor(c.filtered, tableOpts(c));
    updateFilterChrome();
  }

  // Lightweight update of bulk-selection UI (avoids a full re-render so the agent dropdown keeps its value)
  function updateBulkUI() {
    const n = state.selected.size, bar = $('#bulkbar');
    if ((n > 0 && !bar) || (n === 0 && bar)) { renderMain(); return; }   // insert/remove the bulk bar
    if (bar) { const c = bar.querySelector('.bulk-count'); if (c) c.textContent = n + ' selected'; }
    const sa = document.querySelector('input[data-selall]');
    if (sa) {
      const ids = currentTableLeads().filtered.map(l => l.id);
      const onCount = ids.filter(id => state.selected.has(id)).length;
      sa.checked = ids.length > 0 && onCount === ids.length;
      sa.indeterminate = onCount > 0 && onCount < ids.length;
    }
  }
  const clearSelection = () => { if (state.selected.size) state.selected.clear(); };
  const $ = (s, r) => (r || document).querySelector(s);
  const root = () => document.getElementById('root');

  // ────────────────────────── boot / routing
  let _dataReady = false;
  function boot() {
    root().innerHTML = bootScreen();
    if (!RWG.fb) { root().innerHTML = bootScreen('Couldn’t reach Firebase — check your connection and refresh.'); return; }
    RWG.auth.init(onAuthChange);
  }
  function onAuthChange() {
    const u = RWG.auth.currentUser();
    if (!u || u.status !== 'active') { _dataReady = false; D.teardown(); render(); return; }
    if (!_dataReady) { _dataReady = true; D.init(u, render); }   // render() re-fires on each Firestore snapshot
    render();
  }
  function bootScreen(msg) {
    return `<div id="gate"><div class="gate-card" style="text-align:center">
      <img class="gate-logo" src="assets/img/logo.png" alt="Resilient Wealth Group">
      <p class="gate-brand">Resilient Wealth Group</p>
      <p class="gate-motto">Wealth, Conducted with Purpose</p>
      <p class="muted" style="margin-top:18px">${U.esc(msg || 'Loading…')}</p></div></div>`;
  }
  function pendingScreen(u) {
    const first = U.esc((u.name || '').split(' ')[0] || 'there');
    let title = 'Account pending approval';
    let sub = `Thanks, ${first}! Your account is awaiting the owner's approval — you'll have access the moment it's approved.`;
    if (u.status === 'removed') {
      title = 'Access removed';
      sub = `Hi ${first} — your access to this CRM has been removed. If this is a mistake, ask your administrator to restore your access.`;
    } else if (u.status === 'denied') {
      title = 'Request not approved';
      sub = `Hi ${first} — your access request wasn't approved. Please contact your administrator if you believe this is an error.`;
    }
    return `<div id="gate"><div class="gate-card" style="text-align:center">
      <img class="gate-logo" src="assets/img/logo.png" alt="Resilient Wealth Group">
      <p class="gate-brand">Resilient Wealth Group</p>
      <p class="gate-motto">Wealth, Conducted with Purpose</p>
      <p class="gate-title" style="margin-top:18px">${title}</p>
      <p class="gate-sub">${sub}</p>
      <button class="btn btn-ghost btn-block" data-action="logout">Sign out</button></div></div>`;
  }
  function render() {
    const real = RWG.auth.currentUser();
    closeDrawer();
    if (!real) { root().innerHTML = RWG.views.login(); document.body.classList.remove('in-app'); return; }
    if (real.status !== 'active') { root().innerHTML = pendingScreen(real); document.body.classList.remove('in-app'); return; }
    if (real.role !== 'admin') state.viewAs = null;   // only admins may impersonate
    // Land on the first nav item of the first enabled module for this role.
    if (!state.view || !RWG.modules.moduleForView(state.view)) state.view = RWG.modules.defaultView(effectiveRole());
    renderShell();
  }

  function renderShell() {
    const user = effectiveUser();
    const role = effectiveRole();
    const impersonating = !!state.viewAs;
    // Topbar extras are opt-in: a module declares chrome:{search:'leads', newLead:true}
    const chrome = RWG.modules.forRole(role).reduce((a, m) => Object.assign(a, m.chrome || {}), {});
    const navHtml = RWG.modules.navFor(role).map(n => {
      const badge = n.badge ? n.badge() : 0;
      return `<button class="nav-item ${state.view === n.view ? 'active' : ''}" data-action="nav" data-view="${n.view}">
        ${ICONS[n.icon] || ''}<span>${n.label}</span>${badge ? `<span class="badge">${badge}</span>` : ''}</button>`;
    }).join('');
    const banner = impersonating
      ? `<div class="viewas-banner">👁 Viewing as <b>${U.esc(user.name)}</b> — their exact cockpit. Changes you make here save on their behalf.<button class="btn btn-sm" data-action="exit-view-as">Exit agent view</button></div>`
      : '';

    root().innerHTML = `
      <div id="app" class="show">
        <aside class="sidebar" id="sidebar">
          <div class="side-brand"><img src="assets/img/logo.png" alt="RWG"><div class="t">Resilient Wealth<small>Wealth, Conducted with Purpose</small></div></div>
          <div class="nav-label">${role === 'admin' ? 'Owner' : (impersonating ? 'Viewing as agent' : 'Agent')}</div>
          ${navHtml}
          <div class="spacer"></div>
          <a class="nav-item" href="guide.html" target="_blank" rel="noopener"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 7v14"/><path d="M3 5h6a3 3 0 0 1 3 3 3 3 0 0 1 3-3h6v13h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3H3z"/></svg><span>Guide</span></a>
          <button class="nav-item" data-action="logout">${ICONS.logout}<span>Sign out</span></button>
          <div class="side-foot">RWG Platform</div>
        </aside>
        <div class="sidebar-scrim"></div>
        <header class="topbar">
          <button class="icon-btn menu-toggle" data-action="toggle-menu">☰</button>
          <div><div class="page-title" id="page-title"></div><div class="page-sub" id="page-sub"></div></div>
          <div class="topbar-spacer"></div>
          ${chrome.search ? `<div class="topbar-search">${ICONS.search}<input id="global-search" type="search" placeholder="Search leads…" value="${U.esc(state.search)}"></div>` : ''}
          ${chrome.newLead ? `<button class="btn btn-gold btn-sm" data-action="add-lead" style="white-space:nowrap">＋ New Lead</button>` : ''}
          <div class="user-chip">${U.avatar(user, 32)}<div class="meta"><div class="nm">${U.esc(user.name)}</div><div class="rl">${impersonating ? 'Agent (view)' : (role === 'admin' ? 'Owner' : 'Agent')}</div></div></div>
        </header>
        <main class="main">${banner}<div id="main-content"></div></main>
      </div>
      <div id="drawer-mount"></div>
      <div id="modal-mount"></div>`;
    document.body.classList.add('in-app');
    renderMain();
  }

  function setMeta() {
    const m = RWG.modules.metaFor(state.view) || { t: '', s: '' };
    if ($('#page-title')) { $('#page-title').textContent = m.t; $('#page-sub').textContent = m.s; }
  }

  function renderMain() {
    const real = RWG.auth.currentUser();
    if (!real) return render();
    const user = effectiveUser(), role = effectiveRole();
    setMeta();
    const ctx = { role, search: state.search, isAdmin: role === 'admin', filter: currentFilter(), columns: currentCols(), selected: state.selected, assignTarget: state.assignTarget };
    const mod = RWG.modules.moduleForView(state.view);
    const html = mod
      ? mod.render(state.view, user, ctx)
      : `<div class="empty" style="padding:60px 16px"><div class="ec">🧭</div><h3>Nothing here yet</h3><p>Choose an area from the menu.</p></div>`;
    const c = $('#main-content');
    if (c) { c.innerHTML = html; c.scrollTop = 0; }
    if (mod && mod.onEnter) mod.onEnter(state.view, ctx);

    // ── Legacy Leads wiring. Only reachable while the Leads module is enabled. ──
    // re-wire dynamic bits for the upload view
    if (state.view === 'upload') wireUpload();
    // the deletion archive lives outside the live cache — fetch on entry, repaint from memory after
    if (role === 'admin' && state.view === 'archive') { if (state.archiveRows === null) loadArchive(); else paintArchive(); }
    // weekly reports: current week computes live; past weeks load/freeze a snapshot
    if (role === 'admin' && state.view === 'reports') loadOrPaintReport();
  }

  // ── weekly reports ──
  const curWeekStart = () => RWG.analytics.weekStartOf(Date.now());
  function loadOrPaintReport() {
    if (state.reportWeekStart == null) state.reportWeekStart = curWeekStart();
    const A = RWG.analytics, ws = state.reportWeekStart;
    const range = A.weekRangeFor(ws), wid = A.weekId(ws), label = A.weekLabel(ws);
    if (ws >= curWeekStart()) {                      // current (in-progress) week → always live
      paintReport(A.weeklyReport(range), label, 'live');
      return;
    }
    if (state.reportCache[wid]) { paintReport(state.reportCache[wid], label, 'final'); return; }
    const host = $('#report-body'); if (host) host.innerHTML = '<div class="muted" style="padding:28px;text-align:center">Loading…</div>';
    D.getReport(wid).then(snap => {
      if (snap) { state.reportCache[wid] = snap; paintReport(snap, label, 'final'); return; }
      const rep = A.weeklyReport(range);             // not stored yet → compute and freeze it
      rep.weekStart = range.start; rep.weekEnd = range.end;
      D.saveReport(wid, rep).catch(e => console.error('save report:', e));
      state.reportCache[wid] = rep; paintReport(rep, label, 'final');
    }).catch(() => { const h = $('#report-body'); if (h) h.innerHTML = '<div class="muted" style="padding:28px;text-align:center">Couldn’t load this report. If you just enabled reports, re-publish your Firestore rules.</div>'; });
  }
  function paintReport(rep, label, status) {
    const host = $('#report-body'); if (!host) return;
    state.lastReport = { rep, label };
    host.innerHTML = RWG.views.admin.reportTable(rep, label, status);
    const nextBtn = document.querySelector('[data-action="report-next"]');
    if (nextBtn) nextBtn.disabled = state.reportWeekStart >= curWeekStart();
  }
  function csvCell(v) { v = (v == null) ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function exportReport() {
    const lr = state.lastReport; if (!lr) return;
    const cols = ['Agent', 'Dials', 'Reaches', 'Reach %', 'Appts set', 'Appts GOLD', 'Appts HIGH', 'Appts MEDIUM', 'Appts LOW', 'Appts kept', 'Opportunities', 'Leads touched'];
    const tiers = (o) => { const at = o.apptTiers || {}; return [at.GOLD || 0, at.HIGH || 0, at.MEDIUM || 0, at.LOW || 0]; };
    const rows = lr.rep.agents.map(a => [a.name, a.dials, a.reaches, a.reachRate + '%', a.apptSet].concat(tiers(a), [a.apptKept, a.oppOpened, a.leadsTouched]));
    const t = lr.rep.team;
    rows.push(['Team total', t.dials, t.reaches, t.reachRate + '%', t.apptSet].concat(tiers(t), [t.apptKept, t.oppOpened, '']));
    const csv = [cols].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n');
    downloadCSV('RWG_weekly_report_' + RWG.analytics.weekId(state.reportWeekStart) + '.csv', csv);
  }

  // ── deletion archive ──
  function loadArchive() {
    const host = $('#archive-body'); if (!host) return;
    host.innerHTML = '<div class="muted" style="padding:28px;text-align:center">Loading the archive…</div>';
    D.fetchDeletedLeads().then(rows => { state.archiveRows = rows; paintArchive(); })
      .catch(err => {
        state.archiveRows = [];
        const h = $('#archive-body');
        if (h) h.innerHTML = '<div class="muted" style="padding:28px;text-align:center">Couldn’t load the archive — ' + U.esc(err.message || 'tap Refresh to retry.') + '</div>';
      });
  }
  function paintArchive() {
    const host = $('#archive-body'); if (!host) return;
    host.innerHTML = RWG.views.admin.archiveTable(state.archiveRows || []);
  }

  function setActiveNav() {
    document.querySelectorAll('.nav-item[data-view]').forEach(b =>
      b.classList.toggle('active', b.dataset.view === state.view));
  }

  function nav(view) {
    state.view = view;
    if (view === 'archive') state.archiveRows = null;   // pull a fresh copy of the archive on entry
    if (view === 'reports') state.reportWeekStart = RWG.analytics.weekStartOf(Date.now());   // open on the current week
    if (view !== 'leads') state.assignTarget = null;     // the pre-selected assignee only applies to All Leads
    clearSelection();
    setActiveNav();
    renderMain();
    const sb = $('#sidebar'); if (sb) sb.classList.remove('open');
  }

  // clickable table-header sorting: same col toggles direction, new col uses its default
  function sortByHeader(key, defDir) {
    const f = currentFilter();
    if (f.sortKey === key) f.sortDir = (f.sortDir === 'asc') ? 'desc' : 'asc';
    else { f.sortKey = key; f.sortDir = defDir || 'desc'; }
    renderMain();
  }

  // ────────────────────────── drawer
  function openLead(id, editing) {
    state.leadId = id;
    state.editing = !!editing;
    const user = RWG.auth.currentUser();
    $('#drawer-mount').innerHTML = RWG.views.drawer(id, { isAdmin: user.role === 'admin', editing: state.editing });
  }
  function closeDrawer() {
    const m = $('#drawer-mount'); if (m) m.innerHTML = '';
    state.leadId = null; state.editing = false;
  }
  function refreshDrawer() { if (state.leadId) openLead(state.leadId, state.editing); }

  // ────────────────────────── modal (Add lead)
  function openModal(html) { const m = $('#modal-mount'); if (m) m.innerHTML = html; }
  function closeModal() { const m = $('#modal-mount'); if (m) m.innerHTML = ''; }

  function buildAddLeadModal() {
    const u = RWG.auth.currentUser();
    const sel = (id, opts, val) => `<select id="${id}">${opts.map(o => `<option ${o === val ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
    const fg = (label, inner) => `<div class="field-group"><label class="lbl">${label}</label>${inner}</div>`;
    const assignRow = u.role === 'admin'
      ? fg('Assign to', `<select id="nl-assign"><option value="">— Unassigned (pool) —</option>${D.agents().map(a => `<option value="${a.id}">${U.esc(a.name)}</option>`).join('')}</select>`)
      : `<p class="muted" style="font-size:13px;margin:2px 0 10px">This lead will be added to <b>your</b> leads.</p>`;
    return `
    <div class="scrim" data-action="close-modal"></div>
    <div class="modal-card" role="dialog" aria-label="Add lead">
      <div class="modal-head"><h2>Add a lead</h2><p>For a prospect from a call, email or referral — not a seminar list.</p></div>
      <div class="modal-body">
        <div class="field-row">${fg('First name', `<input id="nl-firstName" type="text">`)}${fg('Last name', `<input id="nl-lastName" type="text">`)}</div>
        <div class="field-row">${fg('Phone', `<input id="nl-phone" type="tel">`)}${fg('Email', `<input id="nl-email" type="email">`)}</div>
        <div class="field-row">${fg('Source', sel('nl-source', ['Inbound Call', 'Email', 'Referral', 'Walk-in', 'Other']))}${fg('Attended seminar', sel('nl-attended', D.ATTENDED_OPTS, 'No'))}</div>
        <div class="field-row">${fg('Age', `<input id="nl-age" type="number">`)}${fg('Years of Service', `<input id="nl-yos" type="number">`)}</div>
        <div class="field-row">${fg('Plan Type', sel('nl-planType', D.PLAN_TYPES, "Don't Know"))}${fg('Member Class', sel('nl-memberClass', D.MEMBER_CLASSES, 'Regular'))}</div>
        <div class="field-row">${fg('AFC / Salary', `<input id="nl-afc" type="number">`)}${fg('Employer', `<input id="nl-employer" type="text">`)}</div>
        ${assignRow}
        ${fg('Notes', `<textarea id="nl-notes" placeholder="Context — where this lead came from, etc."></textarea>`)}
        <p class="gate-error" id="nl-err"></p>
      </div>
      <div class="modal-foot">
        <button class="btn btn-quiet" data-action="close-modal">Cancel</button>
        <button class="btn btn-gold" data-action="save-new-lead">Add lead</button>
      </div>
    </div>`;
  }

  function saveNewLead() {
    const v = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };
    const first = v('nl-firstName'), last = v('nl-lastName'), phone = v('nl-phone'), email = v('nl-email');
    if (!first && !last) { $('#nl-err').textContent = 'Please enter at least a first or last name.'; return; }
    if (!phone && !email) { $('#nl-err').textContent = 'Add a phone or email so the lead is contactable.'; return; }
    const u = RWG.auth.currentUser();
    const fields = {
      firstName: first, lastName: last, phone, email,
      source: v('nl-source'), attended: v('nl-attended'),
      age: v('nl-age'), yos: v('nl-yos'), afc: v('nl-afc'),
      planType: v('nl-planType'), memberClass: v('nl-memberClass'),
      employer: v('nl-employer'), notes: v('nl-notes'),
      assignedTo: (u.role === 'admin') ? (v('nl-assign') || null) : u.id
    };
    const lead = D.addLead(fields, u.id);
    closeModal();
    renderMain();
    openLead(lead.id);
    U.toast('Lead added', true);
  }

  function buildEditUserModal(userId) {
    const u = D.user(userId); if (!u) return '';
    const isOwner = (u.email || '').toLowerCase() === (RWG.OWNER_EMAIL || '').toLowerCase();
    return `
    <div class="scrim" data-action="close-modal"></div>
    <div class="modal-card" role="dialog" aria-label="Edit team member">
      <div class="modal-head"><h2>Edit team member</h2><p>Update their name or send a password-reset link.</p></div>
      <div class="modal-body">
        <div class="field-group"><label class="lbl">Name</label><input id="eu-name" type="text" value="${U.esc(u.name || '')}"></div>
        <div class="field-group"><label class="lbl">Login email</label>
          <input type="email" value="${U.esc(u.email || '')}" disabled>
          <div class="cell-sub mt-8">The login email is their sign-in credential and can't be changed from here. To change it, they update it themselves, or remove this account and have them re-register with the new email${isOwner ? ' (this is the owner account)' : ''}.</div></div>
        <div class="field-group"><label class="lbl">Password</label>
          <button class="btn btn-ghost btn-sm" data-action="admin-reset-pass" data-email="${U.esc(u.email || '')}">✉ Send password-reset link</button>
          <div class="cell-sub mt-8">Emails them a secure link to set a new password. (Admins can't directly set someone's password.)</div></div>
        <p class="gate-error" id="eu-err"></p>
      </div>
      <div class="modal-foot">
        <button class="btn btn-quiet" data-action="close-modal">Cancel</button>
        <button class="btn btn-gold" data-action="save-user" data-id="${u.id}">Save</button>
      </div>
    </div>`;
  }
  function saveUser(id) {
    const name = $('#eu-name') ? $('#eu-name').value.trim() : '';
    if (!name) { const e = $('#eu-err'); if (e) e.textContent = 'Name cannot be empty.'; return; }
    D.setUserName(id, name); closeModal(); renderMain(); U.toast('Saved', true);
  }

  const appBaseUrl = () => location.origin + location.pathname;   // e.g. https://maxinstrument.github.io/CRM/
  function buildInviteModal() {
    const url = appBaseUrl();
    const msg = `You're invited to join the Resilient Wealth Group CRM.\n\n1. Open this link: ${url}\n2. Click "Request access" and sign up with your email.\n3. I'll approve your account and you'll be in.\n\n— Resilient Wealth Group`;
    return `
    <div class="scrim" data-action="close-modal"></div>
    <div class="modal-card" role="dialog" aria-label="Invite a teammate">
      <div class="modal-head"><h2>Invite a teammate</h2><p>Email them a link to join — they sign up, then you approve them in one click.</p></div>
      <div class="modal-body">
        <div class="field-group"><label class="lbl">Their email</label><input id="inv-email" type="email" placeholder="name@example.com"></div>
        <div class="field-group"><label class="lbl">Invite message</label><textarea id="inv-msg" rows="7">${U.esc(msg)}</textarea>
          <div class="cell-sub mt-8">Edit if you like, then send by email or copy it to a text/Slack.</div></div>
        <p class="cell-sub">After they sign up, they appear under <b>Pending approvals</b> on this page — approve with one click.</p>
      </div>
      <div class="modal-foot">
        <button class="btn btn-quiet" data-action="close-modal">Cancel</button>
        <button class="btn btn-ghost" data-action="invite-copy">Copy message</button>
        <button class="btn btn-gold" data-action="invite-email">✉ Open email</button>
      </div>
    </div>`;
  }

  function saveLeadEdits(id) {
    const updates = {};
    D.EDITABLE_FIELDS.forEach(f => { const el = $('#edit-' + f.key); if (el) updates[f.key] = el.value; });
    const res = D.updateLeadFields(id, updates, RWG.auth.currentUser().id);
    openLead(id, false);
    renderMain();
    if (res.changes.length) U.toast(`Saved — ${res.changes.length} field${res.changes.length > 1 ? 's' : ''} updated`, true);
    else U.toast('No changes to save');
  }

  // ────────────────────────── actions: lead workflow
  function saveActivity(id) {
    const typeBtn = $('#act-type .active');
    const type = typeBtn ? typeBtn.dataset.type : 'Call';
    const dispo = $('#act-dispo') ? $('#act-dispo').value : '';
    let reached = $('#act-reached') ? $('#act-reached').checked : false;
    if (dispo === 'Reached (pitched)') reached = true;
    const note = $('#act-note') ? $('#act-note').value.trim() : '';
    D.addActivity(id, { type, disposition: dispo, note, reached, by: RWG.auth.currentUser().id });
    U.toast('Activity logged', true);
    refreshDrawer(); renderMain();
  }
  function confirmAppt(id) {
    const v = $('#appt-dt') ? $('#appt-dt').value : '';
    if (!v) { U.toast('Pick a date & time first'); return; }
    const ts = new Date(v).getTime();
    const me = RWG.auth.currentUser().id;
    D.setStage(id, 'Appointment Set', { apptDate: ts }, me);
    D.addActivity(id, { type: 'Other', disposition: 'Appointment Set', note: 'Appointment scheduled for ' + U.fmtDateTime(ts), reached: false, by: me });
    U.toast('Appointment set 🎉', true);
    refreshDrawer(); renderMain();
  }
  function confirmCallback(id) {
    const v = $('#callback-dt') ? $('#callback-dt').value : '';
    if (!v) { U.toast('Pick a date & time first'); return; }
    const ts = new Date(v).getTime();
    const note = $('#act-note') ? $('#act-note').value.trim() : '';
    D.scheduleCallback(id, ts, note, RWG.auth.currentUser().id);
    U.toast('Callback scheduled 📞', true);
    refreshDrawer(); renderMain();
  }
  function graduate(id, stage) {
    const extra = (stage === 'No Opportunity' || stage === 'Opportunity Opened') ? { outcome: stage } : {};
    D.setStage(id, stage, extra, RWG.auth.currentUser().id);
    U.toast(stage === 'Opportunity Opened' ? 'Opportunity opened ✦ handed off' : stage, true);
    refreshDrawer(); renderMain();
  }
  // Drag a card to another pipeline column
  function moveStage(id, stage) {
    const lead = D.lead(id);
    if (!lead || !stage || lead.stage === stage) { renderMain(); return; }
    D.setStage(id, stage, {}, RWG.auth.currentUser().id);
    renderMain();
    if (stage === 'Appointment Set' && !D.lead(id).apptDate) {
      openLead(id);
      const r = $('#appt-row'); if (r) r.hidden = false;
      U.toast('Moved to Appointment Set — add the date & time', true);
    } else {
      if (state.leadId === id) refreshDrawer();
      U.toast('Moved to ' + stage, true);
    }
  }

  // ────────────────────────── auth forms
  async function doLogin(form) {
    const err = $('#login-error'); if (err) err.textContent = 'Signing in…';
    const remember = $('#login-remember') ? $('#login-remember').checked : true;
    const r = await RWG.auth.login($('#login-email').value, $('#login-pass').value, remember);
    if (!r.ok && err) err.textContent = r.error;   // success → onAuthChange renders the app
  }
  async function doSignup(form) {
    const su = $('#su-error'); if (su) su.textContent = 'Creating your account…';
    const r = await RWG.auth.signup({ name: $('#su-name').value, email: $('#su-email').value, password: $('#su-pass').value });
    if (!r.ok) { if (su) su.textContent = r.error; return; }
    if (su) su.textContent = '';
    const ok = $('#su-success'); if (ok) ok.hidden = false;   // auto-signed-in → pending screen appears
  }
  function gateTab(tab) {
    document.querySelectorAll('.gate-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('[data-panel]').forEach(p => p.hidden = (p.dataset.panel !== tab));
  }

  // ────────────────────────── upload pipeline
  function wireUpload() {
    const input = $('#file-input'), dz = $('#dropzone');
    if (input) input.addEventListener('change', e => { if (e.target.files[0]) readFile(e.target.files[0]); });
    if (dz) {
      ['dragover', 'dragenter'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('drag'); }));
      dz.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) readFile(f); });
    }
  }
  function readFile(file) {
    state.importName = file.name.replace(/\.csv$/i, '');
    const r = new FileReader();
    r.onload = () => { const rows = mapRows(parseCSV(r.result)); state.importRows = rows; renderPreview(rows); };
    r.readAsText(file);
  }
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else {
        if (ch === '"') q = true;
        else if (ch === ',') { row.push(cur); cur = ''; }
        else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
        else cur += ch;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    if (!rows.length) return [];
    const headers = rows.shift().map(h => h.trim());
    return rows.filter(r => r.some(c => c.trim() !== '')).map(r => {
      const o = {}; headers.forEach((h, i) => o[h] = (r[i] || '').trim()); return o;
    });
  }
  function mapRows(records) {
    // priority order matters (afc before age to avoid "average" collision)
    const FIELDS = [
      ['email', /e-?mail/i], ['phone', /phone|mobile|cell/i],
      ['afc', /afc|salary|compensation/i], ['age', /\bage\b|dob|birth/i],
      ['yos', /yos|years/i], ['planType', /plan/i], ['memberClass', /member|class|risk/i],
      ['employer', /employer|agency|department/i], ['attended', /attend/i],
      ['disposition', /disposition|status/i], ['attempts', /attempt/i],
      ['firstName', /first/i], ['lastName', /last|surname/i], ['notes', /note|comment/i]
    ];
    return records.map(rec => {
      const out = {}; const used = {};
      Object.keys(rec).forEach(h => {
        for (const [field, rx] of FIELDS) {
          if (used[field]) continue;
          if (rx.test(h)) { out[field] = rec[h]; used[field] = 1; break; }
        }
      });
      if (!out.firstName && !out.lastName) {
        const nameKey = Object.keys(rec).find(h => /name/i.test(h));
        if (nameKey) { const p = rec[nameKey].split(' '); out.firstName = p.shift() || ''; out.lastName = p.join(' '); }
      }
      ['age', 'yos', 'attempts'].forEach(k => { if (out[k] != null) out[k] = parseFloat(String(out[k]).replace(/[^\d.]/g, '')) || null; });
      if (out.afc != null) out.afc = parseFloat(String(out.afc).replace(/[^\d.]/g, '')) || null;
      return out;
    });
  }
  function renderPreview(rows) {
    const el = $('#upload-preview'); if (!el) return;
    if (!rows.length) { el.innerHTML = `<div class="card"><p class="muted mb-0">Couldn't read any rows from that file. Make sure it's a CSV with a header row.</p></div>`; return; }
    const cls = D.classifyImport(rows);
    let nNew = 0, nRet = 0, nDup = 0;
    cls.forEach(c => { if (c.status === 'returning') nRet++; else if (c.status === 'duplicate') nDup++; else nNew++; });
    const tierCount = { GOLD: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    const scored = rows.map((r, i) => { const s = RWG.scoring.scoreLead(r); tierCount[s.tier]++; return { r, s, c: cls[i] }; });
    const body = scored.slice(0, 40).map(({ r, s, c }) => {
      const prior = c.match;
      const flag = c.status === 'returning'
        ? `<span class="chip tier-gold" title="Already in your database">🔁 Returning</span>`
        : c.status === 'duplicate'
          ? `<span class="pill-soft" title="Listed more than once in this file — will be merged">Duplicate row</span>`
          : `<span class="pill-soft">🆕 New</span>`;
      const sub = (c.status === 'returning' && prior)
        ? `In database${prior.assignedTo ? ' · ' + ((D.user(prior.assignedTo) || {}).name || '').split(' ')[0] : ''}${prior.disposition ? ' · ' + prior.disposition : (prior.stage ? ' · ' + prior.stage : '')}`
        : U.esc(r.employer || '');
      return `<tr>
        <td><div class="cell-name">${U.esc((r.firstName || '') + ' ' + (r.lastName || ''))}</div><div class="cell-sub">${U.esc(sub)}</div></td>
        <td>${flag}</td><td>${U.tierChip(s)}</td><td>${U.scoreBar(s)}</td>
        <td>${U.esc(RWG.scoring.normPlan(r.planType))}</td><td class="num">${r.yos ?? '—'}/${r.age ?? '—'}</td><td>${U.moneyK(r.afc)}</td></tr>`;
    }).join('');
    el.innerHTML = `
      <div class="card">
        <div class="card-head"><h3>Preview · ${rows.length} rows</h3>
          <div class="tag-row" style="margin-left:auto">
            <span class="pill-soft">🆕 ${nNew} new</span>${nRet ? `<span class="chip tier-gold">🔁 ${nRet} returning</span>` : ''}${nDup ? `<span class="pill-soft">${nDup} dup row${nDup === 1 ? '' : 's'}</span>` : ''}
            <span class="fbar-sep"></span>
            <span class="chip tier-gold">★ ${tierCount.GOLD}</span><span class="chip tier-high">${tierCount.HIGH}</span>
            <span class="chip tier-medium">${tierCount.MEDIUM}</span><span class="chip tier-low">${tierCount.LOW}</span></div></div>
        ${nRet ? `<p class="muted" style="font-size:12.5px;margin:-4px 0 10px">🔁 <b>${nRet}</b> ${nRet === 1 ? 'person is' : 'people are'} already in your database — they won't be duplicated. We'll merge this seminar into their existing record, flag them as <b>Returning</b>, hand them to the agent you choose below, and re-open any that had gone cold.${nDup ? ` (${nDup} duplicate row${nDup === 1 ? '' : 's'} within the file will be merged too.)` : ''}</p>` : (nDup ? `<p class="muted" style="font-size:12.5px;margin:-4px 0 10px">${nDup} duplicate row${nDup === 1 ? '' : 's'} within this file will be merged so no one is added twice.</p>` : '')}
        <div class="table-wrap"><table class="data"><thead><tr><th>Lead</th><th>Status</th><th>Tier</th><th>Score</th><th>Plan</th><th>YOS/Age</th><th>AFC</th></tr></thead><tbody>${body}</tbody></table></div>
        ${rows.length > 40 ? `<p class="muted center mt-8" style="font-size:12.5px">…and ${rows.length - 40} more</p>` : ''}
        <div class="mt-16" style="display:flex;justify-content:flex-end;gap:10px">
          <button class="btn btn-quiet btn-sm" data-action="cancel-import">Cancel</button>
          <button class="btn btn-gold" data-action="confirm-import">Import ${rows.length} leads</button>
        </div>
      </div>`;
  }
  function confirmImport() {
    const target = $('#assign-target') ? $('#assign-target').value : '';
    const by = RWG.auth.currentUser().id;
    const total = (state.importRows || []).length;
    D.addLeadsSmart(state.importRows, state.importName || 'Imported list', target || null, by).then(sum => {
      const bits = [];
      if (sum.created) bits.push(sum.created + ' new');
      if (sum.returning) bits.push(sum.returning + ' returning');
      let msg = 'Imported ' + (bits.join(' · ') || (total + ' leads'));
      if (sum.reopened) msg += ' · ' + sum.reopened + ' re-opened';
      if (sum.duplicates) msg += ' · ' + sum.duplicates + ' dup merged';
      U.toast(msg, true);
    });
    state.importRows = null; state.tierFilter = 'ALL';
    nav('leads');
  }
  function loadSampleList() {
    const samples = [
      { firstName: 'Nina', lastName: 'Alvarez', email: 'nalvarez@email.com', phone: '(305) 555-0301', age: 60, yos: 29, planType: 'Investment Plan', afc: 108000, employer: 'Miami-Dade County', attended: 'Yes' },
      { firstName: 'Oscar', lastName: 'Diaz', email: 'odiaz@email.com', phone: '(407) 555-0302', age: 57, yos: 27, planType: 'Pension Plan', memberClass: 'Special Risk', afc: 99000, employer: 'Orlando Fire Dept', attended: 'Yes' },
      { firstName: 'Rita', lastName: 'Sims', email: 'rsims@email.com', phone: '(813) 555-0303', age: 41, yos: 11, planType: "Don't Know", afc: 63000, employer: 'Tampa Schools', attended: 'No' },
      { firstName: 'Leo', lastName: 'Park', email: 'lpark@email.com', phone: '(561) 555-0304', age: 34, yos: 7, planType: 'Pension Plan', afc: 51000, employer: 'Boca Raton', attended: 'Unknown' },
      { firstName: 'Gina', lastName: 'Ross', email: 'gross@email.com', phone: '(904) 555-0305', age: 62, yos: 31, planType: 'DROP', afc: 117000, employer: 'Jacksonville Port', attended: 'Yes' }
    ];
    D.addLeads(samples, 'Sample FRS list', null);
    U.toast('Added 5 sample leads', true);
    renderMain();
  }
  function downloadCSV(filename, csv) {
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });   // BOM = Excel reads UTF-8 cleanly
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  }
  function downloadTemplate() {
    const headers = ['Attended', 'First Name', 'Last Name', 'Email', 'Phone Number', 'Age', 'YOS', 'Plan Type', 'Member Class', 'AFC/Salary', 'Employer Name', 'Disposition', 'Number of Attempts', 'Notes'];
    downloadCSV('RWG_lead_list_template.csv', headers.join(','));
  }
  // Export the current view (filters + sort, in display order) to CSV
  function exportLeads() {
    if (!RWG.auth.isAdmin()) return;   // owner-only
    const { filtered } = currentTableLeads();
    if (!filtered.length) { U.toast('No leads to export in this view'); return; }
    const stamp = new Date().toISOString().slice(0, 10);
    const scope = isAdminLeads() ? 'all' : 'my';
    downloadCSV(`RWG_leads_${scope}_${filtered.length}_${stamp}.csv`, RWG.leadtable.toCSV(filtered));
    U.toast(`Exported ${filtered.length} lead${filtered.length > 1 ? 's' : ''} to CSV`, true);
  }

  // ────────────────────────── settings
  function saveScoring() {
    const n = id => parseFloat($('#' + id).value);
    const cfg = {
      drop: { regular: { yos: n('cfg-reg-yos'), age: n('cfg-reg-age') }, specialRisk: { yos: n('cfg-sr-yos'), age: n('cfg-sr-age') } },
      inServiceAge: n('cfg-inservice'), investmentHighYos: n('cfg-invhi'),
      afc: { high: n('cfg-afc-hi'), mid: n('cfg-afc-mid'), low: RWG.scoring.defaultConfig.afc.low },
      tierCutoffs: { gold: n('cfg-cut-gold'), high: n('cfg-cut-high'), medium: n('cfg-cut-med') }
    };
    D.setScoringConfig(cfg);
    U.toast('Scoring rules saved — leads re-scored', true);
    renderMain();
  }

  // ────────────────────────── event wiring
  function handleAction(a, el, e) {
    // A module that claims this action owns it. Everything below is the
    // kernel's core set plus the legacy Leads actions (to be extracted later).
    const owner = RWG.modules.actionOwner(a);
    if (owner) { owner.actions[a](el, e, owner.state); return; }

    switch (a) {
      case 'gate-tab': gateTab(el.dataset.tab); break;
      case 'forgot-pass': {
        const email = ($('#login-email') ? $('#login-email').value : '').trim();
        const err = $('#login-error');
        if (!email) { if (err) err.textContent = 'Enter your email above, then click “Forgot password?”'; break; }
        if (err) err.textContent = 'Sending reset link…';
        RWG.auth.resetPassword(email).then(r => {
          if (r.ok) { if (err) err.textContent = ''; U.toast('Password reset link sent — check your email', true); }
          else if (err) err.textContent = r.error;
        });
        break;
      }
      case 'logout': state.view = null; RWG.auth.logout(); break;   // onAuthChange re-renders
      case 'nav': nav(el.dataset.view); break;
      case 'toggle-menu': { const sb = $('#sidebar'); if (sb) sb.classList.toggle('open'); break; }
      case 'open-lead': openLead(el.dataset.id); break;
      case 'close-drawer': closeDrawer(); break;
      case 'edit-lead': openLead(el.dataset.id, true); break;
      case 'cancel-edit': openLead(state.leadId, false); break;
      case 'save-lead': saveLeadEdits(el.dataset.id); break;
      case 'add-lead': openModal(buildAddLeadModal()); break;
      case 'close-modal': closeModal(); break;
      case 'save-new-lead': saveNewLead(); break;
      case 'save-activity': saveActivity(el.dataset.id); break;
      case 'toggle-appt': { const r = $('#appt-row'); if (r) r.hidden = !r.hidden; break; }
      case 'confirm-appt': confirmAppt(el.dataset.id); break;
      case 'toggle-callback': { const r = $('#callback-row'); if (r) r.hidden = !r.hidden; break; }
      case 'confirm-callback': confirmCallback(el.dataset.id); break;
      case 'graduate': graduate(el.dataset.id, el.dataset.stage); break;
      case 'pick-stage': {   // stacked-card stage menu (mobile) → same path as a board drag
        document.querySelectorAll('.pop-panel:not([hidden])').forEach(p => p.hidden = true);
        moveStage(el.dataset.id, el.dataset.stage);
        break;
      }
      case 'flt-tier': {   // board quick-chips → colFilters.tier
        const t = el.dataset.tier, f = currentFilter();
        f.colFilters = f.colFilters || {}; const arr = f.colFilters.tier = f.colFilters.tier || [];
        const i = arr.indexOf(t); if (i >= 0) arr.splice(i, 1); else arr.push(t);
        if (!arr.length) delete f.colFilters.tier;
        clearSelection(); renderMain(); break;
      }
      case 'flt-clear': {
        if (isAdminLeads()) state.adminFilter = newFilter(); else state.agentFilter = newFilter();
        state.search = ''; const s = $('#global-search'); if (s) s.value = ''; clearSelection(); renderMain(); break;
      }
      case 'popmenu': {
        const p = el.parentElement.querySelector('.pop-panel'); if (!p) break;
        const willOpen = p.hidden;
        document.querySelectorAll('.pop-panel:not([hidden])').forEach(x => x.hidden = true);
        if (willOpen) { positionPanel(el, p); const s = p.querySelector('.pop-search'); if (s) s.focus(); }
        break;
      }
      case 'popsort': { const f = currentFilter(); f.sortKey = el.dataset.col; f.sortDir = el.dataset.dir; renderMain(); break; }
      case 'cols-reset': {
        const def = RWG.leadtable.defaultVisible(isAdminLeads());
        if (isAdminLeads()) state.adminCols = def; else state.agentCols = def;
        saveCols(currentColsKey(), def);
        document.querySelectorAll('input[data-col]').forEach(cb => { cb.checked = cb.dataset.col === 'name' || def.includes(cb.dataset.col); });
        refreshLeadsBody();   // keep the chooser open
        break;
      }
      case 'colfilter-all': {   // select every value present for this column
        const key = el.dataset.col, f = currentFilter(), c = currentTableLeads();
        f.colFilters = f.colFilters || {};
        f.colFilters[key] = RWG.leadtable.distinctValues(c.base, key);
        document.querySelectorAll(`input[data-colfilter="${key}"]`).forEach(cb => cb.checked = true);
        clearSelection(); refreshLeadsBody(); updateBulkUI(); break;
      }
      case 'colfilter-clear': {
        const key = el.dataset.col, f = currentFilter();
        if (f.colFilters) delete f.colFilters[key];
        document.querySelectorAll(`input[data-colfilter="${key}"]`).forEach(cb => cb.checked = false);
        clearSelection();
        refreshLeadsBody(); updateBulkUI();
        break;
      }
      case 'bulk-assign': {
        const sel = $('#bulk-agent'), v = sel ? sel.value : '';
        if (!v) { U.toast('Pick an agent to reassign to'); break; }
        const ids = Array.from(state.selected), me = RWG.auth.currentUser().id;
        ids.forEach(id => D.assignLead(id, v === 'unassigned' ? null : v, me));
        const who = v === 'unassigned' ? 'the unassigned pool' : D.user(v).name.split(' ')[0];
        U.toast(`Reassigned ${ids.length} lead${ids.length > 1 ? 's' : ''} → ${who}`, true);
        state.selected.clear(); state.assignTarget = null; renderMain(); break;
      }
      case 'bulk-clear': state.selected.clear(); renderMain(); break;
      case 'bulk-delete': {
        if (!RWG.auth.isAdmin()) break;
        const ids = Array.from(state.selected);
        if (!ids.length) break;
        if (confirm(`Delete ${ids.length} lead${ids.length > 1 ? 's' : ''}? They're moved to Deleted Leads (admin archive), where you can restore them.`)) {
          const me = RWG.auth.currentUser().id;
          ids.forEach(id => D.deleteLead(id, me));
          state.selected.clear(); renderMain();
          U.toast(`Deleted ${ids.length} lead${ids.length > 1 ? 's' : ''} — kept in the archive`);
        }
        break;
      }
      case 'delete-lead': {
        if (!RWG.auth.isAdmin()) break;
        const id = el.dataset.id, l = D.lead(id);
        if (confirm(`Delete ${l ? D.fullName(l) : 'this lead'}? It's moved to Deleted Leads (admin archive), where you can restore it.`)) {
          D.deleteLead(id, RWG.auth.currentUser().id); closeDrawer(); renderMain(); U.toast('Lead deleted — kept in the archive');
        }
        break;
      }
      case 'archive-refresh': { if (RWG.auth.isAdmin()) { state.archiveRows = null; loadArchive(); } break; }
      case 'restore-lead': {
        if (!RWG.auth.isAdmin()) break;
        const id = el.dataset.id;
        const row = (state.archiveRows || []).find(r => r.id === id);
        const nm = row ? row.name : 'this lead';
        if (confirm(`Restore ${nm} back into the CRM? It reappears in All Leads with its original owner and full history.`)) {
          D.restoreLead(id, RWG.auth.currentUser().id).then(() => {
            state.archiveRows = (state.archiveRows || []).filter(r => r.id !== id);
            paintArchive(); U.toast('Lead restored', true);
          }).catch(e => U.toast(e.message || 'Restore failed'));
        }
        break;
      }
      case 'purge-lead': {
        if (!RWG.auth.isAdmin()) break;
        const id = el.dataset.id;
        const row = (state.archiveRows || []).find(r => r.id === id);
        const nm = row ? row.name : 'this record';
        if (confirm(`Permanently erase ${nm} from the archive? This cannot be undone — no record of this lead will remain anywhere.`)) {
          D.purgeDeletedLead(id).then(() => {
            state.archiveRows = (state.archiveRows || []).filter(r => r.id !== id);
            paintArchive(); U.toast('Erased from the archive');
          }).catch(e => U.toast(e.message || 'Erase failed'));
        }
        break;
      }
      case 'set-role': {
        if (!RWG.auth.isAdmin()) break;
        const me = RWG.auth.currentUser();
        if (el.dataset.id === me.id) break;   // can't change your own role
        D.setUserRole(el.dataset.id, el.dataset.role);
        U.toast(el.dataset.role === 'admin' ? 'Promoted to admin' : 'Changed to agent', true);
        renderMain();
        break;
      }
      case 'invite': if (RWG.auth.isAdmin()) openModal(buildInviteModal()); break;
      case 'invite-email': {
        const email = $('#inv-email') ? $('#inv-email').value.trim() : '';
        const msg = $('#inv-msg') ? $('#inv-msg').value : '';
        const subject = 'Your invite to the Resilient Wealth Group CRM';
        window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`;
        break;
      }
      case 'invite-copy': {
        const t = $('#inv-msg'), msg = t ? t.value : '';
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(msg).then(() => U.toast('Invite copied', true), () => { if (t) t.select(); });
        else if (t) { t.select(); try { document.execCommand('copy'); U.toast('Invite copied', true); } catch (e) {} }
        break;
      }
      case 'edit-user': if (RWG.auth.isAdmin()) openModal(buildEditUserModal(el.dataset.id)); break;
      case 'save-user': if (RWG.auth.isAdmin()) saveUser(el.dataset.id); break;
      case 'admin-reset-pass': {
        if (!RWG.auth.isAdmin()) break;
        const email = el.dataset.email;
        RWG.auth.resetPassword(email).then(r => U.toast(r.ok ? ('Reset link sent to ' + email) : r.error, r.ok));
        break;
      }
      case 'remove-user': {
        if (!RWG.auth.isAdmin()) break;
        const me = RWG.auth.currentUser(), u = D.user(el.dataset.id);
        if (el.dataset.id === me.id) break;
        if (u && (u.email || '').toLowerCase() === (RWG.OWNER_EMAIL || '').toLowerCase()) { U.toast('The owner account can’t be removed'); break; }
        if (confirm(`Remove ${u ? u.name : 'this person'}? They lose access immediately, and their leads return to the Unassigned pool so you can hand them to someone else. If you restore this person later, those leads do NOT come back to them automatically.`)) {
          const freed = D.removeUser(el.dataset.id);
          U.toast(`Removed ${u ? u.name.split(' ')[0] : 'agent'}${freed ? ' · ' + freed + ' lead' + (freed === 1 ? '' : 's') + ' moved to Unassigned' : ''}`);
          renderMain();
        }
        break;
      }
      case 'restore-user': {
        if (!RWG.auth.isAdmin()) break;
        D.approveUser(el.dataset.id);   // status → active (role preserved); they sign in again to regain access
        U.toast('Access restored — they can sign back in', true);
        renderMain();
        break;
      }
      case 'assign-to-agent': {   // Team shortcut → jump to All Leads, pool-filtered, with this agent pre-selected
        if (!RWG.auth.isAdmin()) break;
        const a = D.user(el.dataset.id);
        state.assignTarget = el.dataset.id;
        state.adminFilter.colFilters = Object.assign({}, state.adminFilter.colFilters || {}, { owner: ['Unassigned'] });
        state.search = ''; const gs = $('#global-search'); if (gs) gs.value = '';
        nav('leads');
        U.toast(`Pick the unassigned leads for ${a ? a.name.split(' ')[0] : 'this agent'}, then hit Apply`, true);
        break;
      }
      case 'view-as': {
        if (!RWG.auth.isAdmin()) break;
        state.viewAs = el.dataset.id; state.view = 'board'; state.search = ''; clearSelection();
        render();
        break;
      }
      case 'exit-view-as': {
        state.viewAs = null; state.view = 'dashboard'; state.search = ''; clearSelection();
        render();
        break;
      }
      case 'export-leads': exportLeads(); break;
      case 'report-prev': { const A = RWG.analytics; if (state.reportWeekStart == null) state.reportWeekStart = curWeekStart(); state.reportWeekStart = A.weekStartOf(state.reportWeekStart - 4 * 86400000); loadOrPaintReport(); break; }
      case 'report-next': { const A = RWG.analytics; if (state.reportWeekStart == null) state.reportWeekStart = curWeekStart(); const n = A.weekStartOf(state.reportWeekStart + 10 * 86400000); if (n <= curWeekStart()) { state.reportWeekStart = n; loadOrPaintReport(); } break; }
      case 'report-this': state.reportWeekStart = curWeekStart(); loadOrPaintReport(); break;
      case 'report-export': if (RWG.auth.isAdmin()) exportReport(); break;
      case 'report-backfill-tiers': {   // add the tier split to a snapshot frozen before the feature existed
        if (!RWG.auth.isAdmin()) break;
        const A = RWG.analytics, ws = state.reportWeekStart;
        if (ws == null || ws >= curWeekStart()) break;             // current week is always live
        const wid = A.weekId(ws), snap = state.reportCache[wid];
        if (!snap) break;
        const live = A.weeklyReport(A.weekRangeFor(ws));            // recompute from surviving lead history
        const zero = () => ({ GOLD: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
        const byUid = {}; (live.agents || []).forEach(a => { byUid[a.uid] = a.apptTiers; });
        (snap.agents || []).forEach(a => { a.apptTiers = byUid[a.uid] || zero(); });
        snap.team = snap.team || {};
        snap.team.apptTiers = (snap.agents || []).reduce((s, a) => { ['GOLD', 'HIGH', 'MEDIUM', 'LOW'].forEach(k => s[k] += (a.apptTiers[k] || 0)); return s; }, zero());
        D.saveReport(wid, snap).catch(e => console.error('backfill save:', e));
        state.reportCache[wid] = snap;
        paintReport(snap, A.weekLabel(ws), 'final');
        U.toast('Tier breakdown rebuilt from lead history', true);
        break;
      }
      case 'approve-user': D.approveUser(el.dataset.id); U.toast('Agent approved', true); renderShell(RWG.auth.currentUser()); break;
      case 'deny-user': D.denyUser(el.dataset.id); U.toast('Request removed'); renderShell(RWG.auth.currentUser()); break;
      case 'load-sample-list': loadSampleList(); break;
      case 'download-template': downloadTemplate(); break;
      case 'confirm-import': confirmImport(); break;
      case 'cancel-import': state.importRows = null; $('#upload-preview').innerHTML = ''; break;
      case 'recount-attempts': {
        if (!RWG.auth.isAdmin()) break;
        D.recountAttempts().then(dry => {                       // dry run first, always
          if (!dry.changed.length) { U.toast('Every lead already matches its logged outreach'); return; }
          const sample = dry.changed.slice(0, 6).map(c => `  ${c.name}: ${c.from} → ${c.to}`).join('\n');
          const more = dry.changed.length > 6 ? `\n  …and ${dry.changed.length - 6} more` : '';
          const n = dry.changed.length;
          if (!confirm(`Update Attempts on ${n} lead${n === 1 ? '' : 's'}?\n\n${sample}${more}\n\nThis writes to the shared lead records, so the live CRM will show the corrected numbers too.`)) return;
          D.recountAttempts({ apply: true }).then(res => {
            U.toast(`Recounted ${res.changed.length} lead${res.changed.length === 1 ? '' : 's'}`, true);
            renderMain();
          }).catch(e => U.toast(e.message || 'Recount failed'));
        });
        break;
      }
      case 'save-scoring': saveScoring(); break;
      case 'reset-scoring': D.setScoringConfig({}); U.toast('Scoring reset to defaults'); renderMain(); break;
    }
  }

  function bind() {
    let lastTouchDragEnd = 0;
    document.addEventListener('click', e => {
      if (Date.now() - lastTouchDragEnd < 350) return;   // swallow the click synthesized right after a touch-drag
      // tapping outside the mobile slide-in menu dismisses it
      const sbEl = document.getElementById('sidebar');
      if (sbEl && sbEl.classList.contains('open') && !e.target.closest('#sidebar') && !e.target.closest('.menu-toggle')) {
        sbEl.classList.remove('open'); return;
      }
      // close any open popover (column chooser / multi-select filter) when clicking outside it
      if (!e.target.closest('.pop-wrap')) {
        document.querySelectorAll('.pop-panel:not([hidden])').forEach(p => p.hidden = true);
      }
      // selection checkboxes must not open the lead drawer
      if (e.target.closest('.sel-cell') || e.target.closest('.sel-th')) return;
      const typeBtn = e.target.closest('#act-type button');
      if (typeBtn) { typeBtn.parentElement.querySelectorAll('button').forEach(b => b.classList.remove('active')); typeBtn.classList.add('active'); return; }
      const thl = e.target.closest('.th-label[data-sort]');
      if (thl) { sortByHeader(thl.dataset.sort, thl.dataset.dir); return; }
      const el = e.target.closest('[data-action]');
      if (el) { handleAction(el.dataset.action, el, e); }
    });
    document.addEventListener('submit', e => {
      const f = e.target.closest('form[data-action]');
      if (!f) return;
      e.preventDefault();
      if (f.dataset.action === 'do-login') doLogin(f);
      else if (f.dataset.action === 'do-signup') doSignup(f);
    });
    document.addEventListener('input', e => {
      if (e.target.classList.contains('pop-search')) {   // narrow a column's value checklist
        const q = e.target.value.toLowerCase(), panel = e.target.closest('.pop-panel');
        if (panel) panel.querySelectorAll('.pop-list .pop-row').forEach(r => { r.style.display = r.textContent.toLowerCase().includes(q) ? '' : 'none'; });
        return;
      }
      if (e.target.classList.contains('fbar-search')) {   // mobile in-list search
        state.search = e.target.value;
        refreshLeadsBody();   // refresh only the list so the search box keeps focus
        return;
      }
      if (e.target.id === 'global-search') {
        state.search = e.target.value;
        clearSelection();
        // Jump to the leads list as you type — only if the Leads module is on.
        const want = effectiveRole() === 'admin' ? 'leads' : 'mylist';
        if (RWG.modules.moduleForView(want) && state.view !== want) { state.view = want; setActiveNav(); setMeta(); }
        renderMain();
        const s = $('#global-search'); if (s) { s.focus(); }
        return;
      }
      // Let the active module react to typing in its own inputs.
      const im = RWG.modules.moduleForView(state.view);
      if (im && im.onInput) im.onInput(e, im.state);
    });
    document.addEventListener('change', e => {
      if (e.target.classList.contains('fbar-sort')) {   // mobile sort dropdown
        const parts = (e.target.value || 'score:desc').split(':');
        const f = currentFilter(); f.sortKey = parts[0]; f.sortDir = parts[1];
        refreshLeadsBody();
        return;
      }
      if (e.target.classList.contains('assign-select')) {
        D.assignLead(e.target.dataset.id, e.target.value || null, RWG.auth.currentUser().id);
        U.toast('Lead reassigned', true); refreshDrawer(); renderMain();
        return;
      }
      if (e.target.matches('input[data-col]')) {   // column chooser (popover lives in the bar)
        const key = e.target.dataset.col, arr = currentCols(), i = arr.indexOf(key);
        if (e.target.checked) { if (i < 0) arr.push(key); } else if (i >= 0) arr.splice(i, 1);
        saveCols(currentColsKey(), arr);
        refreshLeadsBody();   // rebuilds headers+body; bar popover survives
        return;
      }
      if (e.target.matches('input[data-colfilter]')) {   // AutoFilter value checklist (popover lives in the header)
        const key = e.target.dataset.colfilter, val = e.target.dataset.val, f = currentFilter();
        f.colFilters = f.colFilters || {}; const arr = f.colFilters[key] = f.colFilters[key] || [];
        const i = arr.indexOf(val); if (e.target.checked) { if (i < 0) arr.push(val); } else if (i >= 0) arr.splice(i, 1);
        if (!arr.length) delete f.colFilters[key];
        clearSelection();
        refreshLeadsBody(); updateBulkUI();   // rebuild the table so the filtered leads always repaint
        return;
      }
      if (e.target.matches('input[data-sel]')) {
        const id = e.target.dataset.sel;
        if (e.target.checked) state.selected.add(id); else state.selected.delete(id);
        const tr = e.target.closest('tr'); if (tr) tr.classList.toggle('row-sel', e.target.checked);
        const card = e.target.closest('.lead-row-card'); if (card) card.classList.toggle('sel', e.target.checked);
        updateBulkUI();
        return;
      }
      if (e.target.matches('input[data-selall]')) {
        const ids = currentTableLeads().filtered.map(l => l.id);
        if (e.target.checked) ids.forEach(id => state.selected.add(id)); else ids.forEach(id => state.selected.delete(id));
        document.querySelectorAll('#leads-body input[data-sel]').forEach(cb => {
          const on = state.selected.has(cb.dataset.sel); cb.checked = on;
          const tr = cb.closest('tr'); if (tr) tr.classList.toggle('row-sel', on);
        });
        updateBulkUI();
        return;
      }
      // Let the active module react to changes in its own selects/inputs.
      const cm = RWG.modules.moduleForView(state.view);
      if (cm && cm.onChange) cm.onChange(e, cm.state);
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeDrawer(); closeModal(); document.querySelectorAll('.pop-panel:not([hidden])').forEach(p => p.hidden = true); } });
    // a fixed popover can't follow a scroll, so close it instead
    window.addEventListener('scroll', () => document.querySelectorAll('.pop-panel:not([hidden])').forEach(p => p.hidden = true), true);

    // ── drag & drop: move lead cards between pipeline columns (My Board) ──
    document.addEventListener('dragstart', e => {
      const card = e.target.closest('.lead-card.draggable');
      if (!card) return;
      state.dragId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', state.dragId); } catch (_) {}
    });
    document.addEventListener('dragend', () => {
      document.querySelectorAll('.lead-card.dragging').forEach(c => c.classList.remove('dragging'));
      document.querySelectorAll('.board-col.drop-target').forEach(c => c.classList.remove('drop-target'));
      state.dragId = null;
    });
    const elFrom = (e) => { const t = e.target; return (t && t.nodeType === 1) ? t : (t && t.parentElement); };
    document.addEventListener('dragover', e => {
      if (!state.dragId) return;
      e.preventDefault();                          // accept the drop anywhere while dragging a card
      try { e.dataTransfer.dropEffect = 'move'; } catch (_) {}
      const t = elFrom(e);
      const col = t && t.closest('.board-col');
      document.querySelectorAll('.board-col.drop-target').forEach(c => { if (c !== col) c.classList.remove('drop-target'); });
      if (col) col.classList.add('drop-target');
    });
    document.addEventListener('drop', e => {
      if (!state.dragId) return;
      e.preventDefault();
      const t = elFrom(e);
      const col = t && t.closest('.board-col');
      const id = state.dragId; state.dragId = null;
      document.querySelectorAll('.board-col.drop-target').forEach(c => c.classList.remove('drop-target'));
      if (col) moveStage(id, col.dataset.stage); else renderMain();
    });

    // ── touch drag & drop: HTML5 DnD doesn't fire on touch, so hand-roll it ──
    // Press-and-hold a card to pick it up, drag over a column, lift to drop.
    let tDrag = null;
    const LONGPRESS = 220, MOVE_CANCEL = 12;
    const colAtPoint = (x, y) => { const el = document.elementFromPoint(x, y); return el ? el.closest('.board-col') : null; };
    const endTouchDrag = (drop) => {
      if (!tDrag) return;
      clearTimeout(tDrag.timer);
      if (tDrag.active) {
        if (tDrag.ghost) tDrag.ghost.remove();
        if (tDrag.card) tDrag.card.classList.remove('dragging');
        document.querySelectorAll('.board-col.drop-target').forEach(c => c.classList.remove('drop-target'));
        lastTouchDragEnd = Date.now();
        if (drop && drop.dataset.stage) moveStage(tDrag.id, drop.dataset.stage);
      }
      tDrag = null;
    };
    document.addEventListener('touchstart', e => {
      const card = e.target.closest('.lead-card.draggable');
      if (!card || e.touches.length !== 1) return;
      const t = e.touches[0];
      tDrag = { id: card.dataset.id, card, sx: t.clientX, sy: t.clientY, active: false, ghost: null, timer: null, offX: 0, offY: 0 };
      tDrag.timer = setTimeout(() => {
        if (!tDrag) return;
        tDrag.active = true;
        const r = card.getBoundingClientRect();
        card.classList.add('dragging');
        const g = card.cloneNode(true);
        g.classList.add('drag-ghost');
        g.style.width = r.width + 'px'; g.style.left = r.left + 'px'; g.style.top = r.top + 'px';
        document.body.appendChild(g);
        tDrag.ghost = g; tDrag.offX = tDrag.sx - r.left; tDrag.offY = tDrag.sy - r.top; tDrag.edge = 0;
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch (_) {} }
        // auto-scroll the board when the finger nears a screen edge (reach off-screen columns)
        const step = () => { if (!tDrag || !tDrag.active) return; const board = document.querySelector('.board'); if (board && tDrag.edge) board.scrollLeft += tDrag.edge * 14; requestAnimationFrame(step); };
        requestAnimationFrame(step);
      }, LONGPRESS);
    }, { passive: true });
    document.addEventListener('touchmove', e => {
      if (!tDrag) return;
      const t = e.touches[0];
      if (!tDrag.active) {   // moved before the hold completed → it's a scroll, let it go
        if (Math.abs(t.clientX - tDrag.sx) > MOVE_CANCEL || Math.abs(t.clientY - tDrag.sy) > MOVE_CANCEL) { clearTimeout(tDrag.timer); tDrag = null; }
        return;
      }
      e.preventDefault();   // we own the gesture now → stop the page from scrolling
      const EDGE = 46;
      tDrag.edge = t.clientX < EDGE ? -1 : (t.clientX > window.innerWidth - EDGE ? 1 : 0);
      if (tDrag.ghost) { tDrag.ghost.style.left = (t.clientX - tDrag.offX) + 'px'; tDrag.ghost.style.top = (t.clientY - tDrag.offY) + 'px'; }
      const col = colAtPoint(t.clientX, t.clientY);
      document.querySelectorAll('.board-col.drop-target').forEach(c => { if (c !== col) c.classList.remove('drop-target'); });
      if (col) col.classList.add('drop-target');
    }, { passive: false });
    document.addEventListener('touchend', e => {
      if (!tDrag) return;
      const t = e.changedTouches && e.changedTouches[0];
      endTouchDrag(t ? colAtPoint(t.clientX, t.clientY) : null);
    });
    document.addEventListener('touchcancel', () => endTouchDrag(null));

    // swap table ⇄ stacked cards when crossing the mobile breakpoint (rotate/resize)
    const mqMobile = window.matchMedia('(max-width:760px)');
    const onBreak = () => { if (document.body.classList.contains('in-app')) renderMain(); };
    if (mqMobile.addEventListener) mqMobile.addEventListener('change', onBreak);
    else if (mqMobile.addListener) mqMobile.addListener(onBreak);
  }

  // The kernel's public surface. Modules use nav() to move around and icons for their tiles.
  // effectiveUser/effectiveRole + viewAs let a module honour admin "view as" for its own reads/writes.
  return { boot, bind, state, nav, renderMain, icons: ICONS, effectiveUser, effectiveRole, viewAs: setViewAs };
})();

document.addEventListener('DOMContentLoaded', () => { RWG.app.bind(); RWG.app.boot(); });
