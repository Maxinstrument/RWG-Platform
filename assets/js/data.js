/* ============================================================
   RWG CRM — Data layer (Firestore-backed)
   Keeps an in-memory cache kept live by real-time listeners, so the
   rest of the app reads synchronously exactly as before. Writes go
   to Firestore per-document. This is the ONLY file (with auth.js)
   that knows where data lives.

   Collections:
     users/{uid}   profile (name,email,role,status,color,createdAt)
     leads/{id}    lead doc incl. activities[] and history[] arrays
     config/scoring  { value: {...scoring thresholds...} }
   ============================================================ */
window.RWG = window.RWG || {};
RWG.data = (function () {

  const STAGES = ['New', 'Attempting', 'Reached', 'Appointment Set', 'Appointment Kept', 'Opportunity Opened', 'No Opportunity'];
  const BOARD_STAGES = ['New', 'Attempting', 'Reached', 'Appointment Set', 'Appointment Kept'];
  const DISPOSITIONS = ['Left Voicemail', 'No Answer', 'Bad Number', 'Not Interested', 'Call Back', 'Reached (pitched)', 'Appointment Set', 'Unable to Reach'];
  const ACTIVITY_TYPES = ['Call', 'Text', 'Email', 'Voicemail', 'Other'];
  // What counts as an outreach attempt. 'Other' is deliberately excluded: the
  // CRM writes system notes (e.g. "Appointment scheduled for…") as Other, and a
  // system note is not an attempt to reach someone.
  const OUTREACH_TYPES = ['Call', 'Voicemail', 'Text', 'Email'];

  // Stages you can only arrive at by actually making contact. A lead sitting in
  // one of these with 0 attempts is self-contradictory, so the count is floored
  // at 1. Deliberately a FLOOR and not an increment: a logged call that results
  // in an appointment is one attempt, not two. 'No Opportunity' is excluded —
  // a bad number or an unreachable lead can land there without any contact.
  const CONTACTED_STAGES = ['Reached', 'Appointment Set', 'Appointment Kept', 'Opportunity Opened'];
  const floorAttempts = (l) => { if (CONTACTED_STAGES.indexOf(l.stage) >= 0 && (l.attempts || 0) < 1) l.attempts = 1; };
  const PLAN_TYPES = ['Pension Plan', 'Investment Plan', 'DROP', "Don't Know"];
  const ATTENDED_OPTS = ['Yes', 'No', 'Unknown'];
  const MEMBER_CLASSES = ['Regular', 'Special Risk'];
  const EDITABLE_FIELDS = [
    { key: 'phone', label: 'Phone Number', type: 'tel' },
    { key: 'email', label: 'Email', type: 'email' },
    { key: 'attended', label: 'Attended seminar', type: 'select', options: ATTENDED_OPTS },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'yos', label: 'Years of Service', type: 'number' },
    { key: 'planType', label: 'Plan Type', type: 'select', options: PLAN_TYPES },
    { key: 'memberClass', label: 'Member Class', type: 'select', options: MEMBER_CLASSES },
    { key: 'afc', label: 'AFC / Salary', type: 'number' },
    { key: 'employer', label: 'Employer', type: 'text' }
  ];
  const stageClass = {
    'New': 'stage-new', 'Attempting': 'stage-attempting', 'Reached': 'stage-reached',
    'Appointment Set': 'stage-appt-set', 'Appointment Kept': 'stage-appt-kept',
    'Opportunity Opened': 'stage-opportunity', 'No Opportunity': 'stage-no-opp'
  };
  const stageDotColor = {
    'New': '#5C6B7E', 'Attempting': '#B0691F', 'Reached': '#2E7D5B',
    'Appointment Set': '#C2A14D', 'Appointment Kept': '#0E2440'
  };

  const now = () => Date.now();
  let _seq = 0;
  const subId = (p) => p + '_' + Date.now().toString(36) + (++_seq);

  // ── live cache ──
  const cache = { users: [], leads: [], scoringConfig: {} };
  let onChange = () => {};
  let me = null;
  let unsubs = [];
  const db = () => RWG.fb.db;

  function init(profile, cb) {
    me = profile;
    onChange = cb || (() => {});
    teardown();

    // shared scoring config
    unsubs.push(db().collection('config').doc('scoring').onSnapshot(
      d => { cache.scoringConfig = (d.exists && d.data().value) || {}; onChange(); },
      e => console.error('scoring config listener:', e)));

    // users — admin sees the whole team; an agent only needs itself
    if (profile.role === 'admin') {
      unsubs.push(db().collection('users').onSnapshot(
        s => { cache.users = s.docs.map(d => Object.assign({ id: d.id }, d.data())); onChange(); },
        e => console.error('users listener:', e)));
    } else {
      cache.users = [profile];
    }

    // leads — admin sees all; an agent sees only the leads assigned to them
    let q = db().collection('leads');
    if (profile.role !== 'admin') q = q.where('assignedTo', '==', profile.id);
    unsubs.push(q.onSnapshot(
      s => { cache.leads = s.docs.map(d => Object.assign({ id: d.id }, d.data())); onChange(); },
      e => console.error('leads listener:', e)));
  }
  function teardown() { unsubs.forEach(u => { try { u(); } catch (e) {} }); unsubs = []; cache.users = []; cache.leads = []; }

  // ── derived / helpers ──
  function withScore(lead) { return Object.assign({}, lead, { _score: RWG.scoring.scoreLead(lead, cache.scoringConfig) }); }
  const fullName = (l) => `${l.firstName || ''} ${l.lastName || ''}`.trim();
  const findLead = (id) => cache.leads.find(l => l.id === id);

  // ── duplicate matching (returning seminar attendees) ──
  const digits = (s) => String(s == null ? '' : s).replace(/\D/g, '');
  const phoneKey = (p) => { const d = digits(p); return d.length >= 10 ? d.slice(-10) : (d.length >= 7 ? d : ''); };
  const emailKey = (e) => { const s = String(e == null ? '' : e).trim().toLowerCase(); return /.+@.+\..+/.test(s) ? s : ''; };
  const DEAD_STAGES = ['No Opportunity'];                          // re-opened when a returning lead reappears
  const CONVERTED_STAGES = ['Appointment Kept', 'Opportunity Opened']; // already won — left exactly as-is
  const stripLead = (l) => { const p = Object.assign({}, l); delete p._score; delete p.id; return p; };
  function buildLeadIndex() {
    const byPhone = {}, byEmail = {};
    cache.leads.forEach(l => { const pk = phoneKey(l.phone); if (pk && !byPhone[pk]) byPhone[pk] = l; const ek = emailKey(l.email); if (ek && !byEmail[ek]) byEmail[ek] = l; });
    return { byPhone, byEmail };
  }
  function fillBlanks(l, r) {   // enrich an existing record from an import row — never overwrites real data
    ['firstName', 'lastName', 'email', 'phone', 'employer', 'planType', 'memberClass'].forEach(k => {
      if ((l[k] == null || l[k] === '') && r[k] != null && r[k] !== '') l[k] = r[k];
    });
    ['age', 'yos', 'afc'].forEach(k => { if (l[k] == null && r[k] != null && r[k] !== '') l[k] = Number(r[k]); });
  }

  function saveLead(l) {
    const payload = Object.assign({}, l); delete payload._score; delete payload.id;
    return db().collection('leads').doc(l.id).set(payload).catch(e => console.error('save lead:', e));
  }
  function logChange(lead, by, changes, note) {
    if ((!changes || !changes.length) && !note) return;
    lead.history = lead.history || [];
    lead.history.push({ id: subId('h'), by: by || null, at: now(), changes: changes || [], note: note || null });
  }

  return {
    STAGES, BOARD_STAGES, DISPOSITIONS, ACTIVITY_TYPES, PLAN_TYPES,
    ATTENDED_OPTS, MEMBER_CLASSES, EDITABLE_FIELDS,
    stageClass, stageDotColor, fullName, withScore,
    init, teardown,

    // ── users ──
    users: () => cache.users.slice(),
    agents: () => cache.users.filter(u => u.role === 'agent' && u.status === 'active'),
    pendingUsers: () => cache.users.filter(u => u.status === 'pending'),
    removedUsers: () => cache.users.filter(u => u.status === 'removed' || u.status === 'denied'),
    user: (id) => cache.users.find(u => u.id === id),
    userByEmail: (email) => cache.users.find(u => (u.email || '').toLowerCase() === String(email).toLowerCase()),
    approveUser(id) { db().collection('users').doc(id).update({ status: 'active' }).catch(e => console.error('approve:', e)); },
    denyUser(id) { db().collection('users').doc(id).update({ status: 'denied' }).catch(e => console.error('deny:', e)); },
    setUserRole(id, role) {
      const u = cache.users.find(x => x.id === id); if (u) { u.role = role; onChange(); }
      db().collection('users').doc(id).update({ role: role }).catch(e => console.error('set role:', e));
    },
    removeUser(id) {   // revoke access AND release their leads to the unassigned pool (not returned on restore)
      const u = cache.users.find(x => x.id === id);
      const name = (u && u.name) || 'a teammate';
      if (u) u.status = 'removed';
      const by = (me && me.id) || null;
      const mine = cache.leads.filter(l => l.assignedTo === id);
      const ops = [];
      mine.forEach(l => {
        l.assignedTo = null;
        l.formerOwner = id; l.formerOwnerName = name;   // breadcrumb: who this pooled lead used to belong to
        logChange(l, by, [{ label: 'Owner', from: name, to: 'Unassigned' }], name + ' was removed from the team — lead returned to the unassigned pool');
        ops.push({ ref: db().collection('leads').doc(l.id), data: stripLead(l) });
      });
      onChange();
      db().collection('users').doc(id).update({ status: 'removed' }).catch(e => console.error('remove user:', e));
      const chunks = [];   // release the leads (chunked — a Firestore batch caps at 500)
      for (let i = 0; i < ops.length; i += 450) chunks.push(ops.slice(i, i + 450));
      chunks.reduce((p, ch) => p.then(() => { const b = db().batch(); ch.forEach(o => b.set(o.ref, o.data)); return b.commit(); }), Promise.resolve())
        .catch(e => console.error('release leads:', e));
      return mine.length;   // so the UI can report how many were freed
    },
    setUserName(id, name) {
      const u = cache.users.find(x => x.id === id); if (u) { u.name = name; onChange(); }
      db().collection('users').doc(id).update({ name: name }).catch(e => console.error('rename:', e));
    },

    // ── reads ──
    leads: () => cache.leads.map(withScore),
    leadsRaw: () => cache.leads.slice(),
    leadsFor: (agentId) => cache.leads.filter(l => l.assignedTo === agentId).map(withScore),
    unassigned: () => cache.leads.filter(l => !l.assignedTo).map(withScore),
    lead: (id) => { const l = findLead(id); return l ? withScore(l) : null; },

    // ── scoring config ──
    scoringConfig: () => Object.assign({}, RWG.scoring.defaultConfig, cache.scoringConfig),
    setScoringConfig(cfg) {
      cache.scoringConfig = cfg; onChange();
      db().collection('config').doc('scoring').set({ value: cfg }).catch(e => console.error('scoring save:', e));
    },

    // ── lead writes ──
    addActivity(leadId, act) {
      const l = findLead(leadId); if (!l) return;
      act.id = subId('a'); act.at = act.at || now();
      l.activities = l.activities || [];
      l.activities.push(act);
      // Any real outreach counts as an attempt (call, voicemail, text, email).
      // Only a call or voicemail clears a pending callback task, though — an
      // emailed reply doesn't mean the scheduled call-back has been serviced.
      if (OUTREACH_TYPES.indexOf(act.type) >= 0) l.attempts = (l.attempts || 0) + 1;
      if (act.type === 'Call' || act.type === 'Voicemail') { if (l.callbackAt) l.callbackAt = null; }
      if (act.disposition) l.disposition = act.disposition;
      if (act.reached && (l.stage === 'New' || l.stage === 'Attempting')) l.stage = 'Reached';
      else if (l.stage === 'New' && act.type === 'Call') l.stage = 'Attempting';
      floorAttempts(l);
      onChange(); saveLead(l);
      return withScore(l);
    },

    // Maintenance (admin): bring `attempts` in line with the outreach actually
    // logged. Idempotent, and it never LOWERS a count — leads imported with a
    // vendor "Number of Attempts" carry dials that have no matching activity
    // record, and those really happened, so they must survive the recount.
    // Returns {changed, applied}. Dry run unless you pass {apply:true}.
    recountAttempts(opts) {
      const changed = [];
      cache.leads.forEach(l => {
        const logged = (l.activities || []).filter(a => OUTREACH_TYPES.indexOf(a.type) >= 0).length;
        const cur = l.attempts || 0;
        let next = Math.max(cur, logged);
        if (CONTACTED_STAGES.indexOf(l.stage) >= 0 && next < 1) next = 1;   // booked/reached implies contact
        if (next !== cur) changed.push({ id: l.id, name: fullName(l), from: cur, to: next });
      });
      if (!(opts && opts.apply)) return Promise.resolve({ changed: changed, applied: false });
      const CHUNK = 400;                    // stay well under Firestore's 500-write batch cap
      const jobs = [];
      for (let i = 0; i < changed.length; i += CHUNK) {
        const batch = db().batch();
        changed.slice(i, i + CHUNK).forEach(c => {
          const l = findLead(c.id); if (l) l.attempts = c.to;             // optimistic local
          batch.update(db().collection('leads').doc(c.id), { attempts: c.to });
        });
        jobs.push(batch.commit());
      }
      onChange();
      return Promise.all(jobs).then(() => ({ changed: changed, applied: true }));
    },

    setStage(leadId, stage, extra, by) {
      const l = findLead(leadId); if (!l) return;
      const old = l.stage;
      l.stage = stage;
      const changes = (old !== stage) ? [{ label: 'Stage', from: old, to: stage }] : [];
      let note = null;
      if (extra && extra.apptDate) { l.apptDate = extra.apptDate; note = 'Appointment ' + (old === 'Appointment Set' ? 'rescheduled' : 'set') + ' for ' + new Date(extra.apptDate).toLocaleString('en-US'); }
      if (extra && extra.outcome) l.outcome = extra.outcome;
      if (stage === 'Appointment Set') l.disposition = 'Appointment Set';
      floorAttempts(l);        // booking (or dragging a card to Reached/Appt) implies contact happened
      logChange(l, by, changes, note);
      onChange(); saveLead(l);
      return withScore(l);
    },

    // Schedule a future callback task (shows in the agent's Today queue when due)
    scheduleCallback(leadId, ts, note, by) {
      const l = findLead(leadId); if (!l) return;
      l.callbackAt = ts;
      l.disposition = 'Call Back';
      l.attempts = (l.attempts || 0) + 1;
      if (l.stage === 'New' || l.stage === 'Attempting') l.stage = 'Reached';
      l.activities = l.activities || [];
      l.activities.push({ id: subId('a'), at: now(), type: 'Call', disposition: 'Call Back', reached: true, by: by || null,
        note: 'Callback scheduled for ' + new Date(ts).toLocaleString('en-US') + (note ? ' — ' + note : '') });
      onChange(); saveLead(l);
      return withScore(l);
    },

    assignLead(leadId, agentId, by) {
      const l = findLead(leadId); if (!l) return;
      const newId = agentId || null;
      if ((l.assignedTo || null) === newId) return;
      const nameOf = (id) => id ? ((cache.users.find(u => u.id === id) || {}).name || '—') : 'Unassigned';
      const fromName = nameOf(l.assignedTo), toName = nameOf(newId);
      l.assignedTo = newId;
      logChange(l, by, [{ label: 'Owner', from: fromName, to: toName }]);
      onChange(); saveLead(l);
    },

    deleteLead(id, by) {   // admin only (enforced by security rules) — archived before removal
      const l = findLead(id);
      const i = cache.leads.findIndex(x => x.id === id);
      if (i >= 0) { cache.leads.splice(i, 1); onChange(); }   // hide from the CRM immediately
      const actor = by || (me && me.id) || null;
      const actorName = (cache.users.find(u => u.id === actor) || me || {}).name || null;
      if (!l) return db().collection('leads').doc(id).delete().catch(e => console.error('delete lead:', e));
      const snapshot = Object.assign({}, l); delete snapshot._score;
      const ownerName = l.assignedTo ? ((cache.users.find(u => u.id === l.assignedTo) || {}).name || null) : null;
      const archive = {
        lead: snapshot, originalId: id,
        name: fullName(l) || '(no name)',
        stageAtDeletion: l.stage || null,
        ownerAtDeletion: ownerName,
        deletedAt: now(), deletedBy: actor, deletedByName: actorName
      };
      const batch = db().batch();
      batch.set(db().collection('deleted_leads').doc(id), archive);   // keep a behind-the-scenes copy
      batch.delete(db().collection('leads').doc(id));
      return batch.commit().catch(e => console.error('archive+delete lead:', e));
    },

    // ── deletion archive (admin only) ──
    fetchDeletedLeads() {   // one-time read; the archive is not part of the live cache
      return db().collection('deleted_leads').get().then(s => {
        const rows = s.docs.map(d => Object.assign({ id: d.id }, d.data()));
        rows.sort((a, b) => (b.deletedAt || 0) - (a.deletedAt || 0));
        return rows;
      });
    },
    restoreLead(id, by) {   // move a record back from the archive into live leads
      const ref = db().collection('deleted_leads').doc(id);
      return ref.get().then(d => {
        if (!d.exists) throw new Error('Already restored or not found.');
        const lead = Object.assign({}, (d.data() || {}).lead || {});
        delete lead._score; delete lead.id;
        lead.history = lead.history || [];
        lead.history.push({ id: subId('h'), by: by || (me && me.id) || null, at: now(), changes: [], note: 'Lead restored from the deletion archive' });
        const batch = db().batch();
        batch.set(db().collection('leads').doc(id), lead);   // reappears via the live listener
        batch.delete(ref);
        return batch.commit();
      });
    },
    purgeDeletedLead(id) {   // permanently erase a record from the archive too (no undo)
      return db().collection('deleted_leads').doc(id).delete();
    },

    // ── weekly report snapshots (admin only) ──
    getReport(weekId) {
      return db().collection('reports').doc(weekId).get()
        .then(d => d.exists ? Object.assign({ id: d.id }, d.data()) : null);
    },
    saveReport(weekId, data) {   // freeze a completed week, immutable thereafter
      const payload = Object.assign({}, data);
      delete payload._status;
      payload.weekId = weekId;
      payload.finalizedAt = now();
      payload.finalizedBy = (me && me.id) || null;
      return db().collection('reports').doc(weekId).set(payload);
    },

    addLeads(rows, listName, assignTo) {
      const batch = db().batch();
      rows.forEach(r => {
        const ref = db().collection('leads').doc();
        batch.set(ref, Object.assign({
          attempts: 0, notes: '', stage: 'New', disposition: '',
          apptDate: null, outcome: null, activities: [], history: [], createdAt: now(),
          listName: listName || 'Imported list', assignedTo: assignTo || null,
          attended: 'Unknown', memberClass: 'Regular'
        }, r));
      });
      batch.commit().catch(e => console.error('import:', e));
    },

    // Match an upload against existing leads (phone OR email). One entry per row — used by the import preview.
    //   returning = matches a lead already in the database
    //   duplicate = matches an earlier row in this same file (will be merged, not duplicated)
    //   new       = a genuinely new person
    classifyImport(rows) {
      const idx = buildLeadIndex();
      const seenP = {}, seenE = {};
      return (rows || []).map(r => {
        const pk = phoneKey(r.phone), ek = emailKey(r.email);
        const match = (pk && idx.byPhone[pk]) || (ek && idx.byEmail[ek]) || null;
        const dupInFile = !match && !!((pk && seenP[pk]) || (ek && seenE[ek]));
        if (pk) seenP[pk] = true; if (ek) seenE[ek] = true;
        return { status: match ? 'returning' : (dupInFile ? 'duplicate' : 'new'), match: match || null, dupInFile };
      });
    },

    // Smart import: de-duplicate on phone/email, enrich + flag returning attendees, re-open
    // dead ones, and reassign returning leads to the new list's agent. Returns a summary.
    addLeadsSmart(rows, listName, assignTo, by) {
      const idx = buildLeadIndex();                 // existing DB leads only
      const runP = {}, runE = {};                   // people already handled in THIS import
      const summary = { created: 0, returning: 0, reopened: 0, reassigned: 0, duplicates: 0 };
      const stamp = now();
      const list = listName || 'Imported list';
      const nameOf = (id) => id ? ((cache.users.find(u => u.id === id) || {}).name || '—') : 'Unassigned';
      const ops = [];
      const register = (pk, ek, lead) => { if (pk) runP[pk] = lead; if (ek) runE[ek] = lead; };
      (rows || []).forEach(r => {
        const pk = phoneKey(r.phone), ek = emailKey(r.email);

        // duplicate row within this same file → fold into the record we already touched, no double-count
        const already = (pk && runP[pk]) || (ek && runE[ek]) || null;
        if (already) {
          summary.duplicates++;
          fillBlanks(already, r);
          register(pk, ek, already);
          ops.push({ ref: db().collection('leads').doc(already.id), data: stripLead(already) });
          return;
        }

        let l = (pk && idx.byPhone[pk]) || (ek && idx.byEmail[ek]) || null;
        if (l) {
          // ── RETURNING: keep the one record, enrich + flag it ──
          summary.returning++;
          l.seminarCount = (l.seminarCount || 1) + 1;
          l.returning = true;
          l.appearances = l.appearances || [];
          l.appearances.push({ at: stamp, listName: list, by: by || null });
          if (String(r.attended || '').toLowerCase() !== 'no') l.attended = 'Yes';
          fillBlanks(l, r);
          const notes = [];
          const converted = CONVERTED_STAGES.includes(l.stage);
          if (!converted && assignTo && l.assignedTo !== assignTo) {
            notes.push('reassigned ' + nameOf(l.assignedTo) + ' → ' + nameOf(assignTo));
            l.assignedTo = assignTo; summary.reassigned++;
          }
          if (!converted && DEAD_STAGES.includes(l.stage)) {
            l.stage = 'New'; l.disposition = ''; summary.reopened++;
            notes.push('pipeline re-opened for another attempt');
          }
          logChange(l, by, [], '🔁 Returning attendee — reappeared on "' + list + '" (now ' + l.seminarCount + ' seminars)'
            + (converted ? ' · already converted, left as-is' : '') + (notes.length ? ' · ' + notes.join(' · ') : ''));
          register(pk, ek, l);
          ops.push({ ref: db().collection('leads').doc(l.id), data: stripLead(l) });
        } else {
          // ── NEW ──
          summary.created++;
          const ref = db().collection('leads').doc();
          const lead = Object.assign({
            id: ref.id, firstName: '', lastName: '', email: '', phone: '',
            attempts: 0, notes: '', stage: 'New', disposition: '', apptDate: null, outcome: null,
            activities: [], history: [], createdAt: stamp, listName: list, assignedTo: assignTo || null,
            attended: 'Unknown', memberClass: 'Regular',
            seminarCount: 1, returning: false, appearances: [{ at: stamp, listName: list, by: by || null }]
          }, r);
          ['age', 'yos', 'afc'].forEach(k => { lead[k] = (lead[k] === '' || lead[k] == null) ? null : Number(lead[k]); });
          cache.leads.push(lead);
          register(pk, ek, lead);
          ops.push({ ref: ref, data: stripLead(lead) });
        }
      });
      onChange();
      // commit in chunks (a Firestore batch tops out at 500 writes)
      const chunks = [];
      for (let i = 0; i < ops.length; i += 450) chunks.push(ops.slice(i, i + 450));
      return chunks.reduce((p, ch) => p.then(() => { const b = db().batch(); ch.forEach(o => b.set(o.ref, o.data)); return b.commit(); }), Promise.resolve())
        .then(() => summary).catch(e => { console.error('smart import:', e); return summary; });
    },

    addLead(fields, by) {
      const ref = db().collection('leads').doc();
      const lead = Object.assign({
        id: ref.id, firstName: '', lastName: '', email: '', phone: '',
        attempts: 0, notes: '', stage: 'New', disposition: '', apptDate: null, outcome: null,
        activities: [], history: [], createdAt: now(),
        listName: 'Manual entry', source: 'Manual', attended: 'No', memberClass: 'Regular', assignedTo: null
      }, fields);
      ['age', 'yos', 'afc'].forEach(k => { lead[k] = (lead[k] === '' || lead[k] == null) ? null : Number(lead[k]); });
      logChange(lead, by, [], 'Lead added manually' + (lead.source ? ' · source: ' + lead.source : ''));
      cache.leads.push(lead); onChange();
      saveLead(lead);
      return withScore(lead);
    },

    updateLeadFields(leadId, updates, by) {
      const l = findLead(leadId);
      if (!l) return { changes: [] };
      const norm = (v) => (v == null ? '' : String(v).trim());
      const changes = [];
      EDITABLE_FIELDS.forEach(f => {
        if (!(f.key in updates)) return;
        let nv = updates[f.key];
        if (f.type === 'number') { nv = (nv === '' || nv == null) ? null : Number(nv); if (Number.isNaN(nv)) nv = null; }
        else nv = (nv == null) ? '' : String(nv).trim();
        if (norm(l[f.key]) !== norm(nv)) {
          changes.push({ field: f.key, label: f.label, from: (l[f.key] === '' || l[f.key] == null) ? null : l[f.key], to: (nv === '' || nv == null) ? null : nv });
          l[f.key] = nv;
        }
      });
      if (changes.length) { logChange(l, by, changes); onChange(); saveLead(l); }
      return { lead: withScore(l), changes };
    }
  };
})();
