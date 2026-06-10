// Browser tools the Hermes Agent can call. Each tool advertises an OpenAI
// "function" spec and executes via Chrome APIs in the background worker, then
// returns a JSON string as the tool result. Only already-granted permissions
// are used (tabs, activeTab/scripting), so enabling tools needs no new prompts.

import type { ToolRunner } from './hermesClient';
import type { ElementInfo } from './dom';
import type { PageContext, ToolSpec } from './types';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  /** Write/side-effecting tools require user confirmation by default. */
  write?: boolean;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

const noParams = { type: 'object', properties: {}, additionalProperties: false };

/** Cap page text / element counts so tool results stay model-prompt sized. */
const PAGE_TEXT_CAP = 4000;
const MAX_ELEMENTS = 80;

async function activeTabId(): Promise<number> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id == null) throw new Error('No active tab.');
  return tab.id;
}

/** Message the active tab's content script, with a friendly error off-limits pages. */
async function toContent<T>(message: Record<string, unknown>): Promise<T> {
  // Resolve the tab first so its errors ("No active tab.") keep their own
  // message instead of being misattributed to a missing content script.
  const tabId = await activeTabId();
  try {
    return (await chrome.tabs.sendMessage(tabId, message)) as T;
  } catch {
    throw new Error('Cannot reach this page (no content script — e.g. a chrome:// or store page).');
  }
}

export const TOOLS: ToolDef[] = [
  {
    name: 'list_tabs',
    description: "List the user's open browser tabs (title and URL).",
    parameters: noParams,
    execute: async () => {
      const tabs = await chrome.tabs.query({});
      return JSON.stringify(tabs.map((t) => ({ title: t.title, url: t.url, active: t.active })));
    },
  },
  {
    name: 'read_active_page',
    description: "Read the text content of the user's currently active tab.",
    parameters: noParams,
    execute: async () => {
      const ctx = await toContent<PageContext>({ type: 'getPageContext' });
      return JSON.stringify({
        title: ctx.title,
        url: ctx.url,
        text: ctx.text.slice(0, PAGE_TEXT_CAP),
      });
    },
  },
  {
    name: 'get_page_elements',
    description:
      'List the interactive elements (links, buttons, inputs) on the active page, each with an index to use with click_element / type_text.',
    parameters: noParams,
    execute: async () => {
      const els = await toContent<ElementInfo[]>({ type: 'getInteractiveElements' });
      return JSON.stringify(els.slice(0, MAX_ELEMENTS));
    },
  },
  {
    name: 'click_element',
    description: 'Click an element on the active page by its index from get_page_elements.',
    parameters: {
      type: 'object',
      properties: { index: { type: 'number', description: 'Element index.' } },
      required: ['index'],
      additionalProperties: false,
    },
    write: true,
    execute: async (args) =>
      JSON.stringify(await toContent({ type: 'clickElement', index: Number(args.index) })),
  },
  {
    name: 'type_text',
    description: 'Type text into an input/textarea on the active page by its index.',
    parameters: {
      type: 'object',
      properties: {
        index: { type: 'number', description: 'Element index.' },
        text: { type: 'string', description: 'Text to type.' },
      },
      required: ['index', 'text'],
      additionalProperties: false,
    },
    write: true,
    execute: async (args) =>
      JSON.stringify(
        await toContent({
          type: 'typeText',
          index: Number(args.index),
          text: String(args.text ?? ''),
        }),
      ),
  },
  {
    name: 'scroll_page',
    description: 'Scroll the active page up or down by about one screen.',
    parameters: {
      type: 'object',
      properties: { direction: { type: 'string', enum: ['up', 'down'] } },
      required: ['direction'],
      additionalProperties: false,
    },
    execute: async (args) => {
      const direction = args.direction === 'up' ? 'up' : 'down';
      return JSON.stringify(await toContent({ type: 'scrollPage', direction }));
    },
  },
  {
    name: 'navigate_to',
    description: 'Navigate the active tab to a URL.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Absolute http(s) URL.' } },
      required: ['url'],
      additionalProperties: false,
    },
    write: true,
    execute: async (args) => {
      const url = String(args.url ?? '');
      if (!/^https?:\/\//.test(url)) throw new Error('url must be an absolute http(s) URL.');
      await chrome.tabs.update(await activeTabId(), { url });
      return JSON.stringify({ navigated: url });
    },
  },
  {
    name: 'open_url',
    description: 'Open a URL in a new browser tab.',
    parameters: {
      type: 'object',
      properties: { url: { type: 'string', description: 'Absolute http(s) URL to open.' } },
      required: ['url'],
      additionalProperties: false,
    },
    write: true,
    execute: async (args) => {
      const url = String(args.url ?? '');
      if (!/^https?:\/\//.test(url)) throw new Error('url must be an absolute http(s) URL.');
      await chrome.tabs.create({ url });
      return JSON.stringify({ opened: url });
    },
  },
];

const byName = new Map(TOOLS.map((t) => [t.name, t]));

/** OpenAI tool specs to advertise to the model. */
export function toolSpecs(): ToolSpec[] {
  return TOOLS.map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

/** Whether a tool performs a side effect that should be confirmed by the user. */
export function needsConfirmation(name: string): boolean {
  return byName.get(name)?.write === true;
}

/** Execute a tool by name; always resolves to a string result (errors encoded). */
export async function runTool(name: string, rawArgs: string): Promise<string> {
  const tool = byName.get(name);
  if (!tool) return JSON.stringify({ error: `Unknown tool: ${name}` });
  let args: Record<string, unknown> = {};
  try {
    args = rawArgs ? (JSON.parse(rawArgs) as Record<string, unknown>) : {};
  } catch {
    return JSON.stringify({ error: 'Invalid tool arguments (not JSON).' });
  }
  try {
    return await tool.execute(args);
  } catch (e) {
    return JSON.stringify({ error: String(e) });
  }
}

/**
 * Wrap a tool runner so write tools require confirmation (unless auto-approved).
 * `confirm` resolves true to allow the action, false to decline it.
 */
export function createGuardedRunner(
  run: ToolRunner,
  confirm: (name: string, args: string) => Promise<boolean>,
  autoApprove: boolean,
): ToolRunner {
  return async (name, args) => {
    if (needsConfirmation(name) && !autoApprove) {
      if (!(await confirm(name, args)))
        return JSON.stringify({ error: 'User declined this action.' });
    }
    return run(name, args);
  };
}
