import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import WorkspaceHeader, { EmptyState } from '../../components/WorkspaceHeader';
import { ReportPanel } from '../../components/UxGuide';
import { useAuth } from '../../auth';
import { exportDashboardPdf } from '../../exportPdf';
import { DashTabs, KpiRow, SectionCard } from '../../components/DashTabs';

export default function DhoDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [error, setError] = useState('');
  const [actionMsg, setActionMsg] = useState('');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    Promise.all([api('/dashboard'), api('/analytics?scope=district')])
      .then(([d, a]) => { setData(d); setAnalytics(a); })
      .catch((e) => setError(e.message));
  }, []);

  function exportPdf() {
    setExporting(true);
    try { exportDashboardPdf({ kind: 'district_maternal_report', title: `District report · ${user?.district || 'District'}`, user, dashboard: data, analytics }); }
    finally { setExporting(false); }
  }

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p>Loading…</p>;

  const ov = data.district_overview || {};
  const mon = data.health_system_monitoring || {};
  const supervision = data.facility_supervision || {};
  const facilities = supervision.facilities || data.by_facility || [];
  const an = data.analytics || {};
  const geo = data.geographic || [];
  const ind = analytics?.indicators || {};
  const ai = data.ai_support || {};
  const insights = ai.maternal_health_analytics?.insights || [];
  const predictions = ai.predictive_analytics?.predictions || [];
  const reports = ai.dashboard_insights?.reports || [];
  const interventions = data.intervention_planning?.recommended_actions || [];

  const tabs = [
    {
      id: 'overview', icon: '🏠', label: 'Overview',
      content: (
        <>
          <KpiRow stats={[
            { label: 'Pregnancies', value: ov.registered_mothers ?? 0 },
            { label: 'ANC coverage', value: ind.anc_coverage ?? mon.anc_coverage ?? 0, unit: '%', tone: 'ok' },
            { label: 'Facility delivery', value: ov.facility_delivery_rate ?? 0, unit: '%', tone: 'ok' },
            { label: 'Emergencies', value: mon.emergency_cases ?? ov.emergencies ?? 0, tone: (mon.emergency_cases ?? 0) > 0 ? 'high' : 'ok' },
            { label: 'High-risk', value: mon.maternal_outcomes?.high_risk ?? an.high_risk ?? 0, tone: 'high' },
          ]} />
          <SectionCard title="AI maternal health insights" hint={ai.maternal_health_analytics?.description}>
            {insights.length === 0 && <EmptyState title="No AI insights yet" />}
            {insights.map((ins, i) => (
              <div key={i} className={`alert-banner alert-${ins.severity || 'MEDIUM'}`} style={{ marginBottom: 8 }}>
                <strong>{ins.facility || 'District'}</strong>
                <div style={{ fontSize: '0.85rem' }}>{ins.message}</div>
                <div style={{ fontSize: '0.82rem', marginTop: 4 }}><em>Action:</em> {ins.action}</div>
              </div>
            ))}
          </SectionCard>
        </>
      ),
    },
    {
      id: 'facilities', icon: '🏥', label: 'Facilities',
      content: (
        <>
          <SectionCard title="Facility performance comparison" hint="Delivery rate, high-risk, data completeness">
            {facilities.length === 0 && <EmptyState title="No facilities in district scope" />}
            {facilities.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Facility</th><th>Pregnancies</th><th>Deliveries</th><th>Delivery %</th><th>High risk</th><th>Emergencies</th><th>Referrals</th><th>Data score</th></tr></thead>
                  <tbody>
                    {facilities.map((f) => (
                      <tr key={f.id}>
                        <td style={{ fontWeight: 600 }}>{f.name}</td>
                        <td>{f.pregnancies}</td>
                        <td>{f.deliveries}</td>
                        <td>{f.facility_delivery_rate ?? '—'}%</td>
                        <td><span className={`badge ${f.high_risk > 0 ? 'badge-HIGH' : 'badge-LOW'}`}>{f.high_risk}</span></td>
                        <td>{f.emergencies}</td>
                        <td>{f.referrals}</td>
                        <td>{f.data_completeness_score ?? '—'}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <SectionCard title="Maternal outcomes">
              <div className="list-row"><span>Maternal deaths</span><strong>{ind.maternal_deaths ?? 0}</strong></div>
              <div className="list-row"><span>PPH cases</span><strong>{an.pph_cases ?? 0}</strong></div>
              <div className="list-row"><span>C-section rate</span><strong>{ind.csection_rate ?? 0}%</strong></div>
              <div className="list-row"><span>PNC coverage</span><strong>{ind.pnc_coverage ?? 0}%</strong></div>
              <div className="list-row"><span>Referrals</span><strong>{an.referrals ?? 0}</strong></div>
            </SectionCard>
            <SectionCard title="Geographic monitoring">
              {geo.length === 0 && <EmptyState title="No geographic signals" />}
              {geo.map((g) => (
                <div className="list-row" key={g.facility}>
                  <div>
                    <strong style={{ fontSize: '0.88rem' }}>{g.facility}</strong>
                    <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{g.district}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '0.82rem' }}>{g.pregnancies} pregnancies</div>
                    <span className={`badge ${g.high_risk > 0 ? 'badge-HIGH' : 'badge-LOW'}`}>{g.high_risk} high-risk</span>
                  </div>
                </div>
              ))}
            </SectionCard>
          </div>
        </>
      ),
    },
    {
      id: 'interventions', icon: '🎯', label: 'Interventions',
      content: (
        <SectionCard title="Intervention planning" hint="Training, resource allocation, improvement programmes">
          {(interventions.length ? interventions : ['Continue routine supervision']).map((a) => (
            <div className="list-row" key={a}><span style={{ fontSize: '0.88rem' }}>{a}</span></div>
          ))}
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => setActionMsg(interventions[0] || 'Recommendation logged for facility mentorship.')}>Log training recommendation</button>
            <button type="button" className="btn btn-ghost" onClick={() => setActionMsg('Resource allocation: prioritize EmONC commodities at highest-emergency facilities.')}>Allocate resources</button>
            <button type="button" className="btn btn-outline" onClick={() => setActionMsg('Improvement programme drafted: ANC documentation + birth preparedness this quarter.')}>Plan programme</button>
            <Link className="btn btn-ghost" to="/analytics">District analytics</Link>
          </div>
          {actionMsg && <div className="alert-banner alert-LOW" style={{ marginTop: '0.75rem', marginBottom: 0 }}>{actionMsg}</div>}
        </SectionCard>
      ),
    },
    {
      id: 'ai', icon: '🤖', label: 'AI analytics',
      content: (
        <>
          <SectionCard title="AI predictive analytics" hint={ai.predictive_analytics?.description}>
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
        <ReportPanel title="District report pack" subtitle="Auto-generated summaries for supervision and planning"
          footer={
            <div className="btn-row" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-primary" disabled={exporting} onClick={exportPdf}>{exporting ? 'Generating…' : 'Export PDF'}</button>
              <Link className="btn btn-ghost" to="/analytics">Full district report</Link>
            </div>
          }>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.5rem' }}>
            {reports.map((r) => (
              <div key={r.id} style={{ padding: '0.65rem 0.75rem', background: 'var(--sky-50)', borderRadius: 10, border: '1px solid var(--line)' }}>
                <strong style={{ fontSize: '0.85rem' }}>{r.title}</strong>
                <p style={{ margin: '0.35rem 0 0', color: 'var(--muted)', fontSize: '0.82rem' }}>{r.summary}</p>
              </div>
            ))}
          </div>
        </ReportPanel>
      ),
    },
  ];

  return (
    <div>
      <WorkspaceHeader brand="District maternal supervision" title="District Health Officer" subtitle={`District oversight · ${user?.district || 'District scope'}`} context={data.context} />
      {error && <p className="error-text">{error}</p>}
      <DashTabs tabs={tabs} storageKey="dash_dho_tab" />
    </div>
  );
}
