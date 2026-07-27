import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { formatMissing } from '../alertUtils';

export default function LaborAdmit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [existing, setExisting] = useState(false);
  const [warnings, setWarnings] = useState([]);
  const [form, setForm] = useState({
    admission_time: new Date().toISOString().slice(0, 16),
    contractions: '3/10min moderate',
    membrane_status: 'intact',
    liquor: 'clear',
    cervical_dilation: '4',
    station: '-1',
    presentation: 'cephalic',
    fhr: '140',
    bp_systolic: '120',
    bp_diastolic: '80',
    pulse: '88',
    admission_note: '',
    ambulance_requested: false,
    ambulance_urgency: 'urgent',
    ambulance_destination: '',
    ambulance_crew_contact: '',
    ambulance_eta_minutes: '',
    ambulance_reason: '',
    ambulance_id: '',
  });
  const [fleet, setFleet] = useState(null);

  useEffect(() => {
    api(`/labor/pregnancy/${id}`)
      .then(() => setExisting(true))
      .catch(() => setExisting(false));
  }, [id]);

  useEffect(() => {
    if (!form.ambulance_requested) return;
    api('/ambulance/fleet')
      .then(setFleet)
      .catch(() => setFleet(null));
  }, [form.ambulance_requested]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      const body = {
        pregnancy_id: Number(id),
        ...form,
        admission_time: `${form.admission_time.replace('T', ' ')}:00`,
        cervical_dilation: Number(form.cervical_dilation),
        fhr: Number(form.fhr),
        bp_systolic: Number(form.bp_systolic),
        bp_diastolic: Number(form.bp_diastolic),
        pulse: Number(form.pulse),
        ambulance_eta_minutes: form.ambulance_eta_minutes ? Number(form.ambulance_eta_minutes) : undefined,
        ambulance_id: form.ambulance_id ? Number(form.ambulance_id) : undefined,
      };
      const res = await api('/labor/admit', { method: 'POST', body });
      if (res.warning_banners?.length) {
        setWarnings(res.warning_banners);
        setTimeout(() => navigate(`/pregnancies/${id}/partograph`), 1200);
      } else {
        navigate(`/pregnancies/${id}/partograph`);
      }
    } catch (err) {
      if (String(err.message).toLowerCase().includes('already')) {
        navigate(`/pregnancies/${id}/partograph`);
        return;
      }
      setError(formatMissing(err));
    }
  }

  if (existing) {
    return (
      <div className="card">
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--green-900)' }}>Already admitted to labor</h1>
        <p>This mother has an active labor record. Continue on the digital partograph.</p>
        <div className="btn-row">
          <Link className="btn btn-primary" to={`/pregnancies/${id}/partograph`}>Open partograph</Link>
          <Link className="btn btn-ghost" to={`/pregnancies/${id}`}>Back to record</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <h1>Labor admission</h1>
        <p>Confirm identity, presentation, gestational age, and initial vitals before monitoring</p>
      </header>
      {warnings.map((w) => (
        <div className="warning-strip" key={w}>⚠ {w}</div>
      ))}
      <form className="card" onSubmit={submit}>
        <div className="grid grid-3">
          <div className="field"><label>Admission time</label><input type="datetime-local" value={form.admission_time} onChange={(e) => set('admission_time', e.target.value)} /></div>
          <div className="field"><label>Contractions</label><input value={form.contractions} onChange={(e) => set('contractions', e.target.value)} /></div>
          <div className="field">
            <label>Membrane status</label>
            <select value={form.membrane_status} onChange={(e) => set('membrane_status', e.target.value)}>
              <option value="intact">Intact</option>
              <option value="ruptured">Ruptured</option>
            </select>
          </div>
          <div className="field"><label>Liquor</label><input value={form.liquor} onChange={(e) => set('liquor', e.target.value)} /></div>
          <div className="field"><label>Cervical dilation *</label><input required value={form.cervical_dilation} onChange={(e) => set('cervical_dilation', e.target.value)} /></div>
          <div className="field"><label>Station</label><input value={form.station} onChange={(e) => set('station', e.target.value)} /></div>
          <div className="field"><label>Presentation *</label><input required value={form.presentation} onChange={(e) => set('presentation', e.target.value)} /></div>
          <div className="field"><label>FHR *</label><input required value={form.fhr} onChange={(e) => set('fhr', e.target.value)} /></div>
          <div className="field"><label>BP systolic *</label><input required value={form.bp_systolic} onChange={(e) => set('bp_systolic', e.target.value)} /></div>
          <div className="field"><label>BP diastolic *</label><input required value={form.bp_diastolic} onChange={(e) => set('bp_diastolic', e.target.value)} /></div>
          <div className="field"><label>Pulse</label><input value={form.pulse} onChange={(e) => set('pulse', e.target.value)} /></div>
        </div>
        <div className="field">
          <label>Labor admission note</label>
          <textarea
            rows={3}
            value={form.admission_note}
            onChange={(e) => set('admission_note', e.target.value)}
            placeholder="Clinical summary, transfer concerns, labor history, or handover note"
          />
        </div>

        <div className="card" style={{ marginBottom: '1rem', background: 'var(--sky-50)' }}>
          <div className="list-row" style={{ paddingTop: 0 }}>
            <div>
              <strong>Ambulance / transfer readiness</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                Use for high-risk labor, suspected obstruction, fetal distress, prior C-section with concern, or emergency transfer planning.
              </div>
            </div>
            <label className="check-item" style={{ margin: 0 }}>
              <input
                type="checkbox"
                checked={form.ambulance_requested}
                onChange={(e) => set('ambulance_requested', e.target.checked)}
              />
              Request ambulance
            </label>
          </div>
          {form.ambulance_requested && (
            <div className="grid grid-2" style={{ marginTop: '0.75rem' }}>
              {fleet?.summary && (
                <div className="ambulance-fleet-hint" style={{ gridColumn: '1 / -1' }}>
                  <strong>{fleet.summary.remaining}</strong> of {fleet.summary.total} ambulances available
                  {fleet.summary.in_use ? ` · ${fleet.summary.in_use} currently in use` : ''}
                </div>
              )}
              <div className="field">
                <label>Assign available unit (optional)</label>
                <select value={form.ambulance_id} onChange={(e) => set('ambulance_id', e.target.value)}>
                  <option value="">Queue for assignment</option>
                  {(fleet?.fleet || []).filter((u) => u.status === 'available').map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_code} · {u.plate_number || 'no plate'} · {u.current_location || 'Facility bay'}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Transport urgency</label>
                <select value={form.ambulance_urgency} onChange={(e) => set('ambulance_urgency', e.target.value)}>
                  <option value="urgent">Urgent transfer</option>
                  <option value="emergency">Emergency dispatch</option>
                  <option value="standby">Standby / prepare vehicle</option>
                </select>
              </div>
              <div className="field">
                <label>Receiving facility</label>
                <input
                  value={form.ambulance_destination}
                  onChange={(e) => set('ambulance_destination', e.target.value)}
                  placeholder="District hospital / referral hospital"
                />
              </div>
              <div className="field">
                <label>Ambulance crew / contact</label>
                <input
                  value={form.ambulance_crew_contact}
                  onChange={(e) => set('ambulance_crew_contact', e.target.value)}
                  placeholder="Driver, dispatch desk, phone"
                />
              </div>
              <div className="field">
                <label>Estimated arrival (minutes)</label>
                <input
                  value={form.ambulance_eta_minutes}
                  onChange={(e) => set('ambulance_eta_minutes', e.target.value)}
                  placeholder="20"
                />
              </div>
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Reason for ambulance request</label>
                <textarea
                  rows={2}
                  value={form.ambulance_reason}
                  onChange={(e) => set('ambulance_reason', e.target.value)}
                  placeholder="Why transfer / ambulance is needed"
                />
              </div>
            </div>
          )}
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary">Admit & open partograph</button>
      </form>
    </div>
  );
}
