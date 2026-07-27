import { useState } from 'react';
import { Link } from 'react-router-dom';
import { StatCard } from './WorkspaceHeader';
import { api } from '../api';

const STATUS_LABEL = {
  available: 'Available',
  dispatched: 'Dispatched',
  en_route: 'En route',
  on_scene: 'On scene',
  returning: 'Returning',
  maintenance: 'Maintenance',
  pending: 'Pending',
  assigned: 'Assigned',
  arrived: 'Arrived',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const STATUS_CLASS = {
  available: 'badge-LOW',
  pending: 'badge-MEDIUM',
  assigned: 'badge-MEDIUM',
  dispatched: 'badge-HIGH',
  en_route: 'badge-HIGH',
  on_scene: 'badge-HIGH',
  arrived: 'badge-HIGH',
  emergency: 'badge-CRITICAL',
  urgent: 'badge-HIGH',
  standby: 'badge-MEDIUM',
};

export function AmbulanceSummary({ summary }) {
  if (!summary) return null;
  return (
    <div className="grid grid-4 ambulance-stats">
      <StatCard value={summary.total} label="Fleet total" />
      <StatCard value={summary.available} label="Available now" />
      <StatCard value={summary.in_use} label="In use" />
      <StatCard value={summary.remaining} label="Remaining" />
    </div>
  );
}

export function DispatchRow({ dispatch, compact }) {
  const urgency = dispatch.urgency || 'urgent';
  return (
    <div className="list-row ambulance-dispatch-row">
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <strong>
            {dispatch.pregnancy_id
              ? <Link to={`/pregnancies/${dispatch.pregnancy_id}`}>{dispatch.mother_name || 'Patient'}</Link>
              : (dispatch.mother_name || dispatch.requester_name || 'Transfer request')}
          </strong>
          {dispatch.anc_number && (
            <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{dispatch.anc_number}</span>
          )}
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          Requested by {dispatch.requester_name || dispatch.requester_role || '—'}
          {dispatch.created_at ? ` · ${new Date(dispatch.created_at).toLocaleString()}` : ''}
        </div>
        <div style={{ fontSize: '0.8rem' }}>
          📍 {dispatch.pickup_location || 'Pickup'} → {dispatch.destination_facility}
        </div>
        {!compact && dispatch.reason && (
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>Reason: {dispatch.reason}</div>
        )}
        {!compact && dispatch.clinical_summary && (
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>Summary: {dispatch.clinical_summary}</div>
        )}
        {!compact && dispatch.crew_lead && (
          <div style={{ fontSize: '0.78rem', color: 'var(--green-800)', marginTop: 2 }}>
            Crew: {dispatch.crew_lead}{dispatch.crew_phone ? ` · ${dispatch.crew_phone}` : ''}
          </div>
        )}
        {!compact && dispatch.eta_minutes && (
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 2 }}>ETA: {dispatch.eta_minutes} min</div>
        )}
      </div>
      <div className="ambulance-dispatch-meta">
        <span className={`badge ${STATUS_CLASS[urgency] || 'badge-HIGH'}`}>{urgency.toUpperCase()}</span>
        <span className={`badge ${STATUS_CLASS[dispatch.status] || 'badge-MEDIUM'}`}>
          {STATUS_LABEL[dispatch.status] || dispatch.status}
        </span>
        {dispatch.unit_code && (
          <span style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{dispatch.unit_code}</span>
        )}
        {dispatch.current_location && !compact && (
          <span style={{ fontSize: '0.75rem', color: 'var(--green-800)' }}>{dispatch.current_location}</span>
        )}
      </div>
    </div>
  );
}

export function FleetUnitRow({ unit }) {
  return (
    <div className="list-row">
      <div>
        <strong>{unit.unit_code}</strong>
        <div style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
          {unit.plate_number || 'No plate'} · {unit.vehicle_type || 'basic'}
          {unit.crew_lead ? ` · ${unit.crew_lead}` : ''}
        </div>
        {unit.current_location && (
          <div style={{ fontSize: '0.78rem', color: 'var(--green-800)' }}>{unit.current_location}</div>
        )}
      </div>
      <span className={`badge ${STATUS_CLASS[unit.status] || 'badge-MEDIUM'}`}>
        {STATUS_LABEL[unit.status] || unit.status}
      </span>
    </div>
  );
}

export function AmbulanceWidget({ data, role, linkToCenter = true, pregnancyId, emergencyId, laborAdmissionId, onRequested }) {
  if (!data?.summary) return null;
  const active = data.active_dispatches || [];
  const canRequest = ['midwife', 'doctor'].includes(role);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const availableUnits = (data.fleet || []).filter((u) => u.status === 'available');
  const [form, setForm] = useState({
    destination_facility: '',
    urgency: 'urgent',
    reason: '',
    clinical_summary: '',
    pickup_location: '',
    eta_minutes: '',
    ambulance_id: '',
  });

  async function submitRequest(e) {
    e.preventDefault();
    if (!form.destination_facility.trim()) { setErr('Destination facility required'); return; }
    setBusy(true); setErr(''); setOk('');
    try {
      const body = {
        destination_facility: form.destination_facility,
        urgency: form.urgency,
        reason: form.reason || undefined,
        clinical_summary: form.clinical_summary || undefined,
        pickup_location: form.pickup_location || undefined,
        eta_minutes: form.eta_minutes ? Number(form.eta_minutes) : undefined,
        ambulance_id: form.ambulance_id ? Number(form.ambulance_id) : undefined,
        pregnancy_id: pregnancyId || undefined,
        emergency_id: emergencyId || undefined,
        labor_admission_id: laborAdmissionId || undefined,
      };
      const res = await api('/ambulance/request', { method: 'POST', body });
      setOk(res.message || 'Ambulance request submitted.');
      setOpen(false);
      setForm({ destination_facility: '', urgency: 'urgent', reason: '', clinical_summary: '', pickup_location: '', eta_minutes: '', ambulance_id: '' });
      if (onRequested) onRequested();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="section-block ambulance-widget">
      <div className="section-head">
        <div>
          <h3>Ambulance coordination</h3>
          <p className="section-hint">
            {data.summary.remaining} unit{data.summary.remaining === 1 ? '' : 's'} available · {data.summary.in_use} in use
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {canRequest && (
            <button type="button" className="btn btn-danger" onClick={() => { setOpen((v) => !v); setErr(''); setOk(''); }}>
              {open ? 'Cancel' : '🚑 Request ambulance'}
            </button>
          )}
          {linkToCenter && ['midwife', 'doctor', 'facility_admin'].includes(role) && (
            <Link className="btn btn-outline" to="/ambulance">Coordination center</Link>
          )}
        </div>
      </div>

      {ok && <div className="warning-strip" style={{ background: 'var(--green-50)', color: 'var(--green-900)', marginBottom: 8 }}>{ok}</div>}
      {err && <p className="error-text">{err}</p>}

      {open && canRequest && (
        <form className="card" style={{ marginBottom: '1rem' }} onSubmit={submitRequest}>
          <strong style={{ fontSize: '0.9rem' }}>New ambulance request</strong>
          <p className="section-hint" style={{ marginTop: 4 }}>Fill in destination and urgency. Assign a unit now or let the coordinator assign one.</p>
          <div className="grid grid-2" style={{ marginTop: '0.75rem' }}>
            <div className="field">
              <label>Destination facility *</label>
              <input required value={form.destination_facility} onChange={(e) => setForm((f) => ({ ...f, destination_facility: e.target.value }))} placeholder="e.g. Kibagabaga District Hospital" />
            </div>
            <div className="field">
              <label>Urgency</label>
              <select value={form.urgency} onChange={(e) => setForm((f) => ({ ...f, urgency: e.target.value }))}>
                <option value="standby">Standby</option>
                <option value="urgent">Urgent</option>
                <option value="emergency">Emergency</option>
              </select>
            </div>
            <div className="field">
              <label>Pickup location</label>
              <input value={form.pickup_location} onChange={(e) => setForm((f) => ({ ...f, pickup_location: e.target.value }))} placeholder="Ward / room / current location" />
            </div>
            <div className="field">
              <label>ETA needed (minutes)</label>
              <input type="number" min="1" value={form.eta_minutes} onChange={(e) => setForm((f) => ({ ...f, eta_minutes: e.target.value }))} placeholder="e.g. 30" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Reason / clinical indication</label>
              <input value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="e.g. Severe preeclampsia — referral to district hospital" />
            </div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Clinical summary</label>
              <textarea rows={2} value={form.clinical_summary} onChange={(e) => setForm((f) => ({ ...f, clinical_summary: e.target.value }))} placeholder="BP, FHR, treatment given, current status…" />
            </div>
            {availableUnits.length > 0 && (
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <label>Assign available unit now (optional)</label>
                <select value={form.ambulance_id} onChange={(e) => setForm((f) => ({ ...f, ambulance_id: e.target.value }))}>
                  <option value="">Let coordinator assign</option>
                  {availableUnits.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.unit_code} · {u.plate_number || 'no plate'} · {u.vehicle_type} · {u.crew_lead || 'no crew'}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {availableUnits.length === 0 && (
              <div className="field" style={{ gridColumn: '1 / -1' }}>
                <div className="warning-strip">No units available at this facility. Request will be queued for coordinator assignment.</div>
              </div>
            )}
          </div>
          <div className="btn-row">
            <button type="submit" className="btn btn-danger" disabled={busy}>
              {busy ? 'Submitting…' : '🚑 Submit ambulance request'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}

      <AmbulanceSummary summary={data.summary} />
      {active.length === 0 ? (
        <p className="empty">No active dispatches</p>
      ) : (
        <div className="card">
          {active.slice(0, 4).map((d) => (
            <DispatchRow key={d.id} dispatch={d} compact />
          ))}
        </div>
      )}
    </section>
  );
}

export { STATUS_LABEL, STATUS_CLASS };
