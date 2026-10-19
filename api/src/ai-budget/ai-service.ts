/** Where the Python AI service runs, and the shared token it requires once deployed (unset locally). */
export const aiUrl = (path: string) =>
  `${process.env.AI_URL ?? 'http://127.0.0.1:8000'}${path}`;

export const aiHeaders = (
  extra: Record<string, string> = {},
): Record<string, string> => ({
  ...extra,
  ...(process.env.AI_SERVICE_TOKEN && {
    'X-Service-Token': process.env.AI_SERVICE_TOKEN,
  }),
});
