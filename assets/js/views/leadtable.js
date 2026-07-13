/* ============================================================
   RWG CRM — Shared leads table with Excel-style AutoFilter
   Used by admin "All Leads" and the agent "My Leads" table; the
   agent board reuses the same filter model via a compact bar.

   Filter model:  { colFilters: { <col>:[values] }, sortKey, sortDir }
   (plus `search` merged in by the controller). Every column filters
   by a value checklist; sort lives in each column's header menu.
   ============================================================ */
window.RWG = window.RWG || {};
RWG.leadtable = (function () {
  const U = RWG.ui, D = RWG.data, A = RWG.analytics;

  const lastTouch = (l) => (l.activities && l.activities.length) ? l.activities[l.activities.length - 1].at : (l.createdAt || 0);
  const tierRank = (l) => ({ GOLD: 4, HIGH: 3, MEDIUM: 2, LOW: 1 })[l._score.tier] || 0;
  const dispoIdx = (l) => { const i = D.DISPOSITIONS.indexOf(l.disposition || ''); return i < 0 ? 999 : i; };
  const ownerName = (l) => l.assignedTo ? ((D.user(l.assignedTo) || {}).name || '') : '~~~';

  function defaultFilter() {
    return { colFilters: {}, sortKey: 'score', sortDir: 'desc' };
  }

  const NUMERIC = ['score', 'yos', 'afc', 'attempts'];

  // Each column drives: header label, sort comparator, body cell, and (if filterable) a filter value + label.
  function columnDefs() {
    return {
      name:  { label: 'Lead', dir: 'asc', filterable: false, cmp: (a, b) => D.fullName(a).localeCompare(D.fullName(b)),
               cell: (l) => `<div class="cell-name">${U.esc(D.fullName(l))}${l.returning ? ` <span class="ret-flag" title="Returning · ${l.seminarCount || 2} seminars">🔁</span>` : ''} ${U.callbackChip(l)}${U.clickedChip(l)}</div><div class="cell-sub">${U.esc(l.employer || '')}</div>` },
      tier:  { label: 'Tier', dir: 'desc', filterable: true, fval: (l) => l._score.tier,
               cmp: (a, b) => tierRank(a) - tierRank(b), cell: (l) => U.tierChip(l._score) },
      score: { label: 'Score', dir: 'desc', filterable: true, fval: (l) => String(l._score.score),
               cmp: (a, b) => a._score.score - b._score.score, cell: (l) => U.scoreBar(l._score) },
      owner: { label: 'Owner', dir: 'asc', filterable: true, fval: (l) => l.assignedTo ? ((D.user(l.assignedTo) || {}).name || '—') : 'Unassigned',
               cmp: (a, b) => ownerName(a).localeCompare(ownerName(b)),
               cell: (l) => { const o = D.user(l.assignedTo); return o ? `<span class="flex" style="gap:7px">${U.avatar(o, 24)}<span class="cell-sub" style="color:var(--ink)">${U.esc(o.name.split(' ')[0])}</span></span>` : '<span class="pill-soft">Unassigned</span>'; } },
      stage: { label: 'Stage', dir: 'asc', filterable: true, fval: (l) => l.stage,
               cmp: (a, b) => (A.STAGE_RANK[a.stage] || 0) - (A.STAGE_RANK[b.stage] || 0), cell: (l) => U.stageChip(l.stage) },
      disposition: { label: 'Disposition', dir: 'asc', filterable: true, fval: (l) => l.disposition || '(none)',
               cmp: (a, b) => dispoIdx(a) - dispoIdx(b), cell: (l) => l.disposition ? `<span class="pill-soft">${U.esc(l.disposition)}</span>` : '<span class="cell-sub">—</span>' },
      plan:  { label: 'Plan', dir: 'asc', filterable: true, fval: (l) => RWG.scoring.normPlan(l.planType),
               cmp: (a, b) => RWG.scoring.normPlan(a.planType).localeCompare(RWG.scoring.normPlan(b.planType)), cell: (l) => U.esc(RWG.scoring.normPlan(l.planType)) },
      list:  { label: 'List', dir: 'asc', filterable: true, fval: (l) => l.listName || '(none)',
               cmp: (a, b) => (a.listName || '').localeCompare(b.listName || ''), cell: (l) => `<span class="cell-sub" style="color:var(--ink)">${U.esc(l.listName || '—')}</span>` },
      returning: { label: 'Returning', dir: 'desc', filterable: true, fval: (l) => l.returning ? 'Returning' : 'First time',
               cmp: (a, b) => ((a.seminarCount || 1) - (b.seminarCount || 1)),
               cell: (l) => l.returning ? `<span class="chip tier-gold" title="${l.seminarCount || 2} seminars">🔁 ×${l.seminarCount || 2}</span>` : '<span class="cell-sub">—</span>' },
      callback: { label: 'Callback', dir: 'desc', filterable: true, fval: (l) => U.isCallback(l) ? 'Callback requested' : 'No',
               cmp: (a, b) => (U.isCallback(a) ? 1 : 0) - (U.isCallback(b) ? 1 : 0),
               cell: (l) => U.isCallback(l) ? U.callbackChip(l) : '<span class="cell-sub">—</span>' },
      yos:   { label: 'YOS / Age', dir: 'desc', tdClass: 'num', filterable: true, fval: (l) => l.yos == null ? '(none)' : String(l.yos),
               cmp: (a, b) => (a.yos || 0) - (b.yos || 0), cell: (l) => `${l.yos ?? '—'} / ${l.age ?? '—'}` },
      afc:   { label: 'AFC', dir: 'desc', filterable: true, fval: (l) => l.afc == null ? '(none)' : String(l.afc),
               flabel: (v) => v === '(none)' ? '(none)' : U.moneyK(Number(v)),
               cmp: (a, b) => (a.afc || 0) - (b.afc || 0), cell: (l) => U.moneyK(l.afc) },
      attempts: { label: 'Att.', dir: 'asc', tdClass: 'num', filterable: true, fval: (l) => String(l.attempts || 0),
               cmp: (a, b) => (a.attempts || 0) - (b.attempts || 0), cell: (l) => (l.attempts || 0) },
      touch: { label: 'Last touch', dir: 'desc', filterable: false, cmp: (a, b) => lastTouch(a) - lastTouch(b),
               cell: (l) => `<span class="cell-sub">${l.activities && l.activities.length ? U.fmtRelative(l.activities[l.activities.length - 1].at) : '—'}</span>` }
    };
  }

  function columnOrder(showOwner) {
    const base = ['name', 'tier', 'score', 'stage', 'disposition', 'plan', 'list', 'returning', 'callback', 'yos', 'afc', 'attempts', 'touch'];
    if (showOwner) base.splice(3, 0, 'owner');   // Owner right after Score
    return base;
  }
  const defaultVisible = (showOwner) => columnOrder(showOwner).slice();
  const allColumns = (showOwner) => { const defs = columnDefs(); return columnOrder(showOwner).map(k => ({ key: k, label: defs[k].label })); };

  const CMP = (() => { const defs = columnDefs(), m = {}; Object.keys(defs).forEach(k => m[k] = defs[k].cmp); m.appt = (a, b) => (a.apptDate || Infinity) - (b.apptDate || Infinity); return m; })();

  // Distinct values present for a column, sorted sensibly (used to build the checklist).
  function distinctValues(leads, key) {
    const defs = columnDefs(), fv = defs[key].fval;
    if (!fv) return [];
    const set = new Set();
    leads.forEach(l => set.add(fv(l)));
    let vals = Array.from(set);
    const none = (v) => v === '(none)';
    if (key === 'tier') { const r = { GOLD: 0, HIGH: 1, MEDIUM: 2, LOW: 3 }; vals.sort((a, b) => (r[a] ?? 9) - (r[b] ?? 9)); }
    else if (key === 'stage') vals.sort((a, b) => (A.STAGE_RANK[a] ?? 99) - (A.STAGE_RANK[b] ?? 99));
    else if (key === 'disposition') vals.sort((a, b) => { const ia = D.DISPOSITIONS.indexOf(a), ib = D.DISPOSITIONS.indexOf(b); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
    else if (NUMERIC.includes(key)) vals.sort((a, b) => (none(a) ? Infinity : +a) - (none(b) ? Infinity : +b));
    else if (key === 'list') { const rec = listRecency(leads); vals.sort((a, b) => (rec[b] || 0) - (rec[a] || 0)); }
    else vals.sort((a, b) => String(a).localeCompare(String(b)));
    return vals;
  }
  function listRecency(leads) { const m = {}; leads.forEach(l => { const k = l.listName || '(none)'; m[k] = Math.max(m[k] || 0, l.createdAt || 0); }); return m; }

  function applyFilter(leads, f) {
    let out = leads.slice();
    const cf = f.colFilters || {}, defs = columnDefs();
    Object.keys(cf).forEach(key => {
      const sel = cf[key], def = defs[key];
      if (sel && sel.length && def && def.fval) out = out.filter(l => sel.includes(def.fval(l)));
    });
    if (f.search) {
      const q = f.search.toLowerCase();
      out = out.filter(l => (D.fullName(l) + ' ' + (l.employer || '') + ' ' + (l.phone || '')).toLowerCase().includes(q));
    }
    const base = CMP[f.sortKey] || CMP.score;
    out.sort((a, b) => { let r = base(a, b); if (f.sortDir === 'desc') r = -r; return r || (b._score.score - a._score.score); });
    return out;
  }

  // The AutoFilter menu for a column (sort + search + value checklist). Reused in headers and the board bar.
  function filterMenu(key, allLeads, selected) {
    const defs = columnDefs(), def = defs[key], flabel = def.flabel || ((v) => v);
    const numeric = NUMERIC.includes(key);
    const rows = distinctValues(allLeads, key).map(v =>
      `<label class="pop-row"><input type="checkbox" data-colfilter="${key}" data-val="${U.esc(v)}" ${selected.includes(v) ? 'checked' : ''}> ${U.esc(String(flabel(v)))}</label>`).join('');
    return `<div class="pop-panel" hidden>
      <button class="pop-sort" data-action="popsort" data-col="${key}" data-dir="asc">↑ Sort ${numeric ? 'low → high' : 'A → Z'}</button>
      <button class="pop-sort" data-action="popsort" data-col="${key}" data-dir="desc">↓ Sort ${numeric ? 'high → low' : 'Z → A'}</button>
      <div class="pop-sep"></div>
      <input class="pop-search" type="search" placeholder="Search ${U.esc(def.label)}…">
      <div class="pop-actions"><button data-action="colfilter-all" data-col="${key}">Select all</button><button data-action="colfilter-clear" data-col="${key}">Clear</button></div>
      <div class="pop-list">${rows || '<div class="muted" style="padding:8px;font-size:12.5px">No values</div>'}</div>
    </div>`;
  }

  // Active-filter summary chips (shown in the bar; each clears its column)
  function summaryChips(f) {
    const cf = f.colFilters || {}, defs = columnDefs();
    return Object.keys(cf).filter(k => cf[k] && cf[k].length).map(k => {
      const def = defs[k] || { label: k }, flabel = def.flabel || ((v) => v), vals = cf[k];
      const txt = vals.length === 1 ? flabel(vals[0]) : vals.length + ' selected';
      return `<span class="filter-chip">${U.esc(def.label)}: <b>${U.esc(String(txt))}</b><button class="chip-x" data-action="colfilter-clear" data-col="${k}" title="Clear">✕</button></span>`;
    }).join('');
  }

  // Body rows only (so the controller can refresh rows without rebuilding the headers/popovers)
  function bodyFor(leads, opts) {
    opts = opts || {};
    const vis = opts.columns, defs = columnDefs();
    const order = columnOrder(opts.showOwner).filter(k => k === 'name' || !vis || vis.includes(k));
    const sel = !!opts.selectable, selected = opts.selected || new Set();
    const colCount = order.length + (sel ? 1 : 0);
    if (!leads.length) return `<tr class="no-rows"><td colspan="${colCount}"><div class="empty" style="padding:34px 10px"><div class="ec">🔍</div><h3>No leads match</h3><p>${U.esc(opts.empty || 'Adjust a column filter, or Clear all.')}</p></div></td></tr>`;
    return leads.map(l => {
      const isSel = sel && selected.has(l.id);
      const selTd = sel ? `<td class="sel-cell"><input type="checkbox" data-sel="${l.id}" ${isSel ? 'checked' : ''}></td>` : '';
      return `<tr class="${isSel ? 'row-sel' : ''}" data-action="open-lead" data-id="${l.id}">${selTd}${order.map(key => { const c = defs[key]; return `<td class="${c.tdClass || ''}">${c.cell(l)}</td>`; }).join('')}</tr>`;
    }).join('');
  }

  function table(leads, f, opts) {
    opts = opts || {};
    const vis = opts.columns, defs = columnDefs();
    const order = columnOrder(opts.showOwner).filter(k => k === 'name' || !vis || vis.includes(k));
    const sel = !!opts.selectable, selected = opts.selected || new Set();
    const cf = f.colFilters || {}, allLeads = opts.allLeads || leads;
    const allOn = sel && leads.length && leads.every(l => selected.has(l.id));
    const selTh = sel ? `<th class="sel-th"><input type="checkbox" data-selall ${allOn ? 'checked' : ''}></th>` : '';
    const head = `<thead><tr>${selTh}${order.map(key => {
      const c = defs[key], activeCol = key === f.sortKey;
      const arr = activeCol ? (f.sortDir === 'asc' ? ' <span class="arrow">▲</span>' : ' <span class="arrow">▼</span>') : '';
      let fb = '';
      if (c.filterable) { const has = (cf[key] || []).length > 0; fb = `<button class="th-filter ${has ? 'on' : ''}" data-action="popmenu" data-col="${key}" type="button" aria-label="Filter ${U.esc(c.label)}">▾</button>${filterMenu(key, allLeads, cf[key] || [])}`; }
      return `<th class="pop-wrap th-cell ${activeCol ? 'sorted' : ''}"><span class="th-label" data-sort="${key}" data-dir="${c.dir}">${c.label}${arr}</span>${fb}</th>`;
    }).join('')}</tr></thead>`;
    return `<div class="table-wrap"><table class="data">${head}<tbody>${bodyFor(leads, opts)}</tbody></table></div>`;
  }

  // ── Stacked card view: the mobile face of the leads table ──
  function isMobile() { return !!(window.matchMedia && window.matchMedia('(max-width:760px)').matches); }

  // One lead as a vertical card. Tap the Stage pill (B) → quick stage menu; tap anywhere else (A) → open drawer.
  function leadRowCard(l, opts) {
    const s = l._score, sel = !!opts.selectable, isSel = sel && (opts.selected || new Set()).has(l.id);
    const owner = opts.showOwner ? D.user(l.assignedTo) : null;
    const ownerCell = opts.showOwner
      ? `<div class="lrc-cell"><span class="k">Owner</span><span class="v">${owner ? U.esc(owner.name.split(' ')[0]) : 'Unassigned'}</span></div>` : '';
    const stageMenu = `<span class="pop-wrap">
        <button class="lrc-stage" data-action="popmenu" type="button" aria-label="Change stage">${U.stageChip(l.stage)} <span class="caret">▾</span></button>
        <div class="pop-panel" hidden><div class="pop-h">Move to stage</div>
          ${D.STAGES.map(st => `<button class="pop-sort pop-stage ${st === l.stage ? 'on' : ''}" data-action="pick-stage" data-id="${l.id}" data-stage="${st}">${st}</button>`).join('')}
        </div></span>`;
    const checkbox = sel ? `<label class="sel-cell lrc-sel"><input type="checkbox" data-sel="${l.id}" ${isSel ? 'checked' : ''}></label>` : '';
    const ret = l.returning ? ` <span title="Returning · ${l.seminarCount || 2} seminars">🔁</span>` : '';
    return `<div class="lead-row-card${isSel ? ' sel' : ''}" data-action="open-lead" data-id="${l.id}">
      <div class="lrc-top">
        ${checkbox}
        <div class="lrc-id"><div class="lrc-name">${U.esc(D.fullName(l))}${ret} ${U.callbackChip(l)}${U.clickedChip(l)}</div><div class="cell-sub">${U.esc(l.employer || '—')}</div></div>
        ${U.tierChip(s)}
      </div>
      <div class="lrc-grid">
        <div class="lrc-cell"><span class="k">Stage</span>${stageMenu}</div>
        <div class="lrc-cell"><span class="k">Score</span><span class="v">${U.scoreBar(s)}</span></div>
        ${ownerCell}
        <div class="lrc-cell"><span class="k">Plan</span><span class="v">${U.esc(RWG.scoring.normPlan(l.planType))}</span></div>
      </div>
      <div class="lrc-foot">
        <a href="tel:${U.esc(l.phone)}" class="lrc-phone" onclick="event.stopPropagation()">${l.phone ? '📞 ' + U.esc(l.phone) : '—'}</a>
        <span class="cell-sub">${l.attempts || 0} attempt${l.attempts === 1 ? '' : 's'}${l.disposition ? ' · ' + U.esc(l.disposition) : ''}</span>
      </div>
    </div>`;
  }

  function cardList(leads, opts) {
    opts = opts || {};
    if (!leads.length) return `<div class="empty" style="padding:40px 16px"><div class="ec">🔍</div><h3>No leads match</h3><p>${U.esc(opts.empty || 'Adjust a filter, or Clear all.')}</p></div>`;
    return `<div class="lead-cards">${leads.map(l => leadRowCard(l, opts)).join('')}</div>`;
  }

  // Responsive: spreadsheet table on desktop, stacked cards on phones.
  function leadsView(leads, f, opts) { return isMobile() ? cardList(leads, opts) : table(leads, f, opts); }

  function filterBar(allLeads, f, count, opts) {
    opts = opts || {};
    const cf = f.colFilters || {};
    const chips = summaryChips(f);
    const active = Object.keys(cf).some(k => cf[k] && cf[k].length) || f.search || f.sortKey !== 'score' || f.sortDir !== 'desc';
    const clearBtn = `<button class="btn btn-quiet btn-sm fbar-clear" data-action="flt-clear" ${active ? '' : 'style="display:none"'}>✕ Clear all</button>`;

    if (opts.onBoard) {
      const tierChips = ['GOLD', 'HIGH', 'MEDIUM', 'LOW'].map(t => {
        const m = RWG.scoring.tierMeta[t], on = (cf.tier || []).includes(t);
        return `<button class="fbar-tier ${on ? 'on' : ''}" data-action="flt-tier" data-tier="${t}"><span class="tier-dot ${m.dot}"></span>${m.label}</button>`;
      }).join('');
      return `<div class="filterbar">
        <div class="fbar-top">
          <span class="fbar-label">Quality</span><div class="fbar-tiers">${tierChips}</div>
          <span class="fbar-spacer"></span>${clearBtn}
        </div>
        ${chips ? `<div class="fbar-bottom"><span class="fbar-label">Filters</span><div class="chip-row">${chips}</div></div>` : ''}
      </div>`;
    }

    // Mobile (table/list views): compact bar — search + sort + tier chips + count/export
    if (isMobile()) {
      const sortOpts = [['score', 'desc', 'Best score first'], ['score', 'asc', 'Lowest score'], ['name', 'asc', 'Name A–Z'], ['stage', 'asc', 'Pipeline stage'], ['touch', 'desc', 'Recently touched'], ['attempts', 'asc', 'Fewest attempts']];
      const cur = (f.sortKey || 'score') + ':' + (f.sortDir || 'desc');
      const sortSel = `<select class="fbar-select fbar-sort" aria-label="Sort leads">${sortOpts.map(o => `<option value="${o[0]}:${o[1]}" ${cur === o[0] + ':' + o[1] ? 'selected' : ''}>${o[2]}</option>`).join('')}</select>`;
      const tierChips = ['GOLD', 'HIGH', 'MEDIUM', 'LOW'].map(t => {
        const m = RWG.scoring.tierMeta[t], on = (cf.tier || []).includes(t);
        return `<button class="fbar-tier ${on ? 'on' : ''}" data-action="flt-tier" data-tier="${t}"><span class="tier-dot ${m.dot}"></span>${m.label}</button>`;
      }).join('');
      const exportBtn = opts.canExport ? `<button class="btn btn-ghost btn-sm" data-action="export-leads" title="Export this view to CSV">⬇ Export</button>` : '';
      return `<div class="filterbar fbar-mobile">
        <input class="input fbar-search" type="search" placeholder="Search name, employer or phone…" value="${U.esc(f.search || '')}">
        <div class="fbar-mrow">${sortSel}${tierChips}</div>
        ${chips ? `<div class="chip-row">${chips}</div>` : ''}
        <div class="fbar-bottom"><span class="fbar-count">${count} of ${allLeads.length} lead${allLeads.length === 1 ? '' : 's'}</span><span class="fbar-spacer"></span>${clearBtn}${exportBtn}</div>
      </div>`;
    }

    // table views: slim bar — active-filter summary + count + columns + export
    const visible = opts.columns;
    const colBtn = (() => {
      const defs = columnDefs();
      const items = columnOrder(opts.showOwner).map(k => {
        const on = !visible || visible.includes(k), locked = k === 'name';
        return `<label class="pop-row"><input type="checkbox" data-col="${k}" ${on ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${defs[k].label}</label>`;
      }).join('');
      return `<div class="pop-wrap cols-btn">
        <button class="btn btn-ghost btn-sm" data-action="popmenu" type="button">▦ Columns</button>
        <div class="pop-panel" hidden><div class="pop-h">Show columns</div>${items}
          <div class="pop-f"><button class="btn btn-quiet btn-sm" data-action="cols-reset">Reset all</button></div></div>
      </div>`;
    })();

    return `<div class="filterbar">
      <div class="fbar-top">
        <span class="fbar-label">Filters</span>
        <div class="chip-row">${chips || '<span class="muted" style="font-size:13px">None — click a column ▾ to sort &amp; filter</span>'}</div>
        <span class="fbar-spacer"></span>
        ${clearBtn}
      </div>
      <div class="fbar-bottom">
        <span class="fbar-count">${count} of ${allLeads.length} lead${allLeads.length === 1 ? '' : 's'}</span>
        <span class="fbar-spacer"></span>
        ${colBtn}
        ${opts.canExport ? `<button class="btn btn-ghost btn-sm" data-action="export-leads" title="Export this view to CSV (opens in Excel)">⬇ Export</button>` : ''}
      </div>
    </div>`;
  }

  // ── CSV export (rich, action-ready columns — independent of which table columns are shown) ──
  const EXPORT_COLS = [
    ['First Name', l => l.firstName], ['Last Name', l => l.lastName],
    ['Email', l => l.email], ['Phone', l => l.phone],
    ['Tier', l => l._score.tier], ['Score', l => l._score.score],
    ['Stage', l => l.stage], ['Disposition', l => l.disposition],
    ['Owner', l => { const o = D.user(l.assignedTo); return o ? o.name : 'Unassigned'; }],
    ['Plan Type', l => l.planType], ['Member Class', l => l.memberClass],
    ['Age', l => l.age], ['Years of Service', l => l.yos], ['AFC/Salary', l => l.afc],
    ['Employer', l => l.employer], ['Attended', l => l.attended], ['Callback Requested', l => U.isCallback(l) ? 'Yes' : ''], ['Attempts', l => l.attempts || 0],
    ['Last Activity', l => { const a = (l.activities || [])[(l.activities || []).length - 1]; return a ? new Date(a.at).toLocaleString('en-US') : ''; }],
    ['Appointment', l => l.apptDate ? new Date(l.apptDate).toLocaleString('en-US') : ''],
    ['Lead List', l => l.listName], ['Top Reason', l => l._score.headline]
  ];
  function csvCell(v) { if (v == null) v = ''; v = String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function toCSV(leads) {
    const header = EXPORT_COLS.map(c => csvCell(c[0])).join(',');
    const rows = leads.map(l => EXPORT_COLS.map(c => csvCell(c[1](l))).join(','));
    return [header].concat(rows).join('\r\n');
  }

  return { defaultFilter, applyFilter, filterBar, table, leadsView, isMobile, bodyFor, summaryChips, distinctValues, defaultVisible, allColumns, toCSV };
})();
