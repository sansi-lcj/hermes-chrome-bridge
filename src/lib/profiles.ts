// Site profiles: per-domain defaults for the assistant. When the active tab's
// host matches a profile, new chats can be seeded with its system prompt, page
// context can auto-attach, and "private" domains can be pinned to on-device
// inference (no network) — privacy-sensitive routing.
//
// Stored per-install (shared across accounts) under `siteProfiles`.

export interface SiteProfile {
  id: string;
  /**
   * Host pattern, e.g. "github.com", "*.arxiv.org", or "mail.google.com".
   * A leading "*." matches the domain and any subdomain.
   */
  host: string;
  /** A friendly label for the list. */
  label: string;
  /** Seeded as the system prompt of new chats opened on this host. */
  system?: string;
  /** Auto-enable "attach page context" on this host. */
  autoPageContext?: boolean;
  /** Privacy routing: force on-device inference (keep everything local). */
  private?: boolean;
}

const KEY = 'siteProfiles';

export function newProfileId(): string {
  return `sp-${crypto.randomUUID()}`;
}

/** Extract the lowercase host from a URL, or '' if it isn't a web URL. */
export function hostOf(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
    return u.hostname.toLowerCase();
  } catch {
    return '';
  }
}

/**
 * Does `host` match `pattern`? A bare host matches itself; a "*." prefix matches
 * the apex domain and any subdomain (e.g. "*.arxiv.org" matches "arxiv.org" and
 * "www.arxiv.org").
 */
export function hostMatches(pattern: string, host: string): boolean {
  const p = pattern.trim().toLowerCase();
  if (!p || !host) return false;
  if (p.startsWith('*.')) {
    const base = p.slice(2);
    return host === base || host.endsWith(`.${base}`);
  }
  return host === p;
}

/** The most specific matching profile for a URL (longest host pattern wins). */
export function matchProfile(profiles: SiteProfile[], url: string): SiteProfile | null {
  const host = hostOf(url);
  if (!host) return null;
  let best: SiteProfile | null = null;
  for (const p of profiles) {
    if (hostMatches(p.host, host) && (!best || p.host.length > best.host.length)) best = p;
  }
  return best;
}

export async function loadProfiles(): Promise<SiteProfile[]> {
  const res = await chrome.storage.local.get(KEY);
  const stored = res[KEY] as SiteProfile[] | undefined;
  return Array.isArray(stored) ? stored : [];
}

export async function saveProfiles(profiles: SiteProfile[]): Promise<void> {
  await chrome.storage.local.set({ [KEY]: profiles });
}
