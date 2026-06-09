import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn(async () => ({}));
vi.stubGlobal('chrome', {
  tabs: {
    query: vi.fn(async () => [{ title: 'Example', url: 'https://example.com', active: true }]),
    create,
  },
});

const { toolSpecs, runTool, TOOLS } = await import('./tools');

describe('tools', () => {
  beforeEach(() => create.mockClear());

  it('advertises function specs for every tool', () => {
    const specs = toolSpecs();
    expect(specs).toHaveLength(TOOLS.length);
    expect(specs.every((s) => s.type === 'function' && s.function.name)).toBe(true);
    expect(specs.map((s) => s.function.name)).toContain('list_tabs');
  });

  it('list_tabs returns the open tabs', async () => {
    const out = JSON.parse(await runTool('list_tabs', ''));
    expect(out).toEqual([{ title: 'Example', url: 'https://example.com', active: true }]);
  });

  it('open_url opens an absolute URL', async () => {
    const out = JSON.parse(await runTool('open_url', '{"url":"https://x.com"}'));
    expect(out).toEqual({ opened: 'https://x.com' });
    expect(create).toHaveBeenCalledWith({ url: 'https://x.com' });
  });

  it('open_url rejects a non-absolute URL', async () => {
    const out = JSON.parse(await runTool('open_url', '{"url":"not-a-url"}'));
    expect(out.error).toMatch(/absolute http/);
    expect(create).not.toHaveBeenCalled();
  });

  it('reports an unknown tool', async () => {
    expect(JSON.parse(await runTool('nope', '')).error).toMatch(/Unknown tool/);
  });

  it('reports invalid JSON arguments', async () => {
    expect(JSON.parse(await runTool('open_url', '{bad')).error).toMatch(/not JSON/);
  });
});
