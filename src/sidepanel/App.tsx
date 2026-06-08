import { useEffect, useState } from 'react';
import { Segmented } from 'antd';
import {
  MessageOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { getSettings, onSettingsChanged } from '../lib/storage';
import { DEFAULT_SETTINGS, type Settings } from '../lib/types';
import { ChatView } from './components/ChatView';
import { SkillsView } from './components/SkillsView';
import { SessionsView } from './components/SessionsView';
import { SettingsView } from './components/SettingsView';

type Tab = 'chat' | 'skills' | 'sessions' | 'settings';

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
      if (!s.baseUrl || !s.apiKey) setTab('settings');
    });
    return onSettingsChanged(setSettings);
  }, []);

  if (!loaded) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      <header className="topbar">
        <Segmented<Tab>
          block
          value={tab}
          onChange={setTab}
          options={[
            { value: 'chat', label: 'Chat', icon: <MessageOutlined /> },
            { value: 'skills', label: 'Skills', icon: <ThunderboltOutlined /> },
            { value: 'sessions', label: 'Sessions', icon: <HistoryOutlined /> },
            { value: 'settings', label: 'Settings', icon: <SettingOutlined /> },
          ]}
        />
      </header>
      <main className="view">
        {/* Keep Chat mounted so its conversation/stream state survives tab switches. */}
        <div hidden={tab !== 'chat'} className="view-pane">
          <ChatView settings={settings} />
        </div>
        {tab === 'skills' && <SkillsView />}
        {tab === 'sessions' && <SessionsView />}
        {tab === 'settings' && <SettingsView settings={settings} />}
      </main>
    </div>
  );
}
