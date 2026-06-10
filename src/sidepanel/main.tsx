import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, theme } from 'antd';
import { XProvider } from '@ant-design/x';
import { registerFeedback } from '../lib/feedback';
import { initStores } from '../stores';
import brand from '../brand.json';
import { App } from './App';
import './styles.css';

// Load settings, connect the Port, and wire cross-store subscriptions once.
initStores();

/** Hand antd's context-aware message instance to non-component code (stores). */
function FeedbackBridge() {
  const { message } = AntApp.useApp();
  useEffect(() => registerFeedback(message), [message]);
  return null;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <XProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: brand.accent },
      }}
    >
      <AntApp>
        <FeedbackBridge />
        <App />
      </AntApp>
    </XProvider>
  </StrictMode>,
);
