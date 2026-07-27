import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { RiskBadge } from '../../components/Layout';
import WorkspaceHeader, { EmptyState, StatCard } from '../../components/WorkspaceHeader';
import { DashTabs, KpiRow, SectionCard } from '../../components/DashTabs';

export default function ChwDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [busy, setBusy] = useState(null);
  const [smsDraft, setSmsDraft] = useState(null);
  const [visit, setVisit] = useState({ task_id: '', pregnancy_id: '', mother_condition: 'stable', challenges: [], education_topics: [], danger_signs: false, notes: '', community_phone: '', community_village: '' });

  async function load() {
    try { setData(await api('/dashboard')); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  function toggleList(field, value) {
    setVisit((v) => ({ ...v, [field]: v[field].includes(value) ? v[field].filter((x) => x !== value) : [...v[field], value] }));
  }

  async function completeQuick(id) {
    setBusy(id);
    try { await api(`/community/tasks/${id}`, { method: 'PATCH', body: { status: 'completed' } }); setOkMsg('Visit marked complete.'); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(null); }
  }

  async function submitHomeVisit(e) {
    e.preventDefault(); setError(''); setOkMsg('');
    if (!visit.pregnancy_id) { setError('Select a mother.'); return; }
    setBusy('visit');
    try {
      const res = await api('/community/home-visit', { method: 'POST', body: { ...visit, pregnancy_id: Number(visit.pregnancy_id), task_id: visit.task_id ? Number(visit.task_id) : undefined } });
      setOkMsg(res.sms_stub?.template || 'Home visit recorded.');
      setVisit({ task_id: '', pregnancy_id: '', mother_condition: 'stable', challenges: [], education_topics: [], danger_signs: false, notes: '', community_phone: '', community_village: '' });
      await load();
    } catch (err) { setError(err.message); } finally { setBusy(null); }
  }

  async function draftSms(pregnancy_id, template_type) {
    setBusy(`sms-${pregnancy_id}`);
    try { const res = await api('/community/sms-draft', { method: 'POST', body: { pregnancy_id, template_type } }); setSmsDraft(res); setOkMsg('SMS draft queued.'); }
    catch (e) { setError(e.message); } finally { setBusy(null); }
  }

  function fillVisitFromTask(task) {
    setVisit((v) => ({ ...v, task_id: String(task.task_id || task.id || ''), pregnancy_id: String(task.pregnancy_id), community_phone: task.phone || '', community_village: task.village || '' }));
  }

  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data) return <p>Loading…</p>;

  const t = data.today || {};
  const mothers = data.pregnancy_identification?.assigned_mothers || data.assigned_mothers || [];
  const followup = data.home_followup || {};
  const missed = followup.missed || { anc: [], pnc: [] };
  const tasks = followup.tasks || [];
  const education = Array.isArray(data.maternal_education || data.education) ? (data.maternal_education || data.education) : [];
  const ai = data.ai_support || {};
  const prio = ai.followup_prioritization || { queue: [], counts: {} };
  const comm = ai.communication_assistant || { templates: [] };
  const locations = ai.location_risk_analysis?.communities || [];

  const visitMotherOptions = (() => {
    const map = new Map();
    for (const m of [...mothers, ...(prio.queue || []).map((f) => ({ id: f.pregnancy_id, full_name: f.full_name, anc_number: f.anc_number, phone: f.phone, village: f.village })), ...tasks.map((tk) => ({ id: tk.pregnancy_id, full_name: tk.full_name, anc_number: tk.anc_number, phone: tk.phone, village: tk.village }))]) {
      if (!map.has(Number(m.id))) map.set(Number(m.id), m);
    }
    return [...map.values()];
  })();

  const tabs = [
    {
      id: 'overview', icon: '🏠', label: 'Overview',
      content: (
        <>
          <KpiRow stats={[
            { label: 'Assigned mothers', value: mothers.length },
            { label: 'High priority', value: prio.counts?.HIGH ?? 0, tone: prio.counts?.HIGH > 0 ? 'high' : 'ok' },
            { label: 'Visits today', value: t.visits_completed ?? 0, tone: 'ok' },
            { label: 'Open tasks', value: tasks.length, tone: tasks.length > 0 ? 'high' : 'ok' },
          ]} />
          <SectionCard title="AI priority follow-ups" hint="High = missed ANC + high-risk. Start here.">
            {(prio.queue || []).length === 0 && <EmptyState title="No prioritized follow-ups" />}
            {(prio.queue || []).slice(0, 6).map((f) => (
              <div key={f.task_id} className={`alert-banner alert-${f.priority_band === 'HIGH' ? 'HIGH' : 'MEDIUM'}`} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <span className={`badge badge-${f.priority_band === 'HIGH' ? 'HIGH' : 'MEDIUM'}`} style={{ marginRight: 6 }}>{f.priority_band}</span>
                    <strong>{f.full_name}</strong>
                    <div style={{ fontSize: '0.82rem' }}>{f.title}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{f.priority_reason} · {f.village || 'Community'}</div>
                  </div>
                  <RiskBadge score={f.risk_score} />
                </div>
                <div className="btn-row" style={{ marginTop: 8 }}>
                  <button type="button" className="btn btn-primary" onClick={() => fillVisitFromTask(f)}>Record visit</button>
                  <button type="button" className="btn btn-ghost" disabled={busy === `sms-${f.pregnancy_id}`} onClick={() => draftSms(f.pregnancy_id, f.priority_band === 'HIGH' ? 'high_priority' : 'reminder')}>Draft SMS</button>
                  <Link className="btn btn-outline" to={`/pregnancies/${f.pregnancy_id}`}>Open</Link>
                </div>
              </div>
            ))}
          </SectionCard>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Link className="btn btn-primary" to="/pregnancies/new">Support registration</Link>
            <Link className="btn btn-ghost" to="/mothers">Find mother</Link>
            <Link className="btn btn-ghost" to="/community">Community board</Link>
          </div>
        </>
      ),
    },
    {
      id: 'mothers', icon: '🤰', label: 'My mothers',
      content: (
        <>
          <KpiRow stats={[
            { label: 'Assigned', value: mothers.length },
            { label: 'High-risk', value: mothers.filter((m) => ['HIGH', 'CRITICAL'].includes(m.risk_score)).length, tone: 'high' },
          ]} />
          <SectionCard title="Assigned mothers" action={<Link className="btn btn-primary" to="/pregnancies/new">+ Register</Link>}>
            {mothers.length === 0 && <EmptyState title="No assigned mothers" hint="Facility midwives assign tasks to you." />}
            {mothers.map((m) => (
              <div className="list-row" key={m.id}>
                <div>
                  <Link to={`/pregnancies/${m.id}`} style={{ fontWeight: 600 }}>{m.full_name}</Link>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{m.anc_number} · {m.village || 'Community'} · {m.phone || 'No phone'}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <RiskBadge score={m.risk_score} />
                  <button type="button" className="btn btn-ghost" onClick={() => fillVisitFromTask({ pregnancy_id: m.id, phone: m.phone, village: m.village })}>Visit</button>
                </div>
              </div>
            ))}
          </SectionCard>
        </>
      ),
    },
    {
      id: 'visits', icon: '🏘️', label: 'Home visits',
      badge: tasks.length,
      content: (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            <SectionCard title="Missed ANC">
              {(missed.anc || []).length === 0 && <p className="empty">None assigned</p>}
              {(missed.anc || []).map((m) => (
                <div className="list-row" key={m.id}>
                  <div>
                    <Link to={`/pregnancies/${m.pregnancy_id}`} style={{ fontWeight: 600 }}>{m.full_name}</Link>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{m.phone || 'Call via facility'}</div>
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={() => fillVisitFromTask(m)}>Visit</button>
                </div>
              ))}
            </SectionCard>
            <SectionCard title="Missed PNC (Day 7 / 42)">
              {(missed.pnc || []).length === 0 && <p className="empty">None assigned</p>}
              {(missed.pnc || []).map((m) => (
                <div className="list-row" key={m.id}>
                  <div>
                    <Link to={`/pregnancies/${m.pregnancy_id}`} style={{ fontWeight: 600 }}>{m.full_name}</Link>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{m.task_type}</div>
                  </div>
                  <button type="button" className="btn btn-ghost" onClick={() => fillVisitFromTask(m)}>Visit</button>
                </div>
              ))}
            </SectionCard>
          </div>
          <SectionCard title="Open visit tasks">
            {tasks.length === 0 && <EmptyState title="No open visits" />}
            {tasks.map((task) => (
              <div className="list-row" key={task.id}>
                <div>
                  <strong style={{ fontSize: '0.88rem' }}>{task.title}</strong>
                  <div style={{ fontSize: '0.8rem' }}><Link to={`/pregnancies/${task.pregnancy_id}`}>{task.full_name}</Link> · due {task.due_date || '—'}</div>
                </div>
                <div className="btn-row" style={{ margin: 0 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => fillVisitFromTask(task)}>Record</button>
                  <button type="button" className="btn btn-primary" disabled={busy === task.id} onClick={() => completeQuick(task.id)}>Done</button>
                </div>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="Record home visit">
            {okMsg && <p style={{ color: 'var(--green-800)', marginBottom: '0.5rem' }}>{okMsg}</p>}
            {error && <p className="error-text">{error}</p>}
            <form onSubmit={submitHomeVisit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="field">
                  <label>Mother *</label>
                  <select required value={visit.pregnancy_id} onChange={(e) => setVisit({ ...visit, pregnancy_id: e.target.value })}>
                    <option value="">Select…</option>
                    {visitMotherOptions.map((m) => <option key={m.id} value={m.id}>{m.full_name}{m.anc_number ? ` (${m.anc_number})` : ''}</option>)}
                  </select>
                </div>
                <div className="field">
                  <label>Condition</label>
                  <select value={visit.mother_condition} onChange={(e) => setVisit({ ...visit, mother_condition: e.target.value })}>
                    <option value="stable">Stable</option>
                    <option value="needs_facility">Needs facility visit</option>
                    <option value="unwell">Unwell</option>
                    <option value="emergency">Emergency — escalate</option>
                  </select>
                </div>
                <div className="field">
                  <label>Phone</label>
                  <input value={visit.community_phone} onChange={(e) => setVisit({ ...visit, community_phone: e.target.value })} placeholder="Community phone" />
                </div>
                <div className="field">
                  <label>Village</label>
                  <input value={visit.community_village} onChange={(e) => setVisit({ ...visit, community_village: e.target.value })} placeholder="Village / cell" />
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: 6 }}>Challenges</strong>
                <div className="check-grid">
                  {['Transport', 'Cost', 'Family resistance', 'Distance', 'No childcare', 'Other'].map((c) => (
                    <label className="check-item" key={c}><input type="checkbox" checked={visit.challenges.includes(c)} onChange={() => toggleList('challenges', c)} />{c}</label>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.85rem', display: 'block', marginBottom: 6 }}>Education provided</strong>
                <div className="check-grid">
                  {['Nutrition', 'Birth preparedness', 'Danger signs', 'Facility delivery'].map((c) => (
                    <label className="check-item" key={c}><input type="checkbox" checked={visit.education_topics.includes(c)} onChange={() => toggleList('education_topics', c)} />{c}</label>
                  ))}
                </div>
              </div>
              <label className="check-item" style={{ marginBottom: '0.75rem' }}>
                <input type="checkbox" checked={visit.danger_signs} onChange={(e) => setVisit({ ...visit, danger_signs: e.target.checked })} />
                Danger signs observed — notify facility
              </label>
              <div className="field">
                <label>Notes</label>
                <textarea rows={2} value={visit.notes} onChange={(e) => setVisit({ ...visit, notes: e.target.value })} />
              </div>
              <button className="btn btn-primary" type="submit" disabled={busy === 'visit'}>{busy === 'visit' ? 'Saving…' : 'Save home visit'}</button>
            </form>
          </SectionCard>
        </>
      ),
    },
    {
      id: 'education', icon: '📚', label: 'Education & SMS',
      content: (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
            {education.map((ed) => (
              <SectionCard key={ed.id} title={ed.title} hint={ed.topic}>
                <ul style={{ margin: '0 0 0.5rem', paddingLeft: '1.1rem', color: 'var(--muted)', fontSize: '0.85rem' }}>
                  {(ed.talking_points || []).map((p) => <li key={p}>{p}</li>)}
                </ul>
                {ed.sms && <div style={{ padding: '0.5rem 0.65rem', background: 'var(--sky-50)', borderRadius: 8, fontSize: '0.82rem', marginBottom: 8 }}>{ed.sms}</div>}
                {(prio.queue || [])[0] && (
                  <button type="button" className="btn btn-ghost" onClick={() => draftSms(prio.queue[0].pregnancy_id, ed.id === 'nutrition' ? 'education_nutrition' : ed.id === 'danger_signs' ? 'education_danger' : 'education_birth')}>
                    Queue SMS
                  </button>
                )}
              </SectionCard>
            ))}
          </div>
          <SectionCard title="AI communication assistant" hint={comm.description}>
            {(comm.templates || []).length === 0 && <EmptyState title="No SMS drafts yet" />}
            {(comm.templates || []).slice(0, 6).map((tpl) => (
              <div key={tpl.pregnancy_id} style={{ borderBottom: '1px solid var(--line)', padding: '0.65rem 0' }}>
                <strong style={{ fontSize: '0.88rem' }}>{tpl.full_name}</strong>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{tpl.phone || 'No phone'} · {tpl.priority_band}</div>
                <div style={{ padding: '0.4rem 0.6rem', background: 'var(--sky-50)', borderRadius: 8, fontSize: '0.82rem', margin: '6px 0' }}>{tpl.sms_reminder}</div>
                <button type="button" className="btn btn-ghost" disabled={busy === `sms-${tpl.pregnancy_id}`} onClick={() => draftSms(tpl.pregnancy_id, tpl.priority_band === 'HIGH' ? 'high_priority' : 'reminder')}>Queue SMS stub</button>
              </div>
            ))}
            {smsDraft && <div className="alert-banner alert-LOW" style={{ marginTop: '0.75rem' }}><strong>Last SMS draft</strong><div>{smsDraft.message}</div></div>}
          </SectionCard>
        </>
      ),
    },
    {
      id: 'location', icon: '📍', label: 'Location risk',
      content: (
        <SectionCard title="AI location risk analysis" hint="Communities with missed visits and high-risk trends">
          {locations.length === 0 && <EmptyState title="No community risk patterns yet" />}
          {locations.map((loc) => (
            <div className="list-row" key={loc.village}>
              <div>
                <strong>{loc.village}</strong>
                <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{loc.mothers} mothers · {loc.high_risk} high-risk · {loc.missed} missed · {loc.trend}</div>
              </div>
              <span className={`badge badge-${loc.risk_level === 'HIGH' ? 'HIGH' : loc.risk_level === 'MEDIUM' ? 'MEDIUM' : 'LOW'}`}>{loc.risk_level}</span>
            </div>
          ))}
        </SectionCard>
      ),
    },
  ];

  return (
    <div>
      <WorkspaceHeader brand="Community maternal follow-up" title="CHW workspace" subtitle="Home visits, education, and community follow-up" context={data.context} />
      {error && <p className="error-text">{error}</p>}
      {okMsg && <p style={{ color: 'var(--green-800)', marginBottom: '0.5rem' }}>{okMsg}</p>}
      <DashTabs tabs={tabs} storageKey="dash_chw_tab" />
    </div>
  );
}
