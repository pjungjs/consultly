import { RateLimiter } from './rate-limiter.js';

describe('RateLimiter', () => {
  it('allows up to the limit per key, then refuses until the window ends', () => {
    const limiter = new RateLimiter(2, 1000);
    expect([
      limiter.allow('a', 0),
      limiter.allow('a', 10),
      limiter.allow('a', 20),
    ]).toEqual([true, true, false]);
    expect(limiter.allow('b', 20)).toBe(true); // other visitors aren't affected
    expect(limiter.allow('a', 1000)).toBe(true); // new window
  });
});
