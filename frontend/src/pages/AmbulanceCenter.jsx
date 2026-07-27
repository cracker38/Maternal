import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import WorkspaceHeader from '../components/WorkspaceHeader';
import {
  AmbulanceSummary,
  DispatchRow,
  FleetUnitRow,
  STATUS_LABEL,
} from '../components/AmbulancePanel';

const NEXT_STATUS = {
  assigned: 'dispatched',
  dispatched: 'en_route',
  en_route: 'arrived',
  arrived: 'completed',
};

const EMPTY_REQUEST = {
  destination_facility: '',
  urgency: 'urgent',
  reason: '',
  clinical_summary: '',
  pickup_location: '',
  eta_minutes: '',
  ambulance_id: '',
};

const EMPTY_FLEET = {
  unit_code: '',
  plate_number: '',
  vehicle_type: 'basic',
  crew_lead: '',
  crew_phone: '',
  current_location: 'Facility bay',
};

export default function AmbulanceCenter() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [dispatches, setDispatches] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(null);
  const [assignPick, setAssignPick] = useState({});
  const [requestOpen, setRequestOpen] = useState(false);
  const [requestForm, setRequestForm] = useState(EMPTY_REQUEST);
  const [fleetForm, setFleetForm] = useState(EMPTY_FLEET);

  const load = useCallback(async () => {
    try {
      const [fleet, disp] = await Promise.all([
        api('/ambulance/fleet'),
        api('/ambulance/dispatches'),
      ]);
      setData(fleet);
      setDispatches(disp);
      setError('');
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);

  const caps = data?.role_capabilities || {};
  const canRequest = caps.can_request;
  const canAssign = caps.can_assign;
  const canManage = caps.can_manage_fleet;
  const availableUnits = (data?.fleet || []).filter((u) => u.status === 'available');

  function flash(message, isError = false) {
    if (isError) setError(message);
    else { setMsg(message); setError(''); }
  }

  async function submitRequest(e) {
    e.preventDefault();
    if (!requestForm.destination_facility.trim()) {
      flash('Destination facility is required.', true);
      return;
    }
    setBusy('request');
    try {
      const body = {
        destination_facility: requestForm.destination_facility,
        urgency: requestForm.urgency,
        reason: requestForm.reason || undefined,
        clinical_summary: requestForm.clinical_summary || undefined,
        pickup_location: requestForm.pickup_location || undefined,
        eta_minutes: requestForm.eta_minutes ? Number(requestForm.eta_minutes) : undefined,
        ambulance_id: requestForm.ambulance_id ? Number(requestForm.ambulance_id) : undefined,
      };
      const res = await api('/ambulance/request', { method: 'POST', body });
      flash(res.message || 'Ambulance request submitted.');
      setRequestOpen(false);
      setRequestForm(EMPTY_REQUEST);
      await load();
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  async function assignDispatch(dispatchId) {
    const ambulanceId = assignPick[dispatchId];
    if (!ambulanceId) return;
    setBusy(`assign-${dispatchId}`);
    try {
      await api(`/ambulance/dispatches/${dispatchId}/assign`, {
        method: 'PATCH',
        body: { ambulance_id: Number(ambulanceId) },
      });
      flash('Ambulance assigned and dispatch updated.');
      setAssignPick((p) => { const n = { ...p }; delete n[dispatchId]; return n; });
      await load();
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  async function advanceStatus(dispatch) {
    const next = NEXT_STATUS[dispatch.status];
    if (!next) return;
    setBusy(`status-${dispatch.id}`);
    try {
      await api(`/ambulance/dispatches/${dispatch.id}/status`, {
        method: 'PATCH',
        body: { status: next },
      });
      flash(`Dispatch marked ${STATUS_LABEL[next] || next}.`);
      await load();
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  async function cancelDispatch(dispatch) {
    if (!window.confirm(`Cancel dispatch for ${dispatch.mother_name || dispatch.destination_facility}?`)) return;
    setBusy(`cancel-${dispatch.id}`);
    try {
      await api(`/ambulance/dispatches/${dispatch.id}/status`, {
        method: 'PATCH',
        body: { status: 'cancelled' },
      });
      flash('Dispatch cancelled. Unit returned to available.');
      await load();
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  async function addFleetUnit(e) {
    e.preventDefault();
    setBusy('add-fleet');
    try {
      await api('/ambulance/fleet', { method: 'POST', body: fleetForm });
      setFleetForm(EMPTY_FLEET);
      flash('Ambulance unit added to fleet.');
      await load();
    } catch (e) {
      flash(e.message, true);
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <p className="error-text">{error}</p>;
  if (!data) return <p>Loading ambulance coordination center…</p>;

  const active = dispatches?.active || data.active_dispatches || [];
  const recent = dispatches?.recent || [];
  const completedRecent = recent.filter((r) => ['completed', 'cancelled'].includes(r.status)).slice(0, 10);

  return (
    <div>
      <WorkspaceHeader
        title="Ambulance coordination center"
        subtitle={`${user?.facility_name || 'Facility'} · Real-time fleet status, dispatch assignment, and transfer tracking`}
      />

      {msg && (
        <div className="warning-strip" style={{ background: 'var(--green-50)', color: 'var(--green-900)', marginBottom: '0.75rem' }}>
          {msg}
        </div>
      )}
      {error && <p className="error-text">{error}</p>}

      {/* Summary stats */}
      <AmbulanceSummary summary={data.summary} />

      {/* Request ambulance — midwife / doctor */}
      {canRequest && (
        <section className="section-block" style={{ marginTop: '1rem' }}>
          <div className="section-head">
            <div>
              <h3>Request ambulance</h3>
              <p className="section-hint">
                {availableUnits.length > 0
                  ? `${availableUnits.length} unit${availableUnits.length === 1 ? '' : 's'} available — you can assign one now or let the coordinator assign.`
                  : 'No units currently available — request will be queued for coordinator assignment.'}
              </p>
            </div>
            <button
              type="button"
              className={`btn ${requestOpen ? 'btn-ghost' : 'btn-danger'}`}
              onClick={() => { setRequestOpen((v) => !v); setError(''); }}
            >
              {requestOpen ? 'Close form' : '🚑 New ambulance request'}
            </button>
          </div>

          {requestOpen && (
            <form className="card" onSubmit={submitRequest}>
              <div className="grid grid-2">
                <div className="field">
                  <label>Destination facility *</label>
                  <input
                    required
                    value={requestForm.destination_facility}
                    onChange={(e) => setRequestForm((f) => ({ ...f, destination_facility: e.target.value }))}
                    placeholder="e.g. Kibagabaga District Hospital"
                  />
                </div>
                <div className="field">
                  <label>Urgency</label>
                  <select value={requestForm.urgency} onChange={(e) => setRequestForm((f) => ({ ...f, urgency: e.target.value }))}>
                    <option value="standby">Standby</option>
                    <option value="urgent">Urgent</option>
                    <option value="emergency">Emergency</option>
                  </select>
                </div>
                <div className="field">
                  <label>Pickup location</label>
                  <input
                    value={requestForm.pickup_location}
                    onChange={(e) => setRequestForm((f) => ({ ...f, pickup_location: e.target.value }))}
                    placeholder="Ward / room / current location"
                  />
                </div>
                <div className="field">
                  <label>ETA needed (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    value={requestForm.eta_minutes}
                    onChange={(e) => setRequestForm((f) => ({ ...f, eta_minutes: e.target.value }))}
                    placeholder="e.g. 30"
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Reason / clinical indication</label>
                  <input
                    value={requestForm.reason}
                    onChange={(e) => setRequestForm((f) => ({ ...f, reason: e.target.value }))}
                    placeholder="e.g. Severe preeclampsia — referral to district hospital"
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Clinical summary</label>
                  <textarea
                    rows={2}
                    value={requestForm.clinical_summary}
                    onChange={(e) => setRequestForm((f) => ({ ...f, clinical_summary: e.target.value }))}
                    placeholder="BP, FHR, treatment given, current status…"
                  />
                </div>
                <div className="field" style={{ gridColumn: '1 / -1' }}>
                  <label>Assign available unit now (optional)</label>
                  {availableUnits.length === 0 ? (
                    <div className="warning-strip">No available units — coordinator will assign when one becomes free.</div>
                  ) : (
                    <select
                      value={requestForm.ambulance_id}
                      onChange={(e) => setRequestForm((f) => ({ ...f, ambulance_id: e.target.value }))}
                    >
                      <option value="">Let coordinator assign</option>
                      {availableUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unit_code} · {u.plate_number || 'no plate'} · {u.vehicle_type} · {u.crew_lead || 'no crew listed'}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              <div className="btn-row">
                <button type="submit" className="btn btn-danger" disabled={busy === 'request'}>
                  {busy === 'request' ? 'Submitting…' : '🚑 Submit request'}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setRequestOpen(false)}>Cancel</button>
              </div>
            </form>
          )}
        </section>
      )}

      <div className="grid grid-2" style={{ marginTop: '1rem' }}>
        {/* Fleet status */}
        <section className="section-block">
          <h3>Fleet status</h3>
          <p className="section-hint">
            {data.summary.remaining} of {data.summary.total} units ready
            {data.summary.maintenance ? ` · ${data.summary.maintenance} in maintenance` : ''}
          </p>
          <div className="card">
            {(data.fleet || []).length === 0 && <p className="empty">No ambulances registered at this facility</p>}
            {(data.fleet || []).map((u) => (
              <FleetUnitRow key={u.id} unit={u} />
            ))}
          </div>
        </section>

        {/* Active dispatches */}
        <section className="section-block">
          <h3>Active dispatches</h3>
          <p className="section-hint">Current requests — assign units, advance status, or cancel</p>
          <div className="card">
            {active.length === 0 && <p className="empty">No active ambulance requests</p>}
            {active.map((d) => (
              <div key={d.id} className="ambulance-active-card" style={{ borderBottom: '1px solid var(--line)', paddingBottom: '0.75rem', marginBottom: '0.75rem' }}>
                <DispatchRow dispatch={d} />

                {/* Assign unit to pending dispatch */}
                {canAssign && d.status === 'pending' && (
                  <div className="btn-row ambulance-assign-row" style={{ marginTop: 8 }}>
                    <select
                      value={assignPick[d.id] || ''}
                      onChange={(e) => setAssignPick((p) => ({ ...p, [d.id]: e.target.value }))}
                    >
                      <option value="">Select available unit</option>
                      {availableUnits.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.unit_code} · {u.plate_number || 'no plate'} · {u.crew_lead || '—'}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!assignPick[d.id] || busy === `assign-${d.id}`}
                      onClick={() => assignDispatch(d.id)}
                    >
                      {busy === `assign-${d.id}` ? 'Assigning…' : 'Assign unit'}
                    </button>
                  </div>
                )}

                {/* Advance status */}
                {canAssign && NEXT_STATUS[d.status] && (
                  <div className="btn-row" style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={busy === `status-${d.id}`}
                      onClick={() => advanceStatus(d)}
                    >
                      {busy === `status-${d.id}` ? 'Updating…' : `Mark ${STATUS_LABEL[NEXT_STATUS[d.status]] || NEXT_STATUS[d.status]}`}
                    </button>
                    {/* Cancel is always available on active dispatches */}
                    {['pending', 'assigned', 'dispatched', 'en_route'].includes(d.status) && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={busy === `cancel-${d.id}`}
                        onClick={() => cancelDispatch(d)}
                        style={{ color: 'var(--red-700)' }}
                      >
                        {busy === `cancel-${d.id}` ? 'Cancelling…' : 'Cancel dispatch'}
                      </button>
                    )}
                  </div>
                )}

                {/* Cancel-only for pending when no next status (shouldn't happen but safety) */}
                {canAssign && !NEXT_STATUS[d.status] && ['pending'].includes(d.status) && (
                  <div className="btn-row" style={{ marginTop: 6 }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={busy === `cancel-${d.id}`}
                      onClick={() => cancelDispatch(d)}
                      style={{ color: 'var(--red-700)' }}
                    >
                      {busy === `cancel-${d.id}` ? 'Cancelling…' : 'Cancel dispatch'}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Recent history */}
      <section className="section-block">
        <h3>Recent dispatch history</h3>
        <div className="card">
          {completedRecent.length === 0 && <p className="empty">No completed dispatches yet</p>}
          {completedRecent.map((d) => (
            <DispatchRow key={d.id} dispatch={d} compact />
          ))}
        </div>
      </section>

      {/* Fleet management — admin only */}
      {canManage && user?.role === 'facility_admin' && (
        <section className="section-block">
          <h3>Manage fleet</h3>
          <p className="section-hint">Register new ambulance units for this facility</p>
          <form className="card grid grid-2" onSubmit={addFleetUnit}>
            <div className="field">
              <label>Unit code *</label>
              <input required value={fleetForm.unit_code} onChange={(e) => setFleetForm((f) => ({ ...f, unit_code: e.target.value }))} placeholder="AMB-04" />
            </div>
            <div className="field">
              <label>Plate number</label>
              <input value={fleetForm.plate_number} onChange={(e) => setFleetForm((f) => ({ ...f, plate_number: e.target.value }))} />
            </div>
            <div className="field">
              <label>Vehicle type</label>
              <select value={fleetForm.vehicle_type} onChange={(e) => setFleetForm((f) => ({ ...f, vehicle_type: e.target.value }))}>
                <option value="basic">Basic life support</option>
                <option value="advanced">Advanced life support</option>
                <option value="neonatal">Neonatal transport</option>
              </select>
            </div>
            <div className="field">
              <label>Crew lead</label>
              <input value={fleetForm.crew_lead} onChange={(e) => setFleetForm((f) => ({ ...f, crew_lead: e.target.value }))} />
            </div>
            <div className="field">
              <label>Crew phone</label>
              <input value={fleetForm.crew_phone} onChange={(e) => setFleetForm((f) => ({ ...f, crew_phone: e.target.value }))} />
            </div>
            <div className="field">
              <label>Current location</label>
              <input value={fleetForm.current_location} onChange={(e) => setFleetForm((f) => ({ ...f, current_location: e.target.value }))} />
            </div>
            <div className="btn-row" style={{ gridColumn: '1 / -1' }}>
              <button type="submit" className="btn btn-primary" disabled={busy === 'add-fleet'}>
                {busy === 'add-fleet' ? 'Adding…' : 'Add ambulance unit'}
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Role permissions */}
      <section className="section-block">
        <h3>Your permissions</h3>
        <div className="card ambulance-perms">
          <span className={`badge ${caps.can_request ? 'badge-LOW' : 'badge-MEDIUM'}`}>
            Request: {caps.can_request ? 'Yes' : 'View only'}
          </span>
          <span className={`badge ${caps.can_assign ? 'badge-LOW' : 'badge-MEDIUM'}`}>
            Assign: {caps.can_assign ? 'Yes' : 'No'}
          </span>
          <span className={`badge ${caps.can_manage_fleet ? 'badge-LOW' : 'badge-MEDIUM'}`}>
            Fleet admin: {caps.can_manage_fleet ? 'Yes' : 'No'}
          </span>
        </div>
      </section>
    </div>
  );
}
