import { Navigate, Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth';

const ROLE_LABELS = {
  midwife: 'Midwife',
  doctor: 'Doctor',
  chw: 'Community Health Worker',
  facility_admin: 'Facility Administrator',
  district_officer: 'District Health Officer',
  moh: 'Ministry of Health',
};

const NAV_BY_ROLE = {
  midwife: [
    {
      group: 'Care',
      items: [
        { to: '/', label: 'Home' },
        { to: '/pregnancies/new', label: 'Register mother' },
        { to: '/mothers', label: 'Find mother' },
      ],
    },
    {
      group: 'Follow-up & reports',
      items: [
        { to: '/ambulance', label: 'Ambulance center' },
        { to: '/community', label: 'CHW follow-up' },
        { to: '/analytics', label: 'Facility report' },
      ],
    },
  ],
  doctor: [
    {
      group: 'Clinical',
      items: [
        { to: '/', label: 'Home' },
        { to: '/mothers', label: 'Patient records' },
      ],
    },
    {
      group: 'Coordination',
      items: [
        { to: '/ambulance', label: 'Ambulance center' },
        { to: '/community', label: 'Follow-up board' },
        { to: '/analytics', label: 'Facility report' },
      ],
    },
  ],
  chw: [
    {
      group: 'Community care',
      items: [
        { to: '/', label: 'Home' },
        { to: '/pregnancies/new', label: 'Support registration' },
        { to: '/mothers', label: 'Find mother' },
        { to: '/community', label: 'My visits' },
      ],
    },
  ],
  facility_admin: [
    {
      group: 'Operations',
      items: [
        { to: '/', label: 'Home' },
        { to: '/ambulance', label: 'Ambulance fleet' },
        { to: '/analytics', label: 'Facility reports' },
      ],
    },
  ],
  district_officer: [
    {
      group: 'District oversight',
      items: [
        { to: '/', label: 'Home' },
        { to: '/analytics', label: 'District reports' },
      ],
    },
  ],
  moh: [
    {
      group: 'National oversight',
      items: [
        { to: '/', label: 'Home' },
        { to: '/analytics', label: 'National reports' },
      ],
    },
  ],
};

const SIDEBAR_GUIDANCE = {
  midwife: {
    label: 'Care pathway',
    text: 'Register → ANC → Labor → Delivery → Postpartum. Confirm AI alerts with clinical judgment.',
  },
  doctor: {
    label: 'Clinical focus',
    text: 'Prioritize Critical cases, validate AI recommendations, then manage referrals and emergencies.',
  },
  chw: {
    label: 'Community focus',
    text: 'Complete High-priority home visits first. Escalate danger signs to the facility immediately.',
  },
  facility_admin: {
    label: 'Operations focus',
    text: 'Manage users and facility setup, resolve data-quality flags, then review performance reports.',
  },
  district_officer: {
    label: 'Supervision focus',
    text: 'Compare facilities, act on AI hotspots, and plan training and resource interventions.',
  },
  moh: {
    label: 'Strategic focus',
    text: 'Monitor national indicators and district ranking, then export policy and performance reports.',
  },
};

export function ProtectedRoute() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <Outlet />;
}

export function ClinicalRoute({ children }) {
  const { user } = useAuth();
  if (user?.role === 'facility_admin' || user?.role === 'district_officer' || user?.role === 'moh') {
    return <Navigate to="/" replace />;
  }
  return children;
}

export default function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const groups = NAV_BY_ROLE[user?.role] || NAV_BY_ROLE.midwife;
  const guidance = SIDEBAR_GUIDANCE[user?.role] || SIDEBAR_GUIDANCE.midwife;

  const scopeLabel =
    user?.role === 'moh'
      ? 'National scope'
      : user?.role === 'district_officer'
        ? `District · ${user?.district || '—'}`
        : user?.facility_name || 'Facility scope';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">RMDP</span>
          <small>Rwanda Maternal Digital Platform</small>
        </div>

        <nav className="nav-links" aria-label="Primary">
          {groups.map((g) => (
            <div className="nav-group" key={g.group}>
              <div className="nav-group-label">{g.group}</div>
              {g.items.map((l) => (
                <NavLink key={l.to} to={l.to} end={l.to === '/'}>
                  {l.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-guidance">
          <span className="sidebar-guidance-label">{guidance.label}</span>
          <p>{guidance.text}</p>
        </div>

        <div className="user-chip">
          <div className="user-chip-avatar" aria-hidden="true">
            {(user?.full_name || 'U').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
          </div>
          <div className="user-chip-meta">
            <strong>{user?.full_name}</strong>
            <span>{ROLE_LABELS[user?.role] || user?.role}</span>
            <em>{scopeLabel}</em>
          </div>
          <button
            type="button"
            className="user-chip-signout"
            onClick={async () => {
              await logout();
              navigate('/login');
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export function RiskBadge({ score }) {
  if (!score) return null;
  return <span className={`badge badge-${score}`}>{score}</span>;
}
