import { useEffect, useState } from 'react';
import { Alert, Button, Empty, Spin, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { Conversations } from '@ant-design/x';
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

  const items = sessions.map((s) => ({
    key: s.id,
    label: s.title || s.id,
    group: timeLabel(s.updated_at ?? s.created_at),
  }));

  return (
    <div className="scroll-pane">
      <div className="row-between">
        <Typography.Title level={5} style={{ margin: 0 }}>
          Sessions ({sessions.length})
        </Typography.Title>
        <Button size="small" icon={<ReloadOutlined />} onClick={load} loading={loading}>
          Refresh
        </Button>
      </div>

      {error && <Alert type="error" showIcon message={error} style={{ marginTop: 12 }} />}

      {loading ? (
        <div className="centered">
          <Spin />
        </div>
      ) : sessions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No prior sessions" />
      ) : (
        <Conversations items={items} groupable style={{ marginTop: 8 }} />
      )}
    </div>
  );
}

function timeLabel(t: string | number | undefined): string {
  if (t == null) return 'Earlier';
  const d = typeof t === 'number' ? new Date(t * (t < 1e12 ? 1000 : 1)) : new Date(t);
  if (isNaN(d.getTime())) return 'Earlier';
  const days = (Date.now() - d.getTime()) / 86_400_000;
  if (days < 1) return 'Today';
  if (days < 2) return 'Yesterday';
  if (days < 7) return 'This week';
  return 'Earlier';
}
