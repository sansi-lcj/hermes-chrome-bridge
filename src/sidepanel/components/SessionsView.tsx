import { observer } from 'mobx-react-lite';
import { Alert, Button, Empty, Spin, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { Conversations } from '@ant-design/x';
import { catalogStore } from '../../stores';

export const SessionsView = observer(function SessionsView() {
  const c = catalogStore;
  const items = c.sessions.map((s) => ({
    key: s.id,
    label: s.title || s.id,
    group: timeLabel(s.updated_at ?? s.created_at),
  }));

  return (
    <div className="scroll-pane">
      <div className="row-between">
        <Typography.Title level={5} style={{ margin: 0 }}>
          Sessions ({c.sessions.length})
        </Typography.Title>
        <Button
          size="small"
          icon={<ReloadOutlined />}
          onClick={c.loadSessions}
          loading={c.sessionsLoading}
        >
          Refresh
        </Button>
      </div>

      {c.sessionsError && (
        <Alert type="error" showIcon message={c.sessionsError} style={{ marginTop: 12 }} />
      )}

      {c.sessionsLoading ? (
        <div className="centered">
          <Spin />
        </div>
      ) : c.sessions.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No prior sessions" />
      ) : (
        <Conversations items={items} groupable style={{ marginTop: 8 }} />
      )}
    </div>
  );
});

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
