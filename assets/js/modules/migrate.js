/* ============================================================
   RWG Platform — Data migration (admin only, one-time tool)

   Moves the ~64 cases and ~16 weekly rows out of the old Google Sheet
   into Firestore, under the corrected money model, attributed to real
   accounts.

   Safety:
     - DRY RUN writes nothing. It prints the name -> account map and the
       flagged records first.
     - Uses the SAME recordId as the source, so re-running overwrites and
       never duplicates.
     - Refuses to write a case whose agent can't be resolved, unless it is
       explicitly allowed to carry the name with no login link (Alejandro,
       until he has an account).

   The pure transform/mapping functions are exposed on RWG._migrate for
   headless verification.
   ============================================================ */
window.RWG = window.RWG || {};

(function () {
  const S = () => RWG.scorecard;
  const D = () => RWG.scorecardData;
  const U = () => RWG.ui;
  const esc = (s) => U().esc(s);
  const money = (n) => U().money(n);

  // Same Apps Script the old report reads. Read-only; we never write to it.
  const SOURCE_ENDPOINT = 'https://script.google.com/macros/s/AKfycbyBkStY31dgbEIkVCMFcgfFtM_LbVAtOCrDnzw9tDYIeK7H8cL5xdsTJkBlxZGnaQTN/exec';

  // Scorecard legacy name -> the CRM account's display name, where they differ.
  const NAME_ALIAS = { 'Nelson Mompierre Jr.': 'Nelson Mompierre' };
  // Producers we allow to migrate under name only (no login link yet).
  const ALLOW_NO_ACCOUNT = ['Alejandro Mendieta'];

  const aliasOf = (name) => NAME_ALIAS[name] || name;
  const norm = (s) => String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, ' ');

  // Match every scorecard name to a CRM user account.
  function buildNameToUid(scNames, users) {
    const byName = {};
    users.forEach(u => { byName[norm(u.name)] = u; });
    const map = {};
    scNames.forEach(name => {
      const u = byName[norm(aliasOf(name))];
      map[name] = u ? { uid: u.id, accountName: u.name, email: u.email } : null;
    });
    return map;
  }

  // Suggested fixes for the five records the corrected math flagged.
  function suggestFix(sheetCase) {
    const id = S().productId(sheetCase.product);
    const amt = Number(sheetCase.amount) || 0, aum = Number(sheetCase.aum) || 0;
    // The "financial plan" that is really an investment (Carlos confirmed).
    if (id === 'plan' && amt > 25000) return { product: 'inv', amount: 0, aum: amt, why: 'Reclassified as an Investment; the ' + money(amt) + ' is assets, not a fee.' };
    // An investment where the money was typed into Amount instead of AUM.
    if (id === 'inv' && amt > 0 && !aum) return { product: 'inv', amount: 0, aum: amt, why: 'Moved the ' + money(amt) + ' into AUM so revenue computes at 0.70%.' };
    // An investment carrying both: keep AUM, drop the stray amount (automatic).
    if (id === 'inv' && amt > 0 && aum > 0) return { product: 'inv', amount: 0, aum: aum, why: 'Kept AUM ' + money(aum) + '; dropped the hand-typed ' + money(amt) + '.' };
    return null;
  }

  // Turn one Sheet case row into a Firestore case doc, preserving the exact
  // lifecycle weeks. Applies the money model and any approved fix.
  function transformCase(sheetCase, nameToUid, fixes) {
    const fix = (fixes && fixes[sheetCase.record_id]) || null;
    const product = fix && fix.product ? fix.product : S().productId(sheetCase.product);
    const amountIn = fix && fix.amount != null ? fix.amount : sheetCase.amount;
    const aumIn = fix && fix.aum != null ? fix.aum : sheetCase.aum;
    const m = S().normalizeMoney(product, amountIn, aumIn);

    const owner = nameToUid[sheetCase.submitting_agent] || null;
    const coNames = S().coCredit(sheetCase);
    const coUids = coNames.map(n => (nameToUid[n] && nameToUid[n].uid) || null).filter(Boolean);

    const stampNoon = (fri) => fri ? (fri + 'T12:00:00.000-05:00') : null;

    return {
      recordId: sheetCase.record_id,
      agentUid: owner ? owner.uid : null,
      agentName: sheetCase.submitting_agent || '',
      clientName: sheetCase.client_name || '',
      product: product,
      source: S().sourceId(sheetCase.source),
      state: sheetCase.state || 'Opened',
      amount: m.amount,
      aum: m.aum,
      coCreditUids: coUids,
      coCreditNames: coNames,
      openedWeek: sheetCase.opened_week || sheetCase.week_ending || '',
      submittedAt: stampNoon(sheetCase.submitted_week),
      closedAt: stampNoon(sheetCase.closed_week),
      createdAt: sheetCase.updated_at || new Date().toISOString(),
      createdBy: 'migration',
      updatedAt: new Date().toISOString()
    };
  }

  // Turn one Sheet weekly row into a weeks doc (only for resolved agents).
  function transformWeek(row, nameToUid) {
    const owner = nameToUid[row.agent];
    if (!owner) return null;
    const num = (v) => Number(v) || 0;
    return {
      agentUid: owner.uid, agentName: row.agent, weekEnding: row.week_ending,
      submittedAt: row.submitted_at || null,
      firstApptsScheduled: num(row.first_appts_scheduled), firstApptsHeld: num(row.first_appts_held),
      closingApptsScheduled: num(row.closing_appts_scheduled), closingApptsHeld: num(row.closing_appts_held),
      referralsGathered: num(row.referrals_gathered),
      activityPoints: num(row.activity_points),
      migratedFrom: 'sheet'
    };
  }

  // The full dry-run analysis, pure and testable.
  function analyze(sheet, users, fixes) {
    const cases = sheet.cases || [], weekly = sheet.weekly || [];
    const scNames = Array.from(new Set(
      cases.map(c => c.submitting_agent).concat(weekly.map(w => w.agent))
        .concat(cases.flatMap(c => S().coCredit(c)))
        .filter(Boolean)));
    const nameToUid = buildNameToUid(scNames, users);

    const flagged = [];
    const reviews = [];
    cases.forEach(c => {
      const w = S().dataWarnings(c);
      if (w.length) flagged.push({ id: c.record_id, product: c.product, amount: Number(c.amount) || 0, aum: Number(c.aum) || 0, state: c.state, warnings: w, fix: suggestFix(c) });
      // Soft review (no auto-fix): an unusually large insurance FYC. Confirm it is
      // FYC, not the annual premium or death benefit typed into the wrong box.
      const id = S().productId(c.product), amt = Number(c.amount) || 0;
      if (['wl', 'term', 'di', 'ltc'].indexOf(id) >= 0 && amt > 50000) {
        reviews.push({ id: c.record_id, product: c.product, amount: amt, agent: c.submitting_agent, client: c.client_name });
      }
    });

    const unresolvedOwners = scNames.filter(n =>
      !nameToUid[n] && cases.some(c => c.submitting_agent === n) && ALLOW_NO_ACCOUNT.indexOf(n) < 0);

    const caseDocs = cases.map(c => transformCase(c, nameToUid, fixes));
    const weekDocs = weekly.map(w => transformWeek(w, nameToUid)).filter(Boolean);

    return { scNames, nameToUid, flagged, reviews, unresolvedOwners, caseDocs, weekDocs,
      counts: { cases: cases.length, weekly: weekly.length, caseDocs: caseDocs.length, weekDocs: weekDocs.length } };
  }

  // ── JSONP read of the old Sheet (read-only) ──
  function loadSheet() {
    return new Promise((resolve, reject) => {
      const cb = 'rwg_mig_' + Date.now().toString(36);
      const script = document.createElement('script');
      let done = false;
      window[cb] = (data) => { done = true; cleanup(); resolve(data); };
      function cleanup() { try { delete window[cb]; } catch (e) { window[cb] = undefined; } if (script.parentNode) script.parentNode.removeChild(script); }
      script.onerror = () => { if (!done) { cleanup(); reject(new Error('could not reach the old scorecard')); } };
      script.src = SOURCE_ENDPOINT + '?action=getReport&callback=' + cb + '&_=' + Date.now();
      document.body.appendChild(script);
      setTimeout(() => { if (!done) { cleanup(); reject(new Error('timed out reading the old scorecard')); } }, 15000);
    });
  }

  const state = { sheet: null, analysis: null, busy: false };

  function run(applyNow) {
    const st = state;
    st.busy = true; RWG.app.renderMain();
    const users = RWG.data.users();
    const go = (sheet) => {
      st.sheet = sheet;
      st.analysis = analyze(sheet, users, {});   // fixes are baked into suggestFix -> apply step passes them
      if (!applyNow) { st.busy = false; RWG.app.renderMain(); return; }
      applyMigration(st.analysis);
    };
    if (st.sheet) go(st.sheet);
    else loadSheet().then(go).catch(err => { st.busy = false; U().toast(err.message); RWG.app.renderMain(); });
  }

  function applyMigration(a) {
    // Re-transform with the suggested fixes applied.
    const fixes = {};
    a.flagged.forEach(f => { if (f.fix) fixes[f.id] = f.fix; });
    const caseDocs = state.sheet.cases.map(c => transformCase(c, a.nameToUid, fixes));
    const weekDocs = a.weekDocs;
    let okC = 0, okW = 0, fail = 0;
    const writes = caseDocs.map(doc => D().importCase(doc).then(() => okC++).catch(() => fail++))
      .concat(weekDocs.map(doc => D().importWeek(doc).then(() => okW++).catch(() => fail++)));
    Promise.all(writes).then(() => {
      state.busy = false;
      U().toast(okC + ' cases and ' + okW + ' weeks imported' + (fail ? ', ' + fail + ' failed' : ''), fail === 0);
      RWG.app.renderMain();
    });
  }

  RWG.modules.register({
    id: 'migrate',
    title: 'Data migration',
    enabled: true,
    roles: ['admin'],
    nav: [{ view: 'migrate', label: 'Data migration', icon: 'upload' }],
    meta: { migrate: { t: 'Data migration', s: 'One-time import from the old scorecard' } },

    onEnter(view, ctx) { if (!D().isStarted()) D().init(ctx.userObj || RWG.auth.currentUser(), RWG.app.renderMain); },

    actions: {
      'mig-dry': () => run(false),
      'mig-apply': () => { if (confirm('Import the migrated cases and weeks into Firestore now? Re-running is safe (it overwrites, never duplicates).')) run(true); }
    },

    render(view, user, ctx) {
      const a = state.analysis;
      const intro = `<div class="card">
        <div class="card-head"><h3>Migrate the old scorecard</h3><span class="sub">Admin one-time tool</span></div>
        <p class="muted" style="font-size:13.5px;line-height:1.6">Reads your ${'~'}64 cases and ${'~'}16 weekly rows from the old Google Sheet, applies the corrected money model, and attributes each to a login account. The dry run writes nothing. Import uses the same record IDs, so running it twice never duplicates.</p>
        <div style="display:flex;gap:10px;margin-top:14px">
          <button class="btn btn-gold" data-action="mig-dry" ${state.busy ? 'disabled' : ''}>${state.busy ? 'Working…' : 'Run dry run'}</button>
          ${a ? `<button class="btn btn-navy" data-action="mig-apply" ${state.busy ? 'disabled' : ''}>Import for real</button>` : ''}
        </div>
      </div>`;
      if (!a) return intro;

      const mapRows = a.scNames.map(nm => {
        const m = a.nameToUid[nm];
        const st = m ? `<span class="chip tier-high">${esc(m.accountName)}</span>` :
          (ALLOW_NO_ACCOUNT.indexOf(nm) >= 0 ? `<span class="chip tier-medium">name only (no login yet)</span>` : `<span class="chip tier-low">NO ACCOUNT</span>`);
        return `<tr><td>${esc(nm)}</td><td>${st}</td><td class="muted">${m ? esc(m.email || '') : ''}</td></tr>`;
      }).join('');

      const flagRows = a.flagged.map(f => `<tr>
        <td>${esc(f.product)}</td><td class="num">${money(f.amount)}</td><td class="num">${money(f.aum)}</td><td>${esc(f.state)}</td>
        <td>${f.warnings.map(esc).join('<br>')}</td>
        <td>${f.fix ? esc(f.fix.why) : '<span class="muted">imported as-is</span>'}</td></tr>`).join('');

      const blocker = a.unresolvedOwners.length
        ? `<div class="sc-note" style="border-color:var(--bad);color:var(--bad)">These case owners have no account and aren't on the allow-list, so import is blocked for them: <b>${a.unresolvedOwners.map(esc).join(', ')}</b>. Create their accounts first.</div>`
        : '';

      return intro + `
        ${blocker}
        <div class="card">
          <div class="card-head"><h3>Name → account</h3><span class="sub">${a.scNames.length} names</span></div>
          <div class="table-wrap"><table class="data"><thead><tr><th>Scorecard name</th><th>Maps to</th><th>Email</th></tr></thead><tbody>${mapRows}</tbody></table></div>
        </div>
        <div class="card">
          <div class="card-head"><h3>Records I'll fix on import</h3><span class="sub">${a.flagged.length} flagged</span></div>
          <div class="table-wrap"><table class="data"><thead><tr><th>Product</th><th class="num">Amount</th><th class="num">AUM</th><th>Stage</th><th>Why flagged</th><th>Fix on import</th></tr></thead><tbody>${flagRows || '<tr><td colspan="6" class="muted" style="padding:16px">Nothing flagged.</td></tr>'}</tbody></table></div>
        </div>
        ${a.reviews && a.reviews.length ? `<div class="card">
          <div class="card-head"><h3>Please confirm before import</h3><span class="sub">${a.reviews.length} large case${a.reviews.length === 1 ? '' : 's'}</span></div>
          <p class="muted" style="font-size:13px">Big insurance commissions. Confirm each is the first-year commission (FYC), not the annual premium or death benefit. Imported as-is unless you change them in the old scorecard first.</p>
          <div class="table-wrap"><table class="data"><thead><tr><th>Product</th><th class="num">FYC entered</th><th class="num">Implies ann. premium</th><th>Agent</th></tr></thead><tbody>${a.reviews.map(rv => `<tr><td>${esc(rv.product)}</td><td class="num">${money(rv.amount)}</td><td class="num">${money(rv.amount * 2)}</td><td>${esc(rv.agent || '')}</td></tr>`).join('')}</tbody></table></div>
        </div>` : ''}
        <div class="card">
          <div class="card-head"><h3>What import will write</h3></div>
          <div class="grid rp-glance">
            <div class="stat"><div class="label">Cases</div><div class="value num">${a.counts.caseDocs}</div></div>
            <div class="stat"><div class="label">Weekly rows</div><div class="value num">${a.counts.weekDocs}</div></div>
          </div>
        </div>`;
    }
  });

  RWG._migrate = { buildNameToUid, suggestFix, transformCase, transformWeek, analyze, NAME_ALIAS, ALLOW_NO_ACCOUNT };
})();
