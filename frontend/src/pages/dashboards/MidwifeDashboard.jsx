import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { RiskBadge } from '../../components/Layout';
import WorkspaceHeader, { EmptyState, StatCard } from '../../components/WorkspaceHeader';
import { AmbulanceWidget } from '../../components/AmbulancePanel';
import { alertActions, alertExplanation } from '../../alertUtils';
import { DashTabs, KpiRow, SectionCard } from '../../components/DashTabs';

function MotherRow({ m, actions }) {
  return (
    <div className="list-row">
      <div>
        <Link to={`/pregnancies/${m.id}`} style={{ fontWeight: 600 }}>{m.full_name}</Link>
        <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>
          {m.anc_number}{m.gestational_age_weeks != null ? ` · GA ${m.gestational_age_weeks}w` : ''}
          {m.next_visit_date ? ` · Next ${String(m.next_visit_date).slice(0, 10)}` : ''}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <RiskBadge score={m.risk_score} />
        {actions}
      </div>
    </div>
  );
}

export default function MidwifeDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busyMissed, setBusyMissed] = useState(false);
  const [acking, setAcking] = useState(null);

  async function load() {
    try { setData(await api('/dashboard')); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function processMissedAnc() {
    setBusyMissed(true);
    try { await api('/anc/process-missed', { method: 'POST' }); await load(); }
    catch (e) { setError(e.message); } finally { setBusyMissed(false); }
  }

  async function confirmAlert(id) {
    setAcking(id);
    try { await api(`/pregnancies/alerts/${id}/ack`, { method: 'PATCH', body: { confirmation_note: 'Midwife confirmed' } }); await load(); }
    catch (e) { setError(e.message); } finally { setAcking(null); }
  }

  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data) return <p>Loading…</p>;

  const resp = data.responsibilities || {};
  const anc = resp.anc || { counts: {}, caseload: [] };
  const labor = resp.labor_delivery || { counts: {}, ward: [] };
  const pp = resp.postpartum || { counts: {}, queue: [] };
  const ai = data.ai_support || {};
  const risk = ai.risk_prediction || { classification: {}, priority_mothers: [] };
  const alerts = ai.clinical_alerts || { by_phase: { anc: [], labor: [], postpartum: [] } };
  const workflow = ai.workflow || { next_actions: [], reminders: [], chw_assignments: [], missing_documentation: [], summaries: [] };
  const perf = data.performance || {};
  const cls = risk.classification || {};
  const allAlerts = [...(alerts.by_phase?.anc || []), ...(alerts.by_phase?.labor || []), ...(alerts.by_phase?.postpartum || [])];

  const tabs = [
    {
      id: 'overview', icon: '🏠', label: 'Overview',
      content: (
        <>
          <KpiRow stats={[
            { label: 'In ANC', value: anc.counts?.mothers_in_anc ?? 0 },
            { label: 'In labor', value: labor.counts?.active_labor ?? 0, tone: labor.counts?.active_labor > 0 ? 'high' : 'ok' },
            { label: 'Deliveries today', value: labor.counts?.deliveries_today ?? 0, tone: 'ok' },
            { label: 'Postpartum', value: pp.counts?.mothers_postpartum ?? 0 },
            { label: 'EDD ≤7 days', value: labor.counts?.expected_7_days ?? 0 },
          ]} />

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1rem' }}>
            {[
              { to: '/pregnancies/new', icon: '➕', label: 'Register mother', sub: 'Profile · risk score' },
              { to: '/mothers', icon: '🔍', label: 'Find mother', sub: 'Search by name / ANC' },
              { to: labor.ward?.[0] ? `/pregnancies/${labor.ward[0].pregnancy_id}/partograph` : '/mothers', icon: '📈', label: 'Partograph', sub: 'Labor monitoring' },
              { to: labor.ward?.[0] ? `/pregnancies/${labor.ward[0].pregnancy_id}/delivery` : '/mothers', icon: '👶', label: 'Delivery', sub: 'Document birth' },
              { to: pp.queue?.[0] ? `/pregnancies/${pp.queue[0].id}/postpartum` : '/mothers', icon: '🩺', label: 'Postpartum', sub: 'PNC assessment' },
              { to: labor.ward?.[0] ? `/pregnancies/${labor.ward[0].pregnancy_id}/emergency` : '/mothers', icon: '🚨', label: 'Emergency', sub: 'WHO checklist', danger: true },
            ].map((a) => (
              <Link key={a.to + a.label} to={a.to} style={{
                display: 'flex', flexDirection: 'column', gap: 4,
                padding: '0.85rem 1rem', borderRadius: 12,
                background: a.danger ? 'linear-gradient(135deg,#fff0ee,#fff)' : 'var(--white)',
                border: `1px solid ${a.danger ? '#f5c6c2' : 'var(--line)'}`,
                boxShadow: '0 2px 8px rgba(11,61,46,0.05)',
                transition: 'transform 0.15s, border-color 0.15s',
                textDecoration: 'none',
              }}
              onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
              >
                <span style={{ fontSize: '1.4rem' }}>{a.icon}</span>
                <strong style={{ fontSize: '0.88rem', color: a.danger ? 'var(--red)' : 'var(--green-900)' }}>{a.label}</strong>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{a.sub}</span>
              </Link>
            ))}
          </div>

          <SectionCard title="AI next actions" hint="Suggested workflow — confirm with clinical judgment">
            {(workflow.next_actions || []).length === 0 && <EmptyState title="No urgent suggestions" />}
            {(workflow.next_actions || []).map((a, i) => (
              <div className="list-row" key={i}>
                <div>
                  <strong style={{ fontSize: '0.88rem' }}>{a.label}</strong>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{a.reason}</div>
                </div>
                <Link className="btn btn-primary" to={a.path || '/mothers'}>Open</Link>
              </div>
            ))}
            <div className="btn-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-ghost" disabled={busyMissed} onClick={processMissedAnc}>
                {busyMissed ? 'Processing…' : 'Run missed ANC → CHW'}
              </button>
              <Link className="btn btn-ghost" to="/community">Community board</Link>
            </div>
          </SectionCard>
        </>
      ),
    },
    {
      id: 'anc', icon: '🤰', label: 'ANC',
      badge: anc.counts?.due_followups,
      content: (
        <>
          <KpiRow stats={[
            { label: 'In ANC', value: anc.counts?.mothers_in_anc ?? 0 },
            { label: 'Visits today', value: anc.counts?.visits_today ?? 0, tone: 'ok' },
            { label: 'Missed / due', value: anc.counts?.due_followups ?? 0, tone: anc.counts?.due_followups > 0 ? 'high' : 'ok' },
          ]} />
          <SectionCard title="ANC caseload" action={<Link className="btn btn-primary" to="/pregnancies/new">+ Register</Link>}>
            {(anc.caseload || []).length === 0 && <EmptyState title="No ANC caseload" hint="Register a mother to begin." />}
            {(anc.caseload || []).map((m) => (
              <MotherRow key={m.id} m={m} actions={<Link className="btn btn-ghost" to={`/pregnancies/${m.id}/anc`}>ANC visit</Link>} />
            ))}
          </SectionCard>
        </>
      ),
    },
    {
      id: 'labor', icon: '🏥', label: 'Labor ward',
      badge: labor.counts?.active_labor,
      content: (
        <>
          <KpiRow stats={[
            { label: 'Active labor', value: labor.counts?.active_labor ?? 0, tone: labor.counts?.active_labor > 0 ? 'high' : 'ok' },
            { label: 'Deliveries today', value: labor.counts?.deliveries_today ?? 0, tone: 'ok' },
            { label: 'EDD ≤7 days', value: labor.counts?.expected_7_days ?? 0 },
          ]} />
          <SectionCard title="Labor ward">
            {(labor.ward || []).length === 0 && <EmptyState title="Labor ward clear" hint="Admitted mothers appear here." />}
            {(labor.ward || []).map((l) => (
              <div key={l.labor_id} style={{ borderBottom: '1px solid var(--line)', padding: '0.75rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Link to={`/pregnancies/${l.pregnancy_id}`} style={{ fontWeight: 700 }}>{l.full_name}</Link>
                  <RiskBadge score={l.risk_score} />
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6 }}>
                  {l.labor_hours}h · Dil {l.cervical_dilation ?? '—'} cm · FHR {l.fhr ?? '—'} · BP {l.bp || '—'}
                </div>
                <div className={`alert-banner alert-${l.status_label === 'Normal' ? 'LOW' : 'HIGH'}`} style={{ margin: '0 0 6px', padding: '0.4rem 0.65rem' }}>
                  {l.status_label}
                </div>
                <div className="btn-row" style={{ marginTop: 0 }}>
                  <Link className="btn btn-primary" to={`/pregnancies/${l.pregnancy_id}/partograph`}>Partograph</Link>
                  <Link className="btn btn-ghost" to={`/pregnancies/${l.pregnancy_id}/delivery`}>Delivery</Link>
                  <Link className="btn btn-danger" to={`/pregnancies/${l.pregnancy_id}/emergency`}>Emergency</Link>
                </div>
              </div>
            ))}
          </SectionCard>
        </>
      ),
    },
    {
      id: 'postpartum', icon: '👶', label: 'Postpartum',
      badge: pp.counts?.reviews_due,
      content: (
        <>
          <KpiRow stats={[
            { label: 'Postpartum', value: pp.counts?.mothers_postpartum ?? 0 },
            { label: 'Reviews due', value: pp.counts?.reviews_due ?? 0, tone: pp.counts?.reviews_due > 0 ? 'high' : 'ok' },
          ]} />
          <SectionCard title="Postpartum queue">
            {(pp.queue || []).length === 0 && <EmptyState title="No postpartum queue" />}
            {(pp.queue || []).map((m) => (
              <div className="list-row" key={m.id}>
                <div>
                  <Link to={`/pregnancies/${m.id}`} style={{ fontWeight: 600 }}>{m.full_name}</Link>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{m.anc_number} · {m.assessments_done || 0} checks done</div>
                </div>
                <Link className="btn btn-ghost" to={`/pregnancies/${m.id}/postpartum`}>Assess</Link>
              </div>
            ))}
          </SectionCard>
        </>
      ),
    },
    {
      id: 'alerts', icon: '⚠️', label: 'AI alerts',
      badge: allAlerts.filter((a) => a.status === 'active').length,
      content: (
        <>
          <KpiRow stats={[
            { label: 'Low risk', value: cls.LOW ?? 0, tone: 'ok' },
            { label: 'Medium risk', value: cls.MEDIUM ?? 0 },
            { label: 'High risk', value: cls.HIGH ?? 0, tone: 'high' },
            { label: 'Critical', value: cls.CRITICAL ?? 0, tone: 'critical' },
          ]} />
          {['anc', 'labor', 'postpartum'].map((phase) => {
            const list = alerts.by_phase?.[phase] || [];
            return (
              <SectionCard key={phase} title={phase.toUpperCase()} hint={{ anc: 'Preeclampsia · anemia · GDM', labor: 'Fetal distress · prolonged labor', postpartum: 'PPH · infection · mood' }[phase]}>
                {list.length === 0 && <p className="empty">No active alerts</p>}
                {list.slice(0, 5).map((a) => (
                  <div key={a.id} className={`alert-banner alert-${a.severity}`} style={{ marginBottom: 8 }}>
                    <strong>{a.title}</strong>
                    <div style={{ fontSize: '0.8rem' }}>{a.full_name}</div>
                    {alertExplanation(a.recommended_actions) && <div style={{ fontSize: '0.75rem', marginTop: 3 }}>{alertExplanation(a.recommended_actions)}</div>}
                    {alertActions(a.recommended_actions).length > 0 && <div style={{ fontSize: '0.75rem', marginTop: 3 }}>{alertActions(a.recommended_actions).slice(0, 3).join(' · ')}</div>}
                    <div className="btn-row" style={{ marginTop: 6 }}>
                      <Link className="btn btn-ghost" to={`/pregnancies/${a.pregnancy_id}`}>Review</Link>
                      {a.status === 'active' && <button type="button" className="btn btn-outline" disabled={acking === a.id} onClick={() => confirmAlert(a.id)}>{acking === a.id ? '…' : 'Confirm AI'}</button>}
                      <Link className="btn btn-outline" to={`/pregnancies/${a.pregnancy_id}/emergency`}>Escalate</Link>
                    </div>
                  </div>
                ))}
              </SectionCard>
            );
          })}
          <SectionCard title="Priority mothers">
            {(risk.priority_mothers || []).length === 0 && <EmptyState title="No elevated-risk mothers" />}
            {(risk.priority_mothers || []).map((m) => (
              <MotherRow key={m.id} m={m} actions={
                <>
                  <Link className="btn btn-ghost" to={`/pregnancies/${m.id}`}>Profile</Link>
                  {m.status === 'anc' && <Link className="btn btn-outline" to={`/pregnancies/${m.id}/anc`}>ANC</Link>}
                  {m.status === 'labor' && <Link className="btn btn-outline" to={`/pregnancies/${m.id}/partograph`}>Labor</Link>}
                  {m.status === 'postpartum' && <Link className="btn btn-outline" to={`/pregnancies/${m.id}/postpartum`}>PNC</Link>}
                </>
              } />
            ))}
          </SectionCard>
        </>
      ),
    },
    {
      id: 'workflow', icon: '📋', label: 'Workflow',
      content: (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <SectionCard title="Reminders">
              {(workflow.reminders || []).length === 0 && <p className="empty">No pending reminders</p>}
              {(workflow.reminders || []).slice(0, 6).map((t) => (
                <div className="list-row" key={t.id}>
                  <span style={{ fontSize: '0.88rem' }}>{t.title}</span>
                  <span className="badge badge-MEDIUM">{t.due_date ? String(t.due_date).slice(0, 10) : t.status}</span>
                </div>
              ))}
            </SectionCard>
            <SectionCard title="CHW assignments">
              {(workflow.chw_assignments || []).length === 0 && <p className="empty">No CHW tasks queued</p>}
              {(workflow.chw_assignments || []).map((t) => (
                <div className="list-row" key={t.id}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{t.full_name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{t.title}</div>
                  </div>
                  <Link className="btn btn-ghost" to="/community">Follow-up</Link>
                </div>
              ))}
            </SectionCard>
            <SectionCard title="Documentation gaps">
              {(workflow.missing_documentation || []).length === 0 && <EmptyState title="Documentation complete" />}
              {(workflow.missing_documentation || []).map((g) => (
                <div className="list-row" key={g.id}>
                  <div>
                    <Link to={`/pregnancies/${g.id}`} style={{ fontWeight: 600 }}>{g.full_name}</Link>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{g.gap}</div>
                  </div>
                  <Link className="btn btn-ghost" to={`/pregnancies/${g.id}`}>Fix</Link>
                </div>
              ))}
            </SectionCard>
            <SectionCard title="AI summaries">
              {(workflow.summaries || []).map((s) => (
                <div className="list-row" key={s.label}>
                  <span style={{ fontSize: '0.88rem' }}>{s.label}</span>
                  <strong style={{ fontSize: '0.85rem' }}>{s.text}</strong>
                </div>
              ))}
            </SectionCard>
          </div>
        </>
      ),
    },
    {
      id: 'ambulance', icon: '🚑', label: 'Ambulance',
      content: <AmbulanceWidget data={data.ambulance} role="midwife" onRequested={load} />,
    },
    {
      id: 'performance', icon: '📊', label: 'Performance',
      content: (
        <KpiRow stats={[
          { label: 'Mothers managed', value: perf.mothers_managed ?? 0 },
          { label: 'ANC visits', value: perf.anc_completed ?? 0, tone: 'ok' },
          { label: 'Deliveries', value: perf.deliveries_attended ?? 0, tone: 'ok' },
          { label: 'Emergencies', value: perf.emergencies_handled ?? 0 },
          { label: 'Follow-ups', value: perf.followups_completed ?? 0 },
        ]} />
      ),
    },
  ];

  return (
    <div>
      <WorkspaceHeader brand="Primary maternal care" title="Midwife workspace" subtitle="AI-guided care from registration to postpartum" context={data.context} />
      {error && <p className="error-text">{error}</p>}
      <DashTabs tabs={tabs} storageKey="dash_midwife_tab" />
    </div>
  );
}
