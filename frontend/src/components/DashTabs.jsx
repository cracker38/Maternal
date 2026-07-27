import { useState } from 'react';

export function DashTabs({ tabs, storageKey }) {
  const [active, setActive] = useState(() => {
    if (storageKey) {
      try { return localStorage.getItem(storageKey) || tabs[0]?.id; } catch { /* */ }
    }
    return tabs[0]?.id;
  });

  function go(id) {
    setActive(id);
    if (storageKey) try { localStorage.setItem(storageKey, id); } catch { /* */ }
  }

  const current = tabs.find((t) => t.id === active) || tabs[0];

  return (
    <div>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        gap: 2,
        background: 'var(--white)',
        border: '1px solid var(--line)',
        borderRadius: 12,
        padding: 4,
        marginBottom: '1.25rem',
        flexWrap: 'wrap',
        boxShadow: '0 2px 8px rgba(11,61,46,0.06)',
      }}>
        {tabs.map((t) => {
          const isActive = t.id === active;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '0.55rem 1rem',
                borderRadius: 9,
                border: 'none',
                cursor: 'pointer',
                fontWeight: isActive ? 700 : 500,
                fontSize: '0.88rem',
                background: isActive ? 'var(--green-700)' : 'transparent',
                color: isActive ? '#fff' : 'var(--muted)',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap',
                position: 'relative',
              }}
            >
              {t.icon && <span style={{ fontSize: '1rem', lineHeight: 1 }}>{t.icon}</span>}
              {t.label}
              {t.badge != null && t.badge > 0 && (
                <span style={{
                  background: isActive ? 'rgba(255,255,255,0.3)' : 'var(--red-bg)',
                  color: isActive ? '#fff' : 'var(--red)',
                  fontSize: '0.68rem',
                  fontWeight: 700,
                  borderRadius: 999,
                  padding: '0.1rem 0.4rem',
                  minWidth: 18,
                  textAlign: 'center',
                }}>
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {/* Active panel */}
      <div>{current?.content}</div>
    </div>
  );
}

export function KpiRow({ stats }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: `repeat(${Math.min(stats.length, 5)}, 1fr)`,
      gap: '0.75rem',
      marginBottom: '1.25rem',
    }}>
      {stats.map((s) => (
        <div key={s.label} style={{
          background: 'var(--white)',
          border: '1px solid var(--line)',
          borderRadius: 12,
          padding: '0.85rem 1rem',
          boxShadow: '0 2px 8px rgba(11,61,46,0.05)',
        }}>
          <div style={{
            fontSize: 'clamp(1.4rem, 2.5vw, 1.9rem)',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            color: s.tone === 'critical' ? 'var(--red)' : s.tone === 'high' ? 'var(--orange)' : s.tone === 'ok' ? 'var(--green-700)' : 'var(--green-900)',
            lineHeight: 1,
          }}>
            {s.value ?? 0}{s.unit || ''}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--muted)', marginTop: 4, fontWeight: 500 }}>{s.label}</div>
          {s.sub && <div style={{ fontSize: '0.72rem', color: 'var(--muted)', marginTop: 2 }}>{s.sub}</div>}
        </div>
      ))}
    </div>
  );
}

export function SectionCard({ title, hint, children, action }) {
  return (
    <div style={{
      background: 'var(--white)',
      border: '1px solid var(--line)',
      borderRadius: 12,
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(11,61,46,0.05)',
      marginBottom: '1rem',
    }}>
      {(title || action) && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '0.75rem 1rem',
          borderBottom: '1px solid var(--line)',
          background: 'linear-gradient(90deg, rgba(230,244,239,0.6), rgba(238,246,251,0.4))',
          gap: 8,
          flexWrap: 'wrap',
        }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--green-900)' }}>{title}</div>
            {hint && <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginTop: 1 }}>{hint}</div>}
          </div>
          {action && <div>{action}</div>}
        </div>
      )}
      <div style={{ padding: '0.85rem 1rem' }}>{children}</div>
    </div>
  );
}
