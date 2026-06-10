// Broker for write-tool confirmations between the tool loop and the panel UI.
// Pure and dependency-injected (no chrome.*), so every path — approve, deny,
// timeout, stream abort, panel close — is unit-testable.

export interface ConfirmRequestMsg {
  confirmId: string;
  tool: string;
  args: string;
}

export class ConfirmBroker {
  private pending = new Map<string, (approved: boolean) => void>();
  private counter = 0;

  constructor(private timeoutMs = 120_000) {}

  /** Number of outstanding prompts (for tests/diagnostics). */
  get size(): number {
    return this.pending.size;
  }

  /**
   * Ask for approval via `post`. Resolves false on deny, timeout, abort, or
   * flush — it can never park the caller indefinitely.
   */
  request(
    post: (msg: ConfirmRequestMsg) => void,
    tool: string,
    args: string,
    signal: AbortSignal,
  ): Promise<boolean> {
    if (signal.aborted) return Promise.resolve(false);
    const confirmId = `cf-${Date.now()}-${this.counter++}`;
    return new Promise((resolve) => {
      const done = (approved: boolean) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', onAbort);
        this.pending.delete(confirmId);
        resolve(approved);
      };
      const onAbort = () => done(false);
      const timer = setTimeout(() => done(false), this.timeoutMs);
      signal.addEventListener('abort', onAbort);
      this.pending.set(confirmId, done);
      post({ confirmId, tool, args });
    });
  }

  /** Deliver the user's answer. Unknown/late ids are ignored safely. */
  resolve(confirmId: string, approved: boolean): void {
    this.pending.get(confirmId)?.(approved);
  }

  /** Deny everything outstanding (e.g. the panel closed). */
  flush(): void {
    for (const done of [...this.pending.values()]) done(false);
  }
}
