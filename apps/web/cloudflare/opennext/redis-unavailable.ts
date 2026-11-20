const unavailable = () =>
  new Error('Redis is disabled in the Web API identity Worker');

/** The identity bundle has no legacy Redis network client. */
export class Redis {
  constructor() {
    throw unavailable();
  }

  static fromEnv(): never {
    throw unavailable();
  }
}
