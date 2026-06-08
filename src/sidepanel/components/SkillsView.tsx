import { useEffect, useState } from 'react';
import type { Skill, Toolset } from '../../lib/types';
import { sendRuntime } from '../hooks/usePort';

export function SkillsView() {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [toolsets, setToolsets] = useState<Toolset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      sendRuntime<Skill[]>({ type: 'api', action: 'skills' }).catch(() => []),
      sendRuntime<Toolset[]>({ type: 'api', action: 'toolsets' }).catch((e) => {
        setError(String(e));
        return [];
      }),
    ])
      .then(([s, t]) => {
        setSkills(s);
        setToolsets(t);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading">Loading skills…</div>;

  return (
    <div className="list-view">
      {error && <div className="error-banner">{error}</div>}
      <h3>Skills ({skills.length})</h3>
      {skills.length === 0 && <p className="empty">No skills reported by this agent.</p>}
      {skills.map((s, i) => (
        <div key={s.id ?? i} className="card">
          <div className="card-title">{s.name}</div>
          {s.description && <div className="card-desc">{s.description}</div>}
        </div>
      ))}

      <h3>Toolsets ({toolsets.length})</h3>
      {toolsets.length === 0 && <p className="empty">No toolsets reported.</p>}
      {toolsets.map((t, i) => (
        <div key={t.id ?? i} className="card">
          <div className="card-title">{t.name}</div>
          {t.description && <div className="card-desc">{t.description}</div>}
          {t.tools && t.tools.length > 0 && (
            <div className="card-desc">Tools: {t.tools.join(', ')}</div>
          )}
        </div>
      ))}
    </div>
  );
}
