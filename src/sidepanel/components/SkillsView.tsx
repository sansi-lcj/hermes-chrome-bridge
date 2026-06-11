import { Alert, Button, Card, Empty, List, Spin, Tag, Tooltip, Typography } from 'antd';
import { PlayCircleOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore, useCatalogStore, useUiStore } from '../../stores';

export function SkillsView() {
  const c = useCatalogStore(
    useShallow((s) => ({
      skills: s.skills,
      toolsets: s.toolsets,
      skillsLoading: s.skillsLoading,
      skillsError: s.skillsError,
    })),
  );
  const setInput = useChatStore((s) => s.setInput);
  const setTab = useUiStore((s) => s.setTab);

  /** Prefill the composer to invoke a skill, then jump to Chat to complete it. */
  const use = (name: string) => {
    setInput(`Use the "${name}" skill to `);
    setTab('chat');
  };

  if (c.skillsLoading)
    return (
      <div className="centered">
        <Spin />
      </div>
    );

  return (
    <div className="scroll-pane">
      {c.skillsError && (
        <Alert type="error" showIcon message={c.skillsError} style={{ marginBottom: 12 }} />
      )}

      <Typography.Title level={5}>Skills ({c.skills.length})</Typography.Title>
      {c.skills.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No skills reported" />
      ) : (
        <List
          size="small"
          dataSource={c.skills}
          renderItem={(s) => (
            <List.Item
              actions={[
                <Tooltip title="Use in chat" key="use">
                  <Button
                    size="small"
                    type="text"
                    icon={<PlayCircleOutlined />}
                    aria-label={`Use skill ${s.name}`}
                    onClick={() => use(s.name)}
                  />
                </Tooltip>,
              ]}
            >
              <List.Item.Meta title={s.name} description={s.description} />
            </List.Item>
          )}
        />
      )}

      <Typography.Title level={5} style={{ marginTop: 16 }}>
        Toolsets ({c.toolsets.length})
      </Typography.Title>
      {c.toolsets.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No toolsets reported" />
      ) : (
        c.toolsets.map((t, i) => (
          <Card
            key={t.id ?? i}
            size="small"
            title={t.name}
            style={{ marginBottom: 8 }}
            extra={
              <Tooltip title="Use in chat">
                <Button
                  size="small"
                  type="text"
                  icon={<PlayCircleOutlined />}
                  aria-label={`Use toolset ${t.name}`}
                  onClick={() => use(t.name)}
                />
              </Tooltip>
            }
          >
            {t.description && (
              <Typography.Paragraph type="secondary">{t.description}</Typography.Paragraph>
            )}
            {t.tools?.map((tool) => (
              <Tag key={tool}>{tool}</Tag>
            ))}
          </Card>
        ))
      )}
    </div>
  );
}
