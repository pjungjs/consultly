import { webUrl } from './web-url.js';

afterEach(() => vi.unstubAllEnvs());

it('ignores a trailing slash in WEB_URL, so links never get "//"', () => {
  vi.stubEnv('WEB_URL', 'https://consultly.example/');
  expect(`${webUrl()}/orders/o1`).toBe('https://consultly.example/orders/o1');
});
