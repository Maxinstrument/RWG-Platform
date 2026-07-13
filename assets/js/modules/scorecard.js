/* ============================================================
   RWG Platform — Scorecard module (the agent weekly form)

   The rebuilt weekly scorecard. Differences from the old form:
     1. Attributed to the LOGGED-IN account, not a name dropdown.
     2. The agent types ONE number per case; the platform derives FYC,
        annualized premium, and revenue (RWG.scorecard). Investments can
        never carry a stray $ Amount.
     3. The headline number is ANNUALIZED PREMIUM written this week, with
        pace to the agent's weekly target.
     4. A DAILY TALLY replaces the five "type it from memory on Friday"
        boxes. Agents log a couple of numbers per day (Mon..Sat); the week
        auto-sums. The old form told agents to "pull them from your daily
        tally" but never gave them one — this is that tally.
     5. A "My Week — X of 9 met" checklist scores each activity and outcome
        against the agent's target. Opportunities opened / new business
        submitted / closed / premium come from the cases automatically.

   Admin "view as" flows through here: an admin can pick any teammate and
   see (and, per Carlos, edit) their scorecard exactly as they see it. Every
   read and write keys on RWG.app.effectiveUser(), never currentUser.

   Reads/writes go through RWG.scorecardData. Money + week rules come from
   RWG.scorecard. This file owns layout and interaction only.
   ============================================================ */
window.RWG = window.RWG || {};

(function () {
  const S = () => RWG.scorecard;
  const D = () => RWG.scorecardData;
  const U = () => RWG.ui;
  const APP = () => RWG.app;

  // Whoever we're acting as: the logged-in agent, or (for an admin using the
  // agent picker / View As) the teammate being viewed.
  const actor = () => (APP() && APP().effectiveUser && APP().effectiveUser()) || RWG.auth.currentUser();

  const money = (n) => U().money(n);
  const esc = (s) => U().esc(s);

  // ── who is this, on the scorecard? ──
  // config/agents (built at migration) maps account -> legacy name + goals.
  // Before that exists we fall back to matching the account name.
  function identity(user) {
    const cfg = D().agentConfig(user.id);
    if (cfg) return {
      name: cfg.legacyName || user.name,
      goals: cfg.goals || S().goalsFor(cfg.legacyName || user.name),
      role: cfg.scorecardRole || 'associate',
      firmShare: cfg.firmShare != null ? cfg.firmShare : 1.0
    };
    return {
      name: user.name,
      goals: S().goalsFor(user.name),
      role: S().scorecardRole(user.name),
      firmShare: S().firmShare(user.name)
    };
  }

  // The last N Fridays up to and including the current week (newest first).
  function recentWeeks(count) {
    const cur = S().currentWeekEnding();
    const all = S().fridaysOfYear(Number(cur.slice(0, 4)));
    const idx = all.indexOf(cur);
    const upto = idx >= 0 ? all.slice(0, idx + 1) : all;
    return upto.slice(-count).reverse();
  }

  // ── the manual activities (everything that isn't derived from a case) ──
  const MANUAL = [
    { id: 'fa_sched', label: '1st meetings scheduled' },
    { id: 'fa_held', label: '1st meetings held' },
    { id: 'ca_sched', label: '2nd meetings scheduled' },
    { id: 'ca_held', label: '2nd meetings held' },
    { id: 'referrals', label: 'Referrals gathered' }
  ];

  // ── the weekly rollup, computed live from the case cache ──
  function rollup(user, weekEnding) {
    const sc = S();
    const mine = D().casesForAgent(user.id).filter(c => sc.activeInWeek(c, weekEnding));
    const byBucket = { Opened: [], Submitted: [], Closed: [] };
    mine.forEach(c => { const b = sc.bucketForWeek(c, weekEnding); if (byBucket[b]) byBucket[b].push(c); });

    const sum = (list, fn) => list.reduce((a, c) => a + fn(c), 0);
    const closed = byBucket.Closed, sub = byBucket.Submitted, opened = byBucket.Opened;

    return {
      cases: mine, opened, submitted: sub, closed,
      annualizedClosed: sum(closed, c => sc.annualizedPremium(c.product, c.amount)),
      annualizedSubmitted: sum(sub, c => sc.annualizedPremium(c.product, c.amount)),
      fycClosed: sum(closed, c => sc.fyc(c.product, c.amount)),
      revClosed: sum(closed, c => sc.revenue(c.product, c.amount, c.aum)),
      revSubmitted: sum(sub, c => sc.revenue(c.product, c.amount, c.aum)),
      aumClosed: sum(closed, c => Number(c.aum) || 0)
    };
  }

  // ── daily tally helpers ──
  // st.daily = { 'yyyy-mm-dd': { fa_sched, fa_held, ca_sched, ca_held, referrals } }
  function dailyTotals(st) {
    const t = { fa_sched: 0, fa_held: 0, ca_sched: 0, ca_held: 0, referrals: 0 };
    const daily = st.daily || {};
    Object.keys(daily).forEach(k => { const d = daily[k] || {}; MANUAL.forEach(m => { t[m.id] += Number(d[m.id]) || 0; }); });
    return t;
  }
  // Strip empties and coerce to numbers before persisting.
  function cleanDaily(daily) {
    const out = {};
    Object.keys(daily || {}).forEach(k => {
      const d = daily[k] || {}, row = {};
      MANUAL.forEach(m => { const v = Number(d[m.id]) || 0; if (v) row[m.id] = v; });
      if (Object.keys(row).length) out[k] = row;
    });
    return out;
  }
  // Load the saved daily tally for (agent, week) into state, unless the agent is
  // mid-edit on the same week. Weeks saved before this feature existed have no
  // daily breakdown, so seed their totals onto the Friday column — nothing is lost.
  function syncDaily(user, st, week) {
    if (!D().isStarted()) { st.daily = st.daily || {}; return; }
    const key = user.id + '_' + week;
    if (st.loadedKey === key) return;
    const saved = D().weekFor(user.id, week);
    if (saved && saved.daily) st.daily = JSON.parse(JSON.stringify(saved.daily));
    else if (saved) st.daily = { [week]: {
      fa_sched: saved.firstApptsScheduled || 0, fa_held: saved.firstApptsHeld || 0,
      ca_sched: saved.closingApptsScheduled || 0, ca_held: saved.closingApptsHeld || 0,
      referrals: saved.referralsGathered || 0 } };
    else st.daily = {};
    st.loadedKey = key;
  }

  // Activity points = manual funnel + counts derived from the cases this week.
  function activityPoints(totals, r) {
    const p = S().ACTIVITY_POINTS;
    const n = (v) => Number(v) || 0;
    return n(totals.fa_sched) * p.fa_sched + n(totals.fa_held) * p.fa_held
      + r.opened.length * p.opp_open + n(totals.ca_sched) * p.ca_sched
      + n(totals.ca_held) * p.ca_held + r.submitted.length * p.nb_written
      + r.closed.length * p.nb_closed + n(totals.referrals) * p.referrals;
  }

  // The one week doc, built from the daily tally + the live case rollup. Used by
  // both the daily auto-save (finalize:false) and Submit week (finalize:true).
  function weekDoc(st, user, opts) {
    const sc = S(), me = identity(user);
    const week = st.weekEnding || sc.currentWeekEnding();
    const totals = dailyTotals(st);
    const r = rollup(user, week);
    const doc = {
      agentUid: user.id, agentName: me.name, weekEnding: week,
      daily: cleanDaily(st.daily),
      firstApptsScheduled: totals.fa_sched, firstApptsHeld: totals.fa_held,
      closingApptsScheduled: totals.ca_sched, closingApptsHeld: totals.ca_held,
      referralsGathered: totals.referrals,
      opportunitiesOpened: r.opened.length, newBusinessSubmitted: r.submitted.length, newBusinessClosed: r.closed.length,
      activityPoints: activityPoints(totals, r),
      annualizedPremiumClosed: r.annualizedClosed, annualizedPremiumSubmitted: r.annualizedSubmitted,
      fycClosed: r.fycClosed, revenueClosed: r.revClosed, revenueSubmitted: r.revSubmitted, aumClosed: r.aumClosed,
      scorecardRole: me.role
    };
    if (opts && opts.finalize) doc.submittedAt = new Date().toISOString();
    return doc;
  }

  // ── the "My Week" nine-goal checklist ──
  // Five come from the daily tally; four are counted from the cases (marked "auto").
  const GOAL_LINES = [
    { label: '1st meetings scheduled', actual: vm => vm.totals.fa_sched, goal: vm => vm.goals.firstSched },
    { label: '1st meetings held', actual: vm => vm.totals.fa_held, goal: vm => vm.goals.firstHeld },
    { label: 'Opportunities opened', actual: vm => vm.r.opened.length, goal: vm => vm.goals.opps, auto: true },
    { label: '2nd meetings scheduled', actual: vm => vm.totals.ca_sched, goal: vm => vm.goals.closingSched },
    { label: '2nd meetings held', actual: vm => vm.totals.ca_held, goal: vm => vm.goals.closingRun },
    { label: 'New business submitted', actual: vm => vm.r.submitted.length, goal: vm => vm.goals.nbSub, auto: true },
    { label: 'New business closed', actual: vm => vm.r.closed.length, goal: vm => vm.goals.nbClosed, auto: true },
    { label: 'Premium closed', actual: vm => vm.r.annualizedClosed, goal: vm => vm.goals.closeAnnualizedPremium, money: true, auto: true },
    { label: 'Referrals gathered', actual: vm => vm.totals.referrals, goal: vm => vm.goals.referrals }
  ];
  const lineMet = (g, vm) => { const goal = g.goal(vm) || 0, a = g.actual(vm) || 0; return goal > 0 ? a >= goal : a > 0; };

  function myWeekHtml(vm) {
    const fmt = (g, x) => g.money ? money(x) : x;
    const lines = GOAL_LINES.map(g => {
      const a = g.actual(vm) || 0, goal = g.goal(vm) || 0, met = lineMet(g, vm);
      const pct = goal > 0 ? Math.min(100, Math.round(100 * a / goal)) : (a > 0 ? 100 : 0);
      return `<div class="mw-line ${met ? 'met' : ''}">
        <div class="mw-top">
          <span class="mw-label">${g.label}${g.auto ? '<span class="mw-auto" title="Counted from your cases">auto</span>' : ''}</span>
          <span class="mw-val">${fmt(g, a)}${goal ? ` <span class="mw-goal">/ ${fmt(g, goal)}</span>` : ''}</span>
        </div>
        <div class="mw-bar"><div class="mw-fill ${met ? 'ok' : ''}" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
    const met = GOAL_LINES.filter(g => lineMet(g, vm)).length;
    return `<div class="card mw-card">
      <div class="card-head"><h3>My Week</h3><span class="sub">${met} of ${GOAL_LINES.length} met</span></div>
      ${lines}
    </div>`;
  }

  // ── the money input on the add-case form ──
  function moneyInputBlock(prodId) {
    const inp = S().inputFor(prodId);
    return `<label id="sc-money-label">${esc(inp.label)}</label>
      <input id="sc-money" type="number" min="0" inputmode="decimal" placeholder="0">
      <div class="hint" id="sc-money-hint">${esc(inp.hint)}</div>`;
  }

  function caseRow(c) {
    const sc = S();
    const d = sc.derive(c.product, c.amount, c.aum);
    const money1 = sc.usesAum(c.product) ? money(c.aum) : money(c.amount);
    return `<tr>
      <td>${esc(c.clientName || '(no name)')}</td>
      <td>${esc(sc.productName(c.product))}</td>
      <td><span class="chip">${esc(c.state)}</span></td>
      <td class="num">${money1}</td>
      <td class="num">${d.annualizedPremium ? money(d.annualizedPremium) : '—'}</td>
      <td class="num">${money(d.revenue)}</td>
      <td class="row-actions">
        <button class="icon-btn" data-action="sc-edit-case" data-id="${esc(c.recordId)}" title="Edit">✎</button>
        <button class="icon-btn" data-action="sc-del-case" data-id="${esc(c.recordId)}" title="Delete">🗑</button>
      </td></tr>`;
  }

  // ── the daily tally grid (Mon..Sat) ──
  function dailyGridHtml(st, week) {
    const days = S().weekDays(week, 6);
    const today = S().todayKey();
    const totals = dailyTotals(st);
    const head = days.map(d =>
      `<th class="sc-dayh ${d.key === today ? 'is-today' : ''}"><span>${d.label}</span><small>${d.month} ${d.dom}</small></th>`).join('');
    const rows = MANUAL.map(m => {
      const cells = days.map(d => {
        const v = (st.daily[d.key] || {})[m.id];
        return `<td class="${d.key === today ? 'is-today' : ''}"><input class="sc-daycell" type="number" min="0" inputmode="numeric"
          data-day="${d.key}" data-metric="${m.id}" value="${v == null || v === '' ? '' : esc(String(v))}" placeholder="0"></td>`;
      }).join('');
      return `<tr><th class="sc-metric">${m.label}</th>${cells}<td class="num sc-rowtot" data-tot="${m.id}">${totals[m.id] || 0}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="data sc-daily">
      <thead><tr><th class="sc-metric">Activity</th>${head}<th class="num sc-weektot">Week</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div>`;
  }

  RWG.modules.register({
    id: 'scorecard',
    title: 'Scorecard',
    enabled: true,
    roles: ['admin', 'agent'],
    nav: [{ view: 'sc_week', label: 'My Scorecard', icon: 'scorecard' }],
    meta: { sc_week: { t: 'My Scorecard', s: 'Log your week' } },

    state: {
      weekEnding: null,
      daily: {},            // { 'yyyy-mm-dd': { fa_sched, ... } }
      loadedKey: null,      // uid_week the daily tally was last loaded for
      draftProduct: 'wl',
      editingId: null
    },

    home: {
      tile: (ctx) => ({ icon: 'scorecard', title: 'Scorecard', desc: 'Log your week. Cases, activity, and your pace to goal.', view: 'sc_week' }),
      stats: (ctx) => {
        if (!D().isStarted()) return [];
        const user = actor(); if (!user) return [];
        const wk = RWG.modules.get('scorecard').state.weekEnding || S().currentWeekEnding();
        const r = rollup(user, wk);
        return [{ label: 'Annualized premium (wk)', value: money(r.annualizedClosed) }];
      }
    },

    onEnter(view, ctx) {
      const st = this.state;
      if (!D().isStarted()) D().init(RWG.auth.currentUser(), RWG.app.renderMain);
      if (!st.weekEnding) st.weekEnding = S().currentWeekEnding();
    },

    onChange(e, st) {
      if (e.target.id === 'sc-week-pick') { st.weekEnding = e.target.value; st.loadedKey = null; RWG.app.renderMain(); return; }
      if (e.target.id === 'sc-agent-pick') { RWG.app.viewAs(e.target.value || null); return; }
      if (e.target.id === 'sc-prod') {
        st.draftProduct = e.target.value;
        const inp = S().inputFor(st.draftProduct);
        const lab = document.getElementById('sc-money-label'); if (lab) lab.textContent = inp.label;
        const hint = document.getElementById('sc-money-hint'); if (hint) hint.textContent = inp.hint;
        return;
      }
      if (e.target.classList && e.target.classList.contains('sc-daycell')) { persistDaily(st); return; }
    },

    onInput(e, st) {
      const t = e.target;
      if (t.classList && t.classList.contains('sc-daycell')) {
        const day = t.dataset.day, metric = t.dataset.metric;
        st.daily[day] = st.daily[day] || {};
        st.daily[day][metric] = t.value;
        refreshDailyTotals();
      }
    },

    actions: {
      'sc-add-case': function (el, e, st) { addCase(st); },
      'sc-edit-case': function (el, e, st) { loadCaseIntoForm(st, el.dataset.id); },
      'sc-del-case': function (el, e, st) {
        if (!confirm('Delete this case?')) return;
        D().deleteCase(el.dataset.id).then(() => U().toast('Case deleted'));
      },
      'sc-cancel-edit': function (el, e, st) { st.editingId = null; RWG.app.renderMain(); },
      'sc-save-week': function (el, e, st) { saveWeek(st); }
    },

    render(view, user, ctx) {
      const st = this.state;
      const sc = S();
      const week = st.weekEnding || sc.currentWeekEnding();
      syncDaily(user, st, week);
      const vm = buildVM(user, st);
      const me = vm.me;

      const weekOpts = recentWeeks(14).map(w =>
        `<option value="${w}" ${w === week ? 'selected' : ''}>Week ending ${w}${w === sc.currentWeekEnding() ? ' (this week)' : ''}</option>`).join('');

      const prodOpts = sc.PRODUCTS.map(p => `<option value="${p.id}" ${p.id === st.draftProduct ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
      const srcOpts = sc.SOURCES.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
      const stateOpts = sc.STATES.map(s => `<option value="${s}" ${s === 'Opened' ? 'selected' : ''}>${s}</option>`).join('');

      const rows = vm.r.cases.length
        ? vm.r.cases.map(caseRow).join('')
        : `<tr><td colspan="7"><div class="empty" style="padding:26px"><div class="ec">🗂</div><h3>No cases yet this week</h3><p>Add your first case below.</p></div></td></tr>`;

      const notConnected = !D().isStarted() || (D().cases().length === 0 && !D().agentConfig(user.id));

      // Admin-only agent picker (real role, not the impersonated one).
      const realAdmin = RWG.auth.isAdmin();
      const realUser = RWG.auth.currentUser();
      const viewingId = (RWG.app.state && RWG.app.state.viewAs) || '';
      const others = realAdmin
        ? RWG.data.users().filter(u => u.status === 'active' && u.id !== realUser.id)
          .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        : [];
      const agentPicker = realAdmin
        ? `<select id="sc-agent-pick" class="fbar-select" title="View another agent's scorecard">
             <option value="">Me — ${esc((realUser.name || '').split(' ')[0])}</option>
             ${others.map(u => `<option value="${u.id}" ${u.id === viewingId ? 'selected' : ''}>${esc(u.name)}</option>`).join('')}
           </select>`
        : '';

      return `
      <div class="sc-wrap">
        <div class="sc-main">
          <div class="card">
            <div class="card-head"><h3>Your week</h3><span class="sub">${esc(me.name)}</span>
              <span class="topbar-spacer"></span>
              ${agentPicker}
              <select id="sc-week-pick" class="fbar-select">${weekOpts}</select>
            </div>
            ${notConnected ? `<div class="sc-note">Live save is off until the Firestore rules are published. You can still see the layout and the live math.</div>` : ''}
          </div>

          <div class="card">
            <div class="card-head"><h3>Daily tally</h3><span class="sub">Log a couple of numbers at the end of each day — the week adds itself up</span></div>
            ${dailyGridHtml(st, week)}
            <div class="sc-derived muted">
              Opportunities opened <b>${vm.r.opened.length}</b> &middot;
              New business submitted <b>${vm.r.submitted.length}</b> &middot;
              New business closed <b>${vm.r.closed.length}</b>
              <span class="sub">(counted from your cases, not typed here)</span>
            </div>
          </div>

          <div class="card">
            <div class="card-head"><h3>Cases this week</h3><span class="sub">${vm.r.cases.length} case${vm.r.cases.length === 1 ? '' : 's'}</span></div>
            <div class="table-wrap"><table class="data sc-cases">
              <thead><tr><th>Client</th><th>Product</th><th>Stage</th><th class="num">Amount / AUM</th><th class="num">Ann. premium</th><th class="num">Revenue</th><th></th></tr></thead>
              <tbody>${rows}</tbody>
            </table></div>

            <div class="sc-addcase">
              <div class="sc-add-h">${st.editingId ? 'Edit case' : 'Add a case'}</div>
              <div class="sc-add-grid">
                <div><label>Client name</label><input id="sc-client" type="text" placeholder="Full name"></div>
                <div><label>Product</label><select id="sc-prod">${prodOpts}</select></div>
                <div><label>Source</label><select id="sc-src">${srcOpts}</select></div>
                <div><label>Stage</label><select id="sc-state">${stateOpts}</select></div>
                <div class="sc-money-wrap">${moneyInputBlock(st.draftProduct)}</div>
              </div>
              <div class="sc-add-actions">
                <button class="btn btn-gold" data-action="sc-add-case">${st.editingId ? 'Save changes' : '＋ Add case'}</button>
                ${st.editingId ? `<button class="btn btn-ghost" data-action="sc-cancel-edit">Cancel</button>` : ''}
              </div>
            </div>
          </div>
        </div>

        <aside class="sc-rail" id="sc-rail">${railHtml(vm)}</aside>
      </div>`;
    }
  });

  // ── the view model shared by render + the in-place rail refresh ──
  function buildVM(user, st) {
    const sc = S();
    const week = st.weekEnding || sc.currentWeekEnding();
    const me = identity(user);
    const r = rollup(user, week);
    const totals = dailyTotals(st);
    const pts = activityPoints(totals, r);
    const floor = sc.weeklyFloor(me.name);
    const goals = me.goals || {};
    const target = goals.closeAnnualizedPremium || 0;
    const pacePct = target ? Math.min(100, Math.round(100 * r.annualizedClosed / target)) : 0;
    return { week, me, r, totals, pts, floor, goals, target, pacePct };
  }

  // ── the right rail (also refreshed in place as the daily tally is typed) ──
  function railHtml(vm) {
    const floorPct = vm.floor ? Math.min(100, Math.round(100 * vm.pts / vm.floor)) : 100;
    return `
      <div class="card sc-hero">
        <div class="eyebrow"><span class="dot"></span><span>Annualized premium written</span></div>
        <div class="sc-big num">${money(vm.r.annualizedClosed)}</div>
        ${vm.target ? `<div class="sc-bar"><div class="sc-bar-fill" style="width:${vm.pacePct}%"></div></div>
          <div class="sc-bar-note">${vm.pacePct}% of your ${money(vm.target)} weekly pace</div>` : ''}
      </div>
      ${myWeekHtml(vm)}
      <div class="grid sc-nums">
        <div class="stat"><div class="label">Revenue closed</div><div class="value num">${money(vm.r.revClosed)}</div></div>
        <div class="stat"><div class="label">FYC closed</div><div class="value num">${money(vm.r.fycClosed)}</div></div>
        <div class="stat"><div class="label">Submitted (ann. prem)</div><div class="value num">${money(vm.r.annualizedSubmitted)}</div></div>
        <div class="stat"><div class="label">AUM closed</div><div class="value num">${money(vm.r.aumClosed)}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Activity points</h3></div>
        <div class="sc-bar"><div class="sc-bar-fill ${vm.pts >= vm.floor ? 'ok' : ''}" style="width:${floorPct}%"></div></div>
        <div class="sc-bar-note">${vm.pts} points${vm.floor ? ' &middot; floor ' + vm.floor : ''}</div>
      </div>
      <button class="btn btn-navy btn-block" data-action="sc-save-week">Submit week</button>`;
  }

  function refreshRail() {
    const user = actor(); if (!user) return;
    const st = RWG.modules.get('scorecard').state;
    const rail = document.getElementById('sc-rail');
    if (rail) rail.innerHTML = railHtml(buildVM(user, st));
  }

  // Update the daily grid's row totals + the rail without a full re-render, so
  // the cell being typed keeps focus.
  function refreshDailyTotals() {
    const st = RWG.modules.get('scorecard').state;
    const totals = dailyTotals(st);
    MANUAL.forEach(m => { const el = document.querySelector('[data-tot="' + m.id + '"]'); if (el) el.textContent = totals[m.id] || 0; });
    refreshRail();
  }

  function persistDaily(st) {
    const user = actor(); if (!user || !D().isStarted()) return;
    D().saveDaily(weekDoc(st, user, { finalize: false }))
      .catch(err => U().toast('Could not save: ' + err.message));
  }

  // ── case add / edit ──
  function readCaseForm(st, user) {
    const g = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const prod = g('sc-prod') || st.draftProduct;
    const usesAum = S().usesAum(prod);
    const moneyVal = Number(g('sc-money')) || 0;
    const me = identity(user);
    return {
      recordId: st.editingId || undefined,
      agentUid: user.id,
      agentName: me.name,
      clientName: g('sc-client').trim(),
      product: prod,
      source: g('sc-src'),
      state: g('sc-state'),
      amount: usesAum ? 0 : moneyVal,
      aum: usesAum ? moneyVal : 0
    };
  }

  function addCase(st) {
    const user = actor();
    const input = readCaseForm(st, user);
    if (!input.clientName) { U().toast('Add a client name'); return; }
    D().saveCase(input).then(() => {
      U().toast(st.editingId ? 'Case updated' : 'Case added', true);
      st.editingId = null;
    }).catch(err => U().toast('Could not save: ' + err.message));
  }

  function loadCaseIntoForm(st, id) {
    const c = D().caseById(id); if (!c) return;
    st.editingId = id; st.draftProduct = c.product;
    RWG.app.renderMain();
    // fill after the DOM exists
    setTimeout(() => {
      const set = (i, v) => { const el = document.getElementById(i); if (el) el.value = v; };
      set('sc-client', c.clientName || ''); set('sc-prod', c.product); set('sc-src', c.source);
      set('sc-state', c.state); set('sc-money', S().usesAum(c.product) ? c.aum : c.amount);
    }, 0);
  }

  function saveWeek(st) {
    const user = actor();
    const me = identity(user);
    D().saveWeek(weekDoc(st, user, { finalize: true }))
      .then(() => U().toast('Week submitted. Thanks, ' + me.name.split(' ')[0] + '.', true))
      .catch(err => U().toast('Could not submit: ' + err.message));
  }

  // expose the pure helpers for verification
  RWG._scorecardModule = { rollup, activityPoints, identity, recentWeeks, dailyTotals, cleanDaily, weekDoc, GOAL_LINES, lineMet, buildVM };
})();
