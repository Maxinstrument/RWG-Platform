/* ============================================================
   RWG CRM — Analytics (funnel, weekly activity, goal, leaderboard)
   ============================================================ */
window.RWG = window.RWG || {};
RWG.analytics = (function () {

  const STAGE_RANK = {
    'New': 0, 'Attempting': 1, 'Reached': 2, 'Appointment Set': 3,
    'Appointment Kept': 4, 'No Opportunity': 4, 'Opportunity Opened': 5
  };

  const APPT_GOAL_MIN = 10, APPT_GOAL_MAX = 15;

  function weekRange() {
    const now = new Date();
    const diffToMon = (now.getDay() + 6) % 7;     // days since Monday
    const start = new Date(now);
    start.setDate(now.getDate() - diffToMon);
    start.setHours(0, 0, 0, 0);
    return { start: start.getTime(), end: Date.now() };
  }

  function allActivities(leads) {
    const out = [];
    leads.forEach(l => (l.activities || []).forEach(a => out.push(Object.assign({ leadId: l.id, lead: l }, a))));
    return out;
  }
  const inRange = (a, r) => a.at >= r.start && a.at <= r.end;

  // Volume metrics over a time range (default: this week)
  function activityStats(leads, range, agentId) {
    const r = range || weekRange();
    let acts = allActivities(leads).filter(a => inRange(a, r));
    if (agentId) acts = acts.filter(a => a.by === agentId);
    const dials = acts.filter(a => a.type === 'Call' || a.type === 'Voicemail').length;
    const reaches = acts.filter(a => a.reached).length;
    const apptSet = acts.filter(a => a.disposition === 'Appointment Set').length;
    return { dials, reaches, apptSet, texts: acts.filter(a => a.type === 'Text').length, emails: acts.filter(a => a.type === 'Email').length, total: acts.length };
  }

  // Cumulative pipeline funnel for a set of leads
  function funnel(leads) {
    const rank = (l) => STAGE_RANK[l.stage] ?? 0;
    const n = leads.length;
    const atLeast = (k) => leads.filter(l => rank(l) >= k).length;
    return [
      { label: 'Assigned leads', count: n, color: '#5C6B7E' },
      { label: 'Contacted', count: atLeast(1), color: '#7C6A9C' },
      { label: 'Reached (pitched)', count: atLeast(2), color: '#B0691F' },
      { label: 'Appointment Set', count: atLeast(3), color: '#2E7D5B' },
      { label: 'Appointment Kept', count: atLeast(4), color: '#0E2440' },
      { label: 'Opportunity Opened', count: leads.filter(l => l.stage === 'Opportunity Opened').length, color: '#C2A14D' }
    ];
  }

  // Per-agent rollup for the leaderboard (this week volume + pipeline)
  function agentRollup(range) {
    const r = range || weekRange();
    return RWG.data.agents().map(a => {
      const leads = RWG.data.leadsFor(a.id);
      const av = activityStats(leads, r, a.id);
      const rank = (l) => STAGE_RANK[l.stage] ?? 0;
      const apptKept = leads.filter(l => rank(l) >= 4).length;
      const apptSetTotal = leads.filter(l => rank(l) >= 3).length;
      const untouched = leads.filter(l => (l.attempts || 0) === 0 && l.stage === 'New').length;
      return {
        agent: a, leadCount: leads.length, untouched,
        dials: av.dials, reaches: av.reaches, apptSetWeek: av.apptSet,
        apptSetTotal, apptKept,
        reachRate: av.dials ? Math.round((av.reaches / av.dials) * 100) : 0
      };
    });
  }

  // Goal: appointments SET this week vs the 10–15 target
  function goal(range) {
    const r = range || weekRange();
    const set = activityStats(RWG.data.leads(), r).apptSet;
    return { set, min: APPT_GOAL_MIN, max: APPT_GOAL_MAX, pct: Math.round((set / APPT_GOAL_MAX) * 100) };
  }

  function tierMix(leads) {
    const m = { GOLD: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    leads.forEach(l => { m[l._score.tier]++; });
    return m;
  }

  // ── Weekly reports: Mon–Sun in US Eastern, computed from the timestamped logs ──
  const TZ = 'America/New_York', DAY = 86400000;
  const WD = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  function _eParts(ms) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(ms));
    const o = {}; p.forEach(x => { if (x.type !== 'literal') o[x.type] = x.value; });
    return o;
  }
  function _easternMidnightUTC(y, m, d) {   // UTC ms at which the Eastern wall-clock is y-m-d 00:00:00
    const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
    const e = _eParts(guess);
    const asUTC = Date.UTC(+e.year, +e.month - 1, +e.day, +e.hour, +e.minute, +e.second);
    return guess - (asUTC - guess);
  }
  function weekStartOf(ms) {   // UTC ms of Monday 00:00 Eastern for the week containing ms
    const e = _eParts(ms), sinceMon = (WD[e.weekday] + 6) % 7;
    let mid = _easternMidnightUTC(+e.year, +e.month, +e.day);
    if (sinceMon) { const b = _eParts(mid - sinceMon * DAY + 12 * 3600000); mid = _easternMidnightUTC(+b.year, +b.month, +b.day); }
    return mid;
  }
  function weekRangeFor(weekStartMs) {   // [Mon 00:00 , Sun 23:59:59.999] — DST-safe
    const next = weekStartOf(weekStartMs + 7 * DAY + 12 * 3600000);
    return { start: weekStartMs, end: next - 1 };
  }
  function weekId(weekStartMs) { const e = _eParts(weekStartMs); return `${e.year}-${e.month}-${e.day}`; }
  function weekLabel(weekStartMs) {
    const fmt = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: TZ, month: 'short', day: 'numeric' }).format(new Date(ms));
    return `${fmt(weekStartMs)} – ${fmt(weekRangeFor(weekStartMs).end)}, ${_eParts(weekStartMs).year}`;
  }

  // Per-agent tallies for a week, from EVERY logged action (by actor), so history survives
  // reassignment and agent removal. Dials/reaches/etc. come from activities; milestone
  // counts (appts set/kept, opportunities) from the stage-change history.
  function weeklyReport(range) {
    const leads = RWG.data.leadsRaw();
    const users = RWG.data.users();
    const cfg = RWG.data.scoringConfig();
    const inR = (t) => t >= range.start && t <= range.end;
    const zeroTiers = () => ({ GOLD: 0, HIGH: 0, MEDIUM: 0, LOW: 0 });
    const tally = {};
    const ensure = (uid) => tally[uid] || (tally[uid] = { uid, dials: 0, reaches: 0, texts: 0, emails: 0, apptSet: 0, apptKept: 0, oppOpened: 0, noOpp: 0, apptTiers: zeroTiers(), touched: new Set() });
    leads.forEach(l => {
      let tier = null;   // lead tier, computed once on the first appointment this week
      (l.activities || []).forEach(a => {
        if (!a.by || !inR(a.at)) return;
        const t = ensure(a.by);
        if (a.type === 'Call' || a.type === 'Voicemail') t.dials++;
        if (a.reached) t.reaches++;
        if (a.type === 'Text') t.texts++;
        if (a.type === 'Email') t.emails++;
        t.touched.add(l.id);
      });
      (l.history || []).forEach(h => {
        if (!h.by || !inR(h.at)) return;
        const t = ensure(h.by);
        (h.changes || []).forEach(c => {
          if (c.label !== 'Stage') return;
          if (c.to === 'Appointment Set') {
            t.apptSet++;
            if (tier == null) tier = ((RWG.scoring.scoreLead(l, cfg) || {}).tier) || 'LOW';
            if (t.apptTiers[tier] != null) t.apptTiers[tier]++;
          }
          else if (c.to === 'Appointment Kept') t.apptKept++;
          else if (c.to === 'Opportunity Opened') t.oppOpened++;
          else if (c.to === 'No Opportunity') t.noOpp++;
        });
        t.touched.add(l.id);
      });
    });
    const nameOf = (uid) => { const u = users.find(x => x.id === uid); return (u && u.name) || 'Former agent'; };
    const agents = Object.keys(tally).map(uid => {
      const t = tally[uid];
      return { uid, name: nameOf(uid), dials: t.dials, reaches: t.reaches, texts: t.texts, emails: t.emails, apptSet: t.apptSet, apptKept: t.apptKept, oppOpened: t.oppOpened, noOpp: t.noOpp, apptTiers: t.apptTiers, leadsTouched: t.touched.size, reachRate: t.dials ? Math.round((t.reaches / t.dials) * 100) : 0 };
    });
    RWG.data.agents().forEach(a => { if (!tally[a.id]) agents.push({ uid: a.id, name: a.name, dials: 0, reaches: 0, texts: 0, emails: 0, apptSet: 0, apptKept: 0, oppOpened: 0, noOpp: 0, apptTiers: zeroTiers(), leadsTouched: 0, reachRate: 0 }); });
    agents.sort((x, y) => y.apptSet - x.apptSet || y.reaches - x.reaches || y.dials - x.dials || x.name.localeCompare(y.name));
    const team = agents.reduce((s, a) => ({ dials: s.dials + a.dials, reaches: s.reaches + a.reaches, apptSet: s.apptSet + a.apptSet, apptKept: s.apptKept + a.apptKept, oppOpened: s.oppOpened + a.oppOpened,
      apptTiers: { GOLD: s.apptTiers.GOLD + (a.apptTiers ? a.apptTiers.GOLD : 0), HIGH: s.apptTiers.HIGH + (a.apptTiers ? a.apptTiers.HIGH : 0), MEDIUM: s.apptTiers.MEDIUM + (a.apptTiers ? a.apptTiers.MEDIUM : 0), LOW: s.apptTiers.LOW + (a.apptTiers ? a.apptTiers.LOW : 0) } }),
      { dials: 0, reaches: 0, apptSet: 0, apptKept: 0, oppOpened: 0, apptTiers: zeroTiers() });
    team.reachRate = team.dials ? Math.round((team.reaches / team.dials) * 100) : 0;
    team.goalMin = APPT_GOAL_MIN; team.goalMax = APPT_GOAL_MAX;
    return { team, agents };
  }

  return { weekRange, activityStats, funnel, agentRollup, goal, tierMix, STAGE_RANK, APPT_GOAL_MIN, APPT_GOAL_MAX, weekStartOf, weekRangeFor, weekId, weekLabel, weeklyReport };
})();
