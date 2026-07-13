/* ============================================================
   RWG Platform — Leads module (the existing CRM)

   DISABLED in v1. The live CRM keeps running at its own URL until
   Carlos approves the cutover; flipping `enabled` to true here (or
   calling RWG.modules.setEnabled('leads', true) in the console)
   restores the full CRM inside this platform.

   This is a thin adapter on purpose. It owns the nav and meta that
   used to be hardcoded in app.js, and delegates rendering to
   RWG.views.admin / RWG.views.agent, which are untouched.

   Its interactions still run through the legacy switch in
   app.js handleAction(). That switch is leads-only now, and it will
   move into this file's `actions` map when Leads is extracted for
   real (after cutover). Until then this module declares no actions,
   so the kernel falls through to the switch.
   ============================================================ */
window.RWG = window.RWG || {};

RWG.modules.register({
  id: 'leads',
  title: 'Leads',
  enabled: true,                        // Consolidated in. Old CRM URL runs alongside during the trial.
  roles: ['admin', 'agent'],

  nav: {
    admin: [
      { view: 'dashboard', label: 'Command Center', icon: 'dashboard' },
      { view: 'leads',     label: 'All Leads',      icon: 'leads' },
      { view: 'agents',    label: 'Team',           icon: 'team', badge: () => RWG.data.pendingUsers().length },
      { view: 'reports',   label: 'Lead Reports',   icon: 'reports' },
      { view: 'upload',    label: 'Upload & Assign',icon: 'upload' },
      { view: 'archive',   label: 'Deleted Leads',  icon: 'archive' },
      { view: 'settings',  label: 'Scoring & Settings', icon: 'settings' }
    ],
    agent: [
      { view: 'board',  label: 'My Board',       icon: 'board' },
      { view: 'mylist', label: 'My Leads',       icon: 'leads' },
      { view: 'today',  label: "Today's Queue",  icon: 'today' },
      { view: 'stats',  label: 'My Stats',       icon: 'stats' }
    ]
  },

  meta: {
    dashboard: { t: 'Command Center', s: 'Team performance, live' },
    leads:     { t: 'All Leads',      s: 'Every lead across the team' },
    agents:    { t: 'Team',           s: 'Agents & approvals' },
    reports:   { t: 'Lead Reports', s: 'Call activity & appointments, week by week' },
    upload:    { t: 'Upload & Assign',s: 'Import and distribute lead lists' },
    archive:   { t: 'Deleted Leads',  s: 'Archived records — restore or erase' },
    settings:  { t: 'Scoring & Settings', s: 'Tune the lead-quality engine' },
    board:     { t: 'My Board',       s: 'Work your pipeline' },
    mylist:    { t: 'My Leads',       s: 'Your assigned leads, best first' },
    today:     { t: "Today's Queue",  s: 'What to do right now' },
    stats:     { t: 'My Stats',       s: 'Your week so far' }
  },

  // Needs the leads search box and the "New Lead" button in the topbar.
  chrome: { search: 'leads', newLead: true },

  home: {
    tile: (ctx) => ({
      icon: 'leads',
      title: 'Leads',
      desc: ctx.role === 'admin'
        ? 'Every lead across the team, scoring, uploads and weekly reports.'
        : 'Your pipeline, your queue for today, and your stats.',
      view: ctx.role === 'admin' ? 'dashboard' : 'board'
    })
  },

  render(view, user, ctx) {
    return (ctx.role === 'admin')
      ? RWG.views.admin.render(view, user, ctx)
      : RWG.views.agent.render(view, user, ctx);
  }
});
