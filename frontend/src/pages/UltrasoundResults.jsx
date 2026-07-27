import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, API_URL } from '../api';
import { formatMissing } from '../alertUtils';

const FLAG_LABEL = {
  no_fhr: 'No fetal heart activity',
  placenta_previa_risk: 'Placenta previa / low-lying',
  oligohydramnios: 'Oligohydramnios',
  polyhydramnios: 'Polyhydramnios',
  malpresentation: 'Malpresentation',
  multiple_pregnancy: 'Multiple pregnancy',
  fetal_anomaly: 'Fetal anomaly',
};

const FLAG_SEVERITY = {
  no_fhr: 'CRITICAL',
  placenta_previa_risk: 'HIGH',
  oligohydramnios: 'HIGH',
  multiple_pregnancy: 'HIGH',
  fetal_anomaly: 'HIGH',
  polyhydramnios: 'MEDIUM',
  malpresentation: 'MEDIUM',
};

function UltrasoundCard({ us, onImageUploaded }) {
  const flags = Array.isArray(us.abnormal_flags) ? us.abnormal_flags : [];
  const hasFlags = flags.length > 0;
  const images = us.images || [];
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [lightbox, setLightbox] = useState(null);
  const fileRef = useRef(null);

  async function handleImageUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { setUploadErr('Only image files are allowed.'); return; }
    if (file.size > 5 * 1024 * 1024) { setUploadErr('Image must be under 5 MB.'); return; }
    setUploading(true); setUploadErr('');
    try {
      const formData = new FormData();
      formData.append('image', file);
      const token = localStorage.getItem('rmdp_token');
      const res = await fetch(`${API_URL}/investigations/ultrasound/${us.id}/image`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Upload failed');
      onImageUploaded();
    } catch (err) {
      setUploadErr(err.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
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
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem', flexWrap: 'wrap', gap: 8 }}>
        <div>
          <strong style={{ fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--green-900)' }}>
            Ultrasound — {new Date(us.exam_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
          </strong>
          <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: 2 }}>
            {new Date(us.exam_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            {us.performed_by_name ? ` · ${us.performed_by_name}` : ''}
            {us.indication ? ` · ${us.indication}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {flags.map((f) => (
            <span key={f} className={`badge badge-${FLAG_SEVERITY[f] || 'HIGH'}`}>
              {FLAG_LABEL[f] || f.replace(/_/g, ' ')}
            </span>
          ))}
          {!hasFlags && <span className="badge badge-LOW">No critical findings</span>}
        </div>
      </div>

      {/* Biometric grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {us.ga_by_ultrasound_weeks != null && (
          <div style={{ background: 'var(--sky-50)', border: '1px solid var(--line)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: 2 }}>GA (US)</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{us.ga_by_ultrasound_weeks}<span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: 3 }}>wks</span></div>
          </div>
        )}
        {us.estimated_fetal_weight_g != null && (
          <div style={{ background: 'var(--sky-50)', border: '1px solid var(--line)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: 2 }}>EFW</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{us.estimated_fetal_weight_g}<span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: 3 }}>g</span></div>
          </div>
        )}
        {us.biparietal_diameter_mm != null && (
          <div style={{ background: 'var(--sky-50)', border: '1px solid var(--line)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: 2 }}>BPD</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{us.biparietal_diameter_mm}<span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: 3 }}>mm</span></div>
          </div>
        )}
        {us.femur_length_mm != null && (
          <div style={{ background: 'var(--sky-50)', border: '1px solid var(--line)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: 2 }}>FL</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{us.femur_length_mm}<span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: 3 }}>mm</span></div>
          </div>
        )}
        {us.abdominal_circumference_mm != null && (
          <div style={{ background: 'var(--sky-50)', border: '1px solid var(--line)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: 2 }}>AC</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{us.abdominal_circumference_mm}<span style={{ fontSize: '0.75rem', fontWeight: 400, marginLeft: 3 }}>mm</span></div>
          </div>
        )}
        {us.amniotic_fluid_index != null && (
          <div style={{ background: 'var(--sky-50)', border: '1px solid var(--line)', borderRadius: 10, padding: '0.6rem 0.75rem' }}>
            <div style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: 2 }}>AFI</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{us.amniotic_fluid_index}</div>
          </div>
        )}
      </div>

      {/* Clinical details row */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.65rem' }}>
        {[
          ['FHR', us.fetal_heart_activity],
          ['Fetus', us.fetal_number],
          ['Presentation', us.presentation],
          ['Placenta', us.placenta_location?.replace(/_/g, ' ')],
          ['Fluid', us.amniotic_fluid?.replace(/_/g, ' ')],
        ].filter(([, v]) => v && v !== 'not_assessed').map(([label, value]) => (
          <span key={label} style={{
            padding: '0.25rem 0.6rem',
            borderRadius: 999,
            fontSize: '0.8rem',
            fontWeight: 600,
            background: 'var(--green-100)',
            color: 'var(--green-900)',
          }}>
            {label}: {value}
          </span>
        ))}
      </div>

      {/* Text findings */}
      {(us.findings || us.impression || us.recommendations || us.fetal_anomalies) && (
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {us.fetal_anomalies && (
            <div style={{ padding: '0.55rem 0.75rem', background: '#fdecea', borderRadius: 8, fontSize: '0.88rem', borderLeft: '3px solid var(--red)' }}>
              <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--red)' }}>Anomalies / concerns</strong>
              <div style={{ marginTop: 3 }}>{us.fetal_anomalies}</div>
            </div>
          )}
          {us.findings && (
            <div style={{ padding: '0.55rem 0.75rem', background: 'var(--sky-50)', borderRadius: 8, fontSize: '0.88rem' }}>
              <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Findings</strong>
              <div style={{ marginTop: 3 }}>{us.findings}</div>
            </div>
          )}
          {us.impression && (
            <div style={{ padding: '0.55rem 0.75rem', background: 'var(--sky-50)', borderRadius: 8, fontSize: '0.88rem' }}>
              <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>Impression</strong>
              <div style={{ marginTop: 3 }}>{us.impression}</div>
            </div>
          )}
          {us.recommendations && (
            <div style={{ padding: '0.55rem 0.75rem', background: 'var(--green-100)', borderRadius: 8, fontSize: '0.88rem' }}>
              <strong style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--green-800)' }}>Recommendations</strong>
              <div style={{ marginTop: 3 }}>{us.recommendations}</div>
            </div>
          )}
        </div>
      )}

      {/* Scan images */}
      {images.length > 0 && (
        <div style={{ marginBottom: '0.75rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--muted)', marginBottom: '0.4rem' }}>
            Scan images ({images.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {images.map((img) => (
              <button
                key={img.id}
                type="button"
                onClick={() => setLightbox(img)}
                style={{
                  border: '2px solid var(--line)',
                  borderRadius: 10,
                  overflow: 'hidden',
                  cursor: 'zoom-in',
                  padding: 0,
                  background: 'none',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => e.currentTarget.style.borderColor = 'var(--green-700)'}
                onMouseLeave={(e) => e.currentTarget.style.borderColor = 'var(--line)'}
              >
                <img
                  src={`${API_URL}/investigations/ultrasound/image/${img.filename}`}
                  alt={img.caption || `Scan ${img.id}`}
                  style={{ width: 120, height: 90, objectFit: 'cover', display: 'block' }}
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Upload image */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '0.5rem 0.9rem', borderRadius: 10, cursor: 'pointer',
          background: 'var(--sky-50)', border: '1px solid var(--line)',
          fontSize: '0.88rem', fontWeight: 600, color: 'var(--green-900)',
          opacity: uploading ? 0.6 : 1,
        }}>
          {uploading ? 'Uploading…' : '📎 Attach scan image'}
          <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleImageUpload} disabled={uploading} />
        </label>
        <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>JPG / PNG / WEBP · max 5 MB</span>
        {uploadErr && <span className="error-text" style={{ fontSize: '0.82rem' }}>{uploadErr}</span>}
      </div>

      {/* Lightbox */}
      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, cursor: 'zoom-out',
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'relative', maxWidth: '90vw', maxHeight: '90vh' }}>
            <img
              src={`${API_URL}/investigations/ultrasound/image/${lightbox.filename}`}
              alt={lightbox.caption || 'Scan image'}
              style={{ maxWidth: '90vw', maxHeight: '85vh', borderRadius: 12, display: 'block', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
            />
            {lightbox.caption && (
              <div style={{ textAlign: 'center', color: '#fff', marginTop: 10, fontSize: '0.9rem' }}>{lightbox.caption}</div>
            )}
            <button
              type="button"
              onClick={() => setLightbox(null)}
              style={{
                position: 'absolute', top: -14, right: -14,
                width: 32, height: 32, borderRadius: '50%',
                background: '#fff', border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: '1rem', lineHeight: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
              }}
            >✕</button>
          </div>
        </div>
      )}
    </div>
  );
}

const EMPTY_FORM = {
  exam_date: new Date().toISOString().slice(0, 16),
  indication: 'Routine ANC ultrasound',
  ga_by_ultrasound_weeks: '',
  biparietal_diameter_mm: '',
  femur_length_mm: '',
  abdominal_circumference_mm: '',
  estimated_fetal_weight_g: '',
  fetal_heart_activity: 'present',
  fetal_number: 'singleton',
  presentation: 'cephalic',
  placenta_location: 'anterior',
  amniotic_fluid: 'normal',
  amniotic_fluid_index: '',
  fetal_anomalies: '',
  findings: '',
  impression: '',
  recommendations: '',
  performed_by_name: '',
};

export default function UltrasoundResults() {
  const { id } = useParams();
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
      setHistory(res.ultrasound_results || []);
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
      const res = await api('/investigations/ultrasound', {
        method: 'POST',
        body: {
          pregnancy_id: Number(id),
          ...form,
          ga_by_ultrasound_weeks: form.ga_by_ultrasound_weeks === '' ? undefined : Number(form.ga_by_ultrasound_weeks),
          biparietal_diameter_mm: form.biparietal_diameter_mm === '' ? undefined : Number(form.biparietal_diameter_mm),
          femur_length_mm: form.femur_length_mm === '' ? undefined : Number(form.femur_length_mm),
          abdominal_circumference_mm: form.abdominal_circumference_mm === '' ? undefined : Number(form.abdominal_circumference_mm),
          estimated_fetal_weight_g: form.estimated_fetal_weight_g === '' ? undefined : Number(form.estimated_fetal_weight_g),
          amniotic_fluid_index: form.amniotic_fluid_index === '' ? undefined : Number(form.amniotic_fluid_index),
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
        <h1>Ultrasound results</h1>
        <p>Obstetric ultrasound findings with scan image attachments. Critical findings generate AI alerts.</p>
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
          {showForm ? 'Close form' : '+ Record new ultrasound'}
        </button>
        <Link className="btn btn-outline" to={`/pregnancies/${id}`}>← Back to maternal record</Link>
      </div>

      {loadError && <p className="error-text">{loadError}</p>}
      {history.length === 0 && !showForm && (
        <div className="empty-state">
          <strong>No ultrasound results recorded yet</strong>
          <p>Record the first scan for this pregnancy. You can attach scan images after saving.</p>
        </div>
      )}
      {history.map((us) => (
        <UltrasoundCard key={us.id} us={us} onImageUploaded={loadHistory} />
      ))}

      {/* Entry form */}
      {showForm && (
        <div ref={formRef}>
          <div style={{ borderTop: '2px solid var(--line)', margin: '1.25rem 0 1rem' }} />
          <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--green-900)', marginBottom: '0.75rem' }}>
            New ultrasound report
          </h3>
          <form className="card" onSubmit={submit}>
            <div className="grid grid-3">
              <div className="field">
                <label>Exam date / time</label>
                <input type="datetime-local" value={form.exam_date} onChange={(e) => set('exam_date', e.target.value)} required />
              </div>
              <div className="field">
                <label>Indication</label>
                <input value={form.indication} onChange={(e) => set('indication', e.target.value)} />
              </div>
              <div className="field">
                <label>Performed by</label>
                <input value={form.performed_by_name} onChange={(e) => set('performed_by_name', e.target.value)} placeholder="Sonographer / clinician" />
              </div>
              <div className="field">
                <label>GA by ultrasound (weeks)</label>
                <input value={form.ga_by_ultrasound_weeks} onChange={(e) => set('ga_by_ultrasound_weeks', e.target.value)} placeholder="e.g. 28.5" />
              </div>
              <div className="field">
                <label>Fetal heart activity</label>
                <select value={form.fetal_heart_activity} onChange={(e) => set('fetal_heart_activity', e.target.value)}>
                  <option value="present">Present</option>
                  <option value="absent">Absent</option>
                  <option value="not_assessed">Not assessed</option>
                </select>
              </div>
              <div className="field">
                <label>Fetal number</label>
                <select value={form.fetal_number} onChange={(e) => set('fetal_number', e.target.value)}>
                  <option value="singleton">Singleton</option>
                  <option value="twins">Twins</option>
                  <option value="triplets">Triplets</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="field">
                <label>Presentation</label>
                <select value={form.presentation} onChange={(e) => set('presentation', e.target.value)}>
                  {['cephalic', 'breech', 'transverse', 'oblique', 'variable', 'not_assessed'].map((v) => (
                    <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Placenta location</label>
                <select value={form.placenta_location} onChange={(e) => set('placenta_location', e.target.value)}>
                  {['anterior', 'posterior', 'fundal', 'lateral', 'previa', 'low_lying', 'not_assessed'].map((v) => (
                    <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Amniotic fluid</label>
                <select value={form.amniotic_fluid} onChange={(e) => set('amniotic_fluid', e.target.value)}>
                  {['normal', 'oligohydramnios', 'polyhydramnios', 'not_assessed'].map((v) => (
                    <option key={v} value={v}>{v.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>AFI (optional)</label>
                <input value={form.amniotic_fluid_index} onChange={(e) => set('amniotic_fluid_index', e.target.value)} />
              </div>
              <div className="field">
                <label>BPD (mm)</label>
                <input value={form.biparietal_diameter_mm} onChange={(e) => set('biparietal_diameter_mm', e.target.value)} />
              </div>
              <div className="field">
                <label>FL (mm)</label>
                <input value={form.femur_length_mm} onChange={(e) => set('femur_length_mm', e.target.value)} />
              </div>
              <div className="field">
                <label>AC (mm)</label>
                <input value={form.abdominal_circumference_mm} onChange={(e) => set('abdominal_circumference_mm', e.target.value)} />
              </div>
              <div className="field">
                <label>Estimated fetal weight (g)</label>
                <input value={form.estimated_fetal_weight_g} onChange={(e) => set('estimated_fetal_weight_g', e.target.value)} />
              </div>
            </div>
            <div className="field">
              <label>Fetal anomalies / concerns</label>
              <textarea rows={2} value={form.fetal_anomalies} onChange={(e) => set('fetal_anomalies', e.target.value)} placeholder="None seen / describe findings" />
            </div>
            <div className="field">
              <label>Findings</label>
              <textarea rows={3} value={form.findings} onChange={(e) => set('findings', e.target.value)} placeholder="Detailed scan findings" />
            </div>
            <div className="field">
              <label>Impression</label>
              <textarea rows={2} value={form.impression} onChange={(e) => set('impression', e.target.value)} />
            </div>
            <div className="field">
              <label>Recommendations</label>
              <textarea rows={2} value={form.recommendations} onChange={(e) => set('recommendations', e.target.value)} placeholder="Follow-up scan, referral, delivery plan" />
            </div>
            {error && <p className="error-text">{error}</p>}
            {msg && <p style={{ color: 'var(--green-800)' }}>{msg}</p>}
            <div className="btn-row">
              <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : 'Save ultrasound results'}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.5rem', marginBottom: 0 }}>
              After saving, you can attach scan images directly to the report card above.
            </p>
          </form>
        </div>
      )}
    </div>
  );
}
