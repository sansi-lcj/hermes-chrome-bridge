import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App as AntApp, theme } from 'antd';
import { XProvider } from '@ant-design/x';
import { initStores } from '../stores';
import { App } from './App';
import './styles.css';

// Load settings, connect the Port, and wire cross-store subscriptions once.
initStores();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <XProvider
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: '#5865f2' },
      }}
    >
      <AntApp>
        <App />
      </AntApp>
    </XProvider>
  </StrictMode>,
);
