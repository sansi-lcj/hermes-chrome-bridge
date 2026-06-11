import { Button, Empty, Popconfirm, Typography } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useRunsStore } from '../../stores';

/** Dashboard of in-flight Runs (the Runs API tasks tracked by the background). */
export function RunsView() {
  const { runs, stop } = useRunsStore(useShallow((s) => ({ runs: s.runs, stop: s.stop })));

  return (
    <div className="scroll-pane">
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        Active runs ({runs.length})
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        Long tasks started in Run mode keep going in the background even if you close the panel.
        They appear here while in flight; stop one to cancel it.
      </Typography.Paragraph>

      {runs.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No runs in flight" />
      ) : (
        <div className="account-list">
          {runs.map((r) => (
            <div key={r.id} className="account-card">
              <div className="account-main">
                <div className="account-name">{r.model || 'run'}</div>
                <div className="account-sub">
                  {r.id} · started {new Date(r.startedAt).toLocaleTimeString()}
                </div>
              </div>
              <Popconfirm
                title="Stop this run?"
                okText="Stop"
                okButtonProps={{ danger: true }}
                onConfirm={() => void stop(r.id)}
              >
                <Button
                  size="small"
                  type="text"
                  danger
                  icon={<StopOutlined />}
                  aria-label={`Stop run ${r.id}`}
                >
                  Stop
                </Button>
              </Popconfirm>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
