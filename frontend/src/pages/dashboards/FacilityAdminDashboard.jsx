import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import WorkspaceHeader, { EmptyState } from '../../components/WorkspaceHeader';
import { ReportPanel } from '../../components/UxGuide';
import { AmbulanceWidget } from '../../components/AmbulancePanel';
import { useAuth } from '../../auth';
import { exportDashboardPdf } from '../../exportPdf';
import { DashTabs, KpiRow, SectionCard } from '../../components/DashTabs';

export default function FacilityAdminDashboard() {
  const { user } = useAuth();
  const [dash, setDash] = useState(null);
  const [users, setUsers] = useState([]);
  const [facilityPack, setFacilityPack] = useState(null);
  const [securityLogs, setSecurityLogs] = useState([]);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(null);
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'midwife', phone: '' });
  const [facilityForm, setFacilityForm] = useState({ name: '', phone: '', village: '', cell_name: '', sector: '', facility_type: 'health_center', departmentsText: '', servicesText: '' });

  async function load() {
    try {
      const [d, u, f, logs] = await Promise.all([api('/dashboard'), api('/admin/users'), api('/admin/facility'), api('/admin/security-logs').catch(() => ({ logs: [] }))]);
      setDash(d); setUsers(u.users || []); setFacilityPack(f); setSecurityLogs(logs.logs || []);
      const fac = f.facility || {}; const cfg = f.configuration || {};
      setFacilityForm({ name: fac.name || '', phone: fac.phone || '', village: fac.village || '', cell_name: fac.cell_name || '', sector: fac.sector || '', facility_type: fac.facility_type || 'health_center', departmentsText: (cfg.departments || []).join('\n'), servicesText: (cfg.services || []).join('\n') });
    } catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function createUser(e) {
    e.preventDefault(); setMsg(''); setBusy('create');
    try { await api('/admin/users', { method: 'POST', body: form }); setMsg('User account created.'); setForm({ username: '', password: '', full_name: '', role: 'midwife', phone: '' }); await load(); }
    catch (err) { setMsg(err.message); } finally { setBusy(null); }
  }

  async function resetPassword(id) {
    const password = window.prompt('New temporary password (min 6 characters)');
    if (!password) return;
    setBusy(`pw-${id}`);
    try { await api(`/admin/users/${id}`, { method: 'PATCH', body: { password } }); setMsg('Password reset.'); await load(); }
    catch (err) { setMsg(err.message); } finally { setBusy(null); }
  }

  async function changeRole(id, role) {
    setBusy(`role-${id}`);
    try { await api(`/admin/users/${id}`, { method: 'PATCH', body: { role } }); setMsg('Role updated.'); await load(); }
    catch (err) { setMsg(err.message); } finally { setBusy(null); }
  }

  async function toggleActive(u) {
    setBusy(`act-${u.id}`);
    try { await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { is_active: !u.is_active } }); await load(); }
    catch (err) { setMsg(err.message); } finally { setBusy(null); }
  }

  async function saveFacility(e) {
    e.preventDefault(); setMsg(''); setBusy('facility');
    try {
      await api('/admin/facility', { method: 'PATCH', body: { name: facilityForm.name, phone: facilityForm.phone, village: facilityForm.village, cell_name: facilityForm.cell_name, sector: facilityForm.sector, facility_type: facilityForm.facility_type, departments: facilityForm.departmentsText.split('\n').map((s) => s.trim()).filter(Boolean), services: facilityForm.servicesText.split('\n').map((s) => s.trim()).filter(Boolean) } });
      setMsg('Facility configuration saved.'); await load();
    } catch (err) { setMsg(err.message); } finally { setBusy(null); }
  }

  if (error && !dash) return <p className="error-text">{error}</p>;
  if (!dash || !facilityPack) return <p>Loading…</p>;

  const ov = dash.facility_overview || {};
  const mon = dash.system_monitoring || {};
  const dq = dash.data_quality || {};
  const ai = dash.ai_support || {};
  const qualityFlags = ai.data_quality_monitoring?.flags || [];
  const insights = ai.facility_performance_analysis?.insights || [];
  const workload = ai.facility_performance_analysis?.staff_workload || mon.staff_workload || [];

  const tabs = [
    {
      id: 'overview', icon: '🏠', label: 'Overview',
      content: (
        <>
          <KpiRow stats={[
            { label: 'Pregnancies', value: ov.registered_mothers ?? 0 },
            { label: 'ANC visits', value: ov.anc_visits ?? 0, tone: 'ok' },
            { label: 'Deliveries', value: ov.deliveries ?? 0, tone: 'ok' },
            { label: 'Emergencies', value: ov.emergencies ?? 0, tone: ov.emergencies > 0 ? 'high' : 'ok' },
            { label: 'Active users', value: facilityPack.users?.active_users ?? 0 },
          ]} />
          <SectionCard title="AI data quality flags" hint={ai.data_quality_monitoring?.description}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              {qualityFlags.map((f) => (
                <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.55rem 0.75rem', background: 'var(--sky-50)', borderRadius: 8, border: '1px solid var(--line)' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{f.label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{f.detail}</div>
                  </div>
                  <span className={`badge ${f.count > 0 ? 'badge-MEDIUM' : 'badge-LOW'}`}>{f.count}</span>
                </div>
              ))}
            </div>
          </SectionCard>
          <AmbulanceWidget data={dash.ambulance} role="facility_admin" />
        </>
      ),
    },
    {
      id: 'users', icon: '👥', label: 'Users',
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '0.75rem' }}>
          <SectionCard title="User accounts" hint="Manage roles, passwords, and account status">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td><div style={{ fontWeight: 600 }}>{u.full_name}</div><div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{u.username}</div></td>
                    <td>
                      <select value={u.role} disabled={busy === `role-${u.id}` || u.id === user?.id} onChange={(e) => changeRole(u.id, e.target.value)} style={{ fontSize: '0.82rem', padding: '0.3rem 0.5rem', borderRadius: 6, border: '1px solid var(--line)' }}>
                        <option value="midwife">Midwife</option>
                        <option value="doctor">Doctor</option>
                        <option value="chw">CHW</option>
                        <option value="facility_admin">Admin</option>
                      </select>
                    </td>
                    <td><span className={`badge ${u.is_active ? 'badge-LOW' : 'badge-HIGH'}`}>{u.is_active ? 'Active' : 'Disabled'}</span></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button type="button" className="btn btn-ghost" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} disabled={busy === `pw-${u.id}`} onClick={() => resetPassword(u.id)}>Reset pw</button>
                        {u.id !== user?.id && <button type="button" className="btn btn-outline" style={{ padding: '0.3rem 0.6rem', fontSize: '0.78rem' }} disabled={busy === `act-${u.id}`} onClick={() => toggleActive(u)}>{u.is_active ? 'Disable' : 'Enable'}</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SectionCard>
          <SectionCard title="Create user account">
            <form onSubmit={createUser}>
              <div className="field"><label>Full name</label><input required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /></div>
              <div className="field"><label>Username</label><input required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></div>
              <div className="field"><label>Temporary password</label><input type="password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div className="field">
                <label>Role</label>
                <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="midwife">Midwife</option><option value="doctor">Doctor</option><option value="chw">CHW</option><option value="facility_admin">Admin</option>
                </select>
              </div>
              <button className="btn btn-primary" disabled={busy === 'create'}>{busy === 'create' ? 'Creating…' : 'Create account'}</button>
            </form>
          </SectionCard>
        </div>
      ),
    },
    {
      id: 'facility', icon: '🏥', label: 'Facility config',
      content: (
        <SectionCard title="Facility configuration" hint={`Code: ${facilityPack.facility?.code} · District: ${facilityPack.facility?.district}`}>
          <form onSubmit={saveFacility}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="field"><label>Facility name</label><input required value={facilityForm.name} onChange={(e) => setFacilityForm({ ...facilityForm, name: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input value={facilityForm.phone} onChange={(e) => setFacilityForm({ ...facilityForm, phone: e.target.value })} /></div>
              <div className="field"><label>Village</label><input value={facilityForm.village} onChange={(e) => setFacilityForm({ ...facilityForm, village: e.target.value })} /></div>
              <div className="field"><label>Cell</label><input value={facilityForm.cell_name} onChange={(e) => setFacilityForm({ ...facilityForm, cell_name: e.target.value })} /></div>
              <div className="field"><label>Sector</label><input value={facilityForm.sector} onChange={(e) => setFacilityForm({ ...facilityForm, sector: e.target.value })} /></div>
              <div className="field">
                <label>Facility type</label>
                <select value={facilityForm.facility_type} onChange={(e) => setFacilityForm({ ...facilityForm, facility_type: e.target.value })}>
                  <option value="health_center">Health center</option><option value="district_hospital">District hospital</option><option value="referral_hospital">Referral hospital</option>
                </select>
              </div>
              <div className="field"><label>Departments (one per line)</label><textarea rows={4} value={facilityForm.departmentsText} onChange={(e) => setFacilityForm({ ...facilityForm, departmentsText: e.target.value })} /></div>
              <div className="field"><label>Services (one per line)</label><textarea rows={4} value={facilityForm.servicesText} onChange={(e) => setFacilityForm({ ...facilityForm, servicesText: e.target.value })} /></div>
            </div>
            <button className="btn btn-primary" disabled={busy === 'facility'}>{busy === 'facility' ? 'Saving…' : 'Save configuration'}</button>
          </form>
        </SectionCard>
      ),
    },
    {
      id: 'monitoring', icon: '🔍', label: 'Monitoring',
      content: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <SectionCard title="System status">
            <div className="list-row"><span>Availability</span><strong>{mon.availability || 'Online'}</strong></div>
            <div className="list-row"><span>Sync status</span><strong>{mon.sync_status || '—'}</strong></div>
            <div className="list-row"><span>Logins today</span><strong>{mon.logins_today ?? 0}</strong></div>
            <div className="list-row"><span>Activities today</span><strong>{mon.user_activities_today ?? 0}</strong></div>
          </SectionCard>
          <SectionCard title="Data quality">
            <div className="list-row"><span>Missing obstetric history</span><strong>{dq.missing_obstetric_history ?? 0}</strong></div>
            <div className="list-row"><span>Missing next-visit dates</span><strong>{dq.missing_next_visit ?? 0}</strong></div>
            <div className="list-row"><span>Missing phones</span><strong>{dq.missing_patient_phone ?? 0}</strong></div>
            <div className="list-row"><span>Duplicate phones</span><strong>{dq.possible_duplicate_phones ?? 0}</strong></div>
            <div className="list-row"><span>Incomplete forms</span><strong>{dq.incomplete_clinical_forms ?? 0}</strong></div>
          </SectionCard>
          <SectionCard title="Security log" hint="Recent logins and sensitive actions">
            {securityLogs.length === 0 && <EmptyState title="No recent events" />}
            {securityLogs.slice(0, 8).map((s) => (
              <div className="list-row" key={s.id}>
                <div>
                  <strong style={{ fontSize: '0.85rem' }}>{s.action}</strong>
                  <div style={{ fontSize: '0.78rem', color: 'var(--muted)' }}>{s.full_name || s.username || 'System'} · {s.role || '—'}</div>
                </div>
                <span style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{new Date(s.created_at).toLocaleString()}</span>
              </div>
            ))}
          </SectionCard>
          <SectionCard title="AI performance insights">
            {insights.map((ins, i) => (
              <div key={i} className={`alert-banner alert-${ins.severity || 'LOW'}`} style={{ marginBottom: 8 }}>
                <strong>{ins.title}</strong>
                <div style={{ fontSize: '0.85rem' }}>{ins.message}</div>
                <div style={{ fontSize: '0.82rem', marginTop: 4 }}><em>Recommend:</em> {ins.recommendation}</div>
              </div>
            ))}
            {insights.length === 0 && <EmptyState title="No performance insights yet" />}
          </SectionCard>
        </div>
      ),
    },
    {
      id: 'reports', icon: '📊', label: 'Reports',
      content: (
        <ReportPanel title="Facility performance report" subtitle="ANC, deliveries, emergencies, staff activity"
          footer={
            <div className="btn-row" style={{ marginTop: 0 }}>
              <button type="button" className="btn btn-primary" onClick={() => exportDashboardPdf({ kind: 'facility_performance_report', title: `Facility report · ${facilityPack?.facility?.name || ''}`, user, dashboard: dash, analytics: null })}>Export PDF</button>
              <Link className="btn btn-ghost" to="/analytics">Full report</Link>
            </div>
          }>
          <KpiRow stats={[
            { label: 'Pregnancies', value: ov.registered_mothers ?? 0 },
            { label: 'ANC visits', value: ov.anc_visits ?? 0 },
            { label: 'Deliveries', value: ov.deliveries ?? 0 },
            { label: 'Emergencies', value: ov.emergencies ?? 0 },
            { label: 'Referrals', value: ov.referrals ?? 0 },
          ]} />
        </ReportPanel>
      ),
    },
  ];

  return (
    <div>
      <WorkspaceHeader brand="Facility operations" title="Facility Administrator" subtitle="Users, configuration, monitoring, and performance" context={dash.context} />
      {error && <p className="error-text">{error}</p>}
      {msg && <p style={{ color: 'var(--green-800)', marginBottom: '0.5rem' }}>{msg}</p>}
      <DashTabs tabs={tabs} storageKey="dash_admin_tab" />
    </div>
  );
}
