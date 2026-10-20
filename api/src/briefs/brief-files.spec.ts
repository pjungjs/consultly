import { supabaseHeaders } from './brief-files.js';

describe('supabaseHeaders', () => {
  it('sends a legacy service_role key (a JWT) as apikey and Bearer token', () => {
    expect(supabaseHeaders('eyJhbGciOi.legacy')).toEqual({
      apikey: 'eyJhbGciOi.legacy',
      Authorization: 'Bearer eyJhbGciOi.legacy',
    });
  });

  it('sends a new secret key as apikey only, since it is not a JWT', () => {
    expect(supabaseHeaders('sb_secret_abc')).toEqual({
      apikey: 'sb_secret_abc',
    });
  });
});
