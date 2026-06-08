import { useEffect, useState } from 'react';
import { Alert, Card, Empty, List, Spin, Tag, Typography } from 'antd';
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

  if (loading)
    return (
      <div className="centered">
        <Spin />
      </div>
    );

  return (
    <div className="scroll-pane">
      {error && <Alert type="error" showIcon message={error} style={{ marginBottom: 12 }} />}

      <Typography.Title level={5}>Skills ({skills.length})</Typography.Title>
      {skills.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No skills reported" />
      ) : (
        <List
          size="small"
          dataSource={skills}
          renderItem={(s) => (
            <List.Item>
              <List.Item.Meta title={s.name} description={s.description} />
            </List.Item>
          )}
        />
      )}

      <Typography.Title level={5} style={{ marginTop: 16 }}>
        Toolsets ({toolsets.length})
      </Typography.Title>
      {toolsets.length === 0 ? (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No toolsets reported" />
      ) : (
        toolsets.map((t, i) => (
          <Card key={t.id ?? i} size="small" title={t.name} style={{ marginBottom: 8 }}>
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
