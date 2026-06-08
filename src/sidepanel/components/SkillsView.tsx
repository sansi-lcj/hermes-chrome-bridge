import { observer } from 'mobx-react-lite';
import { Alert, Card, Empty, List, Spin, Tag, Typography } from 'antd';
import { catalogStore } from '../../stores';

export const SkillsView = observer(function SkillsView() {
  const c = catalogStore;

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
            <List.Item>
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
});
