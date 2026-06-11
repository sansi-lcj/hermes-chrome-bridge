import { useState } from 'react';
import { Button, Empty, Input, InputNumber, Space, Switch, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useTasksStore } from '../../stores';
import { MIN_INTERVAL_MINUTES, type ScheduledTask } from '../../lib/tasks';
import { EntityCard } from './EntityCard';

interface Draft {
  id: string | null;
  name: string;
  prompt: string;
  intervalMinutes: number;
}

const EMPTY: Draft = { id: null, name: '', prompt: '', intervalMinutes: 60 };

/** Manage scheduled tasks (digests / monitoring) the background runs on alarms. */
export function ScheduledTasks() {
  const { tasks, addTask, updateTask, removeTask } = useTasksStore(
    useShallow((s) => ({
      tasks: s.tasks,
      addTask: s.addTask,
      updateTask: s.updateTask,
      removeTask: s.removeTask,
    })),
  );
  const [draft, setDraft] = useState<Draft | null>(null);

  const save = async () => {
    if (!draft) return;
    const name = draft.name.trim();
    const prompt = draft.prompt.trim();
    if (!name || !prompt) return;
    const payload = { name, prompt, intervalMinutes: draft.intervalMinutes };
    if (draft.id) await updateTask(draft.id, payload);
    else await addTask({ ...payload, enabled: true });
    setDraft(null);
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div className="row-between">
        <Typography.Title level={5} style={{ margin: 0 }}>
          Scheduled tasks
        </Typography.Title>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setDraft({ ...EMPTY })}>
          Add task
        </Button>
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
        Run a prompt on a schedule in the background and get a desktop notification with the result
        — e.g. a morning digest or a periodic check. Runs use the active account.
      </Typography.Paragraph>

      {tasks.length === 0 && !draft && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No scheduled tasks yet" />
      )}

      <div className="account-list">
        {tasks.map((t) => (
          <TaskCard
            key={t.id}
            task={t}
            onToggle={(enabled) => void updateTask(t.id, { enabled })}
            onEdit={() =>
              setDraft({
                id: t.id,
                name: t.name,
                prompt: t.prompt,
                intervalMinutes: t.intervalMinutes,
              })
            }
            onDelete={() => void removeTask(t.id)}
          />
        ))}
      </div>

      {draft && (
        <div className="settings-form" style={{ marginTop: 12 }}>
          <Typography.Title level={5}>{draft.id ? 'Edit task' : 'New task'}</Typography.Title>
          <label className="field">
            <span>Name</span>
            <Input
              value={draft.name}
              placeholder="Morning AI-news digest"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Prompt</span>
            <Input.TextArea
              value={draft.prompt}
              placeholder="Summarize the latest AI research highlights in 5 bullets."
              autoSize={{ minRows: 3, maxRows: 10 }}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Every (minutes)</span>
            <InputNumber
              min={MIN_INTERVAL_MINUTES}
              value={draft.intervalMinutes}
              onChange={(v) =>
                setDraft({ ...draft, intervalMinutes: Number(v) || MIN_INTERVAL_MINUTES })
              }
            />
          </label>
          <Space>
            <Button type="primary" onClick={() => void save()}>
              Save
            </Button>
            <Button type="text" onClick={() => setDraft(null)}>
              Cancel
            </Button>
          </Space>
        </div>
      )}
    </div>
  );
}

function TaskCard({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: ScheduledTask;
  onToggle: (enabled: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <EntityCard
      noun={`task ${task.name}`}
      deleteTitle="Delete this task?"
      title={task.name}
      subtitle={
        <>
          every {task.intervalMinutes} min
          {task.lastRunAt ? ` · last ran ${new Date(task.lastRunAt).toLocaleTimeString()}` : ''}
        </>
      }
      onEdit={onEdit}
      onDelete={onDelete}
      extra={
        <Switch
          size="small"
          checked={task.enabled}
          onChange={onToggle}
          aria-label={`Enable task ${task.name}`}
        />
      }
    />
  );
}
