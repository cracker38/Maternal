import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import WorkspaceHeader, { EmptyState } from '../components/WorkspaceHeader';

export default function Community() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [chws, setChws] = useState([]);
  const [selectedChw, setSelectedChw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(null);

  async function load() {
    try {
      setData(await api('/community/tasks'));
      if (user?.role === 'midwife' || user?.role === 'doctor') {
        const chwData = await api('/community/chws');
        setChws(chwData.chws || []);
        if (chwData.chws?.[0] && !selectedChw) {
          setSelectedChw(String(chwData.chws[0].id));
        }
      }
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, []);

  async function updateTask(id, status) {
    setBusy(id);
    try {
      await api(`/community/tasks/${id}`, { method: 'PATCH', body: { status } });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  async function assignMissed(pregnancy_id, task_type) {
    setBusy(`m-${pregnancy_id}`);
    try {
      const assigned_to = user?.role === 'chw'
        ? user.id
        : (selectedChw ? Number(selectedChw) : null);
      if (user?.role === 'midwife' && !assigned_to) {
        setError('Select a CHW before assigning follow-up.');
        return;
      }
      await api('/community/assign-missed', {
        method: 'POST',
        body: { pregnancy_id, task_type, assigned_to },
      });
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data) return <p>Loading community follow-up…</p>;

  return (
    <div>
      <WorkspaceHeader
        title="Community follow-up"
        subtitle="Missed ANC/PNC detection and CHW home-visit assignment"
        context={{
          scope: user?.role === 'moh' ? 'national' : user?.role === 'district_officer' ? 'district' : 'facility',
          facility_name: user?.facility_name,
          district: user?.district,
        }}
      />
      {error && <p className="error-text">{error}</p>}

      {(user?.role === 'midwife' || user?.role === 'doctor') && (
        <div className="card" style={{ marginBottom: '1rem' }}>
          <div className="field" style={{ marginBottom: 0, maxWidth: 360 }}>
            <label>Assign follow-ups to CHW</label>
            <select value={selectedChw} onChange={(e) => setSelectedChw(e.target.value)}>
              <option value="">Select CHW…</option>
              {chws.map((c) => (
                <option key={c.id} value={c.id}>{c.full_name} ({c.username})</option>
              ))}
            </select>
          </div>
        </div>
      )}

      <div className="grid grid-2">
        <div className="card">
          <h3>Detected missed visits</h3>
          {data.missed_visits.length === 0 && <EmptyState title="None detected" hint="Mothers with overdue ANC dates appear here." />}
          {data.missed_visits.map((m) => (
            <div className="list-row" key={`${m.pregnancy_id}-${m.due_date}`}>
              <div>
                <Link to={`/pregnancies/${m.pregnancy_id}`}>{m.full_name}</Link>
                <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                  {m.anc_number} · due {m.due_date} · {m.phone}
                </div>
              </div>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy === `m-${m.pregnancy_id}`}
                onClick={() => assignMissed(m.pregnancy_id, 'missed_anc')}
              >
                Assign CHW
              </button>
            </div>
          ))}
        </div>

        <div className="card">
          <h3>Follow-up tasks</h3>
          {data.tasks.length === 0 && <EmptyState title="No open tasks" />}
          {data.tasks.map((t) => (
            <div className="list-row" key={t.id}>
              <div>
                <strong>{t.title}</strong>
                <div style={{ fontSize: '0.85rem' }}>
                  <Link to={`/pregnancies/${t.pregnancy_id}`}>{t.full_name}</Link>
                  {' · '}{t.task_type} · due {t.due_date || '—'}
                  {t.assignee_name ? ` · ${t.assignee_name}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                <span className="badge badge-MEDIUM">{t.status}</span>
                {t.status !== 'completed' && (
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={busy === t.id}
                    onClick={() => updateTask(t.id, 'completed')}
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
