import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { RiskBadge } from '../components/Layout';
import { alertActions, formatMissing } from '../alertUtils';

export default function AncVisit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    vitals: {
      bp_systolic: '', bp_diastolic: '', temperature: '36.6', pulse: '', weight_kg: '',
      fundal_height_cm: '', fetal_heart_rate: '', fetal_movement: 'normal', presentation: 'cephalic', edema: 'none',
    },
    labs: { hemoglobin: '', hiv_result: 'not_done', urine_protein: 'negative', glucose: 'negative', syphilis: 'not_done' },
    danger: { headache: false, blurred_vision: false, bleeding: false, convulsion: false, reduced_fetal_movement: false, severe_pain: false },
    treatment: { iron: true, folate: true, vaccination: false, malaria_prevention: true, deworming: false },
    counseling: { nutrition: true, birth_prep: true, danger_signs: true },
    danger_assessed: false,
    notes: '',
  });

  function nest(section, key, value) {
    setForm((f) => ({ ...f, [section]: { ...f[section], [key]: value } }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.vitals.bp_systolic || !form.vitals.bp_diastolic || !form.vitals.fetal_heart_rate) {
      setError('Required clinical information incomplete. Missing: Blood pressure, Fetal heart rate.');
      return;
    }
    if (!form.danger_assessed) {
      setError('Required clinical information incomplete. Missing: Danger sign assessment.');
      return;
    }
    try {
      const body = {
        pregnancy_id: Number(id),
        vitals: {
          ...form.vitals,
          bp_systolic: form.vitals.bp_systolic ? Number(form.vitals.bp_systolic) : null,
          bp_diastolic: form.vitals.bp_diastolic ? Number(form.vitals.bp_diastolic) : null,
          temperature: form.vitals.temperature ? Number(form.vitals.temperature) : null,
          pulse: form.vitals.pulse ? Number(form.vitals.pulse) : null,
          weight_kg: form.vitals.weight_kg ? Number(form.vitals.weight_kg) : null,
          fundal_height_cm: form.vitals.fundal_height_cm ? Number(form.vitals.fundal_height_cm) : null,
          fetal_heart_rate: form.vitals.fetal_heart_rate ? Number(form.vitals.fetal_heart_rate) : null,
        },
        labs: {
          ...form.labs,
          hemoglobin: form.labs.hemoglobin !== '' ? Number(form.labs.hemoglobin) : null,
        },
        danger: form.danger,
        treatment: form.treatment,
        counseling: form.counseling,
        notes: form.notes,
      };
      const data = await api('/anc', { method: 'POST', body });
      setResult(data);
    } catch (err) {
      setError(formatMissing(err));
    }
  }

  if (result) {
    return (
      <div className="card">
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--green-900)' }}>AI maternal risk engine</h1>
        <p>
          Visit {result.visit_number} saved · Next visit {result.next_visit_date} · Risk{' '}
          <RiskBadge score={result.risk_score} />
          {result.risk_percent != null && <> · Score {result.risk_percent}%</>}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          {result.ai_disclaimer || 'AI recommendations require human confirmation and do not replace clinical judgment.'}
        </p>
        {result.alerts?.length === 0 && <p className="empty">No new clinical alerts</p>}
        {result.alerts?.map((a, i) => (
          <div key={i} className={`alert-banner alert-${a.severity}`}>
            <strong>{a.title}</strong>
            <div>{a.message}</div>
            {a.explanation && <div style={{ marginTop: 6, fontSize: '0.85rem' }}>Why: {a.explanation}</div>}
            <div style={{ marginTop: 6 }}>Actions: {alertActions(a.recommended_actions).join(' · ')}</div>
            {a.requires_human_confirmation && (
              <div style={{ marginTop: 6, fontSize: '0.8rem' }}>⚠ Requires clinician confirmation</div>
            )}
          </div>
        ))}
        {result.sms_stub && (
          <div className="card" style={{ background: 'var(--sky-50)', marginTop: '0.75rem' }}>
            <strong>SMS reminder queued</strong>
            <p style={{ marginBottom: 0 }}>{result.sms_stub.template}</p>
          </div>
        )}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => navigate(`/pregnancies/${id}`)}>Back to record</button>
          {['HIGH', 'CRITICAL'].includes(result.risk_score) && (
            <>
              <button className="btn btn-ghost" onClick={() => navigate(`/pregnancies/${id}`)}>Confirm AI on record</button>
              <button className="btn btn-danger" onClick={() => navigate(`/pregnancies/${id}/emergency`)}>Emergency</button>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <h1>Smart ANC clinical assessment</h1>
        <p>Mandatory: BP, fetal heart rate, gestational age, danger-sign assessment</p>
      </header>
      <form onSubmit={submit}>
        <div className="card section-block">
          <h3>Vital signs</h3>
          <div className="grid grid-3">
            <div className="field"><label>BP systolic *</label><input required value={form.vitals.bp_systolic} onChange={(e) => nest('vitals', 'bp_systolic', e.target.value)} /></div>
            <div className="field"><label>BP diastolic *</label><input required value={form.vitals.bp_diastolic} onChange={(e) => nest('vitals', 'bp_diastolic', e.target.value)} /></div>
            {['temperature', 'pulse', 'weight_kg'].map((k) => (
              <div className="field" key={k}>
                <label>{k.replace(/_/g, ' ')}</label>
                <input value={form.vitals[k]} onChange={(e) => nest('vitals', k, e.target.value)} />
              </div>
            ))}
          </div>
        </div>
        <div className="card section-block">
          <h3>Obstetric assessment</h3>
          <div className="grid grid-3">
            <div className="field"><label>Fundal height (cm)</label><input value={form.vitals.fundal_height_cm} onChange={(e) => nest('vitals', 'fundal_height_cm', e.target.value)} /></div>
            <div className="field"><label>Fetal heart rate *</label><input required value={form.vitals.fetal_heart_rate} onChange={(e) => nest('vitals', 'fetal_heart_rate', e.target.value)} /></div>
            <div className="field">
              <label>Movement</label>
              <select value={form.vitals.fetal_movement} onChange={(e) => nest('vitals', 'fetal_movement', e.target.value)}>
                <option value="normal">Normal</option>
                <option value="reduced">Reduced</option>
                <option value="absent">Absent</option>
              </select>
            </div>
            <div className="field"><label>Presentation</label><input value={form.vitals.presentation} onChange={(e) => nest('vitals', 'presentation', e.target.value)} /></div>
            <div className="field">
              <label>Edema</label>
              <select value={form.vitals.edema} onChange={(e) => nest('vitals', 'edema', e.target.value)}>
                <option value="none">None</option>
                <option value="mild">Mild</option>
                <option value="moderate">Moderate</option>
                <option value="severe">Severe</option>
              </select>
            </div>
          </div>
        </div>
        <div className="card section-block">
          <h3>Laboratory</h3>
          <div className="grid grid-3">
            <div className="field"><label>Hemoglobin</label><input value={form.labs.hemoglobin} onChange={(e) => nest('labs', 'hemoglobin', e.target.value)} /></div>
            <div className="field">
              <label>HIV</label>
              <select value={form.labs.hiv_result} onChange={(e) => nest('labs', 'hiv_result', e.target.value)}>
                <option value="not_done">Not done</option>
                <option value="negative">Negative</option>
                <option value="positive">Positive</option>
              </select>
            </div>
            <div className="field">
              <label>Urine protein</label>
              <select value={form.labs.urine_protein} onChange={(e) => nest('labs', 'urine_protein', e.target.value)}>
                {['negative', 'trace', '1+', '2+', '3+'].map((v) => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Glucose</label>
              <select value={form.labs.glucose} onChange={(e) => nest('labs', 'glucose', e.target.value)}>
                <option value="negative">Negative</option>
                <option value="trace">Trace</option>
                <option value="positive">Positive</option>
              </select>
            </div>
            <div className="field">
              <label>Syphilis</label>
              <select value={form.labs.syphilis} onChange={(e) => nest('labs', 'syphilis', e.target.value)}>
                <option value="not_done">Not done</option>
                <option value="negative">Negative</option>
                <option value="positive">Positive</option>
              </select>
            </div>
          </div>
        </div>
        <div className="card section-block">
          <h3>Danger signs *</h3>
          <label className="check-item" style={{ marginBottom: '0.75rem' }}>
            <input type="checkbox" checked={form.danger_assessed} onChange={(e) => setForm((f) => ({ ...f, danger_assessed: e.target.checked }))} />
            Danger sign assessment completed
          </label>
          <div className="check-grid">
            {Object.keys(form.danger).map((k) => (
              <label className="check-item" key={k}>
                <input type="checkbox" checked={form.danger[k]} onChange={(e) => nest('danger', k, e.target.checked)} />
                {k.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
        </div>
        <div className="card section-block">
          <h3>Treatment & counseling</h3>
          <div className="check-grid">
            {Object.keys(form.treatment).map((k) => (
              <label className="check-item" key={k}>
                <input type="checkbox" checked={form.treatment[k]} onChange={(e) => nest('treatment', k, e.target.checked)} />
                {k.replace(/_/g, ' ')}
              </label>
            ))}
            {Object.keys(form.counseling).map((k) => (
              <label className="check-item" key={k}>
                <input type="checkbox" checked={form.counseling[k]} onChange={(e) => nest('counseling', k, e.target.checked)} />
                counseling {k.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary">Save visit & run risk engine</button>
      </form>
    </div>
  );
}
