/* ============================================================
   RWG Platform — Report module (management view, admin only)

   Reads the SAME cases and weeks the scorecard writes, so the numbers
   management sees can never disagree with what the agent sees. The old
   system kept two copies and they drifted; here there is one source.

   Headline is ANNUALIZED PREMIUM written, per agent per week, with pace
   to the weekly target, plus the Chairman's Club (combined partner FYC
   toward $1M).
   ============================================================ */
window.RWG = window.RWG || {};

(function () {
  const S = () => RWG.scorecard;
  const D = () => RWG.scorecardData;
  const U = () => RWG.ui;
  const money = (n) => U().money(n);
  const esc = (s) => U().esc(s);

  function recentWeeks(count) {
    const cur = S().currentWeekEnding();
    const all = S().fridaysOfYear(Number(cur.slice(0, 4)));
    const idx = all.indexOf(cur);
    return (idx >= 0 ? all.slice(0, idx + 1) : all).slice(-count).reverse();
  }

  // Aggregate every case that hit a milestone in the given week, grouped by agent.
  function teamForWeek(weekEnding) {
    const sc = S(), agents = {};
    D().cases().forEach(c => {
      const b = sc.bucketForWeek(c, weekEnding);
      if (!b) return;
      const key = c.agentUid || c.agentName || '(unknown)';
      const a = agents[key] || (agents[key] = {
        key, name: c.agentName || key,
        opened: 0, submitted: 0, closed: 0,
        annClosed: 0, revClosed: 0, fycClosed: 0, annSub: 0, revSub: 0
      });
      if (b === 'Opened') a.opened++;
      else if (b === 'Submitted') { a.submitted++; a.annSub += sc.annualizedPremium(c.product, c.amount); a.revSub += sc.revenue(c.product, c.amount, c.aum); }
      else if (b === 'Closed') { a.closed++; a.annClosed += sc.annualizedPremium(c.product, c.amount); a.revClosed += sc.revenue(c.product, c.amount, c.aum); a.fycClosed += sc.fyc(c.product, c.amount); }
    });
    return agents;
  }

  function teamTotals(agents) {
    const t = { opened: 0, submitted: 0, closed: 0, annClosed: 0, revClosed: 0, fycClosed: 0, annSub: 0, revSub: 0 };
    Object.values(agents).forEach(a => { Object.keys(t).forEach(k => t[k] += a[k]); });
    return t;
  }

  // Chairman's Club: combined FYC on every closed case, ever, plus the booked start.
  function clubYtd() {
    const sc = S();
    let fyc = 0;
    D().cases().forEach(c => { if (c.closedAt) fyc += sc.fyc(c.product, c.amount); });
    return sc.CHAIRMAN.STARTING_FYC_TOTAL + fyc;
  }

  // The management "glance": each money metric split Opened / Submitted / Closed / Total.
  function glanceMatrix(cases, week) {
    const sc = S();
    const b = { Opened: [], Submitted: [], Closed: [] };
    cases.forEach(c => { if (!sc.activeInWeek(c, week)) return; const k = sc.bucketForWeek(c, week); if (b[k]) b[k].push(c); });
    const sum = (list, fn) => list.reduce((a, c) => a + fn(c), 0);
    const rows = [
      { label: 'Annualized premium', fn: c => sc.annualizedPremium(c.product, c.amount) },
      { label: 'FYC', fn: c => sc.fyc(c.product, c.amount) },
      { label: 'Revenue', fn: c => sc.revenue(c.product, c.amount, c.aum) },
      { label: 'AUM', fn: c => Number(c.aum) || 0 },
      { label: 'Annuity deposits', fn: c => c.product === 'annuity' ? (Number(c.amount) || 0) : 0 }
    ];
    const tr = rows.map(r => {
      const o = sum(b.Opened, r.fn), s = sum(b.Submitted, r.fn), cl = sum(b.Closed, r.fn);
      return `<tr><td>${r.label}</td><td class="num">${money(o)}</td><td class="num">${money(s)}</td><td class="num">${money(cl)}</td><td class="num"><b>${money(o + s + cl)}</b></td></tr>`;
    }).join('');
    return `<div class="card"><div class="card-head"><h3>This week at a glance</h3></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Metric</th><th class="num">Opened</th><th class="num">Submitted</th><th class="num">Closed</th><th class="num">Total</th></tr></thead><tbody>${tr}</tbody></table></div></div>`;
  }

  // Product mix: counts by stage and total revenue per product for the week.
  function mixTable(cases, week) {
    const sc = S(), byP = {};
    cases.forEach(c => {
      if (!sc.activeInWeek(c, week)) return;
      const k = sc.bucketForWeek(c, week);
      const p = byP[c.product] || (byP[c.product] = { o: 0, s: 0, cl: 0, rev: 0 });
      if (k === 'Opened') p.o++; else if (k === 'Submitted') p.s++; else if (k === 'Closed') p.cl++;
      p.rev += sc.revenue(c.product, c.amount, c.aum);
    });
    const order = sc.PRODUCTS.map(p => p.id).filter(id => byP[id]);
    if (!order.length) return '';
    const tr = order.map(id => { const p = byP[id]; return `<tr><td>${esc(sc.productName(id))}</td><td class="num">${p.o}</td><td class="num">${p.s}</td><td class="num">${p.cl}</td><td class="num">${money(p.rev)}</td></tr>`; }).join('');
    return `<div class="card"><div class="card-head"><h3>Product mix</h3></div>
      <div class="table-wrap"><table class="data"><thead><tr><th>Product</th><th class="num">Opened</th><th class="num">Submitted</th><th class="num">Closed</th><th class="num">Revenue</th></tr></thead><tbody>${tr}</tbody></table></div></div>`;
  }

  // A person's weekly goals vs actuals (the old "My Week" card, management side).
  function goalsCard(name, cases, week) {
    const sc = S(), g = sc.goalsFor(name);
    if (!g) return '';
    const b = { Opened: [], Submitted: [], Closed: [] };
    cases.forEach(c => { if (!sc.activeInWeek(c, week)) return; const k = sc.bucketForWeek(c, week); if (b[k]) b[k].push(c); });
    const annClosed = b.Closed.reduce((a, c) => a + sc.annualizedPremium(c.product, c.amount), 0);
    const rows = [
      { label: 'Opportunities opened', val: b.Opened.length, target: g.opps },
      { label: 'New business submitted', val: b.Submitted.length, target: g.nbSub },
      { label: 'New business closed', val: b.Closed.length, target: g.nbClosed },
      { label: 'Annualized premium closed', val: annClosed, target: g.closeAnnualizedPremium || 0, money: true }
    ];
    let met = 0;
    const body = rows.map(r => {
      const pct = r.target > 0 ? Math.min(100, Math.round(100 * r.val / r.target)) : 100;
      const hit = r.val >= r.target; if (hit) met++;
      const disp = r.money ? (money(r.val) + ' / ' + money(r.target)) : (r.val + ' / ' + r.target);
      return `<div class="rp-goal"><div class="rp-goal-top"><span>${r.label}</span><span>${disp}${hit ? ' ✓' : ''}</span></div>
        <div class="sc-bar"><div class="sc-bar-fill ${hit ? 'ok' : ''}" style="width:${pct}%"></div></div></div>`;
    }).join('');
    return `<div class="card"><div class="card-head"><h3>Weekly goals</h3><span class="sub">${met} of ${rows.length} met</span></div>${body}</div>`;
  }

  // Read-only day-by-day activity for one agent's week, from their saved daily
  // tally (weeks/{uid}_{week}.daily). Lets a manager see the pattern — front-loaded
  // week vs. a Friday scramble — without having to View As the agent.
  const DAILY_ROWS = [
    { id: 'fa_sched', label: '1st mtgs scheduled' },
    { id: 'fa_held', label: '1st mtgs held' },
    { id: 'ca_sched', label: '2nd mtgs scheduled' },
    { id: 'ca_held', label: '2nd mtgs held' },
    { id: 'referrals', label: 'Referrals' }
  ];
  function dailyActivityCard(name, week) {
    const sc = S();
    const wk = D().weeksForWeek(week).find(w => w.agentName === name);
    const daily = (wk && wk.daily) || {};
    const days = sc.weekDays(week, 6);
    const head = days.map(d => `<th class="num">${d.label}<br><small class="muted">${d.month} ${d.dom}</small></th>`).join('');
    const rows = DAILY_ROWS.map(m => {
      let tot = 0;
      const cells = days.map(d => {
        const v = Number((daily[d.key] || {})[m.id]) || 0; tot += v;
        return v ? `<td class="num">${v}</td>` : `<td class="num muted">·</td>`;
      }).join('');
      return `<tr><td style="font-weight:600">${m.label}</td>${cells}<td class="num"><b>${tot}</b></td></tr>`;
    }).join('');
    const note = Object.keys(daily).length ? '' : `<p class="muted" style="font-size:12.5px;margin:8px 0 0">No daily tally logged for this week yet.</p>`;
    return `<div class="card">
      <div class="card-head"><h3>Daily activity</h3><span class="sub">${esc(name.split(' ')[0])}'s week, day by day</span></div>
      <div class="table-wrap"><table class="data rp-daily">
        <thead><tr><th>Activity</th>${head}<th class="num">Week</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>${note}
    </div>`;
  }

  function whoOptions(selected) {
    const names = {};
    D().cases().forEach(c => { if (c.agentName) names[c.agentName] = 1; });
    Object.keys(S().AGENT_GOALS).forEach(nm => names[nm] = 1);
    const list = Object.keys(names).sort();
    return ['<option value="__team__"' + (selected === '__team__' ? ' selected' : '') + '>Whole team</option>']
      .concat(list.map(nm => `<option value="${esc(nm)}" ${selected === nm ? 'selected' : ''}>${esc(nm)}</option>`))
      .join('');
  }

  function statCard(label, value) {
    return `<div class="stat"><div class="label">${esc(label)}</div><div class="value num">${esc(value)}</div></div>`;
  }

  function teamView(week) {
    const sc = S();
    const agents = teamForWeek(week);
    const t = teamTotals(agents);
    const pace = sc.ANNUALIZED_PREMIUM_PER_WEEK_AT_TARGET;
    const pacePct = pace ? Math.min(100, Math.round(100 * t.annClosed / pace)) : 0;

    const glance = `<div class="grid rp-glance">
      ${statCard('Annualized premium (closed)', money(t.annClosed))}
      ${statCard('Revenue closed', money(t.revClosed))}
      ${statCard('FYC closed', money(t.fycClosed))}
      ${statCard('Cases closed', String(t.closed))}
    </div>`;

    const rows = Object.values(agents).sort((a, b) => b.annClosed - a.annClosed);
    const lead = rows.length ? rows.map(a => {
      const g = sc.goalsFor(a.name);
      const target = (g && g.closeAnnualizedPremium) || 0;
      const pct = target ? Math.min(100, Math.round(100 * a.annClosed / target)) : 0;
      return `<tr>
        <td style="font-weight:600">${esc(a.name)}</td>
        <td class="num">${a.opened}</td><td class="num">${a.submitted}</td><td class="num">${a.closed}</td>
        <td class="num"><b>${money(a.annClosed)}</b></td>
        <td class="num">${money(a.revClosed)}</td>
        <td class="num">${target ? pct + '%' : '—'}</td></tr>`;
    }).join('') : `<tr><td colspan="7"><div class="empty" style="padding:22px"><div class="ec">📊</div><h3>No production this week</h3><p>Cases show up here as agents log them.</p></div></td></tr>`;

    const teamRow = rows.length ? `<tr class="rp-total">
      <td>Team</td><td class="num">${t.opened}</td><td class="num">${t.submitted}</td><td class="num">${t.closed}</td>
      <td class="num"><b>${money(t.annClosed)}</b></td><td class="num">${money(t.revClosed)}</td>
      <td class="num">${pace ? pacePct + '%' : '—'}</td></tr>` : '';

    const ytd = clubYtd();
    const goal = sc.CHAIRMAN.ANNUAL_FYC_GOAL_TOTAL;
    const clubPct = Math.min(100, Math.round(100 * ytd / goal));
    const club = `<div class="card rp-club">
      <div class="card-head"><h3>Chairman's Club</h3><span class="sub">Combined partner FYC toward ${money(goal)}</span></div>
      <div class="rp-club-num num">${money(ytd)}</div>
      <div class="sc-bar"><div class="sc-bar-fill" style="width:${clubPct}%"></div></div>
      <div class="sc-bar-note">${clubPct}% of the ${money(goal)} goal &middot; pace ${money(sc.FYC_PER_WEEK_AT_TARGET)}/week of FYC</div>
    </div>`;

    return glance + glanceMatrix(D().cases(), week) + `
      <div class="card">
        <div class="card-head"><h3>By agent, this week</h3><span class="sub">Sorted by annualized premium</span></div>
        <div class="table-wrap"><table class="data">
          <thead><tr><th>Agent</th><th class="num">Opened</th><th class="num">Subm.</th><th class="num">Closed</th><th class="num">Ann. premium</th><th class="num">Revenue</th><th class="num">Pace</th></tr></thead>
          <tbody>${lead}${teamRow}</tbody>
        </table></div>
      </div>` + mixTable(D().cases(), week) + club;
  }

  function personView(name, week) {
    const sc = S();
    const cases = D().cases().filter(c => (c.agentName === name || (sc.coCredit(c).indexOf(name) >= 0)) && sc.activeInWeek(c, week));
    const b = { Opened: [], Submitted: [], Closed: [] };
    cases.forEach(c => { const k = sc.bucketForWeek(c, week); if (b[k]) b[k].push(c); });
    const sum = (list, fn) => list.reduce((a, c) => a + fn(c), 0);
    const annClosed = sum(b.Closed, c => sc.annualizedPremium(c.product, c.amount));
    const revClosed = sum(b.Closed, c => sc.revenue(c.product, c.amount, c.aum));
    const fycClosed = sum(b.Closed, c => sc.fyc(c.product, c.amount));
    const g = sc.goalsFor(name); const target = (g && g.closeAnnualizedPremium) || 0;
    const pct = target ? Math.min(100, Math.round(100 * annClosed / target)) : 0;

    const glance = `<div class="grid rp-glance">
      ${statCard('Annualized premium (closed)', money(annClosed))}
      ${statCard('Revenue closed', money(revClosed))}
      ${statCard('FYC closed', money(fycClosed))}
      ${statCard('Pace to goal', target ? pct + '%' : '—')}
    </div>`;

    const rowsFor = (list, label) => list.length ? `
      <div class="card-head" style="margin:16px 0 8px"><h3 style="font-size:15px">${label}</h3><span class="sub">${list.length}</span></div>
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Client</th><th>Product</th><th class="num">Amount / AUM</th><th class="num">Ann. premium</th><th class="num">Revenue</th></tr></thead>
        <tbody>${list.map(c => `<tr><td>${esc(c.clientName || '(no name)')}</td><td>${esc(sc.productName(c.product))}</td>
          <td class="num">${money(sc.usesAum(c.product) ? c.aum : c.amount)}</td>
          <td class="num">${sc.annualizedPremium(c.product, c.amount) ? money(sc.annualizedPremium(c.product, c.amount)) : '—'}</td>
          <td class="num">${money(sc.revenue(c.product, c.amount, c.aum))}</td></tr>`).join('')}</tbody>
      </table></div>` : '';

    const body = (b.Closed.length + b.Submitted.length + b.Opened.length)
      ? rowsFor(b.Closed, 'Closed') + rowsFor(b.Submitted, 'Submitted') + rowsFor(b.Opened, 'Opened')
      : `<div class="empty" style="padding:30px"><div class="ec">🗂</div><h3>Nothing this week for ${esc(name)}</h3></div>`;

    return glance + goalsCard(name, cases, week) + dailyActivityCard(name, week) + glanceMatrix(cases, week) + mixTable(cases, week) + `<div class="card">${body}</div>`;
  }

  RWG.modules.register({
    id: 'report',
    title: 'Reports',
    enabled: true,
    roles: ['admin'],
    nav: [{ view: 'report_week', label: 'Production Reports', icon: 'reports' }],
    meta: { report_week: { t: 'Production Reports', s: 'Cases, premium & pace, week by week' } },

    state: { week: null, who: '__team__' },

    home: {
      tile: () => ({ icon: 'reports', title: 'Reports', desc: 'Team production, annualized premium, and pace to goal.', view: 'report_week' })
    },

    onEnter(view, ctx) {
      if (!D().isStarted()) D().init(ctx.userObj || RWG.auth.currentUser(), RWG.app.renderMain);
      if (!this.state.week) this.state.week = S().currentWeekEnding();
    },

    onChange(e, st) {
      if (e.target.id === 'rp-week') { st.week = e.target.value; RWG.app.renderMain(); }
      if (e.target.id === 'rp-who') { st.who = e.target.value; RWG.app.renderMain(); }
    },

    render(view, user, ctx) {
      const st = this.state;
      const week = st.week || S().currentWeekEnding();
      const weekOpts = recentWeeks(14).map(w => `<option value="${w}" ${w === week ? 'selected' : ''}>Week ending ${w}${w === S().currentWeekEnding() ? ' (this week)' : ''}</option>`).join('');
      const controls = `<div class="card"><div class="card-head"><h3>Weekly report</h3><span class="topbar-spacer"></span>
        <select id="rp-who" class="fbar-select">${whoOptions(st.who)}</select>
        <select id="rp-week" class="fbar-select">${weekOpts}</select></div></div>`;
      const body = st.who === '__team__' ? teamView(week) : personView(st.who, week);
      return controls + body;
    }
  });

  RWG._reportModule = { teamForWeek, teamTotals, clubYtd, personView };
})();
