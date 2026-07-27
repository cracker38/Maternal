import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

export const ROLE_GUIDES = {
  midwife: {
    color: '#146c54',
    bg: 'linear-gradient(135deg, #e6f4ef 0%, #eef6fb 100%)',
    border: '#a8d5c2',
    icon: '🩺',
    title: 'How to use this workspace',
    intro: 'Follow every mother from registration through postpartum. Work top-down: start with AI next actions, then open the mother record.',
    steps: [
      { n: 1, label: 'Register or find a mother', hint: 'Search by name, phone, or ANC number — or register a new pregnancy with auto risk score', to: '/pregnancies/new', linkLabel: 'Register mother' },
      { n: 2, label: 'Complete ANC visit', hint: 'Record vitals, fetal heart rate, labs, counseling, and schedule the next visit', to: '/mothers', linkLabel: 'Find mother' },
      { n: 3, label: 'Admit to labor & monitor', hint: 'Admit → partograph (FHR, dilation, BP) → delivery documentation', to: '/mothers', linkLabel: 'Labor ward' },
      { n: 4, label: 'Confirm AI clinical alerts', hint: 'Review AI recommendations for BP, anemia, fetal distress — confirm with your clinical judgment', to: null },
      { n: 5, label: 'Postpartum & CHW follow-up', hint: 'Assess bleeding, uterus tone, mood. Assign missed-visit tasks to CHW', to: '/community', linkLabel: 'Community board' },
    ],
    tips: [
      'AI alerts require your confirmation — they never replace clinical judgment',
      'Use Emergency mode for PPH, eclampsia, fetal distress — WHO checklist opens automatically',
      'Ambulance requests can be made from any maternal record or the coordination center',
    ],
  },
  doctor: {
    color: '#1a4f8a',
    bg: 'linear-gradient(135deg, #eef3fb 0%, #e6f4ef 100%)',
    border: '#a8c4e0',
    icon: '👨‍⚕️',
    title: 'How to use this workspace',
    intro: 'Work top-down: Critical cases first, then validate AI recommendations, then manage emergencies and referrals.',
    steps: [
      { n: 1, label: 'Review AI priority queue', hint: 'Critical → Urgent → Review Required. Most dangerous cases appear first with AI diagnosis suggestions', to: null },
      { n: 2, label: 'Validate AI clinical alerts', hint: 'Confirm or adjust AI recommendations with your clinical judgment. Add treatment plan notes', to: null },
      { n: 3, label: 'Manage active emergencies', hint: 'Open WHO-style checklist for PPH, eclampsia, sepsis, obstructed labor, fetal distress', to: null },
      { n: 4, label: 'Approve or decline referrals', hint: 'Review clinical summary, add transfer instructions, approve or decline pending referrals', to: null },
      { n: 5, label: 'Open patient clinical history', hint: 'Full ANC timeline, labs, ultrasound, alerts, and obstetric history', to: '/mothers', linkLabel: 'Find patient' },
    ],
    tips: [
      'AI CDS (Clinical Decision Support) shows possible diagnosis + recommended actions — you confirm',
      'Emergency cases are sorted by severity — Critical always appears first',
      'Referral approval triggers transfer tracking: pending → accepted → transferred → received',
    ],
  },
  chw: {
    color: '#7a4f1a',
    bg: 'linear-gradient(135deg, #fff4e5 0%, #e6f4ef 100%)',
    border: '#e0c48a',
    icon: '🏘️',
    title: 'How to use this workspace',
    intro: 'Prioritize High follow-ups first. Record every home visit, educate the family, and escalate danger signs immediately.',
    steps: [
      { n: 1, label: 'Check AI priority list', hint: 'High = missed ANC + hypertension history. Medium = missed routine appointment. Start with High', to: null },
      { n: 2, label: 'Support pregnancy registration', hint: 'Help identify pregnant women in the community and register them at the facility', to: '/pregnancies/new', linkLabel: 'Register pregnancy' },
      { n: 3, label: 'Record home visit', hint: 'Select mother → condition → challenges → education topics → danger signs → save', to: null },
      { n: 4, label: 'Draft education SMS', hint: 'Nutrition, birth preparedness, danger signs — queue SMS stub for the mother', to: null },
      { n: 5, label: 'Escalate if unwell', hint: 'Tick "Danger signs observed" — a facility alert is created automatically for midwife/doctor review', to: '/community', linkLabel: 'Community board' },
    ],
    tips: [
      'You can only see mothers assigned to you or at your facility',
      'Danger signs observed → automatic alert to facility clinical team',
      'SMS drafts are stubs in this MVP — they are logged and returned in the API',
    ],
  },
  facility_admin: {
    color: '#3d3d8a',
    bg: 'linear-gradient(135deg, #f0f0fb 0%, #e6f4ef 100%)',
    border: '#b0b0d8',
    icon: '🏥',
    title: 'How to use this workspace',
    intro: 'Manage users and facility setup first, then monitor data quality and performance. You cannot edit clinical records.',
    steps: [
      { n: 1, label: 'Create & manage user accounts', hint: 'Add midwives, doctors, CHWs. Assign roles, reset passwords, activate or deactivate accounts', to: null },
      { n: 2, label: 'Configure facility details', hint: 'Update facility name, phone, departments, and services', to: null },
      { n: 3, label: 'Review security & activity logs', hint: 'Monitor logins, sensitive actions, and user activity for the facility', to: null },
      { n: 4, label: 'Act on AI data quality flags', hint: 'Missing obstetric history, duplicate phones, incomplete forms — follow up with clinical staff', to: null },
      { n: 5, label: 'Export facility reports', hint: 'Performance trends, ANC/delivery rates, staff activity — export as PDF', to: '/analytics', linkLabel: 'Open analytics' },
    ],
    tips: [
      'You cannot modify clinical records — use corrections with audit trail for data fixes',
      'Ambulance fleet management is available to you — add units, update status',
      'Data quality flags are AI-detected — review with clinical staff weekly',
    ],
  },
  district_officer: {
    color: '#1a6b5a',
    bg: 'linear-gradient(135deg, #e6f4ef 0%, #eef6fb 100%)',
    border: '#8acfbe',
    icon: '📊',
    title: 'How to use this workspace',
    intro: 'Compare facilities, read AI insights, then plan training and resource allocation actions for the district.',
    steps: [
      { n: 1, label: 'Review district KPIs', hint: 'ANC coverage, facility delivery rate, emergency cases, referral patterns, high-risk pregnancies', to: null },
      { n: 2, label: 'Compare facility performance', hint: 'Delivery rate, high-risk count, data completeness score, staff activity proxy per facility', to: null },
      { n: 3, label: 'Read AI predictions & insights', hint: 'Hotspot communities, resource needs, trend signals from the AI analytics engine', to: null },
      { n: 4, label: 'Plan interventions', hint: 'Log training recommendations, allocate resources, draft improvement programmes', to: null },
      { n: 5, label: 'Export district report', hint: 'Full district maternal health report as PDF for supervision and planning', to: '/analytics', linkLabel: 'District analytics' },
    ],
    tips: [
      'Your data scope is district-wide — you see all facilities in your district',
      'AI insights flag facilities with low data completeness or high emergency rates',
      'Use "Log training recommendation" to document supervision actions',
    ],
  },
  moh: {
    color: '#0b3d2e',
    bg: 'linear-gradient(135deg, #e6f4ef 0%, #f0f0fb 100%)',
    border: '#7abfa8',
    icon: '🇷🇼',
    title: 'How to use this workspace',
    intro: 'Monitor national indicators, compare districts, review AI predictions, and export policy and performance reports.',
    steps: [
      { n: 1, label: 'Scan national monitoring', hint: 'ANC/PNC completion, skilled birth attendance, maternal mortality signal, emergency cases', to: null },
      { n: 2, label: 'Compare district performance', hint: 'District ranking by pregnancies, deliveries, delivery rate, high-risk, and emergencies', to: null },
      { n: 3, label: 'Review AI predictions', hint: 'Mortality vigilance signal, resource requirements, risk hotspot districts', to: null },
      { n: 4, label: 'Governance & policy', hint: 'National standards, data policies, system integration status', to: null },
      { n: 5, label: 'Export national reports', hint: 'National maternal health report, policy brief, performance export as PDF', to: '/analytics', linkLabel: 'National analytics' },
    ],
    tips: [
      'Your data scope is national — all districts and facilities are visible',
      'AI report generation creates policy-ready summaries automatically',
      'Use "Draft healthcare policy brief" to document national programme decisions',
    ],
  },
};

const STORAGE_KEY = 'rmdp_guide_collapsed';

function getCollapsed() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

export function RoleGuide({ role }) {
  const guide = ROLE_GUIDES[role];
  const [collapsed, setCollapsed] = useState(() => getCollapsed()[role] === true);
  const [showTips, setShowTips] = useState(false);

  useEffect(() => {
    const map = getCollapsed();
    map[role] = collapsed;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  }, [collapsed, role]);

  if (!guide) return null;

  return (
    <section
      style={{
        background: guide.bg,
        border: `1px solid ${guide.border}`,
        borderRadius: 14,
        marginBottom: '1.25rem',
        overflow: 'hidden',
        boxShadow: '0 4px 16px rgba(0,0,0,0.06)',
      }}
      aria-label="How to use this workspace"
    >
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.85rem 1.1rem',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          gap: 12,
          textAlign: 'left',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '1.25rem', lineHeight: 1 }}>{guide.icon}</span>
          <div>
            <div style={{
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: guide.color,
              marginBottom: 1,
            }}>
              {guide.title}
            </div>
            {collapsed && (
              <div style={{ fontSize: '0.82rem', color: '#5a6f66' }}>
                {guide.intro}
              </div>
            )}
          </div>
        </div>
        <span style={{
          fontSize: '0.75rem',
          fontWeight: 700,
          color: guide.color,
          background: 'rgba(255,255,255,0.7)',
          border: `1px solid ${guide.border}`,
          borderRadius: 999,
          padding: '0.2rem 0.65rem',
          whiteSpace: 'nowrap',
          flexShrink: 0,
        }}>
          {collapsed ? '▼ Show guide' : '▲ Hide guide'}
        </span>
      </button>

      {/* Expanded content */}
      {!collapsed && (
        <div style={{ padding: '0 1.1rem 1rem' }}>
          <p style={{ margin: '0 0 0.85rem', color: '#3a5248', fontSize: '0.92rem', lineHeight: 1.5 }}>
            {guide.intro}
          </p>

          {/* Steps */}
          <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.55rem' }}>
            {guide.steps.map((s) => (
              <li
                key={s.n}
                style={{
                  display: 'flex',
                  gap: '0.55rem',
                  alignItems: 'flex-start',
                  padding: '0.65rem 0.75rem',
                  borderRadius: 10,
                  background: 'rgba(255,255,255,0.75)',
                  border: `1px solid ${guide.border}`,
                  backdropFilter: 'blur(4px)',
                }}
              >
                <span style={{
                  flexShrink: 0,
                  width: '1.6rem',
                  height: '1.6rem',
                  borderRadius: '50%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: guide.color,
                  color: '#fff',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}>
                  {s.n}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem', color: guide.color, lineHeight: 1.3 }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#5a6f66', marginTop: 3, lineHeight: 1.4 }}>
                    {s.hint}
                  </div>
                  {s.to && (
                    <Link
                      to={s.to}
                      style={{
                        display: 'inline-block',
                        marginTop: 6,
                        fontSize: '0.75rem',
                        fontWeight: 700,
                        color: guide.color,
                        background: 'rgba(255,255,255,0.9)',
                        border: `1px solid ${guide.border}`,
                        borderRadius: 6,
                        padding: '0.2rem 0.5rem',
                        textDecoration: 'none',
                      }}
                    >
                      {s.linkLabel || 'Open →'}
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {/* Tips toggle */}
          <div style={{ marginTop: '0.75rem' }}>
            <button
              type="button"
              onClick={() => setShowTips((v) => !v)}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 700,
                color: guide.color,
                padding: '0.25rem 0',
                display: 'flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <span>{showTips ? '▲' : '▶'}</span>
              {showTips ? 'Hide tips' : 'Show quick tips'}
            </button>
            {showTips && (
              <ul style={{
                margin: '0.5rem 0 0',
                padding: 0,
                listStyle: 'none',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.35rem',
              }}>
                {guide.tips.map((tip, i) => (
                  <li
                    key={i}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                      fontSize: '0.82rem',
                      color: '#3a5248',
                      padding: '0.4rem 0.65rem',
                      background: 'rgba(255,255,255,0.6)',
                      borderRadius: 8,
                      border: `1px solid ${guide.border}`,
                    }}
                  >
                    <span style={{ color: guide.color, fontWeight: 700, flexShrink: 0 }}>💡</span>
                    {tip}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function SectionBlock({ eyebrow, title, hint, children, actions }) {
  return (
    <section className="section-block report-section">
      <div className="section-head">
        <div>
          {eyebrow && <div className="section-eyebrow">{eyebrow}</div>}
          <h3>{title}</h3>
          {hint && <p className="section-hint">{hint}</p>}
        </div>
        {actions && <div className="section-actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function ReportPanel({ title, subtitle, children, footer }) {
  return (
    <div className="report-panel">
      <div className="report-panel-head">
        <div>
          <h3>{title}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <div className="report-panel-body">{children}</div>
      {footer && <div className="report-panel-footer">{footer}</div>}
    </div>
  );
}

export function RolePurpose({ profile, className = '' }) {
  if (!profile?.title && !profile?.purpose) return null;
  return (
    <section className={`card role-purpose ${className}`.trim()}>
      <div>
        <h2 className="role-purpose-title">{profile.title}</h2>
        <p className="role-purpose-text">{profile.purpose}</p>
        {profile.ai_principle && <p className="role-purpose-ai">{profile.ai_principle}</p>}
      </div>
      <div className="midwife-can-grid">
        <div>
          <strong className="caps-label">You can</strong>
          <ul>{(profile.can || []).slice(0, 5).map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
        <div>
          <strong className="caps-label">You cannot</strong>
          <ul>{(profile.cannot || []).map((x) => <li key={x}>{x}</li>)}</ul>
        </div>
      </div>
    </section>
  );
}
