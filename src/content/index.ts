// Content script: supplies page context and performs perception/actions on
// behalf of the agent. It keeps the index→element map from the last scan so the
// agent can reference elements by index.

import { collectInteractive, type ElementInfo } from '../lib/dom';
import type { PageContext } from '../lib/types';

const MAX_TEXT = 8000;
let elementMap: Element[] = [];

function collect(): PageContext {
  const selection = window.getSelection()?.toString().trim() ?? '';
  const text = (document.body?.innerText ?? '').replace(/\s+\n/g, '\n').trim().slice(0, MAX_TEXT);
  return { url: location.href, title: document.title, selection, text };
}

function scanElements(): ElementInfo[] {
  const items = collectInteractive(document);
  elementMap = items.map((i) => i.element);
  return items.map((i) => i.info);
}

function elementAt(index: number): HTMLElement {
  const el = elementMap[index];
  if (!el) throw new Error(`No element #${index}. Call get_page_elements first.`);
  return el as HTMLElement;
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) setter.call(el, value);
  else el.value = value;
}

function clickElement(index: number): unknown {
  const el = elementAt(index);
  el.scrollIntoView({ block: 'center' });
  el.click();
  return { clicked: index };
}

function typeText(index: number, text: string): unknown {
  const el = elementAt(index);
  el.focus();
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    setNativeValue(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else if (el.isContentEditable) {
    el.textContent = text;
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  } else {
    throw new Error('Element is not typeable.');
  }
  return { typed: index };
}

function scrollPage(direction: 'up' | 'down'): unknown {
  const top = (direction === 'up' ? -1 : 1) * window.innerHeight * 0.8;
  window.scrollBy({ top, behavior: 'smooth' });
  return { scrolled: direction };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handle = (): unknown => {
    switch (message?.type) {
      case 'getPageContext':
        return collect();
      case 'getInteractiveElements':
        return scanElements();
      case 'clickElement':
        return clickElement(message.index);
      case 'typeText':
        return typeText(message.index, message.text);
      case 'scrollPage':
        return scrollPage(message.direction);
      default:
        return undefined;
    }
  };
  try {
    const result = handle();
    if (result !== undefined) sendResponse(result);
  } catch (e) {
    sendResponse({ error: String(e) });
  }
  // Every handler responds synchronously, so no async channel is kept open
  // (returning true is reserved for listeners that respond later).
  return false;
});
