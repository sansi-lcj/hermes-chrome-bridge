import { beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn(async () => ({}));
const sendMessage = vi.fn(async () => [{ index: 0, tag: 'button', name: 'Save' }]);
const group = vi.fn(async () => 99);
const remove = vi.fn(async () => {});
const groupsUpdate = vi.fn(async () => {});
vi.stubGlobal('chrome', {
  tabs: {
    query: vi.fn(async () => [
      { id: 1, title: 'Example', url: 'https://example.com', active: true },
    ]),
    create,
    sendMessage,
    group,
    remove,
  },
  tabGroups: { update: groupsUpdate },
});

const { toolSpecs, runTool, TOOLS, needsConfirmation, createGuardedRunner } =
  await import('./tools');

describe('tools', () => {
  beforeEach(() => {
    create.mockClear();
    sendMessage.mockClear();
  });

  it('advertises function specs for every tool', () => {
    const specs = toolSpecs();
    expect(specs).toHaveLength(TOOLS.length);
    expect(specs.map((s) => s.function.name)).toEqual(
      expect.arrayContaining(['list_tabs', 'get_page_elements', 'click_element', 'type_text']),
    );
  });

  it('list_tabs returns the open tabs with ids', async () => {
    const out = JSON.parse(await runTool('list_tabs', ''));
    expect(out).toEqual([{ id: 1, title: 'Example', url: 'https://example.com', active: true }]);
  });

  it('read_tab reads a specific tab by id', async () => {
    sendMessage.mockResolvedValueOnce({
      title: 'Doc',
      url: 'https://x',
      selection: '',
      text: 'body text',
    } as never);
    const out = JSON.parse(await runTool('read_tab', '{"id":7}'));
    expect(out).toEqual({ title: 'Doc', url: 'https://x', text: 'body text' });
    expect(sendMessage).toHaveBeenCalledWith(7, { type: 'getPageContext' });
  });

  it('read_tab rejects a non-numeric id', async () => {
    expect(JSON.parse(await runTool('read_tab', '{"id":"nope"}')).error).toMatch(/tab id/);
  });

  it('get_page_elements relays the content-script scan', async () => {
    const out = JSON.parse(await runTool('get_page_elements', ''));
    expect(out).toEqual([{ index: 0, tag: 'button', name: 'Save' }]);
    expect(sendMessage).toHaveBeenCalledWith(1, { type: 'getInteractiveElements' });
  });

  it('open_url rejects a non-absolute URL', async () => {
    const out = JSON.parse(await runTool('open_url', '{"url":"not-a-url"}'));
    expect(out.error).toMatch(/absolute http/);
    expect(create).not.toHaveBeenCalled();
  });

  it('group_tabs groups ids and titles the group', async () => {
    const out = JSON.parse(await runTool('group_tabs', '{"ids":[1,2],"title":"Research"}'));
    expect(out).toMatchObject({ grouped: [1, 2], groupId: 99, title: 'Research' });
    expect(group).toHaveBeenCalledWith({ tabIds: [1, 2] });
    expect(groupsUpdate).toHaveBeenCalledWith(99, { title: 'Research' });
  });

  it('group_tabs / close_tabs reject an empty id list', async () => {
    expect(JSON.parse(await runTool('group_tabs', '{"ids":[],"title":"x"}')).error).toMatch(
      /non-empty/,
    );
    expect(JSON.parse(await runTool('close_tabs', '{"ids":[]}')).error).toMatch(/non-empty/);
  });

  it('close_tabs removes the given ids', async () => {
    const out = JSON.parse(await runTool('close_tabs', '{"ids":[3,4]}'));
    expect(out).toEqual({ closed: [3, 4] });
    expect(remove).toHaveBeenCalledWith([3, 4]);
  });

  it('reports an unknown tool and invalid JSON', async () => {
    expect(JSON.parse(await runTool('nope', '')).error).toMatch(/Unknown tool/);
    expect(JSON.parse(await runTool('open_url', '{bad')).error).toMatch(/not JSON/);
  });
});

describe('confirmation gating', () => {
  it('flags write tools, not read tools', () => {
    expect(needsConfirmation('click_element')).toBe(true);
    expect(needsConfirmation('type_text')).toBe(true);
    expect(needsConfirmation('navigate_to')).toBe(true);
    expect(needsConfirmation('open_url')).toBe(true);
    expect(needsConfirmation('group_tabs')).toBe(true);
    expect(needsConfirmation('close_tabs')).toBe(true);
    expect(needsConfirmation('get_page_elements')).toBe(false);
    expect(needsConfirmation('list_tabs')).toBe(false);
    expect(needsConfirmation('read_tab')).toBe(false);
  });

  it('auto-approve runs write tools without confirming', async () => {
    const run = vi.fn(async () => 'ran');
    const confirm = vi.fn(async () => true);
    const guarded = createGuardedRunner(run, confirm, true);
    expect(await guarded('click_element', '{}')).toBe('ran');
    expect(confirm).not.toHaveBeenCalled();
  });

  it('asks before a write tool and runs it when allowed', async () => {
    const run = vi.fn(async () => 'ran');
    const guarded = createGuardedRunner(run, async () => true, false);
    expect(await guarded('click_element', '{"index":1}')).toBe('ran');
    expect(run).toHaveBeenCalled();
  });

  it('declines a write tool when denied, without running it', async () => {
    const run = vi.fn(async () => 'ran');
    const guarded = createGuardedRunner(run, async () => false, false);
    expect(JSON.parse(await guarded('click_element', '{}')).error).toMatch(/declined/);
    expect(run).not.toHaveBeenCalled();
  });

  it('never asks for read tools', async () => {
    const run = vi.fn(async () => 'ran');
    const confirm = vi.fn(async () => false);
    const guarded = createGuardedRunner(run, confirm, false);
    expect(await guarded('get_page_elements', '')).toBe('ran');
    expect(confirm).not.toHaveBeenCalled();
  });
});
