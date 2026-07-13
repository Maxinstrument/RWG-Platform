/* ============================================================
   RWG Platform — Home launchpad

   Renders one tile per module the signed-in person can reach, by
   asking the registry. A module opts in by declaring:

       home: { tile: (ctx) => ({icon, title, desc, view}),
               stats: (ctx) => [{label, value}] }

   Adding Training, Tools or CRM 2.0 later means registering a module
   with a home.tile. Its tile shows up here on its own. This file
   never needs to change.
   ============================================================ */
window.RWG = window.RWG || {};

RWG.modules.register({
  id: 'home',
  title: 'Home',
  enabled: true,
  roles: ['admin', 'agent'],

  nav: [{ view: 'home', label: 'Home', icon: 'home' }],
  meta: { home: { t: 'Home', s: 'Wealth, Conducted with Purpose' } },

  actions: {
    'home-open': (el) => RWG.app.nav(el.dataset.view)
  },

  render(view, user, ctx) {
    const U = RWG.ui;
    const icons = (RWG.app && RWG.app.icons) || {};
    const first = U.esc((user.name || '').split(' ')[0] || 'there');

    // Every module that wants a tile, except this one.
    const tiles = RWG.modules.forRole(ctx.role)
      .filter(m => m.id !== 'home' && m.home && m.home.tile)
      .map(m => m.home.tile(ctx))
      .filter(Boolean);

    // Every module that contributes a headline number.
    const stats = RWG.modules.forRole(ctx.role)
      .filter(m => m.id !== 'home' && m.home && m.home.stats)
      .reduce((all, m) => all.concat(m.home.stats(ctx) || []), []);

    const statsHtml = stats.length ? `<div class="grid stats-row">${stats.map(s => `
      <div class="stat"><div class="label">${U.esc(s.label)}</div><div class="value num">${U.esc(String(s.value))}</div></div>`).join('')}</div>` : '';

    const tilesHtml = tiles.map(t => `
      <button class="tile" data-action="home-open" data-view="${U.esc(t.view)}">
        <span class="tile-ic">${icons[t.icon] || icons.home || ''}</span>
        <span class="tile-t">${U.esc(t.title)}</span>
        <span class="tile-d">${U.esc(t.desc || '')}</span>
        <span class="tile-go">Open &rarr;</span>
      </button>`).join('');

    // Areas that are planned but not built. Shown muted so nothing looks broken.
    const soon = [
      { icon: 'scorecard', title: 'Scorecard', desc: 'Log your week. Activity, cases, and your goals.' },
      { icon: 'reports', title: 'Reports', desc: 'Team production, annualized premium, and pace to goal.' },
      { icon: 'club', title: 'Training', desc: 'Playbooks, talk tracks, and onboarding.' }
    ].filter(s => !tiles.some(t => t.title === s.title));

    const soonHtml = soon.length ? `
      <div class="card-head" style="margin:34px 0 12px"><h3>Coming soon</h3><span class="sub">Being built now</span></div>
      <div class="tiles">${soon.map(s => `
        <div class="tile tile-soon">
          <span class="tile-ic">${icons[s.icon] || ''}</span>
          <span class="tile-t">${U.esc(s.title)}</span>
          <span class="tile-d">${U.esc(s.desc)}</span>
          <span class="tile-go muted">Not yet available</span>
        </div>`).join('')}</div>` : '';

    return `
      <div class="home-hero">
        <div class="eyebrow"><span class="dot"></span><span>Resilient Wealth Group</span></div>
        <h2 class="serif">Welcome back, ${first}.</h2>
        <p class="muted">Everything the team runs on, in one place.</p>
      </div>
      ${statsHtml}
      ${tilesHtml ? `<div class="tiles">${tilesHtml}</div>` : `
        <div class="empty" style="padding:42px 16px">
          <div class="ec">🧭</div><h3>Your areas are on the way</h3>
          <p>Nothing is switched on for you yet. The tiles below show what is coming.</p>
        </div>`}
      ${soonHtml}`;
  }
});
