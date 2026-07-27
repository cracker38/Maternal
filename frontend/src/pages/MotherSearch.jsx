import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { RiskBadge } from '../components/Layout';

function stageActions(r) {
  if (!r.pregnancy_id) {
    return <Link className="btn btn-primary" to={`/pregnancies/new?mother_id=${r.id}`}>Register pregnancy</Link>;
  }
  const status = r.pregnancy_status || r.status;
  const id = r.pregnancy_id;
  if (status === 'anc') {
    return (
      <div className="btn-row" style={{ margin: 0, flexWrap: 'wrap' }}>
        <Link className="btn btn-ghost" to={`/pregnancies/${id}`}>Record</Link>
        <Link className="btn btn-primary" to={`/pregnancies/${id}/anc`}>ANC visit</Link>
        <Link className="btn btn-outline" to={`/pregnancies/${id}/labor`}>Admit labor</Link>
      </div>
    );
  }
  if (status === 'labor') {
    return (
      <div className="btn-row" style={{ margin: 0, flexWrap: 'wrap' }}>
        <Link className="btn btn-ghost" to={`/pregnancies/${id}`}>Record</Link>
        <Link className="btn btn-primary" to={`/pregnancies/${id}/partograph`}>Partograph</Link>
        <Link className="btn btn-outline" to={`/pregnancies/${id}/delivery`}>Delivery</Link>
        <Link className="btn btn-danger" to={`/pregnancies/${id}/emergency`}>Emergency</Link>
      </div>
    );
  }
  if (status === 'postpartum' || status === 'delivered') {
    return (
      <div className="btn-row" style={{ margin: 0, flexWrap: 'wrap' }}>
        <Link className="btn btn-ghost" to={`/pregnancies/${id}`}>Record</Link>
        <Link className="btn btn-primary" to={`/pregnancies/${id}/postpartum`}>Postpartum</Link>
        <Link className="btn btn-danger" to={`/pregnancies/${id}/emergency`}>Emergency</Link>
      </div>
    );
  }
  return <Link className="btn btn-ghost" to={`/pregnancies/${id}`}>Open record</Link>;
}

export default function Mothers() {
  const [q, setQ] = useState('');
  const [type, setType] = useState('all');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  const navigate = useNavigate();

  async function search(e) {
    e?.preventDefault();
    setError('');
    setSearched(true);
    try {
      const params = new URLSearchParams({ q, ...(type !== 'all' ? { type } : {}) });
      const data = await api(`/mothers/search?${params}`);
      setResults(data.results || []);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div>
      <header className="page-header">
        <h1>Find mother — midwife workspace</h1>
        <p>Identify a mother, then continue ANC, labor, delivery, or postpartum from her stage</p>
      </header>
      <p className="scope-note">
        Results are limited to mothers linked to your facility. You will not see records from other facilities.
      </p>

      <form className="card" onSubmit={search}>
        <div className="grid grid-2">
          <div className="field">
            <label>Search</label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ID, phone, name, or ANC number" required />
          </div>
          <div className="field">
            <label>Method</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">All fields</option>
              <option value="national_id">National ID</option>
              <option value="phone">Phone number</option>
              <option value="anc_number">ANC number</option>
              <option value="qr">QR code</option>
            </select>
          </div>
        </div>
        <div className="btn-row">
          <button className="btn btn-primary" type="submit">Search</button>
          <button className="btn btn-ghost" type="button" onClick={() => navigate('/pregnancies/new')}>
            Register new mother
          </button>
        </div>
        {error && <p className="error-text">{error}</p>}
      </form>

      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>Results</h3>
        {searched && results.length === 0 && <p className="empty">No mothers found in your facility scope</p>}
        {!searched && <p className="empty">Search to find a mother and open the right clinical action</p>}
        {results.length > 0 && (
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>National ID</th>
                <th>Phone</th>
                <th>ANC</th>
                <th>Stage</th>
                <th>Risk</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={`${r.id}-${r.pregnancy_id || 'm'}`}>
                  <td>{r.full_name}</td>
                  <td>{r.national_id}</td>
                  <td>{r.phone}</td>
                  <td>{r.anc_number || '—'}</td>
                  <td><span className="badge badge-MEDIUM">{r.pregnancy_status || '—'}</span></td>
                  <td><RiskBadge score={r.risk_score} /></td>
                  <td>{stageActions(r)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
