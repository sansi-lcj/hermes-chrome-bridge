// Content script: supplies page context on demand.
//
// Stays passive — only responds when the background worker asks for context.

import type { PageContext } from '../lib/types';

const MAX_TEXT = 8000; // cap body text to keep prompts reasonable

function collect(): PageContext {
  const selection = window.getSelection()?.toString().trim() ?? '';
  const text = (document.body?.innerText ?? '').replace(/\s+\n/g, '\n').trim().slice(0, MAX_TEXT);
  return {
    url: location.href,
    title: document.title,
    selection,
    text,
  };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'getPageContext') {
    sendResponse(collect());
    return true;
  }
  return false;
});
