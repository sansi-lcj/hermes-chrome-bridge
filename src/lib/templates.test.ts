import { describe, expect, it } from 'vitest';
import {
  matchTemplates,
  needsClipboard,
  needsPageContext,
  renderTemplate,
  usedVars,
  varsFromContext,
  type PromptTemplate,
} from './templates';

describe('template variables', () => {
  it('detects referenced variables', () => {
    expect([...usedVars('{{selection}} and {{ url }}')]).toEqual(['selection', 'url']);
    expect(needsPageContext('hi {{page}}')).toBe(true);
    expect(needsPageContext('hi {{input}}')).toBe(false);
    expect(needsClipboard('{{clipboard}}')).toBe(true);
  });

  it('renders, collapsing unknown/missing vars to empty', () => {
    expect(renderTemplate('Q: {{input}} / {{url}}', { input: 'hi', url: 'http://x' })).toBe(
      'Q: hi / http://x',
    );
    expect(renderTemplate('{{nope}}{{selection}}', { selection: 'sel' })).toBe('sel');
  });

  it('maps a page context (or null) into vars', () => {
    const ctx = { url: 'http://x', title: 'T', selection: 'sel', text: 'body' };
    expect(varsFromContext(ctx, 'in')).toEqual({
      selection: 'sel',
      page: 'body',
      url: 'http://x',
      title: 'T',
      input: 'in',
    });
    expect(varsFromContext(null, 'in')).toMatchObject({ selection: '', page: '', input: 'in' });
  });
});

describe('matchTemplates', () => {
  const tpls: PromptTemplate[] = [
    { id: '1', name: 'summarize', description: '', body: '' },
    { id: '2', name: 'sum-up', description: '', body: '' },
    { id: '3', name: 'translate', description: '', body: '' },
  ];
  it('matches by name prefix, ignoring a leading slash', () => {
    expect(matchTemplates(tpls, '/sum').map((t) => t.name)).toEqual(['summarize', 'sum-up']);
    expect(matchTemplates(tpls, '/').map((t) => t.name)).toHaveLength(3);
    expect(matchTemplates(tpls, '/tr').map((t) => t.name)).toEqual(['translate']);
    expect(matchTemplates(tpls, '/zzz')).toEqual([]);
  });
});
