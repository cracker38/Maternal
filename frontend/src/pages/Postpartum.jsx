import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { alertActions, formatMissing } from '../alertUtils';

export default function Postpartum() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    checkpoint: '1h',
    bleeding: 'normal',
    blood_loss_ml: '',
    uterus_tone: 'firm',
    bp_systolic: '110',
    bp_diastolic: '70',
    temperature: '36.6',
    breastfeeding: 'yes',
    pain_score: '2',
    mental_health: 'stable',
    mood_changes: false,
    support_available: true,
    family_planning: false,
    notes: '',
  });

  function load() {
    api(`/postpartum/pregnancy/${id}`).then(setData).catch((e) => setError(e.message));
  }

  useEffect(() => { load(); }, [id]);

  async function submit(e) {
    e.preventDefault();
    setResult(null);
    try {
      const res = await api('/postpartum/assess', {
        method: 'POST',
        body: {
          pregnancy_id: Number(id),
          ...form,
          bp_systolic: Number(form.bp_systolic),
          bp_diastolic: Number(form.bp_diastolic),
          temperature: Number(form.temperature),
          pain_score: Number(form.pain_score),
          blood_loss_ml: form.blood_loss_ml !== '' ? Number(form.blood_loss_ml) : null,
        },
      });
      setResult(res);
      load();
    } catch (err) {
      setError(formatMissing(err));
    }
  }

  if (!data && !error) return <p>Loading postpartum schedule…</p>;

  return (
    <div>
      <header className="page-header">
        <h1>Postpartum intelligence</h1>
        <p>Automatic schedule: 1h · 6h · 24h · discharge · Day 7 · Day 42</p>
      </header>

      {result?.pph_suspected && (
        <div className="alert-banner critical">
          <strong>POSTPARTUM HEMORRHAGE ALERT</strong>
          <div>{result.evaluation?.alerts?.[0]?.message}</div>
          <div>Actions: {alertActions(result.evaluation?.alerts?.[0]?.recommended_actions).join(' · ')}</div>
          {result.emergency_id && (
            <div className="btn-row">
              <Link className="btn btn-danger" to={`/emergencies/${result.emergency_id}`}>Open PPH checklist</Link>
            </div>
          )}
        </div>
      )}

      {result?.mental_health_followup && (
        <div className="alert-banner alert-MEDIUM">
          <strong>Mental health follow-up recommended</strong>
          <div>Mood/emotional wellbeing concerns detected during postpartum screening.</div>
        </div>
      )}

      <div className="grid grid-3" style={{ marginBottom: '1rem' }}>
        {data?.schedule?.map((s) => (
          <div className="card" key={s.checkpoint}>
            <h3>{s.checkpoint}</h3>
            <span className={`badge ${s.completed ? 'badge-LOW' : 'badge-MEDIUM'}`}>
              {s.completed ? 'Completed' : 'Due'}
            </span>
            {s.assessment && (
              <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                Bleeding {s.assessment.bleeding} · Uterus {s.assessment.uterus_tone}
              </div>
            )}
          </div>
        ))}
      </div>

      <form className="card" onSubmit={submit}>
        <h3>Postpartum assessment</h3>
        <div className="grid grid-3">
          <div className="field">
            <label>Checkpoint</label>
            <select value={form.checkpoint} onChange={(e) => setForm({ ...form, checkpoint: e.target.value })}>
              {['1h', '6h', '24h', 'discharge', 'day7', 'day42'].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Bleeding</label>
            <select value={form.bleeding} onChange={(e) => setForm({ ...form, bleeding: e.target.value })}>
              <option value="normal">Normal</option>
              <option value="increased">Increased</option>
              <option value="heavy">Heavy</option>
            </select>
          </div>
          <div className="field">
            <label>Uterus</label>
            <select value={form.uterus_tone} onChange={(e) => setForm({ ...form, uterus_tone: e.target.value })}>
              <option value="firm">Firm</option>
              <option value="boggy">Boggy</option>
              <option value="atonic">Atonic</option>
            </select>
          </div>
          <div className="field"><label>BP systolic</label><input value={form.bp_systolic} onChange={(e) => setForm({ ...form, bp_systolic: e.target.value })} /></div>
          <div className="field"><label>BP diastolic</label><input value={form.bp_diastolic} onChange={(e) => setForm({ ...form, bp_diastolic: e.target.value })} /></div>
          <div className="field"><label>Estimated blood loss (ml)</label><input value={form.blood_loss_ml} onChange={(e) => setForm({ ...form, blood_loss_ml: e.target.value })} /></div>
          <div className="field"><label>Temperature</label><input value={form.temperature} onChange={(e) => setForm({ ...form, temperature: e.target.value })} /></div>
          <div className="field">
            <label>Breastfeeding</label>
            <select value={form.breastfeeding} onChange={(e) => setForm({ ...form, breastfeeding: e.target.value })}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="difficult">Difficult</option>
            </select>
          </div>
          <div className="field"><label>Pain score</label><input value={form.pain_score} onChange={(e) => setForm({ ...form, pain_score: e.target.value })} /></div>
          <div className="field">
            <label>Emotional wellbeing</label>
            <select value={form.mental_health} onChange={(e) => setForm({ ...form, mental_health: e.target.value })}>
              <option value="stable">Stable</option>
              <option value="anxious">Anxious</option>
              <option value="depressed_signs">Depressed signs</option>
            </select>
          </div>
        </div>
        <div className="check-grid" style={{ marginTop: '0.75rem' }}>
          <label className="check-item">
            <input type="checkbox" checked={form.mood_changes} onChange={(e) => setForm({ ...form, mood_changes: e.target.checked })} />
            Mood changes reported
          </label>
          <label className="check-item">
            <input type="checkbox" checked={form.support_available} onChange={(e) => setForm({ ...form, support_available: e.target.checked })} />
            Support available at home
          </label>
          <label className="check-item">
            <input type="checkbox" checked={form.family_planning} onChange={(e) => setForm({ ...form, family_planning: e.target.checked })} />
            Family planning discussed
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <div className="btn-row">
          <button className="btn btn-primary">Save assessment</button>
          <button
            type="button"
            className="btn btn-danger"
            onClick={() => setForm((f) => ({ ...f, bleeding: 'heavy', uterus_tone: 'boggy', bp_systolic: '85', bp_diastolic: '55' }))}
          >
            Simulate PPH findings
          </button>
        </div>
      </form>
    </div>
  );
}
