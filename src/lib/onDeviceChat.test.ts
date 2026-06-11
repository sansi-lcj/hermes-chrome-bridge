import { describe, expect, it, vi } from 'vitest';

// Drive runOnDevice against a controllable async stream.
let pending: { push: (s: string) => void; end: () => void; fail: (e: unknown) => void } | null =
  null;
function makeStream(): AsyncIterable<string> {
  const queue: string[] = [];
  let done = false;
  let error: unknown;
  let wake: (() => void) | null = null;
  const bump = () => wake?.();
  pending = {
    push: (s) => {
      queue.push(s);
      bump();
    },
    end: () => {
      done = true;
      bump();
    },
    fail: (e) => {
      error = e;
      done = true;
      bump();
    },
  };
  return {
    async *[Symbol.asyncIterator]() {
      for (;;) {
        while (queue.length === 0 && !done) await new Promise<void>((r) => (wake = r));
        while (queue.length > 0) yield queue.shift()!;
        if (error) throw error;
        if (done) return;
      }
    },
  };
}

vi.mock('./builtinAI', () => ({
  onDeviceAvailable: vi.fn(),
  onDevicePromptStream: () => makeStream(),
}));

const { buildPrompt, runOnDevice, cancelOnDevice } = await import('./onDeviceChat');
import type { StoredMessage } from './conversation';

describe('buildPrompt', () => {
  it('joins non-empty turns and prepends the system line', () => {
    const msgs: StoredMessage[] = [
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '' }, // empty placeholder dropped
      { role: 'assistant', content: 'yo' },
    ];
    expect(buildPrompt(msgs, ' Be terse. ')).toBe('system: Be terse.\nuser: hi\nassistant: yo');
    expect(buildPrompt(msgs, '')).toBe('user: hi\nassistant: yo');
  });
});

describe('runOnDevice', () => {
  it('streams chunks, then calls onDone once', async () => {
    const chunks: string[] = [];
    const onDone = vi.fn();
    const run = runOnDevice('p', (c) => chunks.push(c), vi.fn(), onDone);
    pending!.push('a');
    pending!.push('b');
    pending!.end();
    await run;
    expect(chunks).toEqual(['a', 'b']);
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('stops emitting and skips onDone once superseded', async () => {
    const chunks: string[] = [];
    const onDone = vi.fn();
    const run = runOnDevice(
      'p',
      (c) => {
        chunks.push(c);
        if (c === 'a') cancelOnDevice(); // Stop pressed / a newer run started
      },
      vi.fn(),
      onDone,
    );
    pending!.push('a');
    pending!.push('b'); // arrives after the supersede → ignored
    pending!.end();
    await run;
    expect(chunks).toEqual(['a']);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('reports a thrown error via onError', async () => {
    const onError = vi.fn();
    const run = runOnDevice('p', vi.fn(), onError, vi.fn());
    pending!.fail(new Error('boom'));
    await run;
    expect(onError).toHaveBeenCalledWith('Error: boom');
  });
});
