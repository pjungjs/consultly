import { EmailService } from './email.service.js';

afterEach(() => vi.unstubAllEnvs());

it("skips demo accounts' made-up addresses instead of failing", async () => {
  vi.stubEnv('RESEND_API_KEY', 're_test');
  await expect(
    new EmailService().send(
      'demo-0123456789ab@consultly.test',
      'Hi',
      'text',
      '<p>html</p>',
    ),
  ).resolves.toBeUndefined();
});
