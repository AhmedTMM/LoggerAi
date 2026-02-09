import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { rateLimit } from '@/lib/rate-limit';

describe('rateLimit', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null (allowed) for the first request', () => {
    const result = rateLimit('user-first-request', { maxRequests: 5, windowSeconds: 60 });
    expect(result).toBeNull();
  });

  it('returns null for requests within the limit', () => {
    const id = 'user-within-limit';
    const options = { maxRequests: 3, windowSeconds: 60 };

    expect(rateLimit(id, options)).toBeNull(); // 1st
    expect(rateLimit(id, options)).toBeNull(); // 2nd
    expect(rateLimit(id, options)).toBeNull(); // 3rd (at limit, count === maxRequests)
  });

  it('returns a 429 response when exceeding maxRequests', () => {
    const id = 'user-exceed-limit';
    const options = { maxRequests: 2, windowSeconds: 60 };

    expect(rateLimit(id, options)).toBeNull(); // 1st
    expect(rateLimit(id, options)).toBeNull(); // 2nd (at limit)

    const result = rateLimit(id, options); // 3rd (exceeds limit)
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it('includes correct headers on 429 response', async () => {
    const id = 'user-headers-check';
    const options = { maxRequests: 1, windowSeconds: 120 };

    rateLimit(id, options); // 1st (allowed)
    const result = rateLimit(id, options); // 2nd (blocked)

    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
    expect(result!.headers.get('X-RateLimit-Limit')).toBe('1');
    expect(result!.headers.get('X-RateLimit-Remaining')).toBe('0');
    expect(result!.headers.get('Retry-After')).toBeTruthy();
    expect(result!.headers.get('X-RateLimit-Reset')).toBeTruthy();

    // Verify JSON body
    const body = await result!.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('Too many requests');
  });

  it('tracks different identifiers independently', () => {
    const options = { maxRequests: 1, windowSeconds: 60 };

    expect(rateLimit('user-A', options)).toBeNull(); // user-A 1st
    expect(rateLimit('user-B', options)).toBeNull(); // user-B 1st

    // user-A is now over limit
    const resultA = rateLimit('user-A', options);
    expect(resultA).not.toBeNull();
    expect(resultA!.status).toBe(429);

    // user-B is now over limit too
    const resultB = rateLimit('user-B', options);
    expect(resultB).not.toBeNull();
    expect(resultB!.status).toBe(429);
  });

  it('resets the counter after the window expires', () => {
    const id = 'user-window-reset';
    const options = { maxRequests: 1, windowSeconds: 10 };

    // First request allowed
    expect(rateLimit(id, options)).toBeNull();

    // Second request blocked
    const blocked = rateLimit(id, options);
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);

    // Advance time past the window (10 seconds + 1ms)
    vi.advanceTimersByTime(10 * 1000 + 1);

    // After window expires, a new request should be allowed
    const afterReset = rateLimit(id, options);
    expect(afterReset).toBeNull();
  });

  it('counts exactly at the boundary: maxRequests requests allowed, maxRequests+1 blocked', () => {
    const id = 'user-boundary';
    const options = { maxRequests: 5, windowSeconds: 60 };

    for (let i = 0; i < 5; i++) {
      expect(rateLimit(id, options)).toBeNull();
    }

    // The 6th request should be blocked
    const result = rateLimit(id, options);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(429);
  });

  it('returns 429 for all requests after exceeding the limit within the window', () => {
    const id = 'user-all-blocked';
    const options = { maxRequests: 1, windowSeconds: 60 };

    rateLimit(id, options); // 1st allowed

    // Multiple subsequent requests are all blocked
    for (let i = 0; i < 5; i++) {
      const result = rateLimit(id, options);
      expect(result).not.toBeNull();
      expect(result!.status).toBe(429);
    }
  });

  it('Retry-After header reflects remaining time in window', async () => {
    const id = 'user-retry-after';
    const options = { maxRequests: 1, windowSeconds: 30 };

    rateLimit(id, options); // 1st allowed

    // Advance 10 seconds into the 30-second window
    vi.advanceTimersByTime(10 * 1000);

    const result = rateLimit(id, options); // blocked
    expect(result).not.toBeNull();

    const retryAfter = parseInt(result!.headers.get('Retry-After')!, 10);
    // Should be approximately 20 seconds remaining (30 - 10)
    expect(retryAfter).toBeGreaterThanOrEqual(19);
    expect(retryAfter).toBeLessThanOrEqual(21);
  });
});
