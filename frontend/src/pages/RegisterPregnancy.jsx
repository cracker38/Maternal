import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { RiskBadge } from '../components/Layout';
import { alertActions, formatMissing } from '../alertUtils';

const emptyObs = {
  previous_stillbirth: false,
  previous_csection: false,
  previous_pph: false,
  previous_eclampsia: false,
  previous_premature: false,
};
const emptyMed = {
  hypertension: false,
  diabetes: false,
  hiv: false,
  tb: false,
  asthma: false,
  epilepsy: false,
  sickle_cell: false,
  allergies: '',
};

function calcEDD(lmp) {
  if (!lmp) return '';
  const d = new Date(lmp);
  d.setDate(d.getDate() + 280);
  return d.toISOString().slice(0, 10);
}
function calcGA(lmp) {
  if (!lmp) return '';
  const weeks = (Date.now() - new Date(lmp)) / (1000 * 60 * 60 * 24 * 7);
  return (Math.round(weeks * 10) / 10).toFixed(1);
}

export default function RegisterPregnancy() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    mother_id: params.get('mother_id') || '',
    full_name: '',
    date_of_birth: '',
    national_id: '',
    phone: '',
    village: '',
    cell_name: '',
    sector: '',
    district: 'Gasabo',
    insurance: 'Mutuelle',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    blood_group: '',
    gravida: 1,
    para: 0,
    abortions: 0,
    multiple_pregnancy: false,
    lmp: '',
    obstetric: { ...emptyObs },
    medical: { ...emptyMed },
  });
  const [result, setResult] = useState(null);
  const [duplicate, setDuplicate] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const edd = useMemo(() => calcEDD(form.lmp), [form.lmp]);
  const ga = useMemo(() => calcGA(form.lmp), [form.lmp]);

  useEffect(() => {
    const motherId = params.get('mother_id');
    if (!motherId) return;
    api(`/mothers/${motherId}`)
      .then((d) => {
        const m = d.mother;
        if (!m) return;
        setForm((f) => ({
          ...f,
          mother_id: String(m.id),
          full_name: m.full_name || '',
          date_of_birth: m.date_of_birth ? String(m.date_of_birth).slice(0, 10) : '',
          national_id: m.national_id || '',
          phone: m.phone || '',
          village: m.village || '',
          cell_name: m.cell_name || '',
          sector: m.sector || '',
          district: m.district || f.district,
          insurance: m.insurance || f.insurance,
          emergency_contact_name: m.emergency_contact_name || '',
          emergency_contact_phone: m.emergency_contact_phone || '',
          blood_group: m.blood_group || '',
        }));
      })
      .catch(() => {});
  }, [params]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function setObs(k, v) {
    setForm((f) => ({ ...f, obstetric: { ...f.obstetric, [k]: v } }));
  }
  function setMed(k, v) {
    setForm((f) => ({ ...f, medical: { ...f.medical, [k]: v } }));
  }

  async function checkDuplicate() {
    const qs = new URLSearchParams();
    if (form.national_id) qs.set('national_id', form.national_id);
    if (form.phone) qs.set('phone', form.phone);
    if (!qs.toString()) return null;
    return api(`/mothers/duplicate-check?${qs.toString()}`);
  }

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setDuplicate(null);
    try {
      if (!form.mother_id && (form.national_id || form.phone)) {
        const dup = await checkDuplicate();
        if (dup?.duplicate) {
          setDuplicate(dup);
          setLoading(false);
          return;
        }
      }
      const payload = { ...form };
      if (!payload.mother_id) delete payload.mother_id;
      else payload.mother_id = Number(payload.mother_id);
      const data = await api('/pregnancies', { method: 'POST', body: payload });
      setResult(data);
    } catch (err) {
      if (err.status === 409 && err.data?.duplicate) {
        setDuplicate({
          message: err.data.error,
          matches: [{
            pregnancy_id: err.data.pregnancy_id,
            mother_id: err.data.mother_id,
            full_name: err.data.full_name,
            anc_number: err.data.anc_number,
          }].filter((m) => m.pregnancy_id),
        });
      } else {
        setError(formatMissing(err));
      }
    } finally {
      setLoading(false);
    }
  }

  if (duplicate) {
    const match = duplicate.matches?.[0];
    return (
      <div className="card">
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--green-900)' }}>Mother already registered</h1>
        <p>{duplicate.message || 'Mother already registered. Open existing maternal profile.'}</p>
        {match && (
          <p>
            {match.full_name} · {match.anc_number}
          </p>
        )}
        <div className="btn-row">
          {match?.pregnancy_id && (
            <Link className="btn btn-primary" to={`/pregnancies/${match.pregnancy_id}`}>
              Open existing maternal profile
            </Link>
          )}
          <button className="btn btn-ghost" type="button" onClick={() => setDuplicate(null)}>Back</button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="card">
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--green-900)' }}>Pregnancy registered</h1>
        <p>ANC number: <strong>{result.anc_number}</strong></p>
        <p>
          EDD: {result.edd} · GA: {result.gestational_age_weeks} weeks · Risk:{' '}
          <RiskBadge score={result.risk_score} />
          {result.risk_percent != null && <> · AI score {result.risk_percent}%</>}
        </p>
        {result.ai_disclaimer && <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{result.ai_disclaimer}</p>}
        {result.alerts?.map((a, i) => (
          <div key={i} className={`alert-banner alert-${a.severity}`}>
            <strong>{a.title}</strong>
            <div>{a.message}</div>
            {a.explanation && <div style={{ marginTop: 6, fontSize: '0.85rem' }}>Why: {a.explanation}</div>}
            {alertActions(a.recommended_actions).length > 0 && (
              <div style={{ marginTop: 6, fontSize: '0.85rem' }}>
                Actions: {alertActions(a.recommended_actions).join(' · ')}
              </div>
            )}
          </div>
        ))}
        <div className="btn-row">
          <button className="btn btn-primary" onClick={() => navigate(`/pregnancies/${result.pregnancy_id}`)}>
            Open maternal record
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <h1>Pregnancy registration</h1>
        <p>Structured maternal profile — risk score calculated automatically</p>
      </header>
      <form onSubmit={submit}>
        <div className="card section-block">
          <h3>A — Personal information</h3>
          <div className="grid grid-2">
            <div className="field"><label>Full name</label><input required value={form.full_name} onChange={(e) => set('full_name', e.target.value)} /></div>
            <div className="field"><label>Date of birth</label><input type="date" required value={form.date_of_birth} onChange={(e) => set('date_of_birth', e.target.value)} /></div>
            <div className="field"><label>National ID</label><input value={form.national_id} onChange={(e) => set('national_id', e.target.value)} /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => set('phone', e.target.value)} /></div>
            <div className="field"><label>Village</label><input value={form.village} onChange={(e) => set('village', e.target.value)} /></div>
            <div className="field"><label>Cell</label><input value={form.cell_name} onChange={(e) => set('cell_name', e.target.value)} /></div>
            <div className="field"><label>Sector</label><input value={form.sector} onChange={(e) => set('sector', e.target.value)} /></div>
            <div className="field"><label>District</label><input value={form.district} onChange={(e) => set('district', e.target.value)} /></div>
            <div className="field"><label>Insurance</label><input value={form.insurance} onChange={(e) => set('insurance', e.target.value)} /></div>
            <div className="field"><label>Blood group</label><input value={form.blood_group} onChange={(e) => set('blood_group', e.target.value)} /></div>
            <div className="field"><label>Emergency contact</label><input value={form.emergency_contact_name} onChange={(e) => set('emergency_contact_name', e.target.value)} /></div>
            <div className="field"><label>Emergency phone</label><input value={form.emergency_contact_phone} onChange={(e) => set('emergency_contact_phone', e.target.value)} /></div>
          </div>
        </div>

        <div className="card section-block">
          <h3>B — Obstetric history</h3>
          <div className="grid grid-3">
            <div className="field"><label>Gravida</label><input type="number" value={form.gravida} onChange={(e) => set('gravida', Number(e.target.value))} /></div>
            <div className="field"><label>Para</label><input type="number" value={form.para} onChange={(e) => set('para', Number(e.target.value))} /></div>
            <div className="field"><label>Abortions</label><input type="number" value={form.abortions} onChange={(e) => set('abortions', Number(e.target.value))} /></div>
          </div>
          <div className="check-grid">
            {Object.keys(emptyObs).map((k) => (
              <label className="check-item" key={k}>
                <input type="checkbox" checked={!!form.obstetric[k]} onChange={(e) => setObs(k, e.target.checked)} />
                {k.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
        </div>

        <div className="card section-block">
          <h3>C — Medical history</h3>
          <div className="check-grid">
            {Object.keys(emptyMed).filter((k) => k !== 'allergies').map((k) => (
              <label className="check-item" key={k}>
                <input type="checkbox" checked={!!form.medical[k]} onChange={(e) => setMed(k, e.target.checked)} />
                {k.replace(/_/g, ' ')}
              </label>
            ))}
          </div>
          <div className="field" style={{ marginTop: '0.75rem' }}>
            <label>Allergies</label>
            <input value={form.medical.allergies} onChange={(e) => setMed('allergies', e.target.value)} />
          </div>
        </div>

        <div className="card section-block">
          <h3>D — Current pregnancy</h3>
          <div className="grid grid-3">
            <div className="field"><label>LMP (required)</label><input type="date" required value={form.lmp} onChange={(e) => set('lmp', e.target.value)} /></div>
            <div className="field"><label>Estimated delivery date</label><input value={edd} readOnly /></div>
            <div className="field"><label>Gestational age (weeks)</label><input value={ga} readOnly /></div>
          </div>
          <label className="check-item" style={{ marginTop: '0.75rem' }}>
            <input type="checkbox" checked={form.multiple_pregnancy} onChange={(e) => set('multiple_pregnancy', e.target.checked)} />
            Multiple pregnancy
          </label>
        </div>

        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary" disabled={loading}>{loading ? 'Saving…' : 'Register & score risk'}</button>
      </form>
    </div>
  );
}
