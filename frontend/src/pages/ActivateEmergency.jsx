import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';

const TYPES = [
  { value: 'pph', label: 'Postpartum hemorrhage' },
  { value: 'eclampsia', label: 'Eclampsia' },
  { value: 'sepsis', label: 'Sepsis' },
  { value: 'obstructed_labor', label: 'Obstructed labor' },
  { value: 'uterine_rupture', label: 'Uterine rupture' },
  { value: 'fetal_distress', label: 'Fetal distress' },
];

export default function ActivateEmergency() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [emergency_type, setType] = useState('fetal_distress');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  async function submit(e) {
    e.preventDefault();
    try {
      const data = await api('/emergencies/activate', {
        method: 'POST',
        body: { pregnancy_id: Number(id), emergency_type, notes },
      });
      navigate(`/emergencies/${data.emergency_id}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <header className="page-header">
        <h1>Emergency activation</h1>
        <p>Opens WHO emergency checklist with timestamped actions</p>
      </header>
      <form className="card" onSubmit={submit}>
        <div className="field">
          <label>Emergency type</label>
          <select value={emergency_type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Notes</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn-danger">Activate emergency mode</button>
      </form>
    </div>
  );
}
