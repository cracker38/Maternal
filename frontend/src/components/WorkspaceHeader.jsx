import { useAuth } from '../auth';

const ROLE_LABELS = {
  midwife: 'Midwife',
  doctor: 'Doctor',
  chw: 'Community Health Worker',
  facility_admin: 'Facility Administrator',
  district_officer: 'District Health Officer',
  moh: 'Ministry of Health',
};

const SCOPE_LABELS = {
  facility: 'Facility data',
  district: 'District data',
  national: 'National data',
};

export default function WorkspaceHeader({ title, subtitle, context, brand }) {
  const { user } = useAuth();
  const scope = context?.scope || (user?.role === 'moh' ? 'national' : user?.role === 'district_officer' ? 'district' : 'facility');
  const place = context?.facility_name || user?.facility_name || context?.district || user?.district || 'Rwanda';

  return (
    <header className="workspace-header">
      <div className="workspace-header-main">
        {brand && <div className="workspace-brand">{brand}</div>}
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
      <div className="workspace-meta">
        <div className="meta-pill">{ROLE_LABELS[user?.role] || user?.role}</div>
        <div className="meta-pill meta-pill-soft">{SCOPE_LABELS[scope] || scope}</div>
        <div className="meta-place">
          <strong>{user?.full_name}</strong>
          <span>{place}</span>
        </div>
      </div>
    </header>
  );
}

export function EmptyState({ title, hint }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      {hint && <p>{hint}</p>}
    </div>
  );
}

export function StatCard({ value, label, tone }) {
  return (
    <div className={`card stat-card ${tone ? `stat-card-${tone}` : ''}`.trim()}>
      <div className="stat">{value ?? 0}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
