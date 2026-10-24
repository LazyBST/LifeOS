import { describe, expect, it } from 'vitest';
import { googleRedirectUri } from '@/lib/google/auth';

describe('Google redirect address', () => {
  it('is built from the address you are on, with no doubled or trailing slash', () => {
    expect(googleRedirectUri('https://lifeos-omega-murex.vercel.app')).toBe('https://lifeos-omega-murex.vercel.app/api/google/callback');
    expect(googleRedirectUri('https://lifeos-omega-murex.vercel.app/')).toBe('https://lifeos-omega-murex.vercel.app/api/google/callback');
    expect(googleRedirectUri('http://localhost:3000///')).toBe('http://localhost:3000/api/google/callback');
  });
});
