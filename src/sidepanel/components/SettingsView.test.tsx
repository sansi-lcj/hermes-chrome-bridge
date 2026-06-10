// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Stub antd's static message so the flow doesn't depend on a toast container.
const message = { success: vi.fn(), error: vi.fn(), warning: vi.fn() };
vi.mock('antd', async (orig) => ({ ...(await orig<typeof import('antd')>()), message }));

const stored: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async (o: Record<string, unknown>) => Object.assign(stored, o)),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  permissions: { request: vi.fn(async () => true) },
});

const { SettingsView } = await import('./SettingsView');
const { useSettingsStore } = await import('../../stores/settings');

describe('SettingsView', () => {
  it('saves settings and requests the host permission for the origin', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.type(screen.getByPlaceholderText('http://127.0.0.1:8642'), 'http://localhost:9999');
    await user.type(screen.getByPlaceholderText('API_SERVER_KEY'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Port dropped — Chrome match patterns can't contain a port.
    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['http://localhost/*'],
    });
    expect(message.success).toHaveBeenCalledWith('Saved.');
    expect(useSettingsStore.getState().baseUrl).toBe('http://localhost:9999');
    expect(useSettingsStore.getState().apiKey).toBe('secret');
  });
});
