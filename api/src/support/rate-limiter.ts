/** Fixed-window counter per key, kept in memory. Enough for one server; use Redis (or similar) once there are several. */
export class RateLimiter {
  private readonly windows = new Map<
    string,
    { start: number; count: number }
  >();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  allow(key: string, now = Date.now()): boolean {
    const w = this.windows.get(key);
    if (!w || now - w.start >= this.windowMs) {
      this.windows.set(key, { start: now, count: 1 });
      if (this.windows.size > 10_000) this.prune(now);
      return true;
    }
    w.count += 1;
    return w.count <= this.limit;
  }

  private prune(now: number) {
    for (const [key, w] of this.windows)
      if (now - w.start >= this.windowMs) this.windows.delete(key);
  }
}
