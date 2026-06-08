import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json';

export default defineManifest({
  manifest_version: 3,
  name: 'Hermes Chrome Bridge',
  description:
    'Connect Chrome to a deployed Hermes Agent and use its capabilities while you browse.',
  version: pkg.version,
  action: {
    default_title: 'Open Hermes Agent',
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
  permissions: ['sidePanel', 'storage', 'activeTab', 'scripting', 'tabs'],
  // The configured Hermes origin is requested at runtime (on Settings save) via
  // chrome.permissions.request so the service worker can call it without CORS.
  optional_host_permissions: ['http://*/*', 'https://*/*'],
});
