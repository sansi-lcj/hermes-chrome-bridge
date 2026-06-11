// User-defined prompt templates ("quick commands"), invoked from the composer
// with a leading "/". A template body can interpolate runtime variables:
//   {{selection}} — the active page's selected text
//   {{page}}      — the active page's readable text
//   {{url}}       — the active page's URL
//   {{title}}     — the active page's title
//   {{clipboard}} — the system clipboard text
//   {{input}}     — whatever the user typed after the command name
//
// Templates are stored per-install (shared across accounts) in
// chrome.storage.local under `promptTemplates`.

import { makeId, saveCollection } from './collection';
import type { PageContext } from './types';

export interface PromptTemplate {
  id: string;
  /** Short slash name, e.g. "summarize" → typed as "/summarize". */
  name: string;
  /** Human description shown in the command menu. */
  description: string;
  /** Body with optional {{variables}}. */
  body: string;
}

const KEY = 'promptTemplates';

export const newTemplateId = (): string => makeId('tpl');

/** Variables a template can interpolate; missing ones expand to ''. */
export interface TemplateVars {
  selection?: string;
  page?: string;
  url?: string;
  title?: string;
  clipboard?: string;
  input?: string;
}

/** Which variables a body references (so callers only fetch what's needed). */
export function usedVars(body: string): Set<keyof TemplateVars> {
  const out = new Set<keyof TemplateVars>();
  for (const m of body.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) {
    out.add(m[1] as keyof TemplateVars);
  }
  return out;
}

export function needsPageContext(body: string): boolean {
  const v = usedVars(body);
  return v.has('selection') || v.has('page') || v.has('url') || v.has('title');
}

export function needsClipboard(body: string): boolean {
  return usedVars(body).has('clipboard');
}

/** Interpolate a template body. Unknown variables collapse to ''. */
export function renderTemplate(body: string, vars: TemplateVars): string {
  return body.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name: string) => {
    const v = vars[name as keyof TemplateVars];
    return v == null ? '' : v;
  });
}

/** Map an optional PageContext into template vars. */
export function varsFromContext(ctx: PageContext | null, input: string): TemplateVars {
  return {
    selection: ctx?.selection ?? '',
    page: ctx?.text ?? '',
    url: ctx?.url ?? '',
    title: ctx?.title ?? '',
    input,
  };
}

const STARTER_TEMPLATES: PromptTemplate[] = [
  {
    id: 'tpl-starter-summarize',
    name: 'summarize',
    description: 'Summarize the current page',
    body: 'Summarize this page concisely:\n\nTitle: {{title}}\nURL: {{url}}\n\n{{page}}',
  },
  {
    id: 'tpl-starter-explain',
    name: 'explain',
    description: 'Explain the selected text',
    body: 'Explain the following clearly:\n\n"""\n{{selection}}\n"""',
  },
  {
    id: 'tpl-starter-translate',
    name: 'translate',
    description: 'Translate the selection to English',
    body: 'Translate to English:\n\n"""\n{{selection}}\n"""',
  },
];

export async function loadTemplates(): Promise<PromptTemplate[]> {
  // Note: unlike the generic collection loader, this distinguishes "key absent"
  // (first run → seed starters) from "key present but empty" (user cleared them).
  const res = await chrome.storage.local.get(KEY);
  const stored = res[KEY] as PromptTemplate[] | undefined;
  if (Array.isArray(stored)) return stored;
  await saveTemplates(STARTER_TEMPLATES);
  return STARTER_TEMPLATES;
}

export const saveTemplates = (templates: PromptTemplate[]): Promise<void> =>
  saveCollection(KEY, templates);

/** Find templates whose name starts with the (slash-stripped) query. */
export function matchTemplates(templates: PromptTemplate[], query: string): PromptTemplate[] {
  const q = query.replace(/^\//, '').toLowerCase();
  return templates.filter((t) => t.name.toLowerCase().startsWith(q));
}
