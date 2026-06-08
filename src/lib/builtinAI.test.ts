import { afterEach, describe, expect, it, vi } from 'vitest';
import { onDeviceAvailable } from './builtinAI';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('onDeviceAvailable', () => {
  it('is false when the API is absent', async () => {
    vi.stubGlobal('LanguageModel', undefined);
    expect(await onDeviceAvailable()).toBe(false);
  });

  it('is true when the model is available', async () => {
    vi.stubGlobal('LanguageModel', { availability: async () => 'available' });
    expect(await onDeviceAvailable()).toBe(true);
  });

  it('is true when the model is downloadable', async () => {
    vi.stubGlobal('LanguageModel', { availability: async () => 'downloadable' });
    expect(await onDeviceAvailable()).toBe(true);
  });

  it('is false when unavailable', async () => {
    vi.stubGlobal('LanguageModel', { availability: async () => 'unavailable' });
    expect(await onDeviceAvailable()).toBe(false);
  });

  it('is false when availability throws', async () => {
    vi.stubGlobal('LanguageModel', {
      availability: async () => {
        throw new Error('boom');
      },
    });
    expect(await onDeviceAvailable()).toBe(false);
  });
});
