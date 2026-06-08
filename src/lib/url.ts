/**
 * Build a Chrome host match pattern (`<scheme>://<host>/*`) from a base URL, or
 * return null if the URL is not a valid http(s) URL. Used to request the
 * optional host permission for the configured Hermes origin.
 */
export function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.host}/*`;
  } catch {
    return null;
  }
}
