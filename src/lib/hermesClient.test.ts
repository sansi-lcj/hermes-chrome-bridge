import { describe, expect, it, vi } from 'vitest';
import { createSseDecoder, HermesError, isTransient, unwrapList, withRetry } from './hermesClient';

const noSleep = () => Promise.resolve();

describe('createSseDecoder', () => {
  it('parses a simple data frame', () => {
    const d = createSseDecoder();
    expect(d.push('data: hello\n\n')).toEqual([{ event: undefined, data: 'hello' }]);
  });

  it('handles chunk boundaries splitting a line', () => {
    const d = createSseDecoder();
    expect(d.push('data: hel')).toEqual([]);
    expect(d.push('lo\n\n')).toEqual([{ event: undefined, data: 'hello' }]);
  });

  it('captures named events', () => {
    const d = createSseDecoder();
    const frames = d.push('event: hermes.tool.progress\ndata: {"name":"web"}\n\n');
    expect(frames).toEqual([{ event: 'hermes.tool.progress', data: '{"name":"web"}' }]);
  });

  it('joins multi-line data fields', () => {
    const d = createSseDecoder();
    const frames = d.push('data: line1\ndata: line2\n\n');
    expect(frames).toEqual([{ event: undefined, data: 'line1\nline2' }]);
  });

  it('ignores comments/heartbeats', () => {
    const d = createSseDecoder();
    expect(d.push(': keep-alive\n\n')).toEqual([]);
  });

  it('tolerates CRLF line endings', () => {
    const d = createSseDecoder();
    expect(d.push('data: hi\r\n\r\n')).toEqual([{ event: undefined, data: 'hi' }]);
  });

  it('emits multiple frames across one push', () => {
    const d = createSseDecoder();
    const frames = d.push('data: a\n\ndata: b\n\n');
    expect(frames.map((f) => f.data)).toEqual(['a', 'b']);
  });

  it('flushes a trailing frame without a terminating blank line', () => {
    const d = createSseDecoder();
    expect(d.push('data: [DONE]')).toEqual([]);
    expect(d.flush()).toEqual([{ event: undefined, data: '[DONE]' }]);
  });
});

describe('unwrapList', () => {
  it('returns arrays as-is', () => {
    expect(unwrapList([1, 2, 3])).toEqual([1, 2, 3]);
  });
  it('unwraps a { data } envelope', () => {
    expect(unwrapList({ data: ['a'] })).toEqual(['a']);
  });
  it('unwraps an { items } envelope', () => {
    expect(unwrapList({ items: ['b'] })).toEqual(['b']);
  });
  it('falls back to [] for unexpected shapes', () => {
    expect(unwrapList(null)).toEqual([]);
    expect(unwrapList({ nope: 1 })).toEqual([]);
    expect(unwrapList('string')).toEqual([]);
  });
});

describe('isTransient', () => {
  it('treats network errors (no status) as transient', () => {
    expect(isTransient(new HermesError('network'))).toBe(true);
  });
  it('treats 429/5xx as transient', () => {
    expect(isTransient(new HermesError('busy', 429))).toBe(true);
    expect(isTransient(new HermesError('down', 503))).toBe(true);
  });
  it('treats 4xx (except 429) and non-Hermes errors as permanent', () => {
    expect(isTransient(new HermesError('auth', 401))).toBe(false);
    expect(isTransient(new HermesError('missing', 404))).toBe(false);
    expect(isTransient(new Error('other'))).toBe(false);
  });
});

describe('withRetry', () => {
  it('returns the first success without retrying', async () => {
    const fn = vi.fn(async () => 'ok');
    expect(await withRetry(fn, { sleep: noSleep })).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries transient failures then succeeds', async () => {
    let n = 0;
    const fn = vi.fn(async () => {
      if (n++ < 2) throw new HermesError('busy', 503);
      return 'done';
    });
    const out = await withRetry(fn, { sleep: noSleep, retryable: isTransient });
    expect(out).toBe('done');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not retry a non-retryable error', async () => {
    const fn = vi.fn(async () => {
      throw new HermesError('auth', 401);
    });
    await expect(withRetry(fn, { sleep: noSleep, retryable: isTransient })).rejects.toThrow('auth');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('gives up after the configured attempts', async () => {
    const fn = vi.fn(async () => {
      throw new HermesError('busy', 503);
    });
    await expect(
      withRetry(fn, { attempts: 2, sleep: noSleep, retryable: isTransient }),
    ).rejects.toThrow('busy');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
