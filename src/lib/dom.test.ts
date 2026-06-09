// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { collectInteractive, labelFor } from './dom';

const visible = () => true; // jsdom has no layout

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
}

describe('collectInteractive', () => {
  it('indexes interactive elements in document order', () => {
    const doc = parse(`
      <a href="/x">Home</a>
      <button>Save</button>
      <input type="text" placeholder="Email" />
      <span>not interactive</span>
      <div role="button">Custom</div>
    `);
    const items = collectInteractive(doc, visible);
    expect(items.map((i) => i.info.index)).toEqual([0, 1, 2, 3]);
    expect(items.map((i) => i.info.name)).toEqual(['Home', 'Save', 'Email', 'Custom']);
    expect(items.map((i) => i.info.tag)).toEqual(['a', 'button', 'input', 'div']);
  });

  it('skips disabled and aria-hidden elements', () => {
    const doc = parse(`
      <button disabled>Nope</button>
      <button aria-hidden="true">Hidden</button>
      <button>Yes</button>
    `);
    const items = collectInteractive(doc, (el) =>
      el.getAttribute('aria-hidden') === 'true' || (el as HTMLButtonElement).disabled
        ? false
        : true,
    );
    expect(items.map((i) => i.info.name)).toEqual(['Yes']);
  });

  it('prefers aria-label for the name', () => {
    const doc = parse(`<button aria-label="Close dialog"><svg></svg></button>`);
    expect(labelFor(doc.querySelector('button')!)).toBe('Close dialog');
  });
});
