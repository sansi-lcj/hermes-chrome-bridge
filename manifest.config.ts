import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Hermes Chrome Bridge',
  description:
    'Connect Chrome to a deployed Hermes Agent and use its capabilities while you browse.',
  version: pkg.version,
  icons: {
    16: 'icons/icon-16.png',
    32: 'icons/icon-32.png',
    48: 'icons/icon-48.png',
    128: 'icons/icon-128.png',
  },
  action: {
    default_title: 'Open Hermes Agent',
    default_icon: {
      16: 'icons/icon-16.png',
      32: 'icons/icon-32.png',
      48: 'icons/icon-48.png',
      128: 'icons/icon-128.png',
    },
  },
  background: {
    service_worker: 'src/background/index.ts',
    type: 'module',
  },
  side_panel: {
    default_path: 'src/sidepanel/index.html',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  // Address-bar shortcut: type "hermes <query>" + Enter to ask the agent.
  omnibox: { keyword: 'hermes' },
  // Keyboard shortcuts (configurable at chrome://extensions/shortcuts).
  commands: {
    'open-panel': {
      suggested_key: { default: 'Ctrl+Shift+H', mac: 'Command+Shift+H' },
      description: 'Open the Hermes side panel',
    },
    'new-chat': {
      description: 'Start a new Hermes conversation',
    },
  },
  permissions: [
    'sidePanel',
    'storage',
    'activeTab',
    'scripting',
    'tabs',
    'contextMenus',
    'notifications',
  ],
  // The configured Hermes origin is requested at runtime (on Settings save) via
  // chrome.permissions.request so the service worker can call it without CORS.
  optional_host_permissions: ['http://*/*', 'https://*/*'],
});
