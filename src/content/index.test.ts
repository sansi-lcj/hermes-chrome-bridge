// @vitest-environment jsdom
import { beforeAll, describe, expect, it, vi } from 'vitest';

// Capture the content script's message listener.
type Listener = (
  message: Record<string, unknown>,
  sender: unknown,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined;
let listener: Listener;
vi.stubGlobal('chrome', {
  runtime: {
    onMessage: {
      addListener: (cb: Listener) => {
        listener = cb;
      },
    },
  },
});

// jsdom has no layout: make every element pass the visibility check, and shim
// the layout-dependent APIs the script touches (innerText, scrollIntoView).
beforeAll(() => {
  Element.prototype.getBoundingClientRect = () =>
    ({ width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 }) as DOMRect;
  Element.prototype.scrollIntoView = () => {};
  Object.defineProperty(HTMLElement.prototype, 'innerText', {
    get(this: HTMLElement) {
      return this.textContent ?? '';
    },
  });
});

await import('./index');

/** Drive the listener synchronously and return its response. */
function send(message: Record<string, unknown>): unknown {
  let response: unknown;
  const keptOpen = listener(message, {}, (r) => {
    response = r;
  });
  expect(keptOpen).toBe(false); // all handlers respond synchronously
  return response;
}

describe('content script', () => {
  it('serves page context', () => {
    document.title = 'Test page';
    document.body.innerHTML = '<p>Some body text</p>';
    const ctx = send({ type: 'getPageContext' }) as { title: string; text: string };
    expect(ctx.title).toBe('Test page');
    expect(ctx.text).toContain('Some body text');
  });

  it('scans elements, then clicks one by index', () => {
    document.body.innerHTML = '<button id="go">Go</button>';
    const clicked = vi.fn();
    document.getElementById('go')!.addEventListener('click', clicked);

    const els = send({ type: 'getInteractiveElements' }) as Array<{ index: number; name: string }>;
    expect(els).toHaveLength(1);
    expect(els[0].name).toBe('Go');

    expect(send({ type: 'clickElement', index: 0 })).toEqual({ clicked: 0 });
    expect(clicked).toHaveBeenCalled();
  });

  it('types into an input and fires input/change events', () => {
    document.body.innerHTML = '<input placeholder="name" />';
    const input = document.querySelector('input')!;
    const onInput = vi.fn();
    input.addEventListener('input', onInput);

    send({ type: 'getInteractiveElements' });
    expect(send({ type: 'typeText', index: 0, text: 'Ada' })).toEqual({ typed: 0 });
    expect(input.value).toBe('Ada');
    expect(onInput).toHaveBeenCalled();
  });

  it('returns an error envelope for a stale element index', () => {
    document.body.innerHTML = '';
    send({ type: 'getInteractiveElements' });
    const res = send({ type: 'clickElement', index: 42 }) as { error: string };
    expect(res.error).toMatch(/No element #42/);
  });

  it('ignores unknown message types (no response, channel not held open)', () => {
    let response: unknown = 'untouched';
    const keptOpen = listener({ type: 'mystery' }, {}, (r) => {
      response = r;
    });
    expect(keptOpen).toBe(false);
    expect(response).toBe('untouched');
  });
});
