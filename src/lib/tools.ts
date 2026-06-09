// Browser tools the Hermes Agent can call. Each tool advertises an OpenAI
// "function" spec and executes via Chrome APIs in the background worker, then
// returns a JSON string as the tool result. Only already-granted permissions
// are used (tabs, activeTab/scripting), so enabling tools needs no new prompts.

import type { PageContext, ToolSpec } from './types';

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<string>;
}

const noParams = { type: 'object', properties: {}, additionalProperties: false };

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
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id == null) throw new Error('No active tab.');
      const ctx = (await chrome.tabs.sendMessage(tab.id, {
        type: 'getPageContext',
      })) as PageContext;
      return JSON.stringify({ title: ctx.title, url: ctx.url, text: ctx.text.slice(0, 4000) });
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
