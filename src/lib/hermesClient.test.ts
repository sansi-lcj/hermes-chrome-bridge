import { describe, expect, it } from 'vitest';
import { createSseDecoder, unwrapList } from './hermesClient';

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
