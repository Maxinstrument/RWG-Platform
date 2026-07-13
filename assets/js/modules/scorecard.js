/* ============================================================
   RWG Platform — Scorecard module (the agent weekly form)

   The rebuilt weekly scorecard. Three differences from the old form:
     1. Attributed to the LOGGED-IN account, not a name dropdown.
     2. The agent types ONE number per case; the platform derives FYC,
        annualized premium, and revenue (RWG.scorecard). Investments can
        never carry a stray $ Amount.
     3. The headline number is ANNUALIZED PREMIUM written this week, with
        pace to the agent's weekly target.

   Reads/writes go through RWG.scorecardData. Money + week rules come from
   RWG.scorecard. This file owns layout and interaction only.
   ============================================================ */
window.RWG = window.RWG || {};

(function () {
  const S = () => RWG.scorecard;
  const D = () => RWG.scorecardData;
  const U = () => RWG.ui;

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

  const money = (n) => U().money(n);
  const esc = (s) => U().esc(s);

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

  // Activity points = manual funnel + counts derived from the cases this week.
  function activityPoints(form, r) {
    const p = S().ACTIVITY_POINTS;
    const n = (v) => Number(v) || 0;
    return n(form.fa_sched) * p.fa_sched + n(form.fa_held) * p.fa_held
      + r.opened.length * p.opp_open + n(form.ca_sched) * p.ca_sched
      + n(form.ca_held) * p.ca_held + r.submitted.length * p.nb_written
      + r.closed.length * p.nb_closed + n(form.referrals) * p.referrals;
  }

  const MANUAL = [
    { id: 'fa_sched', label: '1st meetings scheduled' },
    { id: 'fa_held', label: '1st meetings held' },
    { id: 'ca_sched', label: '2nd meetings scheduled' },
    { id: 'ca_held', label: '2nd meetings held' },
    { id: 'referrals', label: 'Referrals gathered' }
  ];

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

  RWG.modules.register({
    id: 'scorecard',
    title: 'Scorecard',
    enabled: true,
    roles: ['admin', 'agent'],
    nav: [{ view: 'sc_week', label: 'My Scorecard', icon: 'scorecard' }],
    meta: { sc_week: { t: 'My Scorecard', s: 'Log your week' } },

    state: {
      weekEnding: null,
      form: { fa_sched: '', fa_held: '', ca_sched: '', ca_held: '', referrals: '' },
      draftProduct: 'wl',
      editingId: null
    },

    home: {
      tile: (ctx) => ({ icon: 'scorecard', title: 'Scorecard', desc: 'Log your week. Cases, activity, and your pace to goal.', view: 'sc_week' }),
      stats: (ctx) => {
        if (!D().isStarted()) return [];
        const user = ctx.user; if (!user) return [];
        const wk = RWG.modules.get('scorecard').state.weekEnding || S().currentWeekEnding();
        const r = rollup(user, wk);
        return [{ label: 'Annualized premium (wk)', value: money(r.annualizedClosed) }];
      }
    },

    onEnter(view, ctx) {
      const st = this.state;
      if (!D().isStarted()) D().init(ctx.userObj || RWG.auth.currentUser(), RWG.app.renderMain);
      if (!st.weekEnding) st.weekEnding = S().currentWeekEnding();
    },

    onChange(e, st) {
      if (e.target.id === 'sc-week-pick') { st.weekEnding = e.target.value; RWG.app.renderMain(); return; }
      if (e.target.id === 'sc-prod') {
        st.draftProduct = e.target.value;
        const inp = S().inputFor(st.draftProduct);
        const lab = document.getElementById('sc-money-label'); if (lab) lab.textContent = inp.label;
        const hint = document.getElementById('sc-money-hint'); if (hint) hint.textContent = inp.hint;
      }
    },

    onInput(e, st) {
      if (e.target.dataset && e.target.dataset.act) { st.form[e.target.dataset.act] = e.target.value; refreshRail(); }
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
      const me = identity(user);
      const r = rollup(user, week);
      const pts = activityPoints(st.form, r);
      const floor = sc.weeklyFloor(me.name);
      const target = (me.goals && me.goals.closeAnnualizedPremium) || 0;
      const pacePct = target ? Math.min(100, Math.round(100 * r.annualizedClosed / target)) : 0;

      const weekOpts = recentWeeks(14).map(w =>
        `<option value="${w}" ${w === week ? 'selected' : ''}>Week ending ${w}${w === sc.currentWeekEnding() ? ' (this week)' : ''}</option>`).join('');

      const prodOpts = sc.PRODUCTS.map(p => `<option value="${p.id}" ${p.id === st.draftProduct ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
      const srcOpts = sc.SOURCES.map(s => `<option value="${s.id}">${esc(s.label)}</option>`).join('');
      const stateOpts = sc.STATES.map(s => `<option value="${s}" ${s === 'Opened' ? 'selected' : ''}>${s}</option>`).join('');

      const rows = r.cases.length
        ? r.cases.map(caseRow).join('')
        : `<tr><td colspan="7"><div class="empty" style="padding:26px"><div class="ec">🗂</div><h3>No cases yet this week</h3><p>Add your first case below.</p></div></td></tr>`;

      const notConnected = !D().isStarted() || (D().cases().length === 0 && !D().agentConfig(user.id));

      return `
      <div class="sc-wrap">
        <div class="sc-main">
          <div class="card">
            <div class="card-head"><h3>Your week</h3><span class="sub">${esc(me.name)}</span>
              <span class="topbar-spacer"></span>
              <select id="sc-week-pick" class="fbar-select">${weekOpts}</select>
            </div>
            ${notConnected ? `<div class="sc-note">Live save is off until the Firestore rules are published. You can still see the layout and the live math.</div>` : ''}
          </div>

          <div class="card">
            <div class="card-head"><h3>Cases this week</h3><span class="sub">${r.cases.length} case${r.cases.length === 1 ? '' : 's'}</span></div>
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

          <div class="card">
            <div class="card-head"><h3>Activity this week</h3><span class="sub">What isn't a case</span></div>
            <div class="sc-activity">
              ${MANUAL.map(m => `<div class="sc-act"><label>${m.label}</label>
                <input type="number" min="0" inputmode="numeric" data-act="${m.id}" value="${esc(st.form[m.id])}" placeholder="0"></div>`).join('')}
            </div>
            <div class="sc-derived muted">
              Opportunities opened <b>${r.opened.length}</b> &middot;
              New business submitted <b>${r.submitted.length}</b> &middot;
              New business closed <b>${r.closed.length}</b>
              <span class="sub">(counted from your cases)</span>
            </div>
          </div>
        </div>

        <aside class="sc-rail" id="sc-rail">${railHtml(r, pts, floor, target, pacePct)}</aside>
      </div>`;
    }
  });

  // ── the right rail (also refreshed in place as activity is typed) ──
  function railHtml(r, pts, floor, target, pacePct) {
    const floorPct = floor ? Math.min(100, Math.round(100 * pts / floor)) : 100;
    return `
      <div class="card sc-hero">
        <div class="eyebrow"><span class="dot"></span><span>Annualized premium written</span></div>
        <div class="sc-big num">${money(r.annualizedClosed)}</div>
        ${target ? `<div class="sc-bar"><div class="sc-bar-fill" style="width:${pacePct}%"></div></div>
          <div class="sc-bar-note">${pacePct}% of your ${money(target)} weekly pace</div>` : ''}
      </div>
      <div class="grid sc-nums">
        <div class="stat"><div class="label">Revenue closed</div><div class="value num">${money(r.revClosed)}</div></div>
        <div class="stat"><div class="label">FYC closed</div><div class="value num">${money(r.fycClosed)}</div></div>
        <div class="stat"><div class="label">Submitted (ann. prem)</div><div class="value num">${money(r.annualizedSubmitted)}</div></div>
        <div class="stat"><div class="label">AUM closed</div><div class="value num">${money(r.aumClosed)}</div></div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Activity points</h3></div>
        <div class="sc-bar"><div class="sc-bar-fill ${pts >= floor ? 'ok' : ''}" style="width:${floorPct}%"></div></div>
        <div class="sc-bar-note">${pts} points${floor ? ' &middot; floor ' + floor : ''}</div>
      </div>
      <button class="btn btn-navy btn-block" data-action="sc-save-week">Submit week</button>`;
  }

  function refreshRail() {
    const mod = RWG.modules.get('scorecard');
    const user = RWG.auth.currentUser(); if (!user) return;
    const st = mod.state, week = st.weekEnding || S().currentWeekEnding();
    const me = identity(user), r = rollup(user, week);
    const pts = activityPoints(st.form, r);
    const floor = S().weeklyFloor(me.name);
    const target = (me.goals && me.goals.closeAnnualizedPremium) || 0;
    const pacePct = target ? Math.min(100, Math.round(100 * r.annualizedClosed / target)) : 0;
    const rail = document.getElementById('sc-rail');
    if (rail) rail.innerHTML = railHtml(r, pts, floor, target, pacePct);
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
    const user = RWG.auth.currentUser();
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
    const user = RWG.auth.currentUser();
    const me = identity(user);
    const week = st.weekEnding || S().currentWeekEnding();
    const r = rollup(user, week);
    const n = (v) => Number(v) || 0;
    const doc = {
      agentUid: user.id, agentName: me.name, weekEnding: week,
      submittedAt: new Date().toISOString(),
      firstApptsScheduled: n(st.form.fa_sched), firstApptsHeld: n(st.form.fa_held),
      closingApptsScheduled: n(st.form.ca_sched), closingApptsHeld: n(st.form.ca_held),
      referralsGathered: n(st.form.referrals),
      opportunitiesOpened: r.opened.length, newBusinessSubmitted: r.submitted.length, newBusinessClosed: r.closed.length,
      activityPoints: activityPoints(st.form, r),
      annualizedPremiumClosed: r.annualizedClosed, annualizedPremiumSubmitted: r.annualizedSubmitted,
      fycClosed: r.fycClosed, revenueClosed: r.revClosed, revenueSubmitted: r.revSubmitted, aumClosed: r.aumClosed,
      scorecardRole: me.role
    };
    D().saveWeek(doc).then(() => U().toast('Week submitted. Thanks, ' + me.name.split(' ')[0] + '.', true))
      .catch(err => U().toast('Could not submit: ' + err.message));
  }

  // expose the pure helpers for verification
  RWG._scorecardModule = { rollup, activityPoints, identity, recentWeeks };
})();
