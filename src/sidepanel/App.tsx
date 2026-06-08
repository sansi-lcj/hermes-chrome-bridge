import { observer } from 'mobx-react-lite';
import { Segmented } from 'antd';
import {
  MessageOutlined,
  ThunderboltOutlined,
  HistoryOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { settingsStore, uiStore } from '../stores';
import type { Tab } from '../stores/UiStore';
import { ChatView } from './components/ChatView';
import { SkillsView } from './components/SkillsView';
import { SessionsView } from './components/SessionsView';
import { SettingsView } from './components/SettingsView';

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
        {tab === 'skills' && <SkillsView />}
        {tab === 'sessions' && <SessionsView />}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
});
