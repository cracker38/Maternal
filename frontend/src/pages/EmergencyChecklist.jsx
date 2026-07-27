import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import { DispatchRow } from '../components/AmbulancePanel';

export default function EmergencyChecklist() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [outcome, setOutcome] = useState('');
  const [fleet, setFleet] = useState(null);
  const [ambulance, setAmbulance] = useState({
    destination_facility: '',
    eta_minutes: '',
    crew_contact: '',
    reason: '',
    ambulance_id: '',
  });

  async function load() {
    try {
      setData(await api(`/emergencies/${id}`));
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    api('/ambulance/fleet').then(setFleet).catch(() => setFleet(null));
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [id]);

  async function toggle(action) {
    await api(`/emergencies/actions/${action.id}`, {
      method: 'PATCH',
      body: { performed: !action.performed, responsible_person: user.full_name },
    });
    load();
  }

  async function requestAmbulance() {
    setError('');
    setMsg('');
    if (!ambulance.destination_facility.trim()) {
      setError('Receiving facility is required.');
      return;
    }
    try {
      const res = await api(`/emergencies/${id}/ambulance-request`, {
        method: 'POST',
        body: {
          destination_facility: ambulance.destination_facility,
          eta_minutes: ambulance.eta_minutes ? Number(ambulance.eta_minutes) : undefined,
          crew_contact: ambulance.crew_contact || undefined,
          reason: ambulance.reason || `Emergency transfer for ${data.emergency.emergency_type}`,
          ambulance_id: ambulance.ambulance_id ? Number(ambulance.ambulance_id) : undefined,
        },
      });
      setMsg(res.message);
      setAmbulance({ destination_facility: '', eta_minutes: '', crew_contact: '', reason: '', ambulance_id: '' });
      load();
      api('/ambulance/fleet').then(setFleet).catch(() => {});
    } catch (e) {
      setError(e.message);
    }
  }

  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data) return <p>Loading emergency checklist…</p>;

  const { emergency, actions } = data;
  const done = actions.filter((a) => a.performed).length;
  const ambulanceRequests = data.ambulance_requests || [];
  const fleetDispatches = data.fleet_dispatches || [];
  const availableUnits = (fleet?.fleet || []).filter((u) => u.status === 'available');

  return (
    <div>
      <header className="page-header">
        <h1>WHO emergency checklist</h1>
        <p>
          {emergency.full_name} · {emergency.emergency_type.replace(/_/g, ' ').toUpperCase()} · {emergency.status}
        </p>
      </header>

      {error && <p className="error-text">{error}</p>}

      <div className="alert-banner alert-CRITICAL">
        <strong>Emergency active</strong> — {done}/{actions.length} actions completed. Every action is timestamped.
      </div>

      {/* WHO Checklist */}
      <div className="card">
        {actions.map((a) => (
          <div className="list-row" key={a.id}>
            <div>
              <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer' }}>
                <input type="checkbox" checked={!!a.performed} onChange={() => toggle(a)} />
                <span>
                  <strong>{a.action_label}</strong>
                  {a.medication && <div style={{ fontSize: '0.85rem' }}>Med: {a.medication}</div>}
                  {a.performed_at && (
                    <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                      {a.responsible_person || '—'} · {new Date(a.performed_at).toLocaleString()}
                    </div>
                  )}
                </span>
              </label>
            </div>
            <span className={`badge ${a.performed ? 'badge-LOW' : 'badge-HIGH'}`}>
              {a.performed ? 'DONE' : 'PENDING'}
            </span>
          </div>
        ))}
      </div>

      {/* Ambulance dispatch */}
      <div className="card" style={{ marginTop: '1rem' }}>
        <h3>🚑 Emergency ambulance dispatch</h3>
        <p className="section-hint">
          Request transport while the team continues stabilization. Dispatch is tracked in the fleet system.
        </p>

        {fleet?.summary && (
          <div className="warning-strip" style={{
            background: fleet.summary.remaining > 0 ? 'var(--green-50)' : '#fff3cd',
            color: fleet.summary.remaining > 0 ? 'var(--green-900)' : '#856404',
            marginBottom: '0.75rem',
          }}>
            <strong>{fleet.summary.remaining}</strong> of {fleet.summary.total} ambulances available
            {fleet.summary.in_use ? ` · ${fleet.summary.in_use} in use` : ''}
            {fleet.summary.remaining === 0 && ' — request will be queued for coordinator assignment'}
          </div>
        )}

        <div className="grid grid-2">
          <div className="field">
            <label>Receiving facility *</label>
            <input
              value={ambulance.destination_facility}
              onChange={(e) => setAmbulance((a) => ({ ...a, destination_facility: e.target.value }))}
              placeholder="District hospital / referral center"
            />
          </div>
          <div className="field">
            <label>ETA needed (minutes)</label>
            <input
              type="number"
              min="1"
              value={ambulance.eta_minutes}
              onChange={(e) => setAmbulance((a) => ({ ...a, eta_minutes: e.target.value }))}
              placeholder="e.g. 15"
            />
          </div>
          <div className="field">
            <label>Crew / dispatcher contact</label>
            <input
              value={ambulance.crew_contact}
              onChange={(e) => setAmbulance((a) => ({ ...a, crew_contact: e.target.value }))}
              placeholder="Driver name / control room number"
            />
          </div>
          <div className="field">
            <label>Reason</label>
            <input
              value={ambulance.reason}
              onChange={(e) => setAmbulance((a) => ({ ...a, reason: e.target.value }))}
              placeholder={`Emergency transfer for ${emergency.emergency_type.replace(/_/g, ' ')}`}
            />
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Assign available unit now (optional)</label>
            {availableUnits.length === 0 ? (
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                No units available — coordinator will assign when one becomes free
              </div>
            ) : (
              <select
                value={ambulance.ambulance_id}
                onChange={(e) => setAmbulance((a) => ({ ...a, ambulance_id: e.target.value }))}
              >
                <option value="">Let coordinator assign</option>
                {availableUnits.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.unit_code} · {u.plate_number || 'no plate'} · {u.vehicle_type} · {u.crew_lead || 'no crew'}{u.crew_phone ? ` · ${u.crew_phone}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        <div className="btn-row" style={{ marginTop: '0.5rem' }}>
          <button type="button" className="btn btn-danger" onClick={requestAmbulance}>
            🚑 Request emergency ambulance
          </button>
        </div>

        {msg && <p style={{ color: 'var(--green-800)', marginBottom: 0, marginTop: '0.5rem' }}>{msg}</p>}

        {fleetDispatches.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Active dispatches for this emergency</strong>
            {fleetDispatches.map((d) => (
              <DispatchRow key={d.id} dispatch={d} />
            ))}
          </div>
        )}

        {ambulanceRequests.length > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <strong style={{ fontSize: '0.85rem' }}>Dispatch audit log</strong>
            {ambulanceRequests.map((r, idx) => (
              <div className="list-row" key={`${r.created_at}-${idx}`}>
                <div>
                  <strong>{r.destination_facility || '—'}</strong>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                    {r.status || 'requested'} · ETA {r.eta_minutes || '—'} min
                    {r.crew_contact ? ` · ${r.crew_contact}` : ''}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{r.reason}</div>
                </div>
                <span className="badge badge-CRITICAL">EMERGENCY</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Outcome + status */}
      <div className="field" style={{ maxWidth: 480, marginTop: '1rem' }}>
        <label>Outcome</label>
        <input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="Record clinical outcome" />
      </div>

      <div className="btn-row">
        <button
          className="btn btn-primary"
          type="button"
          onClick={async () => {
            await api(`/emergencies/${id}/status`, {
              method: 'PATCH',
              body: { status: 'stabilized', outcome: outcome || undefined, responding_person: user.full_name },
            });
            load();
          }}
        >
          Mark stabilized
        </button>
        <button
          className="btn btn-ghost"
          type="button"
          onClick={async () => {
            await api(`/emergencies/${id}/status`, {
              method: 'PATCH',
              body: { status: 'resolved', outcome: outcome || 'Resolved', responding_person: user.full_name },
            });
            load();
          }}
        >
          Resolve
        </button>
        <Link className="btn btn-ghost" to={`/pregnancies/${emergency.pregnancy_id}`}>Back to maternal record</Link>
      </div>
    </div>
  );
}
