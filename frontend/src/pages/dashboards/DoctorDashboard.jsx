import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import { RiskBadge } from '../../components/Layout';
import WorkspaceHeader, { EmptyState } from '../../components/WorkspaceHeader';
import { AmbulanceWidget } from '../../components/AmbulancePanel';
import { alertActions, alertExplanation } from '../../alertUtils';
import { DashTabs, KpiRow, SectionCard } from '../../components/DashTabs';

function CdsBox({ cds }) {
  if (!cds) return null;
  return (
    <div style={{ marginTop: 6, padding: '0.55rem 0.75rem', borderRadius: 8, background: 'rgba(11,61,46,0.04)', borderLeft: '3px solid var(--green-700)', fontSize: '0.85rem' }}>
      <strong>{cds.possible_diagnosis}</strong>
      <div style={{ color: 'var(--muted)', marginTop: 2 }}>{cds.explanation}</div>
      {(cds.recommendations || []).length > 0 && (
        <div style={{ marginTop: 4 }}>Recommend: {cds.recommendations.slice(0, 3).join(' · ')}</div>
      )}
    </div>
  );
}

export default function DoctorDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  const [note, setNote] = useState({});
  const [transferNote, setTransferNote] = useState({});
  const [acking, setAcking] = useState(null);
  const [busyRef, setBusyRef] = useState(null);

  async function load() {
    try { setData(await api('/dashboard')); } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function ackAlert(id) {
    setAcking(id); setError('');
    try {
      await api(`/pregnancies/alerts/${id}/ack`, { method: 'PATCH', body: { confirmation_note: note[id] || 'Doctor validated AI recommendation' } });
      setOkMsg('AI recommendation confirmed.'); await load();
    } catch (e) { setError(e.message); } finally { setAcking(null); }
  }

  async function decideReferral(id, status) {
    setBusyRef(id); setError('');
    try {
      const recommendation = [note[id], transferNote[id]].filter(Boolean).join(' | ') || undefined;
      await api(`/pregnancies/referrals/${id}`, { method: 'PATCH', body: { status, clinical_recommendation: recommendation } });
      setOkMsg(`Referral marked ${status}.`); await load();
    } catch (e) { setError(e.message); } finally { setBusyRef(null); }
  }

  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data) return <p>Loading…</p>;

  const review = data.clinical_review || {};
  const em = data.emergency_management || data.emergency_center || { counts: {}, cases: [] };
  const refs = data.referral_management || { pending: [] };
  const ai = data.ai_support || {};
  const cds = ai.clinical_decision_support || {};
  const prio = ai.emergency_prioritization || { bands: {}, queue: [] };
  const queue = data.decision_queue || {};
  const perf = data.performance || {};
  const c = em.counts || {};
  const bands = prio.bands || {};

  const tabs = [
    {
      id: 'overview', icon: '🏠', label: 'Overview',
      content: (
        <>
          <KpiRow stats={[
            { label: 'Critical', value: bands.CRITICAL ?? 0, tone: 'critical' },
            { label: 'Urgent', value: bands.URGENT ?? 0, tone: 'high' },
            { label: 'Review required', value: bands.REVIEW ?? 0 },
            { label: 'Active emergencies', value: c.active ?? 0, tone: c.active > 0 ? 'critical' : 'ok' },
            { label: 'Pending referrals', value: (refs.pending || []).length, tone: (refs.pending || []).length > 0 ? 'high' : 'ok' },
          ]} />
          <SectionCard title="AI priority queue" hint="Critical → Urgent → Review Required">
            {(prio.queue || []).length === 0 && <EmptyState title="No prioritized cases" hint="Emergencies and critical alerts appear here." />}
            {(prio.queue || []).slice(0, 8).map((item) => (
              <div key={`${item.kind}-${item.id}`} className={`alert-banner alert-${item.priority_band === 'CRITICAL' ? 'CRITICAL' : item.priority_band === 'URGENT' ? 'HIGH' : 'MEDIUM'}`} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <span className="badge badge-CRITICAL" style={{ marginRight: 6 }}>{item.priority_band}</span>
                    <strong>{item.title}</strong>
                    <div style={{ fontSize: '0.85rem' }}>{item.full_name}</div>
                  </div>
                  <Link className="btn btn-ghost" to={item.path}>Open</Link>
                </div>
                <CdsBox cds={item.cds} />
              </div>
            ))}
          </SectionCard>
        </>
      ),
    },
    {
      id: 'review', icon: '🔬', label: 'Clinical review',
      content: (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <SectionCard title="High-risk pregnancies">
              {(review.high_risk || []).length === 0 && <EmptyState title="No high-risk mothers" />}
              {(review.high_risk || []).map((r) => (
                <div className="list-row" key={r.id}>
                  <div>
                    <Link to={`/pregnancies/${r.id}`} style={{ fontWeight: 600 }}>{r.full_name}</Link>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{r.anc_number}{r.risk_percent != null ? ` · AI ${r.risk_percent}%` : ''}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <RiskBadge score={r.risk_score} />
                    <Link className="btn btn-ghost" to={`/pregnancies/${r.id}`}>Review</Link>
                  </div>
                </div>
              ))}
            </SectionCard>
            <SectionCard title="Abnormal lab / ANC findings">
              {(review.abnormal_anc_results || []).length === 0 && <EmptyState title="No abnormal findings" />}
              {(review.abnormal_anc_results || []).slice(0, 8).map((a) => (
                <div className="list-row" key={a.id}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 600 }}>{a.title}</div>
                    <Link to={`/pregnancies/${a.pregnancy_id}`} style={{ fontSize: '0.8rem' }}>{a.full_name}</Link>
                  </div>
                  <span className={`badge badge-${a.severity}`}>{a.severity}</span>
                </div>
              ))}
            </SectionCard>
          </div>
          <SectionCard title="AI alerts to validate">
            {(review.ai_alerts_to_validate || []).length === 0 && <EmptyState title="No AI alerts awaiting validation" />}
            {(review.ai_alerts_to_validate || []).slice(0, 8).map((a) => (
              <div key={a.id} style={{ borderBottom: '1px solid var(--line)', padding: '0.75rem 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <span className={`badge badge-${a.severity}`} style={{ marginRight: 6 }}>{a.severity}</span>
                    <strong>{a.title}</strong>
                    <div style={{ fontSize: '0.85rem' }}><Link to={`/pregnancies/${a.pregnancy_id}`}>{a.full_name}</Link> · {a.anc_number}</div>
                    <div style={{ fontSize: '0.82rem', color: 'var(--muted)' }}>{a.message}</div>
                    {alertExplanation(a.recommended_actions) && <div style={{ fontSize: '0.8rem', marginTop: 3 }}>Why: {alertExplanation(a.recommended_actions)}</div>}
                  </div>
                </div>
                <CdsBox cds={a.cds} />
                {alertActions(a.recommended_actions).length > 0 && <div style={{ fontSize: '0.8rem', marginTop: 4 }}>Actions: {alertActions(a.recommended_actions).join(' · ')}</div>}
                <input style={{ width: '100%', margin: '0.5rem 0', padding: '0.5rem', borderRadius: 8, border: '1px solid var(--line)', fontSize: '0.88rem' }}
                  placeholder="Optional clinical note / treatment plan"
                  value={note[a.id] || ''} onChange={(e) => setNote((n) => ({ ...n, [a.id]: e.target.value }))} />
                <div className="btn-row">
                  <button type="button" className="btn btn-primary" disabled={acking === a.id} onClick={() => ackAlert(a.id)}>{acking === a.id ? 'Saving…' : 'Confirm AI'}</button>
                  <Link className="btn btn-ghost" to={`/pregnancies/${a.pregnancy_id}`}>History</Link>
                  {['CRITICAL', 'HIGH'].includes(a.severity) && <Link className="btn btn-danger" to={`/pregnancies/${a.pregnancy_id}/emergency`}>Emergency</Link>}
                </div>
              </div>
            ))}
          </SectionCard>
        </>
      ),
    },
    {
      id: 'emergencies', icon: '🚨', label: 'Emergencies',
      badge: c.active,
      content: (
        <>
          <KpiRow stats={[
            { label: 'Active', value: c.active ?? 0, tone: c.active > 0 ? 'critical' : 'ok' },
            { label: 'Eclampsia', value: c.eclampsia ?? 0, tone: c.eclampsia > 0 ? 'critical' : 'ok' },
            { label: 'PPH', value: c.pph ?? 0, tone: c.pph > 0 ? 'critical' : 'ok' },
            { label: 'Sepsis', value: c.sepsis ?? 0, tone: c.sepsis > 0 ? 'high' : 'ok' },
            { label: 'Fetal distress', value: c.fetal_distress ?? 0, tone: c.fetal_distress > 0 ? 'high' : 'ok' },
          ]} />
          <SectionCard title="Active emergency cases">
            {(em.cases || []).length === 0 && <EmptyState title="No active emergencies" />}
            {(em.cases || []).map((e) => (
              <div className="list-row" key={e.id}>
                <div>
                  <Link to={`/emergencies/${e.id}`} style={{ fontWeight: 700 }}>{e.full_name}</Link>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{String(e.emergency_type).replace(/_/g, ' ')} · {e.status}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className={`badge ${e.status === 'active' ? 'badge-CRITICAL' : 'badge-HIGH'}`}>{e.status}</span>
                  <Link className="btn btn-danger" to={`/emergencies/${e.id}`}>Manage</Link>
                </div>
              </div>
            ))}
          </SectionCard>
        </>
      ),
    },
    {
      id: 'referrals', icon: '🔄', label: 'Referrals',
      badge: (refs.pending || []).length,
      content: (
        <SectionCard title="Pending referrals" hint="Accept, add transfer instructions, or decline">
          {(refs.pending || []).length === 0 && <EmptyState title="No pending referrals" />}
          {(refs.pending || []).map((r) => (
            <div key={r.id} style={{ borderBottom: '1px solid var(--line)', padding: '0.85rem 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                <div>
                  <Link to={`/pregnancies/${r.pregnancy_id}`} style={{ fontWeight: 700 }}>{r.full_name}</Link>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>→ {r.to_facility_name} · {r.urgency} · {r.anc_number}</div>
                  {r.reason && <div style={{ fontSize: '0.85rem', marginTop: 4 }}><strong>Reason:</strong> {r.reason}</div>}
                  {r.clinical_summary && <div style={{ fontSize: '0.85rem' }}><strong>Summary:</strong> {r.clinical_summary}</div>}
                  {r.vital_signs && <div style={{ fontSize: '0.85rem' }}><strong>Vitals:</strong> {r.vital_signs}</div>}
                </div>
                <RiskBadge score={r.risk_score} />
              </div>
              <input style={{ width: '100%', marginBottom: 6, padding: '0.5rem', borderRadius: 8, border: '1px solid var(--line)', fontSize: '0.88rem' }}
                placeholder="Clinical recommendation / treatment approval"
                value={note[r.id] || ''} onChange={(e) => setNote((n) => ({ ...n, [r.id]: e.target.value }))} />
              <input style={{ width: '100%', marginBottom: 6, padding: '0.5rem', borderRadius: 8, border: '1px solid var(--line)', fontSize: '0.88rem' }}
                placeholder="Transfer instructions for receiving hospital"
                value={transferNote[r.id] || ''} onChange={(e) => setTransferNote((n) => ({ ...n, [r.id]: e.target.value }))} />
              <div className="btn-row">
                <button type="button" className="btn btn-primary" disabled={busyRef === r.id} onClick={() => decideReferral(r.id, 'accepted')}>Approve</button>
                <button type="button" className="btn btn-ghost" disabled={busyRef === r.id} onClick={() => decideReferral(r.id, 'transferred')}>Mark transferred</button>
                <button type="button" className="btn btn-ghost" disabled={busyRef === r.id} onClick={() => decideReferral(r.id, 'cancelled')}>Decline</button>
                <Link className="btn btn-outline" to={`/pregnancies/${r.pregnancy_id}`}>History</Link>
              </div>
            </div>
          ))}
        </SectionCard>
      ),
    },
    {
      id: 'ambulance', icon: '🚑', label: 'Ambulance',
      content: <AmbulanceWidget data={data.ambulance} role="doctor" onRequested={load} />,
    },
    {
      id: 'performance', icon: '📊', label: 'Performance',
      content: (
        <KpiRow stats={[
          { label: 'Cases reviewed', value: perf.cases_reviewed ?? 0 },
          { label: 'Emergencies managed', value: perf.emergencies_managed ?? 0 },
          { label: 'Referrals approved', value: perf.referrals_approved ?? 0, tone: 'ok' },
          { label: 'Pending reviews', value: perf.pending_reviews ?? 0, tone: perf.pending_reviews > 0 ? 'high' : 'ok' },
        ]} />
      ),
    },
  ];

  return (
    <div>
      <WorkspaceHeader brand="Clinical decision support" title="Doctor workspace" subtitle="Validate AI recommendations, manage emergencies, approve referrals" context={data.context} />
      {error && <p className="error-text">{error}</p>}
      {okMsg && <p style={{ color: 'var(--green-800)', marginBottom: '0.75rem' }}>{okMsg}</p>}
      <DashTabs tabs={tabs} storageKey="dash_doctor_tab" />
    </div>
  );
}
