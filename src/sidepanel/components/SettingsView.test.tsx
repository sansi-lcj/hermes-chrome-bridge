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
      get: vi.fn(async (keys: string | string[]) => {
        const arr = Array.isArray(keys) ? keys : [keys];
        const out: Record<string, unknown> = {};
        for (const k of arr) if (k in stored) out[k] = stored[k];
        return out;
      }),
      set: vi.fn(async (o: Record<string, unknown>) => Object.assign(stored, o)),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  permissions: { request: vi.fn(async () => true) },
});

const { SettingsView } = await import('./SettingsView');
const { useSettingsStore } = await import('../../stores/settings');

describe('SettingsView (multi-account)', () => {
  it('adds an account, requests the port-less host permission, and activates it', async () => {
    const user = userEvent.setup();
    render(<SettingsView />);

    await user.click(screen.getByRole('button', { name: /Add account/ }));
    await user.type(screen.getByPlaceholderText('e.g. Work'), 'Work');
    await user.type(screen.getByPlaceholderText('http://127.0.0.1:8642'), 'http://localhost:8642');
    await user.type(screen.getByPlaceholderText('API_SERVER_KEY'), 'secret');
    await user.click(screen.getByRole('button', { name: 'Save' }));

    // Port dropped — Chrome match patterns can't contain a port.
    expect(chrome.permissions.request).toHaveBeenCalledWith({ origins: ['http://localhost/*'] });
    expect(message.success).toHaveBeenCalledWith('Saved.');

    const state = useSettingsStore.getState();
    expect(state.accounts).toHaveLength(1);
    expect(state.accounts[0]).toMatchObject({
      name: 'Work',
      baseUrl: 'http://localhost:8642',
      apiKey: 'secret',
    });
    expect(state.activeId).toBe(state.accounts[0].id);
    expect(state.baseUrl).toBe('http://localhost:8642');
  });
});
