import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { RiskBadge } from '../components/Layout';

export default function CommandCenter() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error) return <p className="error-text">{error}</p>;
  if (!data) return <p>Loading clinical awareness…</p>;

  const t = data.today;

  return (
    <div>
      <header className="page-header">
        <h1>Maternity Command Center</h1>
        <p>Immediate clinical awareness — prioritized by risk and urgency</p>
      </header>

      <section className="section-block">
        <h3>Today&apos;s activities</h3>
        <div className="grid grid-4">
          <div className="card"><div className="stat">{t.mothers_waiting}</div><div className="stat-label">Mothers in ANC</div></div>
          <div className="card"><div className="stat">{t.anc_appointments}</div><div className="stat-label">ANC visits today</div></div>
          <div className="card"><div className="stat">{t.labor_admissions}</div><div className="stat-label">Labor admissions</div></div>
          <div className="card"><div className="stat">{t.deliveries_completed}</div><div className="stat-label">Deliveries completed</div></div>
        </div>
        <div className="card" style={{ marginTop: '1rem' }}>
          <div className="stat">{t.postpartum_reviews_due}</div>
          <div className="stat-label">Postpartum reviews due</div>
        </div>
      </section>

      <div className="grid grid-3">
        <div className="card">
          <h3>Risk monitoring</h3>
          {data.risk.high_risk.length === 0 && <p className="empty">No high-risk cases</p>}
          {data.risk.high_risk.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <Link to={`/pregnancies/${r.id}`}>{r.full_name}</Link>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{r.anc_number} · {r.status}</div>
              </div>
              <RiskBadge score={r.risk_score} />
            </div>
          ))}
          <div style={{ marginTop: '0.75rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Severe anemia</strong>
            {data.risk.severe_anemia.slice(0, 3).map((a) => (
              <div className="list-row" key={a.id}>
                <Link to={`/pregnancies/${a.pregnancy_id}`}>{a.full_name}</Link>
                <RiskBadge score={a.severity} />
              </div>
            ))}
            <strong style={{ fontSize: '0.85rem' }}>Hypertension</strong>
            {data.risk.hypertension.slice(0, 3).map((a) => (
              <div className="list-row" key={a.id}>
                <Link to={`/pregnancies/${a.pregnancy_id}`}>{a.full_name}</Link>
                <RiskBadge score={a.severity} />
              </div>
            ))}
            <strong style={{ fontSize: '0.85rem' }}>Previous C-section</strong>
            {data.risk.previous_csection.map((r) => (
              <div className="list-row" key={r.id}>
                <Link to={`/pregnancies/${r.id}`}>{r.full_name}</Link>
                <RiskBadge score={r.risk_score} />
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Emergency center</h3>
          {data.emergency.critical_alerts.slice(0, 5).map((a) => (
            <div key={a.id} className={`alert-banner alert-${a.severity}`}>
              <strong>{a.title}</strong>
              <div><Link to={`/pregnancies/${a.pregnancy_id}`}>{a.full_name}</Link> · {a.anc_number}</div>
            </div>
          ))}
          <strong style={{ fontSize: '0.85rem' }}>Active emergencies</strong>
          {data.emergency.active.length === 0 && <p className="empty">None active</p>}
          {data.emergency.active.map((e) => (
            <div className="list-row" key={e.id}>
              <Link to={`/emergencies/${e.id}`}>{e.full_name} — {e.emergency_type}</Link>
              <span className="badge badge-CRITICAL">ACTIVE</span>
            </div>
          ))}
          <strong style={{ fontSize: '0.85rem' }}>Pending referrals</strong>
          {data.emergency.pending_referrals.map((r) => (
            <div className="list-row" key={r.id}>
              <div>
                <Link to={`/pregnancies/${r.pregnancy_id}`}>{r.full_name}</Link>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{r.to_facility_name}</div>
              </div>
              <span className="badge badge-HIGH">{r.urgency}</span>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Follow-up management</h3>
          <strong style={{ fontSize: '0.85rem' }}>Missed ANC</strong>
          {data.followup.missed_anc.map((t) => (
            <div className="list-row" key={t.id}>
              <Link to={`/pregnancies/${t.pregnancy_id}`}>{t.full_name}</Link>
              <span style={{ fontSize: '0.8rem' }}>{t.due_date}</span>
            </div>
          ))}
          <strong style={{ fontSize: '0.85rem' }}>Missed PNC</strong>
          {data.followup.missed_pnc.map((t) => (
            <div className="list-row" key={t.id}>
              <Link to={`/pregnancies/${t.pregnancy_id}`}>{t.full_name}</Link>
              <span style={{ fontSize: '0.8rem' }}>{t.task_type}</span>
            </div>
          ))}
          <strong style={{ fontSize: '0.85rem' }}>CHW tasks</strong>
          {data.followup.chw_tasks.map((t) => (
            <div className="list-row" key={t.id}>
              <div>
                <div>{t.title}</div>
                <Link to={`/pregnancies/${t.pregnancy_id}`} style={{ fontSize: '0.85rem' }}>{t.full_name}</Link>
              </div>
              <span className="badge badge-MEDIUM">{t.status}</span>
            </div>
          ))}
          <div className="btn-row">
            <Link className="btn btn-primary" to="/mothers">Identify mother</Link>
            <Link className="btn btn-ghost" to="/community">Open follow-up</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
