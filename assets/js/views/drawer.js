/* ============================================================
   RWG CRM — Lead detail drawer (shared by admin + agent)
   View mode: detail, scoring, activity logging, pipeline, history.
   Edit mode: a focused form for the agent-editable fields, which
   records a behind-the-scenes audit log (visible to admin).
   ============================================================ */
window.RWG = window.RWG || {};
RWG.views = RWG.views || {};

RWG.views.drawer = function (leadId, opts) {
  opts = opts || {};
  const U = RWG.ui, D = RWG.data;
  const l = D.lead(leadId);
  if (!l) return '';

  const fmtVal = (field, v) => {
    if (v == null || v === '') return '<span class="muted">—</span>';
    if (field === 'afc') return U.money(v);
    return U.esc(v);
  };

  // ── EDIT MODE ──────────────────────────────────────────────
  if (opts.editing) {
    const input = (key) => {
      const f = D.EDITABLE_FIELDS.find(x => x.key === key);
      const val = l[f.key] == null ? '' : l[f.key];
      const inner = f.type === 'select'
        ? `<select id="edit-${f.key}">${f.options.map(o => `<option ${String(val) === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input id="edit-${f.key}" type="${f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : f.type === 'tel' ? 'tel' : 'text'}" value="${U.esc(val)}" ${f.type === 'number' ? 'step="any"' : ''}>`;
      return `<div class="field-group"><label class="lbl">${f.label}</label>${inner}</div>`;
    };
    return `
    <div class="scrim" data-action="cancel-edit"></div>
    <aside class="drawer" role="dialog" aria-label="Edit lead">
      <div class="drawer-head">
        <div class="dh-top">
          <div><div class="tag-row mb-8"><span class="chip tier-low">✎ Editing</span></div>
            <h2>${U.esc(D.fullName(l))}</h2>
            <div class="dh-sub">Update details — saved with a change log</div></div>
          <button class="drawer-close" data-action="cancel-edit" aria-label="Cancel">✕</button>
        </div>
      </div>
      <div class="drawer-body">
        <p class="hint" style="margin-top:2px">Name, score, attempts and pipeline stage aren't editable here — the system manages those. Edits are recorded for the owner's records.</p>
        <div class="section-title">Contact</div>
        <div class="field-row">${input('phone')}${input('email')}</div>
        <div class="field-group">${input('attended')}</div>
        <div class="section-title">FRS Profile</div>
        <div class="field-row">${input('age')}${input('yos')}</div>
        <div class="field-row">${input('planType')}${input('memberClass')}</div>
        <div class="field-group">${input('afc')}</div>
        <div class="field-group">${input('employer')}</div>
        <div class="flex" style="justify-content:flex-end;gap:10px;margin-top:18px">
          <button class="btn btn-quiet" data-action="cancel-edit">Cancel</button>
          <button class="btn btn-gold" data-action="save-lead" data-id="${l.id}">Save changes</button>
        </div>
      </div>
    </aside>`;
  }

  // ── VIEW MODE ──────────────────────────────────────────────
  const s = l._score;
  const isAdmin = opts.isAdmin;
  const owner = D.user(l.assignedTo);
  const detail = (k, v) => `<div class="detail-item"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  const reasons = s.reasons.map(r => `<li style="margin-bottom:6px;font-size:13.5px;color:var(--ink)"><span style="color:var(--gold);font-weight:700">›</span> ${U.esc(r)}</li>`).join('');

  const acts = (l.activities || []).slice().sort((a, b) => b.at - a.at);
  const tlIcon = { Call: '📞', Text: '💬', Email: '✉️', Voicemail: '🔔', Other: '•' };
  const timeline = acts.length ? acts.map(a => {
    const by = D.user(a.by);
    return `<div class="tl-item">
      <div class="tl-ic">${tlIcon[a.type] || '•'}</div>
      <div class="tl-body">
        <div class="tl-h">${U.esc(a.type)} ${a.disposition ? `<span class="disp">— ${U.esc(a.disposition)}</span>` : ''} ${a.reached ? '<span class="chip tier-high" style="margin-left:4px">Reached</span>' : ''}</div>
        <div class="tl-meta">${by ? U.esc(by.name) + ' · ' : ''}${U.fmtDateTime(a.at)}</div>
        ${a.note ? `<div class="tl-note">${U.esc(a.note)}</div>` : ''}
      </div></div>`;
  }).join('') : `<p class="muted" style="font-size:13.5px">No activity logged yet.</p>`;

  // contextual pipeline actions
  let stageActions = '';
  if (['New', 'Attempting', 'Reached'].includes(l.stage)) {
    stageActions = `<button class="btn btn-gold btn-sm" data-action="toggle-appt"> Set Appointment</button>`;
  } else if (l.stage === 'Appointment Set') {
    stageActions = `<button class="btn btn-navy btn-sm" data-action="graduate" data-id="${l.id}" data-stage="Appointment Kept">Mark Appointment Kept</button>
                    <button class="btn btn-ghost btn-sm" data-action="toggle-appt">Reschedule</button>`;
  } else if (l.stage === 'Appointment Kept') {
    stageActions = `<span class="muted" style="font-size:13px;align-self:center">Outcome:</span>
                    <button class="btn btn-gold btn-sm" data-action="graduate" data-id="${l.id}" data-stage="Opportunity Opened">Opportunity Opened ✦</button>
                    <button class="btn btn-ghost btn-sm" data-action="graduate" data-id="${l.id}" data-stage="No Opportunity">No Opportunity</button>`;
  } else {
    stageActions = `<span class="chip ${l.stage === 'Opportunity Opened' ? 'tier-gold' : 'tier-low'}">Graduated · ${U.esc(l.stage)}</span>
      <span class="muted" style="font-size:12.5px;align-self:center">This lead has left the CRM workflow.</span>`;
  }

  const appLines = (l.appearances || []).slice().sort((a, b) => a.at - b.at)
    .map(ap => `<div class="cell-sub">• ${U.esc(ap.listName || 'List')} — ${U.fmtRelative(ap.at)}</div>`).join('');
  const callbackBanner = U.isCallback(l) ? `
    <div class="card tight" style="background:rgba(178,58,72,.08);border-color:rgba(178,58,72,.5);margin-bottom:14px">
      <div style="font-weight:700;color:var(--bad)">📞 Callback requested</div>
      <div class="cell-sub" style="margin:4px 0 0">This person asked us to call them to schedule an appointment (June 2026 seminar). Reach out to them first.</div>
    </div>` : '';
  const returningBanner = l.returning ? `
    <div class="card tight" style="background:rgba(194,161,77,.1);border-color:rgba(194,161,77,.5);margin-bottom:14px">
      <div style="font-weight:700;color:var(--navy)">🔁 Returning attendee · ${l.seminarCount || 2} seminars</div>
      <div class="cell-sub" style="margin:4px 0 6px">This person was already in your database before this list — they keep showing up, so they're worth a tailored approach. Their full call history is below.</div>
      ${appLines}
    </div>` : '';

  const notesSection = (l.notes && l.notes.trim()) ? `
      <div class="section-title">Notes</div>
      <div class="card tight" style="white-space:pre-wrap;font-size:13px;line-height:1.55;color:var(--ink)">${U.esc(l.notes)}</div>` : '';

  const assignRow = isAdmin ? `
    <div class="detail-item"><div class="k">Assigned to</div>
      <div class="v"><select class="assign-select" data-id="${l.id}" style="padding:6px 8px;font-size:13px;width:auto;min-width:150px">
        <option value="">— Unassigned —</option>
        ${D.agents().map(a => `<option value="${a.id}" ${a.id === l.assignedTo ? 'selected' : ''}>${U.esc(a.name)}</option>`).join('')}
      </select></div></div>` : '';

  // admin-only change history
  const history = (isAdmin && l.history && l.history.length) ? `
    <div class="section-title">Change history</div>
    <div class="hist-list">
      ${l.history.slice().reverse().map(h => {
        const by = D.user(h.by);
        const lines = (h.changes || []).map(c => `<div class="hist-change"><span class="hk">${U.esc(c.label)}</span> ${fmtVal(c.field, c.from)} <span class="harr">→</span> <b>${fmtVal(c.field, c.to)}</b></div>`).join('');
        const noteLine = h.note ? `<div class="hist-note">${U.esc(h.note)}</div>` : '';
        return `<div class="hist-item">
          <div class="hist-meta">${by ? U.esc(by.name) : 'Someone'} · ${U.fmtDateTime(h.at)}</div>
          ${lines}${noteLine}
        </div>`;
      }).join('')}
    </div>` : '';
  const editedNote = (l.history && l.history.length) ? `<span class="pill-soft" style="font-size:11px">updated ${U.fmtRelative(l.history[l.history.length - 1].at)}</span>` : '';

  return `
  <div class="scrim" data-action="close-drawer"></div>
  <aside class="drawer" role="dialog" aria-label="Lead detail">
    <div class="drawer-head">
      <div class="dh-top">
        <div>
          <div class="tag-row mb-8">${U.tierChip(s, true)} ${U.stageChip(l.stage)} ${U.callbackChip(l)} ${U.clickedChip(l)}</div>
          <h2>${U.esc(D.fullName(l))}</h2>
          <div class="dh-sub">${U.esc(l.employer || '')}${owner ? ' · ' + U.esc(owner.name) : ''}</div>
        </div>
        <div class="flex" style="gap:8px;align-items:flex-start">
          <button class="drawer-edit" data-action="edit-lead" data-id="${l.id}" title="Edit lead details">✎ Edit</button>
          <button class="drawer-close" data-action="close-drawer" aria-label="Close">✕</button>
        </div>
      </div>
    </div>
    <div class="drawer-body">
      ${callbackBanner}${returningBanner}
      <div class="section-title">Contact ${editedNote}</div>
      <div class="detail-grid">
        ${detail('Phone', `<a href="tel:${U.esc(l.phone)}" style="color:var(--navy)">${U.esc(l.phone || '—')}</a>`)}
        ${detail('Email', `<a href="mailto:${U.esc(l.email)}" style="color:var(--navy)">${U.esc(l.email || '—')}</a>`)}
        ${detail('Attempts', `<span class="num">${l.attempts || 0}</span>`)}
        ${detail('Attended seminar', U.esc(l.attended || 'Unknown'))}
        ${detail('Source', U.esc(l.source && l.source !== 'Manual' ? l.source : (l.listName || '—')))}
      </div>

      <div class="section-title">FRS Profile</div>
      <div class="detail-grid">
        ${detail('Age', l.age != null ? l.age : '—')}
        ${detail('Years of Service', `<span class="num">${l.yos != null ? l.yos : '—'}</span>`)}
        ${detail('Plan Type', U.esc(l.planType || '—'))}
        ${detail('Member Class', U.esc(l.memberClass || 'Regular'))}
        ${detail('AFC / Salary', U.money(l.afc))}
        ${detail('Employer', U.esc(l.employer || '—'))}
        ${(!l.assignedTo && l.formerOwnerName) ? detail('Former owner', U.esc(l.formerOwnerName) + ' · removed') : ''}
        ${assignRow}
      </div>

      ${notesSection}
      <div class="section-title">Why this score · ${s.score}/100</div>
      <div class="card tight" style="background:rgba(194,161,77,.06);border-color:rgba(194,161,77,.3)">
        <ul style="margin:0;padding-left:6px;list-style:none">${reasons}</ul>
      </div>

      <div class="section-title">Log activity</div>
      <div class="log-box">
        <div class="type-toggle" id="act-type">
          ${D.ACTIVITY_TYPES.map((t, i) => `<button data-type="${t}" class="${i === 0 ? 'active' : ''}">${t}</button>`).join('')}
        </div>
        <div class="field-row" style="margin-bottom:12px">
          <div><label class="lbl">Disposition</label>
            <select id="act-dispo">${D.DISPOSITIONS.map(d => `<option>${d}</option>`).join('')}</select></div>
          <div><label class="lbl">Outcome</label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:500;padding-top:8px">
              <input type="checkbox" id="act-reached" style="width:auto"> Counts as a <b style="color:var(--good)">reach</b></label></div>
        </div>
        <textarea id="act-note" placeholder="Notes from the call…"></textarea>
        <div class="mt-8" style="display:flex;justify-content:flex-end;gap:8px">
          <button class="btn btn-ghost btn-sm" data-action="toggle-callback" data-id="${l.id}">📞 Log a Callback</button>
          <button class="btn btn-navy btn-sm" data-action="save-activity" data-id="${l.id}">＋ Log it</button>
        </div>
      </div>

      <div id="appt-row" hidden class="card tight mt-16" style="border-color:var(--gold)">
        <label class="lbl">Appointment date &amp; time</label>
        <input type="datetime-local" id="appt-dt">
        <div class="mt-8" style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-quiet btn-sm" data-action="toggle-appt">Cancel</button>
          <button class="btn btn-gold btn-sm" data-action="confirm-appt" data-id="${l.id}">Confirm appointment</button>
        </div>
      </div>

      <div id="callback-row" hidden class="card tight mt-16" style="border-color:var(--warn)">
        <label class="lbl">Callback date &amp; time</label>
        <input type="datetime-local" id="callback-dt">
        <div class="mt-8" style="display:flex;gap:8px;justify-content:flex-end">
          <button class="btn btn-quiet btn-sm" data-action="toggle-callback">Cancel</button>
          <button class="btn btn-gold btn-sm" data-action="confirm-callback" data-id="${l.id}">Schedule callback</button>
        </div>
      </div>

      <div class="section-title">Pipeline</div>
      ${l.apptDate ? `<p class="muted" style="font-size:13px;margin:-2px 0 12px">📅 Appointment: <b style="color:var(--navy)">${U.fmtDateTime(l.apptDate)}</b></p>` : ''}
      ${l.callbackAt ? `<p class="muted" style="font-size:13px;margin:-2px 0 12px">📞 Callback: <b style="color:var(--navy)">${U.fmtDateTime(l.callbackAt)}</b></p>` : ''}
      <div class="flex wrap-gap">${stageActions}</div>

      <div class="section-title">Activity timeline</div>
      ${timeline}

      ${history}

      ${isAdmin ? `<div class="section-title">Danger zone</div>
      <button class="btn btn-danger btn-sm" data-action="delete-lead" data-id="${l.id}">🗑 Delete this lead permanently</button>` : ''}

    </div>
  </aside>`;
};
