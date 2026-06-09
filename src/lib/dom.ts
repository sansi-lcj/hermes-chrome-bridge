// Pure helpers for the content script's page perception: find the interactive
// elements on a page and label them. Kept dependency-free and DOM-only so it is
// unit-testable under jsdom.

export interface ElementInfo {
  /** Stable index for this scan; the agent references elements by it. */
  index: number;
  tag: string;
  type?: string;
  role?: string;
  /** Best-effort accessible name / visible text. */
  name: string;
}

export interface Interactive {
  element: Element;
  info: ElementInfo;
}

const SELECTOR = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="tab"]',
  '[contenteditable="true"]',
  '[onclick]',
].join(', ');

/** Derive a short human label for an element. */
export function labelFor(el: Element): string {
  const aria = el.getAttribute('aria-label');
  if (aria?.trim()) return aria.trim();
  const text = ((el as HTMLElement).innerText || el.textContent || '').trim();
  if (text) return text.slice(0, 100);
  const cand =
    el.getAttribute('placeholder') ||
    (el as HTMLInputElement).value ||
    el.getAttribute('alt') ||
    el.getAttribute('title') ||
    el.getAttribute('name') ||
    '';
  return String(cand).trim().slice(0, 100);
}

function defaultVisible(el: Element): boolean {
  if ((el as HTMLInputElement).disabled) return false;
  if (el.getAttribute('aria-hidden') === 'true') return false;
  const rect = el.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

/**
 * Collect interactive elements in document order, assigning each an index.
 * `isVisible` is injectable so tests can bypass layout (jsdom has none).
 */
export function collectInteractive(
  doc: Document,
  isVisible: (el: Element) => boolean = defaultVisible,
): Interactive[] {
  const out: Interactive[] = [];
  doc.querySelectorAll(SELECTOR).forEach((el) => {
    if (!isVisible(el)) return;
    out.push({
      element: el,
      info: {
        index: out.length,
        tag: el.tagName.toLowerCase(),
        type: (el as HTMLInputElement).type || undefined,
        role: el.getAttribute('role') || undefined,
        name: labelFor(el),
      },
    });
  });
  return out;
}
