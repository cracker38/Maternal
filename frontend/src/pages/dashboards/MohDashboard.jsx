import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import WorkspaceHeader, { EmptyState } from '../../components/WorkspaceHeader';
import { ReportPanel } from '../../components/UxGuide';
import { useAuth } from '../../auth';
import { exportDashboardPdf } from '../../exportPdf';
import { DashTabs, KpiRow, SectionCard } from '../../components/DashTabs';

export default function MohDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState('');
  const [policyMsg, setPolicyMsg] = useState('');

  useEffect(() => {
    Promise.all([api('/dashboard'), api('/analytics?scope=national')])
      .then(([d, a]) => { setData(d); setAnalytics(a); })
      .catch((e) => setError(e.message));
  }, []);

  function exportReport(kind, title) {
    exportDashboardPdf({ kind, title: title || kind.replace(/_/g, ' '), user, dashboard: data, analytics });
    setPolicyMsg(`${(title || kind).replace(/_/g, ' ')} exported as PDF.`);
  }

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p>Loading…</p>;

  const ov = data.national_overview || {};
  const mon = data.national_monitoring || {};
  const risk = data.national_risk || {};
  const ranking = data.district_ranking || [];
  const pred = data.predictions || {};
  const governance = data.digital_health_governance || {};
  const policy = data.policy_and_planning || {};
  const ind = analytics?.indicators || {};
  const ai = data.ai_support || {};
  const insights = ai.national_health_intelligence?.insights || [];
  const predictions = ai.predictive_modeling?.predictions || [];
  const reports = ai.report_generation?.reports || [];

  const tabs = [
    {
      id: 'overview', icon: '🇷🇼', label: 'National overview',
      content: (
        <>
          <KpiRow stats={[
            { label: 'Pregnancies', value: ov.registered_mothers ?? 0 },
            { label: 'ANC completion', value: ind.anc_coverage ?? 0, unit: '%', tone: 'ok' },
            { label: 'PNC completion', value: ind.pnc_coverage ?? 0, unit: '%', tone: 'ok' },
            { label: 'Skilled birth attendance', value: ov.skilled_birth_attendance ?? ov.deliveries ?? 0 },
            { label: 'Maternal deaths', value: mon.maternal_mortality ?? ind.maternal_deaths ?? 0, tone: (mon.maternal_mortality ?? 0) > 0 ? 'critical' : 'ok' },
            { label: 'Emergencies', value: mon.emergency_cases ?? risk.emergencies ?? 0, tone: (mon.emergency_cases ?? 0) > 0 ? 'high' : 'ok' },
          ]} />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <SectionCard title="Risk monitoring">
              <KpiRow stats={[
                { label: 'High-risk', value: risk.high_risk ?? 0, tone: 'high' },
                { label: 'Critical', value: risk.critical ?? 0, tone: 'critical' },
                { label: 'Hypertension alerts', value: risk.disease_flags?.hypertension ?? 0 },
                { label: 'Severe anemia', value: risk.disease_flags?.anemia ?? 0 },
              ]} />
            </SectionCard>
            <SectionCard title="Prediction signals">
              <div className="alert-banner alert-MEDIUM" style={{ marginBottom: 8 }}><strong>Mortality vigilance</strong><div style={{ fontSize: '0.85rem' }}>{pred.mortality_signal}</div></div>
              <div className="alert-banner alert-HIGH" style={{ marginBottom: 8 }}><strong>Risk hotspot</strong><div style={{ fontSize: '0.85rem' }}>{pred.hotspot}</div></div>
              <div className="alert-banner alert-LOW"><strong>Resource requirement</strong><div style={{ fontSize: '0.85rem' }}>{pred.resource_signal}</div></div>
            </SectionCard>
          </div>
          <SectionCard title="AI national health intelligence" hint={ai.national_health_intelligence?.description}>
            {insights.map((ins, i) => (
              <div key={i} className="alert-banner alert-LOW" style={{ marginBottom: 8 }}>
                <strong style={{ textTransform: 'capitalize' }}>{String(ins.theme || 'insight').replace(/_/g, ' ')}</strong>
                <div style={{ fontSize: '0.85rem' }}>{ins.message}</div>
              </div>
            ))}
            {insights.length === 0 && <EmptyState title="No national insights yet" />}
          </SectionCard>
        </>
      ),
    },
    {
      id: 'districts', icon: '📍', label: 'Districts',
      content: (
        <SectionCard title="District performance ranking">
          {ranking.length === 0 && <EmptyState title="No district aggregates yet" />}
          {ranking.length > 0 && (
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>District</th><th>Facilities</th><th>Pregnancies</th><th>Deliveries</th><th>Delivery %</th><th>High risk</th><th>Emergencies</th></tr></thead>
                <tbody>
                  {ranking.map((d) => (
                    <tr key={d.district}>
                      <td style={{ fontWeight: 600 }}>{d.district}</td>
                      <td>{d.facilities ?? '—'}</td>
                      <td>{d.pregnancies}</td>
                      <td>{d.deliveries}</td>
                      <td>{d.delivery_rate ?? '—'}%</td>
                      <td><span className={`badge ${d.high_risk > 0 ? 'badge-HIGH' : 'badge-LOW'}`}>{d.high_risk}</span></td>
                      <td>{d.emergencies}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      ),
    },
    {
      id: 'policy', icon: '📋', label: 'Policy & planning',
      content: (
        <SectionCard title="Policy and planning" hint={policy.description || 'Use national data for programmes, policies, and resource distribution.'}>
          {(policy.priorities || []).map((p) => (
            <div className="list-row" key={p}><span style={{ fontSize: '0.88rem' }}>{p}</span></div>
          ))}
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => exportReport('national_maternal_report', 'National maternal health report')}>Export national report (PDF)</button>
            <button type="button" className="btn btn-ghost" onClick={() => setPolicyMsg('Programme note: prioritize ANC4 completion and EmONC readiness in high-risk districts.')}>Support national programmes</button>
            <button type="button" className="btn btn-outline" onClick={() => setPolicyMsg('Policy brief drafted: maternal risk hotspots, referral bottlenecks, and resource distribution options.')}>Draft policy brief</button>
            <button type="button" className="btn btn-ghost" onClick={() => setPolicyMsg(`Resource distribution flagged for: ${(pred.high_risk_regions || []).join(', ') || pred.hotspot || 'priority districts'}.`)}>Flag resource distribution</button>
          </div>
          {policyMsg && <div className="alert-banner alert-LOW" style={{ marginTop: '0.75rem', marginBottom: 0 }}>{policyMsg}</div>}
        </SectionCard>
      ),
    },
    {
      id: 'governance', icon: '🏛️', label: 'Governance',
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
          <SectionCard title="National standards">
            <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.6 }}>
              {(governance.standards || []).map((s) => <li key={s}>{s}</li>)}
            </ul>
          </SectionCard>
          <SectionCard title="Data policies">
            <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.6 }}>
              {(governance.data_policies || []).map((s) => <li key={s}>{s}</li>)}
            </ul>
          </SectionCard>
          <SectionCard title="System integration">
            <ul style={{ margin: 0, paddingLeft: '1.1rem', color: 'var(--muted)', fontSize: '0.88rem', lineHeight: 1.6 }}>
              {(governance.system_integration || []).map((s) => <li key={s}>{s}</li>)}
            </ul>
          </SectionCard>
        </div>
      ),
    },
    {
      id: 'ai', icon: '🤖', label: 'AI predictions',
      content: (
        <>
          <SectionCard title="AI predictive modeling" hint={ai.predictive_modeling?.description}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
              {predictions.map((p) => (
                <div key={p.type} style={{ padding: '0.75rem', background: 'var(--sky-50)', borderRadius: 10, border: '1px solid var(--line)' }}>
                  <strong style={{ fontSize: '0.85rem', textTransform: 'capitalize' }}>{String(p.type).replace(/_/g, ' ')}</strong>
                  <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.82rem' }}>{p.message}</p>
                </div>
              ))}
            </div>
          </SectionCard>
        </>
      ),
    },
    {
      id: 'reports', icon: '📊', label: 'Reports',
      content: (
        <ReportPanel title="National report pack" subtitle="Policy summaries and performance exports"
          footer={<Link className="btn btn-primary" to="/analytics">Open national analytics</Link>}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
            {reports.map((r) => (
              <div key={r.id} style={{ padding: '0.75rem', background: 'var(--sky-50)', borderRadius: 10, border: '1px solid var(--line)' }}>
                <strong style={{ fontSize: '0.85rem' }}>{r.title}</strong>
                <p style={{ margin: '0.35rem 0 0 0 0.75rem', color: 'var(--muted)', fontSize: '0.82rem' }}>{r.summary}</p>
                <button type="button" className="btn btn-ghost" style={{ marginTop: 8, padding: '0.35rem 0.7rem', fontSize: '0.8rem' }} onClick={() => exportReport(r.id, r.title)}>Export PDF</button>
              </div>
            ))}
          </div>
        </ReportPanel>
      ),
    },
  ];

  return (
    <div>
      <WorkspaceHeader brand="National maternal intelligence" title="Ministry of Health" subtitle="National oversight, policy support, and maternal health intelligence" context={data.context} />
      {error && <p className="error-text">{error}</p>}
      <DashTabs tabs={tabs} storageKey="dash_moh_tab" />
    </div>
  );
}
