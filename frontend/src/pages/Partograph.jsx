import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { alertActions, formatMissing } from '../alertUtils';

export default function Partograph() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [entry, setEntry] = useState({
    fhr: '', liquor: 'clear', molding: '0', cervical_dilation: '', station: '',
    contractions_per_10min: '', contraction_duration_sec: '', bp_systolic: '', bp_diastolic: '',
    pulse: '', temperature: '', urine: 'clear', medication: '',
  });

  const load = useCallback(() => {
    api(`/labor/pregnancy/${id}`)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  async function addEntry(e) {
    e.preventDefault();
    setFormError('');
    try {
      const body = {
        ...entry,
        fhr: entry.fhr ? Number(entry.fhr) : null,
        cervical_dilation: entry.cervical_dilation ? Number(entry.cervical_dilation) : null,
        contractions_per_10min: entry.contractions_per_10min ? Number(entry.contractions_per_10min) : null,
        contraction_duration_sec: entry.contraction_duration_sec ? Number(entry.contraction_duration_sec) : null,
        bp_systolic: entry.bp_systolic ? Number(entry.bp_systolic) : null,
        bp_diastolic: entry.bp_diastolic ? Number(entry.bp_diastolic) : null,
        pulse: entry.pulse ? Number(entry.pulse) : null,
        temperature: entry.temperature ? Number(entry.temperature) : null,
      };
      await api(`/labor/${data.labor.id}/partograph`, { method: 'POST', body });
      load();
    } catch (err) {
      setFormError(formatMissing(err));
    }
  }

  if (error) {
    return (
      <div>
        <p className="error-text">{error}</p>
        <Link className="btn btn-primary" to={`/pregnancies/${id}/labor`}>Admit to labor first</Link>
      </div>
    );
  }
  if (!data) return <p>Loading partograph…</p>;

  const maxDil = Math.max(10, ...data.entries.map((e) => Number(e.cervical_dilation) || 0));

  return (
    <div>
      <header className="page-header">
        <h1>Intelligent digital partograph</h1>
        <p>{data.labor.full_name} · {data.labor.anc_number} · live monitoring (auto-refresh 20s)</p>
      </header>

      {data.warning_banners?.map((w) => (
        <div className="warning-strip" key={w}>⚠ {w}</div>
      ))}

      {data.evaluation?.alerts?.map((a, i) => (
        <div key={i} className={`alert-banner alert-${a.severity}`}>
          <strong>{a.title}</strong>
          <div>{a.message}</div>
          <div>Actions: {alertActions(a.recommended_actions).join(' · ')}</div>
          {a.explanation && <div style={{ marginTop: 4, fontSize: '0.85rem' }}>Why: {a.explanation}</div>}
        </div>
      ))}

      <div className="grid grid-3" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <h3>Fetal monitoring</h3>
          <div className="stat">{data.entries.at(-1)?.fhr || '—'}</div>
          <div className="stat-label">Latest FHR · Liquor {data.entries.at(-1)?.liquor || '—'} · Molding {data.entries.at(-1)?.molding || '—'}</div>
        </div>
        <div className="card">
          <h3>Labor progress</h3>
          <div className="stat">{data.entries.at(-1)?.cervical_dilation ?? '—'} cm</div>
          <div className="stat-label">Station {data.entries.at(-1)?.station || '—'} · Ctx {data.entries.at(-1)?.contractions_per_10min || '—'}/10min</div>
        </div>
        <div className="card">
          <h3>Maternal monitoring</h3>
          <div className="stat">{data.entries.at(-1)?.bp_systolic || '—'}/{data.entries.at(-1)?.bp_diastolic || '—'}</div>
          <div className="stat-label">Pulse {data.entries.at(-1)?.pulse || '—'} · Temp {data.entries.at(-1)?.temperature || '—'}</div>
        </div>
      </div>

      <div className="card section-block">
        <h3>Cervical dilation trend</h3>
        <div className="partograph-chart">
          {data.entries.map((e) => {
            const h = ((Number(e.cervical_dilation) || 0) / maxDil) * 140;
            return (
              <div className="bar" key={e.id} style={{ height: `${Math.max(h, 8)}px` }} title={`${e.cervical_dilation} cm`}>
                <span>{e.cervical_dilation}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="btn-row" style={{ marginBottom: '1rem' }}>
        <Link className="btn btn-danger" to={`/pregnancies/${id}/emergency`}>Emergency Mode</Link>
        <Link className="btn btn-primary" to={`/pregnancies/${id}/delivery`}>Prepare Delivery</Link>
        <Link className="btn btn-ghost" to={`/pregnancies/${id}`}>Call Doctor / back to record</Link>
      </div>

      <form className="card" onSubmit={addEntry}>
        <h3>New observation (required: dilation, FHR, BP, pulse, contractions)</h3>
        <div className="grid grid-3">
          {['fhr', 'liquor', 'molding', 'cervical_dilation', 'station', 'contractions_per_10min', 'contraction_duration_sec', 'bp_systolic', 'bp_diastolic', 'pulse', 'temperature', 'urine', 'medication'].map((k) => {
            const required = ['fhr', 'cervical_dilation', 'bp_systolic', 'bp_diastolic', 'pulse', 'contractions_per_10min'].includes(k);
            return (
              <div className="field" key={k}>
                <label>{k.replace(/_/g, ' ')}{required ? ' *' : ''}</label>
                <input required={required} value={entry[k]} onChange={(e) => setEntry({ ...entry, [k]: e.target.value })} />
              </div>
            );
          })}
        </div>
        {formError && <p className="error-text">{formError}</p>}
        <button className="btn btn-primary">Record entry</button>
      </form>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Partograph log</h3>
        <table className="table">
          <thead>
            <tr>
              <th>Time</th><th>FHR</th><th>Dil</th><th>Station</th><th>Ctx</th><th>BP</th><th>Pulse</th>
            </tr>
          </thead>
          <tbody>
            {data.entries.map((e) => (
              <tr key={e.id}>
                <td>{new Date(e.recorded_at).toLocaleTimeString()}</td>
                <td>{e.fhr}</td>
                <td>{e.cervical_dilation}</td>
                <td>{e.station}</td>
                <td>{e.contractions_per_10min}</td>
                <td>{e.bp_systolic}/{e.bp_diastolic}</td>
                <td>{e.pulse}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
