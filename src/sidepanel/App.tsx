import { lazy, Suspense } from 'react';
import { observer } from 'mobx-react-lite';
import { Segmented, Spin } from 'antd';
import {
  MessageOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { settingsStore, uiStore } from '../stores';
import type { Tab } from '../stores/UiStore';
import { ChatView } from './components/ChatView';

// Code-split the secondary views so they load only when opened.
const SkillsView = lazy(() =>
  import('./components/SkillsView').then((m) => ({ default: m.SkillsView })),
);
const SessionsView = lazy(() =>
  import('./components/SessionsView').then((m) => ({ default: m.SessionsView })),
);
const SettingsView = lazy(() =>
  import('./components/SettingsView').then((m) => ({ default: m.SettingsView })),
);

const Loading = (
  <div className="centered">
    <Spin />
  </div>
);

export const App = observer(function App() {
  if (!settingsStore.loaded) return <div className="loading">Loading…</div>;

  const tab = uiStore.tab;
  return (
    <div className="app">
      <header className="topbar">
        <Segmented<Tab>
          block
          value={tab}
          onChange={(value) => uiStore.setTab(value)}
          options={[
            { value: 'chat', label: 'Chat', icon: <MessageOutlined /> },
            { value: 'skills', label: 'Skills', icon: <ThunderboltOutlined /> },
            { value: 'sessions', label: 'Sessions', icon: <HistoryOutlined /> },
            { value: 'settings', label: 'Settings', icon: <SettingOutlined /> },
          ]}
        />
      </header>
      <main className="view">
        {/* Keep Chat mounted so its stream/conversation survives tab switches. */}
        <div hidden={tab !== 'chat'} className="view-pane">
          <ChatView />
        </div>
        <Suspense fallback={Loading}>
          {tab === 'skills' && <SkillsView />}
          {tab === 'sessions' && <SessionsView />}
          {tab === 'settings' && <SettingsView />}
        </Suspense>
      </main>
    </div>
  );
});
