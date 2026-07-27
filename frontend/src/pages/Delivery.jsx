import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { formatMissing } from '../alertUtils';

export default function Delivery() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [existing, setExisting] = useState(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    delivery_time: new Date().toISOString().slice(0, 16),
    delivery_method: 'svd',
    blood_loss_ml: '250',
    tears: 'none',
    placenta_condition: 'complete',
    baby: {
      birth_weight_g: '3200',
      sex: 'female',
      apgar_1: '8',
      apgar_5: '9',
      resuscitation: false,
    },
  });

  useEffect(() => {
    api(`/deliveries/pregnancy/${id}`)
      .then((d) => {
        setExisting(d);
        setLoading(false);
      })
      .catch(() => {
        setExisting(null);
        setLoading(false);
      });
  }, [id]);

  function set(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  function setBaby(k, v) {
    setForm((f) => ({ ...f, baby: { ...f.baby, [k]: v } }));
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await api('/deliveries', {
        method: 'POST',
        body: {
          pregnancy_id: Number(id),
          delivery_time: `${form.delivery_time.replace('T', ' ')}:00`,
          delivery_method: form.delivery_method,
          blood_loss_ml: Number(form.blood_loss_ml),
          tears: form.tears,
          placenta_condition: form.placenta_condition,
          baby: {
            ...form.baby,
            birth_weight_g: Number(form.baby.birth_weight_g),
            apgar_1: Number(form.baby.apgar_1),
            apgar_5: Number(form.baby.apgar_5),
          },
        },
      });
      navigate(`/pregnancies/${id}/postpartum`);
    } catch (err) {
      if (String(err.message).toLowerCase().includes('already')) {
        navigate(`/pregnancies/${id}/postpartum`);
        return;
      }
      setError(formatMissing(err));
    }
  }

  if (loading) return <p>Checking delivery status…</p>;

  if (existing?.delivery) {
    const d = existing.delivery;
    const n = existing.newborn || {};
    return (
      <div className="card">
        <h1 style={{ fontFamily: 'var(--font-display)', color: 'var(--green-900)' }}>Delivery already recorded</h1>
        <div className="list-row"><span>Method</span><strong>{d.delivery_method}</strong></div>
        <div className="list-row"><span>Time</span><strong>{new Date(d.delivery_time).toLocaleString()}</strong></div>
        <div className="list-row"><span>Blood loss</span><strong>{d.blood_loss_ml ?? '—'} ml</strong></div>
        <div className="list-row"><span>Newborn</span><strong>{n.sex || '—'} · {n.birth_weight_g || '—'} g · APGAR {n.apgar_1}/{n.apgar_5}</strong></div>
        <div className="btn-row">
          <Link className="btn btn-primary" to={`/pregnancies/${id}/postpartum`}>Continue postpartum</Link>
          <Link className="btn btn-ghost" to={`/pregnancies/${id}`}>Back to record</Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <header className="page-header">
        <h1>Birth documentation</h1>
        <p>Mandatory: delivery method, blood loss, placenta, birth weight, APGAR — then auto postpartum transition</p>
      </header>
      <form className="card" onSubmit={submit}>
        <h3>Mother</h3>
        <div className="grid grid-3">
          <div className="field"><label>Delivery time</label><input type="datetime-local" value={form.delivery_time} onChange={(e) => set('delivery_time', e.target.value)} /></div>
          <div className="field">
            <label>Method *</label>
            <select required value={form.delivery_method} onChange={(e) => set('delivery_method', e.target.value)}>
              <option value="svd">SVD</option>
              <option value="assisted">Assisted</option>
              <option value="csection">C-section</option>
            </select>
          </div>
          <div className="field"><label>Blood loss (ml) *</label><input required value={form.blood_loss_ml} onChange={(e) => set('blood_loss_ml', e.target.value)} /></div>
          <div className="field">
            <label>Tears</label>
            <select value={form.tears} onChange={(e) => set('tears', e.target.value)}>
              {['none', '1st', '2nd', '3rd', '4th'].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Placenta *</label>
            <select required value={form.placenta_condition} onChange={(e) => set('placenta_condition', e.target.value)}>
              <option value="complete">Complete</option>
              <option value="incomplete">Incomplete</option>
              <option value="retained">Retained</option>
            </select>
          </div>
        </div>
        <h3>Baby</h3>
        <div className="grid grid-3">
          <div className="field"><label>Birth weight (g) *</label><input required value={form.baby.birth_weight_g} onChange={(e) => setBaby('birth_weight_g', e.target.value)} /></div>
          <div className="field">
            <label>Sex / birth outcome *</label>
            <select required value={form.baby.sex} onChange={(e) => setBaby('sex', e.target.value)}>
              <option value="female">Female</option>
              <option value="male">Male</option>
              <option value="unknown">Unknown</option>
            </select>
          </div>
          <div className="field"><label>APGAR 1 *</label><input required value={form.baby.apgar_1} onChange={(e) => setBaby('apgar_1', e.target.value)} /></div>
          <div className="field"><label>APGAR 5 *</label><input required value={form.baby.apgar_5} onChange={(e) => setBaby('apgar_5', e.target.value)} /></div>
          <label className="check-item">
            <input type="checkbox" checked={form.baby.resuscitation} onChange={(e) => setBaby('resuscitation', e.target.checked)} />
            Resuscitation
          </label>
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-primary">Save delivery & open postpartum</button>
      </form>
    </div>
  );
}
