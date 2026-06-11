import { useState } from 'react';
import { Button, Checkbox, Empty, Input, Space, Typography } from 'antd';
import { LockFilled, PlusOutlined } from '@ant-design/icons';
import { useShallow } from 'zustand/react/shallow';
import { useProfilesStore } from '../../stores';
import type { SiteProfile } from '../../lib/profiles';
import { EntityCard } from './EntityCard';

interface Draft {
  id: string | null;
  host: string;
  label: string;
  system: string;
  autoPageContext: boolean;
  private: boolean;
}

const EMPTY: Draft = {
  id: null,
  host: '',
  label: '',
  system: '',
  autoPageContext: false,
  private: false,
};

/** Manage per-site profiles (system prompt / auto page-context / privacy). */
export function SiteProfiles() {
  const { profiles, addProfile, updateProfile, removeProfile } = useProfilesStore(
    useShallow((s) => ({
      profiles: s.profiles,
      addProfile: s.addProfile,
      updateProfile: s.updateProfile,
      removeProfile: s.removeProfile,
    })),
  );
  const [draft, setDraft] = useState<Draft | null>(null);

  const save = async () => {
    if (!draft) return;
    const host = draft.host.trim().toLowerCase();
    if (!host) return;
    const payload = {
      host,
      label: draft.label.trim() || host,
      system: draft.system.trim() || undefined,
      autoPageContext: draft.autoPageContext,
      private: draft.private,
    };
    if (draft.id) await updateProfile(draft.id, payload);
    else await addProfile(payload);
    setDraft(null);
  };

  return (
    <div style={{ marginTop: 24 }}>
      <div className="row-between">
        <Typography.Title level={5} style={{ margin: 0 }}>
          Site profiles
        </Typography.Title>
        <Button size="small" icon={<PlusOutlined />} onClick={() => setDraft({ ...EMPTY })}>
          Add profile
        </Button>
      </div>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginTop: 4 }}>
        On a matching host, new chats are seeded with the profile&apos;s system prompt and options.
        Use <code>*.example.com</code> to match subdomains. <b>Private</b> hosts route to on-device
        inference (no network) when available.
      </Typography.Paragraph>

      {profiles.length === 0 && !draft && (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No site profiles yet" />
      )}

      <div className="account-list">
        {profiles.map((p) => (
          <ProfileCard
            key={p.id}
            profile={p}
            onEdit={() =>
              setDraft({
                id: p.id,
                host: p.host,
                label: p.label,
                system: p.system ?? '',
                autoPageContext: Boolean(p.autoPageContext),
                private: Boolean(p.private),
              })
            }
            onDelete={() => void removeProfile(p.id)}
          />
        ))}
      </div>

      {draft && (
        <div className="settings-form" style={{ marginTop: 12 }}>
          <Typography.Title level={5}>{draft.id ? 'Edit profile' : 'New profile'}</Typography.Title>
          <label className="field">
            <span>Host (e.g. github.com or *.arxiv.org)</span>
            <Input
              value={draft.host}
              placeholder="github.com"
              onChange={(e) => setDraft({ ...draft, host: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Label</span>
            <Input
              value={draft.label}
              placeholder="Code review assistant"
              onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            />
          </label>
          <label className="field">
            <span>System prompt</span>
            <Input.TextArea
              value={draft.system}
              placeholder="You are a meticulous code reviewer…"
              autoSize={{ minRows: 3, maxRows: 10 }}
              onChange={(e) => setDraft({ ...draft, system: e.target.value })}
            />
          </label>
          <Checkbox
            checked={draft.autoPageContext}
            onChange={(e) => setDraft({ ...draft, autoPageContext: e.target.checked })}
          >
            Auto-attach page context here
          </Checkbox>
          <Checkbox
            checked={draft.private}
            onChange={(e) => setDraft({ ...draft, private: e.target.checked })}
          >
            Private — route to on-device inference (no network)
          </Checkbox>
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

function ProfileCard({
  profile,
  onEdit,
  onDelete,
}: {
  profile: SiteProfile;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <EntityCard
      noun={`profile ${profile.label}`}
      deleteTitle="Delete this profile?"
      title={
        <>
          {profile.private && <LockFilled style={{ color: '#f5bf4f' }} />}
          {profile.label}
        </>
      }
      subtitle={
        <>
          {profile.host}
          {profile.autoPageContext ? ' · page context' : ''}
          {profile.private ? ' · on-device' : ''}
        </>
      }
      onEdit={onEdit}
      onDelete={onDelete}
    />
  );
}
