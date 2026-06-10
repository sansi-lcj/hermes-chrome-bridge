import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfirmBroker, type ConfirmRequestMsg } from './confirmBroker';

describe('ConfirmBroker', () => {
  let broker: ConfirmBroker;
  let posted: ConfirmRequestMsg[];
  const post = (msg: ConfirmRequestMsg) => posted.push(msg);

  beforeEach(() => {
    vi.useFakeTimers();
    broker = new ConfirmBroker(1000);
    posted = [];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves true when the user approves', async () => {
    const p = broker.request(post, 'open_url', '{}', new AbortController().signal);
    expect(posted).toHaveLength(1);
    broker.resolve(posted[0].confirmId, true);
    await expect(p).resolves.toBe(true);
    expect(broker.size).toBe(0);
  });

  it('resolves false when the user denies', async () => {
    const p = broker.request(post, 'click_element', '{"index":1}', new AbortController().signal);
    broker.resolve(posted[0].confirmId, false);
    await expect(p).resolves.toBe(false);
  });

  it('times out to false instead of parking forever', async () => {
    const p = broker.request(post, 'open_url', '{}', new AbortController().signal);
    vi.advanceTimersByTime(1001);
    await expect(p).resolves.toBe(false);
    expect(broker.size).toBe(0);
  });

  it('resolves false when the stream is aborted (Stop)', async () => {
    const ac = new AbortController();
    const p = broker.request(post, 'open_url', '{}', ac.signal);
    ac.abort();
    await expect(p).resolves.toBe(false);
  });

  it('short-circuits when already aborted', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(broker.request(post, 'open_url', '{}', ac.signal)).resolves.toBe(false);
    expect(posted).toHaveLength(0);
  });

  it('flush denies everything outstanding (panel closed)', async () => {
    const p1 = broker.request(post, 'a', '{}', new AbortController().signal);
    const p2 = broker.request(post, 'b', '{}', new AbortController().signal);
    expect(broker.size).toBe(2);
    broker.flush();
    await expect(p1).resolves.toBe(false);
    await expect(p2).resolves.toBe(false);
    expect(broker.size).toBe(0);
  });

  it('ignores late or unknown answers safely', async () => {
    const p = broker.request(post, 'open_url', '{}', new AbortController().signal);
    broker.resolve('nope', true); // unknown id — no effect
    broker.resolve(posted[0].confirmId, true);
    broker.resolve(posted[0].confirmId, false); // late duplicate — no effect
    await expect(p).resolves.toBe(true);
  });
});
