import { describe, expect, it } from 'vitest';
import { originPattern } from './url';

describe('originPattern', () => {
  it('builds a match pattern for http with a port', () => {
    expect(originPattern('http://127.0.0.1:8642')).toBe('http://127.0.0.1:8642/*');
  });
  it('builds a match pattern for https', () => {
    expect(originPattern('https://hermes.example.com')).toBe('https://hermes.example.com/*');
  });
  it('ignores the path/query of the input URL', () => {
    expect(originPattern('https://h.example.com/v1/chat?x=1')).toBe('https://h.example.com/*');
  });
  it('rejects non-http(s) schemes', () => {
    expect(originPattern('ftp://example.com')).toBeNull();
    expect(originPattern('file:///etc')).toBeNull();
  });
  it('rejects invalid URLs', () => {
    expect(originPattern('not a url')).toBeNull();
    expect(originPattern('')).toBeNull();
  });
});
