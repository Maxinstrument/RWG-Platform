/* ============================================================
   RWG Platform — Scorecard data layer (Firestore-backed)

   Same shape as data.js: an in-memory cache kept live by real-time
   listeners, optimistic local writes, then async persist. This is the
   only file that knows where scorecard data lives.

   Collections (all NEW — they do not exist in the live CRM, so nothing
   here can affect leads/users/reports):
     cases/{recordId}          one opportunity. Team-readable.
     weeks/{agentUid_weekEnding} one agent's weekly submission.
     config/agents             legacy-name -> account map + goals.

   Dormant until a module calls init(). The kernel does not auto-start
   it, so the platform runs fine before the Firestore rules are published.

   Money and lifecycle rules live in scorecard-config.js (RWG.scorecard).
   This file only reads/writes; it never invents a money rule.
   ============================================================ */
window.RWG = window.RWG || {};

RWG.scorecardData = (function () {
  const S = () => RWG.scorecard;
  const db = () => RWG.fb && RWG.fb.db;
  const nowISO = () => new Date().toISOString();

  let _seq = 0;
  const newRecordId = () =>
    (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
      : 'case_' + Date.now().toString(36) + (++_seq);

  const CASE_FIELDS = ['recordId', 'agentUid', 'agentName', 'clientName', 'product', 'source',
    'state', 'amount', 'aum', 'coCreditUids', 'coCreditNames',
    'openedWeek', 'submittedAt', 'closedAt', 'createdAt', 'createdBy', 'updatedAt'];

  const cache = { cases: [], weeks: [], agents: {} };
  let onChange = () => {};
  let me = null;
  let unsubs = [];
  let started = false;

  function init(profile, cb) {
    me = profile;
    onChange = cb || (() => {});
    if (!db()) { console.warn('scorecardData.init: Firebase not ready'); return; }
    teardown();
    started = true;

    // Cases: the whole team (client names visible to all, per the current model).
    unsubs.push(db().collection('cases').onSnapshot(
      s => { cache.cases = s.docs.map(d => Object.assign({ recordId: d.id }, d.data())); onChange(); },
      e => console.error('cases listener:', e && e.message)));

    // Weekly submissions: aggregate production, team-readable.
    unsubs.push(db().collection('weeks').onSnapshot(
      s => { cache.weeks = s.docs.map(d => Object.assign({ id: d.id }, d.data())); onChange(); },
      e => console.error('weeks listener:', e && e.message)));

    // Legacy-name -> account map + per-agent goals.
    unsubs.push(db().collection('config').doc('agents').onSnapshot(
      d => { cache.agents = (d.exists && d.data()) || {}; onChange(); },
      e => console.error('agents config listener:', e && e.message)));
  }
  function teardown() {
    unsubs.forEach(u => { try { u(); } catch (e) {} });
    unsubs = []; started = false;
    cache.cases = []; cache.weeks = [];
  }
  const isStarted = () => started;

  // ── reads (synchronous, from the live cache) ──
  const cases = () => cache.cases.slice();
  const withMoney = (c) => Object.assign({}, c, S().derive(c.product, c.amount, c.aum), S().deriveWeeks(c));
  const casesWithMoney = () => cache.cases.map(withMoney);
  function casesForAgent(uid) {
    return cache.cases.filter(c => c.agentUid === uid || (c.coCreditUids || []).indexOf(uid) >= 0);
  }
  const caseById = (id) => cache.cases.find(c => c.recordId === id) || null;

  const weekId = (uid, weekEnding) => uid + '_' + weekEnding;
  const weeks = () => cache.weeks.slice();
  const weekFor = (uid, weekEnding) => cache.weeks.find(w => w.id === weekId(uid, weekEnding)) || null;
  const weeksForWeek = (weekEnding) => cache.weeks.filter(w => w.weekEnding === weekEnding);

  const agentsConfig = () => Object.assign({}, cache.agents);
  const agentConfig = (uid) => cache.agents[uid] || null;

  // ── case writes ──
  // Build the stored row. openedWeek is immutable; submittedAt/closedAt are
  // write-once (only ever added, never cleared) so each week's history is
  // permanent and the Firestore rules accept the update. Admin corrections
  // that need to move a stamp go through adminSetStamps().
  function buildCase(input, existing) {
    existing = existing || {};
    const state = input.state || existing.state || 'Opened';
    const product = input.product != null ? input.product : (existing.product || '');
    const amountIn = input.amount != null ? input.amount : existing.amount;
    const aumIn = input.aum != null ? input.aum : existing.aum;
    const m = S().normalizeMoney(product, amountIn, aumIn);   // form can never set both fields

    const openedWeek = existing.openedWeek || input.openedWeek || S().currentWeekEnding();
    let submittedAt = existing.submittedAt || null;
    let closedAt = existing.closedAt || null;
    if (!submittedAt && (state === 'Submitted' || state === 'Closed')) submittedAt = nowISO();
    if (!closedAt && state === 'Closed') closedAt = nowISO();

    return {
      recordId: existing.recordId || input.recordId || newRecordId(),
      agentUid: existing.agentUid || input.agentUid || null,
      agentName: input.agentName != null ? input.agentName : (existing.agentName || ''),
      clientName: input.clientName != null ? input.clientName : (existing.clientName || ''),
      product: product,
      source: input.source != null ? input.source : (existing.source || ''),
      state: state,
      amount: m.amount,
      aum: m.aum,
      coCreditUids: input.coCreditUids || existing.coCreditUids || [],
      coCreditNames: input.coCreditNames || existing.coCreditNames || [],
      openedWeek: openedWeek,
      submittedAt: submittedAt,
      closedAt: closedAt,
      createdAt: existing.createdAt || nowISO(),
      createdBy: existing.createdBy || input.createdBy || (me && me.id) || null,
      updatedAt: nowISO()
    };
  }

  function saveCase(input) {
    const existing = input.recordId ? caseById(input.recordId) : null;
    const row = buildCase(input, existing);
    if (!row.agentUid) return Promise.reject(new Error('a case needs an agentUid'));
    // optimistic local update
    const i = cache.cases.findIndex(c => c.recordId === row.recordId);
    if (i >= 0) cache.cases[i] = row; else cache.cases.push(row);
    onChange();
    return db().collection('cases').doc(row.recordId).set(row)
      .catch(e => { console.error('save case:', e && e.message); throw e; });
  }

  // Advance/change a case's state, stamping the lifecycle as needed.
  function setCaseState(recordId, state) {
    const existing = caseById(recordId);
    if (!existing) return Promise.reject(new Error('case not found: ' + recordId));
    return saveCase(Object.assign({}, existing, { state: state }));
  }

  function deleteCase(recordId) {
    cache.cases = cache.cases.filter(c => c.recordId !== recordId);
    onChange();
    return db().collection('cases').doc(recordId).delete()
      .catch(e => { console.error('delete case:', e && e.message); throw e; });
  }

  // Admin-only: correct which week each milestone lands in (the old "Correct the
  // weeks" tool). Writes the stamps directly at noon Eastern of each Friday so
  // deriveWeeks() reproduces them. Firestore rules allow admins to move stamps.
  function adminSetStamps(recordId, weeksObj) {
    const existing = caseById(recordId);
    if (!existing) return Promise.reject(new Error('case not found'));
    const toStamp = (fri) => fri ? (fri + 'T12:00:00.000-05:00') : null;
    const row = Object.assign({}, existing, { updatedAt: nowISO() });
    if (weeksObj.openedWeek != null) row.openedWeek = weeksObj.openedWeek;
    if (weeksObj.submittedWeek != null) row.submittedAt = toStamp(weeksObj.submittedWeek);
    if (weeksObj.closedWeek != null) row.closedAt = toStamp(weeksObj.closedWeek);
    // state follows the furthest stamp that still exists
    row.state = row.closedAt ? 'Closed' : (row.submittedAt ? 'Submitted' : 'Opened');
    const i = cache.cases.findIndex(c => c.recordId === recordId);
    if (i >= 0) cache.cases[i] = row;
    onChange();
    return db().collection('cases').doc(recordId).set(row)
      .catch(e => { console.error('admin set stamps:', e && e.message); throw e; });
  }

  // ── weekly submission writes ──
  // Upsert one doc per agent per week (deterministic id = idempotent).
  function saveWeek(doc) {
    if (!doc.agentUid || !doc.weekEnding) return Promise.reject(new Error('a week needs agentUid and weekEnding'));
    const id = weekId(doc.agentUid, doc.weekEnding);
    const row = Object.assign({}, doc, { id: id, updatedAt: nowISO() });
    const i = cache.weeks.findIndex(w => w.id === id);
    if (i >= 0) cache.weeks[i] = row; else cache.weeks.push(row);
    onChange();
    const payload = Object.assign({}, row); delete payload.id;
    return db().collection('weeks').doc(id).set(payload)
      .catch(e => { console.error('save week:', e && e.message); throw e; });
  }

  // Save the daily tally (and its rolled-up activity totals) WITHOUT stamping
  // the week submitted. merge:true means logging a day never wipes a previously
  // submitted week's other fields, and re-editing a day is idempotent. The
  // scorecard writes here on every daily cell change; saveWeek() finalises.
  function saveDaily(partial) {
    if (!partial.agentUid || !partial.weekEnding) return Promise.reject(new Error('daily needs agentUid and weekEnding'));
    const id = weekId(partial.agentUid, partial.weekEnding);
    const existing = cache.weeks.find(w => w.id === id) || {};
    const row = Object.assign({}, existing, partial, { id: id, updatedAt: nowISO() });
    const i = cache.weeks.findIndex(w => w.id === id);
    if (i >= 0) cache.weeks[i] = row; else cache.weeks.push(row);
    onChange();
    const payload = Object.assign({}, row); delete payload.id;
    return db().collection('weeks').doc(id).set(payload, { merge: true })
      .catch(e => { console.error('save daily:', e && e.message); throw e; });
  }

  // ── migration import (admin): write a fully-formed doc verbatim ──
  // Unlike saveCase, this preserves the exact lifecycle stamps carried over from
  // the old Sheet (it does not re-derive them from state). Idempotent: same
  // recordId overwrites, never duplicates.
  function importCase(doc) {
    if (!doc.recordId) return Promise.reject(new Error('import needs a recordId'));
    const i = cache.cases.findIndex(c => c.recordId === doc.recordId);
    if (i >= 0) cache.cases[i] = doc; else cache.cases.push(doc);
    onChange();
    return db().collection('cases').doc(doc.recordId).set(doc)
      .catch(e => { console.error('import case:', e && e.message); throw e; });
  }
  function importWeek(doc) {
    if (!doc.agentUid || !doc.weekEnding) return Promise.reject(new Error('import week needs agentUid + weekEnding'));
    const id = weekId(doc.agentUid, doc.weekEnding);
    const row = Object.assign({ id: id }, doc);
    const i = cache.weeks.findIndex(w => w.id === id);
    if (i >= 0) cache.weeks[i] = row; else cache.weeks.push(row);
    onChange();
    const payload = Object.assign({}, doc);
    return db().collection('weeks').doc(id).set(payload)
      .catch(e => { console.error('import week:', e && e.message); throw e; });
  }

  // ── config/agents (admin: migration + settings) ──
  function saveAgentsConfig(map) {
    cache.agents = Object.assign({}, map);
    onChange();
    return db().collection('config').doc('agents').set(map)
      .catch(e => { console.error('save agents config:', e && e.message); throw e; });
  }

  return {
    init, teardown, isStarted,
    cases, casesWithMoney, casesForAgent, caseById, withMoney,
    weeks, weekFor, weeksForWeek, weekId,
    agentsConfig, agentConfig,
    buildCase, saveCase, setCaseState, deleteCase, adminSetStamps,
    saveWeek, saveDaily, saveAgentsConfig, importCase, importWeek,
    CASE_FIELDS, _cache: cache
  };
})();
