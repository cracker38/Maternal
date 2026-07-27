import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { alertActions, alertExplanation, formatMissing } from '../alertUtils';
import { AmbulanceWidget } from '../components/AmbulancePanel';

const RiskBadge = ({ score }) => (score ? <span className={`badge badge-${score}`}>{score}</span> : null);

export default function PregnancyRecord() {
  const { id } = useParams();
  const { user } = useAuth();
  const historyRef = useRef(null);
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionOk, setActionOk] = useState('');
  const [referOpen, setReferOpen] = useState(false);
  const [acking, setAcking] = useState(null);
  const [ambulanceData, setAmbulanceData] = useState(null);
  const [referForm, setReferForm] = useState({
    to_facility_name: 'Kibagabaga District Hospital',
    reason: '',
    clinical_summary: '',
    vital_signs: '',
    treatment_provided: '',
    urgency: 'urgent',
  });

  async function load() {
    try {
      setLoadError('');
      const [preg, fleet] = await Promise.all([
        api(`/pregnancies/${id}`),
        api('/ambulance/fleet').catch(() => null),
      ]);
      setData(preg);
      setAmbulanceData(fleet);
    } catch (e) {
      setLoadError(e.message);
    }
  }

  useEffect(() => { load(); }, [id]);

  async function confirmAlert(alertId) {
    setAcking(alertId);
    setActionError('');
    try {
      await api(`/pregnancies/alerts/${alertId}/ack`, {
        method: 'PATCH',
        body: { confirmation_note: `${user?.role || 'clinician'} confirmed AI recommendation` },
      });
      setActionOk('AI recommendation confirmed.');
      await load();
    } catch (e) {
      setActionError(e.message);
    } finally {
      setAcking(null);
    }
  }

  async function submitReferral(e) {
    e.preventDefault();
    setActionError('');
    setActionOk('');
    const missing = [];
    if (!referForm.reason.trim()) missing.push('Reason');
    if (!referForm.clinical_summary.trim()) missing.push('Clinical summary');
    if (!referForm.vital_signs.trim()) missing.push('Vital signs');
    if (!referForm.treatment_provided.trim()) missing.push('Treatment provided');
    if (missing.length) {
      setActionError(`Required clinical information incomplete. Missing: ${missing.join(', ')}.`);
      return;
    }
    try {
      await api(`/pregnancies/${id}/refer`, { method: 'POST', body: referForm });
      setActionOk('Referral submitted — tracking: pending → accepted → transferred → received → completed');
      setReferOpen(false);
      await load();
    } catch (err) {
      setActionError(formatMissing(err));
    }
  }

  if (loadError && !data) return <p className="error-text">{loadError}</p>;
  if (!data) return <p>Loading maternal record…</p>;

  const p = data.pregnancy;
  const med = data.medical || {};
  const obs = data.obstetric || {};

  return (
    <div>
      <header className="page-header">
        <h1>Maternal digital health record</h1>
        <p>Midwife command center — ANC, labor, delivery, postpartum, AI alerts</p>
      </header>

      {actionError && <p className="error-text">{actionError}</p>}
      {actionOk && <p style={{ color: 'var(--green-800)', marginBottom: '0.75rem' }}>{actionOk}</p>}

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ fontFamily: 'var(--font-display)', margin: 0, color: 'var(--green-900)' }}>{p.full_name}</h2>
            <div style={{ color: 'var(--muted)' }}>
              Age {p.age} · GA {p.gestational_age_weeks}w · EDD {p.edd || '—'} · {p.anc_number}
              {' · '}G{p.gravida}P{p.para}A{p.abortions}
              {' · '}Blood {p.blood_group || '—'} · HIV {p.hiv_status}
              {' · '}Status <strong>{p.status}</strong>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 4 }}>
              Phone {p.phone || '—'} · {p.village || '—'}, {p.district || '—'}
              {p.emergency_contact_name ? ` · Emergency: ${p.emergency_contact_name} ${p.emergency_contact_phone || ''}` : ''}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <RiskBadge score={p.risk_score} />
            {p.risk_percent != null && (
              <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 4 }}>AI risk {p.risk_percent}%</div>
            )}
          </div>
        </div>

        <div style={{ marginTop: '0.75rem' }}>
          {!!obs.previous_csection && <div className="warning-strip">Previous C-section</div>}
          {!!obs.previous_pph && <div className="warning-strip">Previous PPH</div>}
          {!!obs.previous_eclampsia && <div className="warning-strip">Previous eclampsia</div>}
          {!!obs.previous_stillbirth && <div className="warning-strip">Previous stillbirth</div>}
          {!!med.hypertension && <div className="warning-strip">Chronic hypertension</div>}
          {!!med.diabetes && <div className="warning-strip">Diabetes</div>}
          {!!med.hiv && <div className="warning-strip">HIV positive</div>}
          {med.allergies && <div className="warning-strip">Allergies: {med.allergies}</div>}
        </div>

        <div className="btn-row">
          <Link className="btn btn-outline" to={`/pregnancies/${id}/labs`}>Lab results</Link>
          <Link className="btn btn-outline" to={`/pregnancies/${id}/ultrasound`}>Ultrasound</Link>
          {data.next_actions?.map((a) => {
            const map = {
              start_anc: `/pregnancies/${id}/anc`,
              admit_labor: `/pregnancies/${id}/labor`,
              partograph: `/pregnancies/${id}/partograph`,
              delivery: `/pregnancies/${id}/delivery`,
              postpartum: `/pregnancies/${id}/postpartum`,
              emergency: `/pregnancies/${id}/emergency`,
            };
            if (a.action === 'refer') {
              return (
                <button key={a.action} className="btn btn-danger" type="button" onClick={() => setReferOpen(true)}>
                  {a.label}
                </button>
              );
            }
            if (a.action === 'view_history') {
              return (
                <button
                  key={a.action}
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => historyRef.current?.scrollIntoView({ behavior: 'smooth' })}
                >
                  {a.label}
                </button>
              );
            }
            if (!map[a.action]) return null;
            return (
              <Link key={a.action} className={a.action === 'emergency' ? 'btn btn-danger' : 'btn btn-primary'} to={map[a.action]}>
                {a.label}
              </Link>
            );
          })}
        </div>
      </div>

      {(data.emergencies || []).filter((e) => e.status === 'active' || e.status === 'stabilized').length > 0 && (
        <div className="alert-banner alert-CRITICAL" style={{ marginBottom: '1rem' }}>
          <strong>Active emergency</strong>
          {(data.emergencies || [])
            .filter((e) => e.status === 'active' || e.status === 'stabilized')
            .map((e) => (
              <div key={e.id} className="btn-row" style={{ marginTop: 8 }}>
                <span>{String(e.emergency_type).replace(/_/g, ' ')} · {e.status}</span>
                <Link className="btn btn-danger" to={`/emergencies/${e.id}`}>Open checklist</Link>
              </div>
            ))}
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3>Pregnancy timeline</h3>
          <div className="timeline">
            {data.timeline.map((item, i) => (
              <div key={i} className={`timeline-item ${item.status}`}>
                <strong>{item.label}</strong>
                <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                  {item.date ? new Date(item.date).toLocaleString() : item.status}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>AI clinical alerts</h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 0 }}>
            AI supports decisions. Confirm recommendations — final judgment remains with you.
          </p>
          {data.alerts.length === 0 && <p className="empty">No alerts</p>}
          {data.alerts.slice(0, 10).map((a) => (
            <div key={a.id} className={`alert-banner alert-${a.severity}`}>
              <strong>{a.title}</strong>
              <div>{a.message}</div>
              {alertExplanation(a.recommended_actions) && (
                <div style={{ marginTop: 6, fontSize: '0.85rem' }}>Why: {alertExplanation(a.recommended_actions)}</div>
              )}
              {alertActions(a.recommended_actions).length > 0 && (
                <div style={{ marginTop: 6, fontSize: '0.85rem' }}>
                  Next: {alertActions(a.recommended_actions).join(' · ')}
                </div>
              )}
              <div className="btn-row" style={{ marginTop: 8 }}>
                {a.status === 'active' && a.alert_type !== 'clinical_decision' && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={acking === a.id}
                    onClick={() => confirmAlert(a.id)}
                  >
                    {acking === a.id ? 'Confirming…' : 'Confirm AI'}
                  </button>
                )}
                {a.status === 'acknowledged' && <span className="badge badge-LOW">Confirmed</span>}
                {['CRITICAL', 'HIGH'].includes(a.severity) && (
                  <Link className="btn btn-outline" to={`/pregnancies/${id}/emergency`}>Escalate</Link>
                )}
              </div>
            </div>
          ))}

          {data.referrals?.length > 0 && (
            <>
              <strong style={{ fontSize: '0.85rem' }}>Referral tracking</strong>
              {data.referrals.map((r) => (
                <div className="list-row" key={r.id}>
                  <div>
                    <div>{r.to_facility_name}</div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{r.reason}</div>
                  </div>
                  <span className="badge badge-HIGH">{r.status}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {ambulanceData && (
        <AmbulanceWidget
          data={ambulanceData}
          role={user?.role}
          pregnancyId={Number(id)}
          onRequested={load}
        />
      )}

      <div className="card" style={{ marginTop: '1rem' }} ref={historyRef}>
        <h3>ANC visit history & counseling</h3>
        {(data.anc_visits || []).length === 0 && <p className="empty">No ANC visits recorded yet</p>}
        {(data.anc_visits || []).map((v) => (
          <div key={v.id} style={{ borderTop: '1px solid var(--line)', padding: '0.75rem 0' }}>
            <div className="list-row">
              <strong>Visit {v.visit_number}</strong>
              <span style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                {v.visit_date ? new Date(v.visit_date).toLocaleString() : '—'}
                {v.next_visit_date ? ` · Next ${String(v.next_visit_date).slice(0, 10)}` : ''}
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
              BP {v.bp_systolic || '—'}/{v.bp_diastolic || '—'}
              {' · '}FHR {v.fetal_heart_rate || '—'}
              {' · '}Hb {v.hemoglobin ?? '—'}
              {' · '}Protein {v.urine_protein || '—'}
              {v.hiv_result && v.hiv_result !== 'not_done' ? ` · HIV ${v.hiv_result}` : ''}
            </div>
            <div style={{ fontSize: '0.85rem', marginTop: 4 }}>
              Counseling:
              {v.counseling_nutrition ? ' Nutrition' : ''}
              {v.counseling_birth_prep ? ' · Birth prep' : ''}
              {v.counseling_danger_signs ? ' · Danger signs' : ''}
              {!v.counseling_nutrition && !v.counseling_birth_prep && !v.counseling_danger_signs ? ' —' : ''}
              {' · '}Treatment:
              {v.iron ? ' Iron' : ''}
              {v.folate ? ' · Folate' : ''}
              {v.malaria_prevention ? ' · Malaria prev.' : ''}
              {v.vaccination ? ' · Vaccine' : ''}
              {v.deworming ? ' · Deworming' : ''}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-2" style={{ marginTop: '1rem' }}>
        <div className="card">
          <div className="list-row" style={{ paddingTop: 0 }}>
            <h3 style={{ margin: 0 }}>Lab results</h3>
            <Link className="btn btn-outline" to={`/pregnancies/${id}/labs`}>Add labs</Link>
          </div>
          {(data.lab_results || []).length === 0 && <p className="empty">No standalone lab panels yet</p>}
          {(data.lab_results || []).map((lab) => (
            <div key={lab.id} style={{ borderTop: '1px solid var(--line)', padding: '0.75rem 0' }}>
              <div className="list-row">
                <strong>{lab.test_date ? new Date(lab.test_date).toLocaleString() : 'Lab panel'}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{lab.recorded_by_name || '—'}</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Hb {lab.hemoglobin ?? '—'}
                {lab.blood_group ? ` · Blood ${lab.blood_group}` : ''}
                {lab.hiv_result && lab.hiv_result !== 'not_done' ? ` · HIV ${lab.hiv_result}` : ''}
                {lab.syphilis_result && lab.syphilis_result !== 'not_done' ? ` · Syphilis ${lab.syphilis_result}` : ''}
                {lab.malaria_result && lab.malaria_result !== 'not_done' ? ` · Malaria ${lab.malaria_result}` : ''}
                {lab.urine_protein && lab.urine_protein !== 'not_done' ? ` · Protein ${lab.urine_protein}` : ''}
              </div>
              {(lab.abnormal_flags || []).length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {(lab.abnormal_flags || []).map((f) => (
                    <span key={f} className="badge badge-HIGH" style={{ marginRight: 4 }}>{String(f).replace(/_/g, ' ')}</span>
                  ))}
                </div>
              )}
              {lab.clinical_notes && (
                <div style={{ fontSize: '0.8rem', marginTop: 4 }}>{lab.clinical_notes}</div>
              )}
            </div>
          ))}
        </div>

        <div className="card">
          <div className="list-row" style={{ paddingTop: 0 }}>
            <h3 style={{ margin: 0 }}>Ultrasound results</h3>
            <Link className="btn btn-outline" to={`/pregnancies/${id}/ultrasound`}>Add ultrasound</Link>
          </div>
          {(data.ultrasound_results || []).length === 0 && <p className="empty">No ultrasound reports yet</p>}
          {(data.ultrasound_results || []).map((us) => (
            <div key={us.id} style={{ borderTop: '1px solid var(--line)', padding: '0.75rem 0' }}>
              <div className="list-row">
                <strong>{us.exam_date ? new Date(us.exam_date).toLocaleString() : 'Ultrasound'}</strong>
                <span style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{us.performed_by_name || us.recorded_by_name || '—'}</span>
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                {us.ga_by_ultrasound_weeks != null ? `GA ${us.ga_by_ultrasound_weeks}w · ` : ''}
                FHR {us.fetal_heart_activity || '—'}
                {' · '}{us.presentation || '—'}
                {' · '}Placenta {String(us.placenta_location || '—').replace(/_/g, ' ')}
                {' · '}Fluid {String(us.amniotic_fluid || '—').replace(/_/g, ' ')}
                {us.estimated_fetal_weight_g ? ` · EFW ${us.estimated_fetal_weight_g}g` : ''}
              </div>
              {(us.abnormal_flags || []).length > 0 && (
                <div style={{ marginTop: 4 }}>
                  {(us.abnormal_flags || []).map((f) => (
                    <span key={f} className="badge badge-HIGH" style={{ marginRight: 4 }}>{String(f).replace(/_/g, ' ')}</span>
                  ))}
                </div>
              )}
              {(us.impression || us.findings) && (
                <div style={{ fontSize: '0.8rem', marginTop: 4 }}>{us.impression || us.findings}</div>
              )}
            </div>
          ))}
        </div>
      </div>

      {referOpen && (
        <form className="card" style={{ marginTop: '1rem' }} onSubmit={submitReferral}>
          <h3>Refer patient</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            Required: reason, clinical summary, vital signs, treatment provided (Rule 7.1)
          </p>
          <div className="field">
            <label>To facility</label>
            <input value={referForm.to_facility_name} onChange={(e) => setReferForm({ ...referForm, to_facility_name: e.target.value })} />
          </div>
          <div className="field">
            <label>Reason *</label>
            <textarea value={referForm.reason} onChange={(e) => setReferForm({ ...referForm, reason: e.target.value })} />
          </div>
          <div className="field">
            <label>Clinical summary *</label>
            <textarea value={referForm.clinical_summary} onChange={(e) => setReferForm({ ...referForm, clinical_summary: e.target.value })} />
          </div>
          <div className="field">
            <label>Vital signs *</label>
            <input
              value={referForm.vital_signs}
              onChange={(e) => setReferForm({ ...referForm, vital_signs: e.target.value })}
              placeholder="e.g. BP 150/95, FHR 140, Pulse 92"
            />
          </div>
          <div className="field">
            <label>Treatment provided *</label>
            <textarea value={referForm.treatment_provided} onChange={(e) => setReferForm({ ...referForm, treatment_provided: e.target.value })} />
          </div>
          <div className="field">
            <label>Urgency</label>
            <select value={referForm.urgency} onChange={(e) => setReferForm({ ...referForm, urgency: e.target.value })}>
              <option value="routine">Routine</option>
              <option value="urgent">Urgent</option>
              <option value="emergency">Emergency</option>
            </select>
          </div>
          <div className="btn-row">
            <button className="btn btn-danger" type="submit">Submit referral</button>
            <button className="btn btn-ghost" type="button" onClick={() => setReferOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
