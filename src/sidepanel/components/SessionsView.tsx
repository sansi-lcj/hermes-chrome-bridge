import { useEffect, useState } from 'react';
import type { SessionInfo } from '../../lib/types';
import { sendRuntime } from '../hooks/usePort';

export function SessionsView() {
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    setError(null);
    sendRuntime<SessionInfo[]>({ type: 'api', action: 'sessions' })
      .then(setSessions)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div className="list-view">
      <div className="row-between">
        <h3>Sessions ({sessions.length})</h3>
        <button className="link" onClick={load}>
          Refresh
        </button>
      </div>
      {loading && <div className="loading">Loading…</div>}
      {error && <div className="error-banner">{error}</div>}
      {!loading && sessions.length === 0 && !error && (
        <p className="empty">No prior sessions found.</p>
      )}
      {sessions.map((s) => (
        <div key={s.id} className="card">
          <div className="card-title">{s.title || s.id}</div>
          <div className="card-desc">
            {s.message_count != null && <span>{s.message_count} messages · </span>}
            {formatTime(s.updated_at ?? s.created_at)}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTime(t: string | number | undefined): string {
  if (t == null) return '';
  const d = typeof t === 'number' ? new Date(t * (t < 1e12 ? 1000 : 1)) : new Date(t);
  return isNaN(d.getTime()) ? String(t) : d.toLocaleString();
}
