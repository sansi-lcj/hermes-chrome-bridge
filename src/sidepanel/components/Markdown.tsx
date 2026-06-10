import { memo } from 'react';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

marked.setOptions({ gfm: true, breaks: true });

// Open links in a new tab and keep them safe.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/** Wrap each fenced code block with a header bar carrying a Copy button. */
function withCopyButtons(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('pre').forEach((pre) => {
    const wrap = doc.createElement('div');
    wrap.className = 'codeblock';
    const btn = doc.createElement('button');
    btn.type = 'button';
    btn.className = 'md-copy';
    btn.textContent = 'Copy';
    pre.replaceWith(wrap);
    wrap.append(btn, pre);
  });
  return doc.body.innerHTML;
}

function render(text: string): string {
  const raw = marked.parse(text, { async: false }) as string;
  // Sanitize first; the copy-button wrapper is injected afterwards from
  // elements we create ourselves, so it cannot carry untrusted content.
  return withCopyButtons(DOMPurify.sanitize(raw));
}

/** Event delegation: clicks on an injected Copy button copy its code block. */
function onClick(e: React.MouseEvent<HTMLDivElement>): void {
  const btn = (e.target as HTMLElement).closest('.md-copy');
  if (!(btn instanceof HTMLElement)) return;
  const code = btn.parentElement?.querySelector('pre')?.textContent ?? '';
  void navigator.clipboard.writeText(code).then(() => {
    btn.textContent = 'Copied';
    setTimeout(() => {
      btn.textContent = 'Copy';
    }, 1200);
  });
}

/**
 * Renders assistant content as sanitized Markdown. Wrapped in React.memo (an
 * HOC, not a hook) so it only re-parses when the text actually changes.
 */
export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div
      className="markdown"
      onClick={onClick}
      dangerouslySetInnerHTML={{ __html: render(text) }}
    />
  );
});
