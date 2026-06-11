import type { ReactNode } from 'react';
import { Button, Popconfirm, Space } from 'antd';
import { DeleteOutlined, EditOutlined } from '@ant-design/icons';

interface EntityCardProps {
  /** Primary line (may include inline icons). */
  title: ReactNode;
  /** Secondary line (host, schedule, description…). */
  subtitle: ReactNode;
  /** Noun used in accessible labels, e.g. `profile ${label}` → "Edit profile …". */
  noun: string;
  /** Popconfirm prompt shown before deleting. */
  deleteTitle: string;
  onEdit: () => void;
  onDelete: () => void;
  /** Optional control rendered before the edit button (e.g. a toggle). */
  extra?: ReactNode;
}

/**
 * The shared row for a managed list item (quick command, site profile,
 * scheduled task): title + subtitle on the left, edit + delete (and an optional
 * control) on the right. One copy of what were three identical cards.
 */
export function EntityCard({
  title,
  subtitle,
  noun,
  deleteTitle,
  onEdit,
  onDelete,
  extra,
}: EntityCardProps) {
  return (
    <div className="account-card">
      <div className="account-main">
        <div className="account-name">{title}</div>
        <div className="account-sub">{subtitle}</div>
      </div>
      <Space onClick={(e) => e.stopPropagation()}>
        {extra}
        <Button
          size="small"
          type="text"
          icon={<EditOutlined />}
          aria-label={`Edit ${noun}`}
          onClick={onEdit}
        />
        <Popconfirm
          title={deleteTitle}
          okText="Delete"
          okButtonProps={{ danger: true }}
          onConfirm={onDelete}
        >
          <Button
            size="small"
            type="text"
            danger
            icon={<DeleteOutlined />}
            aria-label={`Delete ${noun}`}
          />
        </Popconfirm>
      </Space>
    </div>
  );
}
