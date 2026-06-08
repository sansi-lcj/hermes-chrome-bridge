import { useEffect, useState } from 'react';
import { getSettings, onSettingsChanged } from '../lib/storage';
import { DEFAULT_SETTINGS, type Settings } from '../lib/types';
import { ChatView } from './components/ChatView';
import { SkillsView } from './components/SkillsView';
import { SessionsView } from './components/SessionsView';
import { SettingsView } from './components/SettingsView';

type Tab = 'chat' | 'skills' | 'sessions' | 'settings';

const TABS: { id: Tab; label: string }[] = [
  { id: 'chat', label: 'Chat' },
  { id: 'skills', label: 'Skills' },
  { id: 'sessions', label: 'Sessions' },
  { id: 'settings', label: 'Settings' },
];

export function App() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');

  useEffect(() => {
    getSettings().then((s) => {
      setSettings(s);
      setLoaded(true);
      // Nudge first-time users to configure the connection.
      if (!s.baseUrl || !s.apiKey) setTab('settings');
    });
    return onSettingsChanged(setSettings);
  }, []);

  if (!loaded) return <div className="loading">Loading…</div>;

  return (
    <div className="app">
      <nav className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="view">
        {tab === 'chat' && <ChatView settings={settings} />}
        {tab === 'skills' && <SkillsView />}
        {tab === 'sessions' && <SessionsView />}
        {tab === 'settings' && <SettingsView settings={settings} />}
      </main>
    </div>
  );
}
