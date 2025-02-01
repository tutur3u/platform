type RateLimitConfig = {
  maxRequests: number;
  timeWindow: number; // in milliseconds
};

class RateLimiter {
  private static instance: RateLimiter;
  private requestTimestamps: { [key: string]: number[] } = {};
  private config: { [key: string]: RateLimitConfig } = {
    default: {
      maxRequests: 10,
      timeWindow: 1000, // 1 second
    },
    external: {
      maxRequests: 5,
      timeWindow: 1000, // 1 second
    },
    internal: {
      maxRequests: 10,
      timeWindow: 1000, // 1 second
    },
  };

  private constructor() {}

  public static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  public setConfig(key: string, config: RateLimitConfig): void {
    this.config[key] = config;
  }

  public async checkRateLimit(key: string = 'default'): Promise<boolean> {
    const config = this.config[key] || this.config.default;
    const now = Date.now();

    // Initialize timestamps array if not exists
    if (!this.requestTimestamps[key]) {
      this.requestTimestamps[key] = [];
    }

    // Remove old timestamps
    this.requestTimestamps[key] = this.requestTimestamps[key].filter(
      (timestamp) => now - timestamp < (config?.timeWindow || 0)
    );

    // Check if rate limit is exceeded
    if (this.requestTimestamps[key].length >= (config?.maxRequests || 0)) {
      const oldestTimestamp = this.requestTimestamps[key][0] || 0;
      const waitTime = (config?.timeWindow || 0) - (now - oldestTimestamp);

      if (waitTime > 0) {
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        return this.checkRateLimit(key);
      }
    }

    // Add new timestamp
    this.requestTimestamps[key].push(now);
    return true;
  }

  public getRemainingRequests(key: string = 'default'): number {
    const config = this.config[key] || this.config.default;
    const now = Date.now();

    // Initialize timestamps array if not exists
    if (!this.requestTimestamps[key]) {
      this.requestTimestamps[key] = [];
    }

    // Remove old timestamps
    this.requestTimestamps[key] = this.requestTimestamps[key].filter(
      (timestamp) => now - timestamp < (config?.timeWindow || 0)
    );

    return Math.max(
      0,
      (config?.maxRequests || 0) - this.requestTimestamps[key].length
    );
  }

  public getResetTime(key: string = 'default'): number {
    const config = this.config[key] || this.config.default;
    const now = Date.now();

    if (
      !this.requestTimestamps[key] ||
      this.requestTimestamps[key].length === 0
    ) {
      return 0;
    }

    const oldestTimestamp = this.requestTimestamps[key][0] || 0;
    return Math.max(0, (config?.timeWindow || 0) - (now - oldestTimestamp));
  }
}

export const rateLimiter = RateLimiter.getInstance();
