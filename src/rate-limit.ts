interface RateLimitEntry {
  count: number;
  expiresAt: number;
}

export class RateLimiter {
  private limits = new Map<string, RateLimitEntry>();
  private readonly limit: number;
  private readonly windowMs: number;

  constructor(limit: number = 10, windowMs: number = 60000) {
    this.limit = limit;
    this.windowMs = windowMs;
  }

  /**
   * Checks if a key is rate limited.
   * @returns true if allowed, false if limited
   */
  check(key: string): boolean {
    const now = Date.now();
    const entry = this.limits.get(key);

    if (!entry || now > entry.expiresAt) {
      this.limits.set(key, { count: 1, expiresAt: now + this.windowMs });
      return true;
    }

    if (entry.count >= this.limit) {
      return false;
    }

    entry.count++;
    return true;
  }

  /**
   * Cleans up expired entries to prevent memory leaks.
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.expiresAt) {
        this.limits.delete(key);
      }
    }
  }
}
