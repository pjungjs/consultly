/** Where the Python AI service runs, and the shared token it requires once deployed (unset locally). */
export const aiUrl = (path: string) =>
  `${(process.env.AI_URL ?? 'http://127.0.0.1:8000').replace(/\/+$/, '')}${path}`;

export const aiHeaders = (
  extra: Record<string, string> = {},
): Record<string, string> => ({
  ...extra,
  ...(process.env.AI_SERVICE_TOKEN && {
    'X-Service-Token': process.env.AI_SERVICE_TOKEN,
  }),
});

/**
 * Calls the AI service. On the free plan it sleeps when idle; while it starts, the host may answer 502-504 at
 * once instead of waiting. Then this waits for /health (the host holds that request until the service is up,
 * about 40 seconds) and tries once more.
 */
export async function callAi(path: string, init: RequestInit = {}) {
  const send = () =>
    fetch(aiUrl(path), {
      ...init,
      headers: aiHeaders(init.headers as Record<string, string>),
      signal: AbortSignal.timeout(90_000),
    });
  const res = await send();
  if (!(res.status >= 502 && res.status <= 504)) return res;
  await fetch(aiUrl('/health'), { signal: AbortSignal.timeout(90_000) }).catch(
    () => {},
  );
  return send();
}
