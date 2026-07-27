import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import WorkspaceHeader, { EmptyState, StatCard } from '../components/WorkspaceHeader';
import { ReportPanel, RoleGuide } from '../components/UxGuide';
import { exportAnalyticsPdf } from '../exportPdf';

function scopesForRole(role) {
  if (role === 'moh') return ['national', 'district'];
  if (role === 'district_officer') return ['district'];
  return ['facility'];
}

function titleFor(scope, role) {
  if (role === 'moh' && scope === 'national') return 'National maternal report';
  if (role === 'district_officer' || scope === 'district') return 'District maternal report';
  return 'Facility maternal report';
}

export default function Analytics() {
  const { user } = useAuth();
  const allowed = scopesForRole(user?.role);
  const [scope, setScope] = useState(allowed[0]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  function load(activeScope = scope) {
    setLoading(true);
    setError('');
    setDetail('');
    api(`/analytics?scope=${activeScope}`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((e) => {
        setData(null);
        setError(e.message || 'Analytics failed');
        setDetail(e.data?.detail || '');
        setLoading(false);
      });
  }

  useEffect(() => {
    if (!allowed.includes(scope)) {
      setScope(allowed[0]);
      return;
    }
    load(scope);
  }, [scope, user?.role]);

  function exportReport() {
    setExporting(true);
    try {
      exportAnalyticsPdf({
        title: titleFor(scope, user?.role),
        subtitle,
        scope,
        user,
        data,
      });
    } finally {
      setExporting(false);
    }
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify({
      generated_at: new Date().toISOString(),
      scope,
      role: user?.role,
      facility: user?.facility_name,
      district: user?.district,
      report: data,
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rmdp-${scope}-report-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="loading-panel">Loading organized maternal report…</div>;

  if (error) {
    return (
      <div className="error-panel">
        <p className="error-text">{error}</p>
        {detail && <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{detail}</p>}
        <button type="button" className="btn btn-primary" onClick={() => load(scope)}>
          Retry
        </button>
      </div>
    );
  }

  const i = data.indicators || {};
  const subtitle =
    user?.role === 'moh'
      ? 'National intelligence for policy and programme oversight'
      : user?.role === 'district_officer'
        ? `District performance · ${user?.district || 'your district'}`
        : `Facility performance · ${user?.facility_name || 'your facility'}`;

  const guideRole =
    user?.role === 'moh' || user?.role === 'district_officer' || user?.role === 'facility_admin'
      ? user.role
      : null;

  return (
    <div>
      <WorkspaceHeader
        brand="Maternal health reports"
        title={titleFor(scope, user?.role)}
        subtitle={subtitle}
        context={{
          scope,
          facility_name: user?.facility_name,
          district: user?.district,
        }}
      />

      {guideRole && <RoleGuide role={guideRole} />}

      {allowed.length > 1 && (
        <div className="btn-row" style={{ marginTop: 0, marginBottom: '1rem' }}>
          {allowed.map((s) => (
            <button
              key={s}
              type="button"
              className={`btn ${scope === s ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setScope(s)}
            >
              {s === 'national' ? 'National view' : s === 'district' ? 'District view' : 'Facility view'}
            </button>
          ))}
        </div>
      )}

      <ReportPanel
        title="1 · Key maternal indicators"
        subtitle="Core outcomes for this reporting scope"
        footer={(
          <div className="btn-row" style={{ marginTop: 0 }}>
            <button type="button" className="btn btn-primary" disabled={exporting} onClick={exportReport}>
              {exporting ? 'Generating PDF…' : 'Export PDF'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={exportJson}>
              Export JSON
            </button>
          </div>
        )}
      >
        <div className="grid grid-3">
          <StatCard value={i.maternal_deaths ?? 0} label="Maternal deaths" />
          <StatCard value={i.near_misses ?? 0} label="Near misses / emergencies" tone="high" />
          <StatCard value={`${i.pph_rate ?? 0}%`} label="PPH rate" />
          <StatCard value={`${i.csection_rate ?? 0}%`} label="C-section rate" />
          <StatCard value={`${i.anc_coverage ?? 0}%`} label="ANC4 coverage" tone="ok" />
          <StatCard value={`${i.pnc_coverage ?? 0}%`} label="PNC coverage" tone="ok" />
        </div>
      </ReportPanel>

      <div className="grid grid-2">
        <ReportPanel title="2 · Service volume" subtitle="Deliveries, emergencies, and referrals">
          <div className="list-row"><span>Deliveries</span><strong>{i.deliveries ?? 0}</strong></div>
          <div className="list-row"><span>Emergencies</span><strong>{i.emergencies ?? 0}</strong></div>
          <div className="list-row"><span>Active emergencies</span><strong>{i.active_emergencies ?? 0}</strong></div>
          <div className="list-row"><span>Pending referrals</span><strong>{i.pending_referrals ?? 0}</strong></div>
          <div className="list-row"><span>High-risk pregnancies</span><strong>{i.high_risk ?? 0}</strong></div>
        </ReportPanel>

        <ReportPanel title="3 · Risk distribution" subtitle="Active pregnancy risk bands">
          <div className="list-row"><span>Low</span><span className="badge badge-LOW">{data.risk_distribution?.low_n || 0}</span></div>
          <div className="list-row"><span>Medium</span><span className="badge badge-MEDIUM">{data.risk_distribution?.medium_n || 0}</span></div>
          <div className="list-row"><span>High</span><span className="badge badge-HIGH">{data.risk_distribution?.high_n || 0}</span></div>
          <div className="list-row"><span>Critical</span><span className="badge badge-CRITICAL">{data.risk_distribution?.critical_n || 0}</span></div>
        </ReportPanel>
      </div>

      {(scope === 'district' || scope === 'national') && (
        <ReportPanel title="4 · Facilities monitored" subtitle="Performance comparison across facilities in scope">
          {(data.by_facility || []).length === 0 && <EmptyState title="No facilities in this scope" />}
          {(data.by_facility || []).length > 0 && (
            <table className="table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>District</th>
                  <th>Pregnancies</th>
                  <th>In labor</th>
                  <th>High risk</th>
                </tr>
              </thead>
              <tbody>
                {(data.by_facility || []).map((f) => (
                  <tr key={f.id}>
                    <td>{f.name}</td>
                    <td>{f.district}</td>
                    <td>{f.pregnancies}</td>
                    <td>{f.in_labor}</td>
                    <td>{f.high_risk}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </ReportPanel>
      )}

      <ReportPanel title="5 · Monthly deliveries" subtitle="Trend of skilled birth attendance over time">
        {(data.monthly_deliveries || []).length === 0 && <EmptyState title="No delivery months yet" />}
        {(data.monthly_deliveries || []).map((m) => (
          <div className="list-row" key={m.month}>
            <span>{m.month}</span>
            <span>{m.deliveries} deliveries · {m.csections} C-sections</span>
          </div>
        ))}
      </ReportPanel>
    </div>
  );
}
