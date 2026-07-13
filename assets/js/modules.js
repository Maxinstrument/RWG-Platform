/* ============================================================
   RWG Platform — Module registry

   The kernel (app.js) knows nothing about Scorecard, Report, or Leads.
   Each area registers itself here and declares:

     id       unique string
     title    human name
     enabled  false hides it completely (nav, views, actions)
     roles    ['admin','agent'] — who may see this module at all
     nav      [{view,label,icon,badge?,roles?}]  OR  {admin:[...], agent:[...]}
     views    extra view ids the module owns that aren't in nav
     meta     { viewId: {t:'Title', s:'Subtitle'} }
     render   (view, user, ctx) -> html string, injected into #main-content
     onEnter  (view, ctx) -> called right after render, for async loads/wiring
     actions  { 'data-action-name': (el, event, moduleState) => {} }
     home     { tile(ctx)->html, stats(ctx)->[{label,value}] }  for the launchpad
     state    private slice; handed back to every action

   To add a module: create assets/js/modules/<id>.js, call register(),
   and add one <script> tag. Nothing in the kernel changes.
   ============================================================ */
window.RWG = window.RWG || {};

RWG.modules = (function () {
  const list = [];
  const byView = {};     // view id -> module
  const byAction = {};   // action name -> module

  // nav may be a flat array (same for both roles) or {admin:[], agent:[]}
  function navEntries(m, role) {
    const n = m.nav;
    if (!n) return [];
    if (Array.isArray(n)) {
      return role ? n.filter(x => !x.roles || x.roles.indexOf(role) >= 0) : n.slice();
    }
    if (role) return (n[role] || []).slice();
    return [].concat(n.admin || [], n.agent || []);
  }

  function reindex() {
    Object.keys(byView).forEach(k => delete byView[k]);
    Object.keys(byAction).forEach(k => delete byAction[k]);
    list.forEach(m => {
      navEntries(m).forEach(n => { byView[n.view] = m; });
      (m.views || []).forEach(v => { byView[v] = m; });
      Object.keys(m.actions || {}).forEach(a => { byAction[a] = m; });
    });
  }

  function register(m) {
    if (!m || !m.id) throw new Error('RWG.modules.register: a module needs an id');
    if (get(m.id)) throw new Error('RWG.modules.register: duplicate id "' + m.id + '"');
    m.state = m.state || {};
    m.roles = m.roles || ['admin', 'agent'];
    if (m.enabled === undefined) m.enabled = true;
    list.push(m);
    reindex();
    return m;
  }

  const get = (id) => list.filter(m => m.id === id)[0] || null;
  const enabled = () => list.filter(m => m.enabled);
  const forRole = (role) => enabled().filter(m => m.roles.indexOf(role) >= 0);

  // Sidebar entries, in registration order, for the role that is actually being viewed.
  function navFor(role) {
    const out = [];
    forRole(role).forEach(m => navEntries(m, role).forEach(n => out.push(n)));
    return out;
  }

  // Only enabled modules can claim a view or an action, so a disabled module is inert.
  const moduleForView = (v) => { const m = byView[v]; return (m && m.enabled) ? m : null; };
  const actionOwner = (a) => { const m = byAction[a]; return (m && m.enabled) ? m : null; };
  const metaFor = (v) => { const m = byView[v]; return (m && m.meta && m.meta[v]) || null; };

  // Where a role lands when it signs in: the first nav item of the first enabled module.
  const defaultView = (role) => { const n = navFor(role); return n.length ? n[0].view : null; };

  // Flip a module on/off at runtime (used to prove Leads parity, and at cutover).
  function setEnabled(id, on) { const m = get(id); if (m) { m.enabled = !!on; reindex(); } return m; }

  return {
    register, get, list, enabled, forRole,
    navFor, navEntries, moduleForView, actionOwner, metaFor, defaultView, setEnabled
  };
})();
