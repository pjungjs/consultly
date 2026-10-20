/** The website's address, for links in emails and Stripe's return pages. A trailing "/" in the setting is ignored. */
export const webUrl = () =>
  (process.env.WEB_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
