/**
 * Build a Chrome host match pattern (`<scheme>://<host>/*`) from a base URL, or
 * return null if the URL is not a valid http(s) URL. Used to request the
 * optional host permission for the configured Hermes origin.
 *
 * The port is intentionally dropped: Chrome match patterns cannot contain a
 * port (`http://127.0.0.1:8642/*` is rejected by chrome.permissions.request).
 * `http://127.0.0.1/*` grants access to the host on every port — which is the
 * only granularity Chrome offers.
 */
export function originPattern(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return `${u.protocol}//${u.hostname}/*`;
  } catch {
    return null;
  }
}
