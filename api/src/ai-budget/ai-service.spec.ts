import { callAi } from './ai-service.js';

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number) => ({ status, ok: status < 400 });

describe('callAi', () => {
  it('waits for a waking AI service, then tries once more', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply(503)) // the host is starting the service
      .mockResolvedValueOnce(reply(200)) // /health: answered once it's up
      .mockResolvedValueOnce(reply(200)); // the retry
    vi.stubGlobal('fetch', fetch);
    const res = await callAi('/support/chat', { method: 'POST' });
    expect(res.status).toBe(200);
    expect(fetch.mock.calls.map((c) => String(c[0]).split('/').pop())).toEqual([
      'chat',
      'health',
      'chat',
    ]);
  });

  it("doesn't retry real answers, including the service's own errors", async () => {
    const fetch = vi.fn().mockResolvedValue(reply(500));
    vi.stubGlobal('fetch', fetch);
    expect((await callAi('/support/chat')).status).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
