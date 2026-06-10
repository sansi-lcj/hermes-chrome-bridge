import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
    },
  },
});

const { hostOf, hostMatches, matchProfile, loadProfiles, saveProfiles } =
  await import('./profiles');
import type { SiteProfile } from './profiles';

beforeEach(() => {
  for (const k of Object.keys(store)) delete store[k];
});

describe('hostOf', () => {
  it('extracts a lowercase host from web URLs only', () => {
    expect(hostOf('https://Example.com/path')).toBe('example.com');
    expect(hostOf('http://sub.arxiv.org')).toBe('sub.arxiv.org');
    expect(hostOf('chrome://extensions')).toBe('');
    expect(hostOf('not a url')).toBe('');
  });
});

describe('hostMatches', () => {
  it('matches exact hosts', () => {
    expect(hostMatches('github.com', 'github.com')).toBe(true);
    expect(hostMatches('github.com', 'gist.github.com')).toBe(false);
  });
  it('matches "*." against the apex and any subdomain', () => {
    expect(hostMatches('*.arxiv.org', 'arxiv.org')).toBe(true);
    expect(hostMatches('*.arxiv.org', 'www.arxiv.org')).toBe(true);
    expect(hostMatches('*.arxiv.org', 'notarxiv.org')).toBe(false);
  });
  it('is false for empty inputs', () => {
    expect(hostMatches('', 'x')).toBe(false);
    expect(hostMatches('x', '')).toBe(false);
  });
});

describe('matchProfile', () => {
  const profiles: SiteProfile[] = [
    { id: '1', host: '*.example.com', label: 'wild' },
    { id: '2', host: 'docs.example.com', label: 'specific' },
  ];
  it('returns the most specific (longest pattern) match', () => {
    expect(matchProfile(profiles, 'https://docs.example.com/x')?.id).toBe('2');
    expect(matchProfile(profiles, 'https://www.example.com')?.id).toBe('1');
    expect(matchProfile(profiles, 'https://other.org')).toBeNull();
    expect(matchProfile(profiles, 'chrome://x')).toBeNull();
  });
});

describe('persistence', () => {
  it('round-trips profiles', async () => {
    expect(await loadProfiles()).toEqual([]);
    const ps: SiteProfile[] = [{ id: 'a', host: 'h', label: 'L', private: true }];
    await saveProfiles(ps);
    expect(await loadProfiles()).toEqual(ps);
  });
});
