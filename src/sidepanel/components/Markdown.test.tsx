// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  it('renders GFM formatting as sanitized HTML', () => {
    const { container } = render(
      <Markdown text={'**bold** and `code` and a [link](https://example.com)'} />,
    );
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('code')?.textContent).toBe('code');
    const a = container.querySelector('a');
    expect(a?.getAttribute('href')).toBe('https://example.com');
    expect(a?.getAttribute('target')).toBe('_blank');
    expect(a?.getAttribute('rel')).toContain('noopener');
  });

  it('strips dangerous markup (XSS)', () => {
    const { container } = render(<Markdown text={'<img src=x onerror="alert(1)">hi'} />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('onerror')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('renders fenced code blocks', () => {
    const { container } = render(<Markdown text={'```\nconst x = 1;\n```'} />);
    expect(container.querySelector('pre code')?.textContent).toContain('const x = 1;');
  });
});
