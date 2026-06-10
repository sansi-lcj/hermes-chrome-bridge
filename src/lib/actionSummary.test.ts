import { describe, expect, it } from 'vitest';
import { actionSummary } from './actionSummary';

describe('actionSummary', () => {
  it('describes URL actions', () => {
    expect(actionSummary('open_url', '{"url":"https://x.com"}')).toBe('Open https://x.com');
    expect(actionSummary('navigate_to', '{"url":"https://y.com"}')).toBe('Go to https://y.com');
  });

  it('describes element actions', () => {
    expect(actionSummary('click_element', '{"index":7}')).toBe('Click element #7');
    expect(actionSummary('type_text', '{"index":2,"text":"hello"}')).toBe(
      'Type “hello” into element #2',
    );
    expect(actionSummary('scroll_page', '{"direction":"up"}')).toBe('Scroll up');
  });

  it('truncates long typed text', () => {
    const long = 'x'.repeat(60);
    expect(
      actionSummary('type_text', JSON.stringify({ index: 1, text: long })).length,
    ).toBeLessThan(70);
  });

  it('falls back gracefully for unknown tools and bad JSON', () => {
    expect(actionSummary('mystery', '{"a":1}')).toBe('mystery {"a":1}');
    expect(actionSummary('list_tabs', '')).toBe('list_tabs');
    expect(actionSummary('open_url', '{bad json')).toBe('Open (a new tab)');
  });
});
