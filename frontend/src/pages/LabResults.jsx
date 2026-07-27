import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { formatMissing } from '../alertUtils';

const RESULT_OPTS = [
  { value: 'not_done', label: 'Not done' },
  { value: 'negative', label: 'Negative' },
  { value: 'positive', label: 'Positive' },
  { value: 'inconclusive', label: 'Inconclusive' },
];

const FLAG_LABEL = {
  severe_anemia: 'Severe anemia',
  anemia: 'Anemia',
  hiv_positive: 'HIV positive',
  syphilis_positive: 'Syphilis positive',
  hepatitis_b_positive: 'Hepatitis B positive',
  malaria_positive: 'Malaria positive',
  proteinuria: 'Proteinuria',
  glucose_abnormal: 'Abnormal glucose',
};

const FLAG_SEVERITY = {
  severe_anemia: 'CRITICAL',
  hiv_positive: 'HIGH',
  syphilis_positive: 'HIGH',
  malaria_positive: 'HIGH',
  anemia: 'HIGH',
  proteinuria: 'HIGH',
  hepatitis_b_positive: 'MEDIUM',
  glucose_abnormal: 'MEDIUM',
};

function ResultValue({ label, value, unit, flag }) {
  const cls = flag === 'CRITICAL'
    ? { background: '#fdecea', color: '#b42318', border: '1px solid #f5c6c2' }
    : flag === 'HIGH'
    ? { background: '#ffeee3', color: '#c45c1a', border: '1px solid #f5c6a0' }
    : flag === 'MEDIUM'
    ? { background: '#fff4e5', color: '#c47b16', border: '1px solid #f5dfa0' }
    : { background: 'var(--sky-50)', color: 'var(--ink)', border: '1px solid var(--line)' };

  return (
    <div style={{ borderRadius: 10, padding: '0.6rem 0.75rem', ...cls }}>
      <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', opacity: 0.7, marginBottom: 2 }}>
        {label}
      </div>
      <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>
        {value ?? '—'}{unit && value != null ? <span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: 3 }}>{unit}</span> : ''}
      </div>
    </div>
  );
}

function LabResultCard({ lab }) {
  const flags = Array.isArray(lab.abnormal_flags) ? lab.abnormal_flags : [];
  const hasFlags = flags.length > 0;

  function flagFor(key) {
    if (flags.includes(key)) return FLAG_SEVERITY[key] || 'HIGH';
    return null;
  }

  return (
    <div style={{
      border: `1px solid ${hasFlags ? '#f5c6c2' : 'var(--line)'}`,
      borderRadius: 12,
      padding: '1rem 1.1rem',
      background: hasFlags ? 'linear-gradient(135deg,#fff8f7,#fff)' : 'var(--white)',
      marginBottom: '1rem',
      boxShadow: 'var(--shadow)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--green-900)' }}>
            Lab panel — {new Date(lab.test_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </strong>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>
            {new Date(lab.test_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {lab.recorded_by_name ? ` · Recorded by ${lab.recorded_by_name}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {flags.map((f) => (
            <span key={f} className={`badge badge-${FLAG_SEVERITY[f] || 'HIGH'}`}>
              {FLAG_LABEL[f] || f.replace(/_/g, ' ')}
            </span>
          ))}
          {!hasFlags && <span className="badge badge-LOW">All normal</span>}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
        {lab.hemoglobin != null && (
          <ResultValue label="Hemoglobin" value={lab.hemoglobin} unit="g/dL"
            flag={flagFor('severe_anemia') || flagFor('anemia')} />
        )}
        {lab.blood_group && (
          <ResultValue label="Blood group" value={`${lab.blood_group} ${lab.rh_factor !== 'unknown' ? lab.rh_factor : ''}`} />
        )}
        {lab.hiv_result && lab.hiv_result !== 'not_done' && (
          <ResultValue label="HIV" value={lab.hiv_result} flag={flagFor('hiv_positive')} />
        )}
        {lab.syphilis_result && lab.syphilis_result !== 'not_done' && (
          <ResultValue label="Syphilis / RPR" value={lab.syphilis_result} flag={flagFor('syphilis_positive')} />
        )}
        {lab.hepatitis_b && lab.hepatitis_b !== 'not_done' && (
          <ResultValue label="Hepatitis B" value={lab.hepatitis_b} flag={flagFor('hepatitis_b_positive')} />
        )}
        {lab.malaria_result && lab.malaria_result !== 'not_done' && (
          <ResultValue label="Malaria" value={lab.malaria_result} flag={flagFor('malaria_positive')} />
        )}
        {lab.urine_protein && lab.urine_protein !== 'not_done' && (
          <ResultValue label="Urine protein" value={lab.urine_protein} flag={flagFor('proteinuria')} />
        )}
        {lab.urine_glucose && lab.urine_glucose !== 'not_done' && (
          <ResultValue label="Urine glucose" value={lab.urine_glucose} flag={flagFor('glucose_abnormal')} />
        )}
        {lab.blood_glucose != null && (
          <ResultValue label="Blood glucose" value={lab.blood_glucose} unit="mg/dL" flag={flagFor('glucose_abnormal')} />
        )}
        {lab.wbc != null && <ResultValue label="WBC" value={lab.wbc} />}
        {lab.platelets != null && <ResultValue label="Platelets" value={lab.platelets} />}
      </div>

      {lab.clinical_notes && (
        <div style={{ marginTop: '0.65rem', padding: '0.55rem 0.75rem', background: 'var(--sky-50)', borderRadius: 8, fontSize: '0.88rem', color: 'var(--ink)' }}>
          <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Clinical notes</strong>
          <div style={{ marginTop: 3 }}>{lab.clinical_notes}</div>
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = {
  test_date: new Date().toISOString().slice(0, 16),
  hemoglobin: '',
  blood_group: '',
  rh_factor: 'unknown',
  hiv_result: 'not_done',
  syphilis_result: 'not_done',
  hepatitis_b: 'not_done',
  malaria_result: 'not_done',
  urine_protein: 'not_done',
  urine_glucose: 'not_done',
  blood_glucose: '',
  wbc: '',
  platelets: '',
  clinical_notes: '',
};

export default function LabResults() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [history, setHistory] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const formRef = useRef(null);

  async function loadHistory() {
    try {
      const res = await api(`/investigations/pregnancy/${id}`);
      setHistory(res.lab_results || []);
    } catch (e) {
      setLoadError(e.message);
    }
  }

  useEffect(() => { loadHistory(); }, [id]);

  function set(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    setError(''); setMsg(''); setBusy(true);
    try {
      const res = await api('/investigations/labs', {
        method: 'POST',
        body: {
          pregnancy_id: Number(id),
          ...form,
          hemoglobin: form.hemoglobin === '' ? undefined : Number(form.hemoglobin),
          blood_glucose: form.blood_glucose === '' ? undefined : Number(form.blood_glucose),
          wbc: form.wbc === '' ? undefined : Number(form.wbc),
          platelets: form.platelets === '' ? undefined : Number(form.platelets),
        },
      });
      setMsg(res.message);
      setForm(EMPTY_FORM);
      setShowForm(false);
      await loadHistory();
    } catch (err) {
      setError(formatMissing(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <header className="page-header">
        <h1>Lab results</h1>
        <p>Antenatal laboratory investigations. Abnormal values generate AI clinical alerts.</p>
      </header>

      <div style={{ display: 'flex', gap: 8, marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <button
          type="button"
          className={`btn ${showForm ? 'btn-ghost' : 'btn-primary'}`}
          onClick={() => {
            setShowForm((v) => !v);
            setError(''); setMsg('');
            setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth' }), 80);
          }}
        >
          {showForm ? 'Close form' : '+ Record new lab results'}
        </button>
        <Link className="btn btn-outline" to={`/pregnancies/${id}`}>← Back to maternal record</Link>
      </div>

      {/* History */}
      {loadError && <p className="error-text">{loadError}</p>}
      {history.length === 0 && !showForm && (
        <div className="empty-state">
          <strong>No lab results recorded yet</strong>
          <p>Record the first lab panel for this pregnancy.</p>
        </div>
      )}
      {history.map((lab) => <LabResultCard key={lab.id} lab={lab} />)}

      {/* Entry form */}
      {showForm && (
        <div ref={formRef}>
          <div style={{ borderTop: '2px solid var(--line)', margin: '1.25rem 0 1rem' }} />
          <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--green-900)', marginBottom: '0.75rem' }}>
            New lab panel
          </h3>
          <form className="card" onSubmit={submit}>
            <div className="grid grid-3">
              <div className="field">
                <label>Test date / time</label>
                <input type="datetime-local" value={form.test_date} onChange={(e) => set('test_date', e.target.value)} required />
              </div>
              <div className="field">
                <label>Hemoglobin (g/dL)</label>
                <input value={form.hemoglobin} onChange={(e) => set('hemoglobin', e.target.value)} placeholder="e.g. 11.2" />
              </div>
              <div className="field">
                <label>Blood group</label>
                <select value={form.blood_group} onChange={(e) => set('blood_group', e.target.value)}>
                  <option value="">Not recorded</option>
                  {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Rh factor</label>
                <select value={form.rh_factor} onChange={(e) => set('rh_factor', e.target.value)}>
                  <option value="unknown">Unknown</option>
                  <option value="positive">Positive</option>
                  <option value="negative">Negative</option>
                </select>
              </div>
              <div className="field">
                <label>HIV</label>
                <select value={form.hiv_result} onChange={(e) => set('hiv_result', e.target.value)}>
                  {RESULT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Syphilis / RPR</label>
                <select value={form.syphilis_result} onChange={(e) => set('syphilis_result', e.target.value)}>
                  {RESULT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Hepatitis B (HBsAg)</label>
                <select value={form.hepatitis_b} onChange={(e) => set('hepatitis_b', e.target.value)}>
                  {RESULT_OPTS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Malaria</label>
                <select value={form.malaria_result} onChange={(e) => set('malaria_result', e.target.value)}>
                  <option value="not_done">Not done</option>
                  <option value="negative">Negative</option>
                  <option value="positive">Positive</option>
                </select>
              </div>
              <div className="field">
                <label>Urine protein</label>
                <select value={form.urine_protein} onChange={(e) => set('urine_protein', e.target.value)}>
                  {['not_done', 'negative', 'trace', '1+', '2+', '3+'].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Urine glucose</label>
                <select value={form.urine_glucose} onChange={(e) => set('urine_glucose', e.target.value)}>
                  {['not_done', 'negative', 'trace', 'positive'].map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Blood glucose (mg/dL)</label>
                <input value={form.blood_glucose} onChange={(e) => set('blood_glucose', e.target.value)} placeholder="optional" />
              </div>
              <div className="field">
                <label>WBC</label>
                <input value={form.wbc} onChange={(e) => set('wbc', e.target.value)} placeholder="optional" />
              </div>
              <div className="field">
                <label>Platelets</label>
                <input value={form.platelets} onChange={(e) => set('platelets', e.target.value)} placeholder="optional" />
              </div>
            </div>
            <div className="field">
              <label>Clinical notes</label>
              <textarea rows={3} value={form.clinical_notes} onChange={(e) => set('clinical_notes', e.target.value)} placeholder="Interpretation, repeat plan, treatment started" />
            </div>
            {error && <p className="error-text">{error}</p>}
            {msg && <p style={{ color: 'var(--green-800)' }}>{msg}</p>}
            <div className="btn-row">
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save lab results'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
