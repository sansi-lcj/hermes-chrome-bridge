// Export a conversation to Markdown or JSON, and trigger a browser download
// without the `downloads` permission (an anchor + object URL).

import type { ConversationMeta, StoredMessage } from './conversation';

const ROLE_LABEL: Record<string, string> = {
  user: 'You',
  assistant: 'Assistant',
  system: 'System',
  tool: 'Tool',
};

/** Render a conversation as Markdown (title heading + role-labelled turns). */
export function toMarkdown(meta: ConversationMeta | undefined, messages: StoredMessage[]): string {
  const lines: string[] = [];
  lines.push(`# ${meta?.title || 'Conversation'}`);
  if (meta?.system) lines.push(`\n> **System:** ${meta.system}`);
  for (const m of messages) {
    if (!m.content) continue;
    lines.push(`\n## ${ROLE_LABEL[m.role] ?? m.role}\n`);
    lines.push(m.content);
  }
  return lines.join('\n') + '\n';
}

/** Render a conversation as pretty JSON (metadata + messages). */
export function toJson(meta: ConversationMeta | undefined, messages: StoredMessage[]): string {
  return JSON.stringify({ meta, messages }, null, 2);
}

/** Safe-ish filename stem from a title. */
export function fileStem(title: string | undefined): string {
  const base = (title || 'conversation').replace(/[^\w-]+/g, '-').replace(/^-+|-+$/g, '');
  return base.slice(0, 60) || 'conversation';
}

/** Trigger a client-side download of `content`. Returns the object URL used. */
export function downloadText(filename: string, content: string, mime: string): string {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so the download has a chance to start.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return url;
}
