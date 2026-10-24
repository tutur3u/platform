import { createHash } from 'node:crypto';
import type { NativeIntegrityRedisAdapter } from './store';

// Exact digests reject changed or unknown Lua until its test model is reviewed.
const scripts = [
  '9d415da606c7b4982fd71fa0e8864d90ac56ee2cd2989719c1e67d161dda6fb1',
  '34f06ddc5b567c7d683092f91ba89b0169f6c6038c806d7e5b036866368008a6',
  'ceee99ed57f53927f5e25b24d43d8b053bdae4b7439781ed146f5ad474319c51',
  '178e6784b94d44b0336ec339f326c23c60a273c995e4f684e67f7b2faa6a7dc1',
  '60c22608554483f5a79e52b09cd7170ee3e5822c232f3cfa2bb9048f8b480340',
  '70252303a1ab77e160e679c5e4ea8e2e669c9e8dc9b0fe21d0d0fcce933eebed',
  '2eaf0f9b9399c53aed8dae6a81f55157ba06ac46668071843aff03eb7daffb6b',
  '172c2ecfb8ffda8e74f1a9b14140a3fbf2b84c312d5e0c7a19632aeb1a1ec2ab',
];
export class MemoryNativeIntegrityRedis implements NativeIntegrityRedisAdapter {
  private values = new Map<string, { value: string; expiry?: number }>();
  private indexes = new Map<string, Map<string, number>>();
  private indexExpiry = new Map<string, number>();
  private clock = 0;
  advance(milliseconds: number) {
    this.clock += milliseconds;
  }
  private read(name: string) {
    const entry = this.values.get(name);
    if (entry?.expiry !== undefined && entry.expiry <= this.clock) {
      this.values.delete(name);
      return null;
    }
    return entry?.value ?? null;
  }
  private set(name: string, value: string, ttl?: number) {
    this.values.set(name, {
      value,
      ...(ttl === undefined ? {} : { expiry: this.clock + ttl }),
    });
  }
  private increment(name: string, ttl: number) {
    const old = this.read(name);
    const count = Number(old ?? 0) + 1;
    if (old === null) this.set(name, String(count), ttl);
    else {
      const entry = this.values.get(name);
      if (!entry) throw new Error('Missing counter');
      entry.value = String(count);
    }
    return count;
  }
  private index(name: string) {
    if ((this.indexExpiry.get(name) ?? Infinity) <= this.clock) {
      this.indexes.delete(name);
      this.indexExpiry.delete(name);
    }
    let index = this.indexes.get(name);
    if (!index) {
      index = new Map();
      this.indexes.set(name, index);
    }
    return index;
  }
  async get(name: string) {
    return this.read(name);
  }
  // Synchronous execution inside each eval models Redis script serialization.
  async eval(
    script: string,
    keys: string[],
    args: (string | number)[]
  ): Promise<unknown> {
    const k = (i: number) => {
      const name = keys[i];
      if (!name) throw new Error('Missing key');
      return name;
    };
    const n = (i: number) => Number(args[i]);
    const a = (i: number) => String(args[i]);
    const literal =
      /^return redis.call\('(SET|DEL|TTL|PTTL)', KEYS\[1\](?:, '([^']*)')?\)$/.exec(
        script
      );
    if (literal) {
      if (literal[1] === 'SET') {
        this.set(k(0), literal[2] ?? '');
        return 'OK';
      }
      if (literal[1] === 'DEL') return Number(this.values.delete(k(0)));
      if (this.read(k(0)) === null) return -2;
      const expiry = this.values.get(k(0))?.expiry;
      if (expiry === undefined) return -1;
      return literal[1] === 'TTL'
        ? Math.floor((expiry - this.clock) / 1000)
        : expiry - this.clock;
    }
    const digest = createHash('sha256').update(script).digest('hex');
    switch (scripts.indexOf(digest)) {
      case 0:
        if (this.increment(k(0), n(1) * 1000) > n(0)) return 0;
        if (this.increment(k(1), 3600000) > 120 || this.read(k(2)) !== null)
          return 0;
        this.set(k(2), a(2), n(3));
        return 1;
      case 1: {
        const value = this.read(k(0));
        this.values.delete(k(0));
        return value;
      }
      case 2: {
        const owner = this.read(k(2));
        if (owner !== null && owner !== a(4)) return 0;
        const index = this.index(k(1));
        for (const [name, expiry] of index)
          if (expiry <= n(1)) index.delete(name);
        if (index.size >= 8 || this.read(k(0)) !== null) return 0;
        this.set(k(0), a(0), n(2) * 1000);
        this.set(k(2), a(4), n(2) * 1000);
        index.set(k(0), n(3));
        this.indexExpiry.set(k(1), this.clock + n(2) * 1000);
        return 1;
      }
      case 3: {
        const value = this.read(k(1));
        if (value !== null) {
          if (value !== '1') throw new Error('invalid-native-capability');
          return 1;
        }
        return Number(
          [...this.index(k(0))]
            .filter(([, expiry]) => expiry >= n(0))
            .slice(0, 8)
            .some(([name]) => this.read(name) !== null)
        );
      }
      case 4:
        this.set(k(0), '1', n(0) * 1000);
        return 1;
      case 5: {
        const names = [...this.index(k(0)).keys()].slice(0, 8);
        for (const name of names) {
          const value = this.read(name);
          if (value !== null) {
            const record = JSON.parse(value);
            if (record.ownerKey && this.read(record.ownerKey) === a(0))
              this.values.delete(record.ownerKey);
          }
          this.values.delete(name);
        }
        this.indexes.delete(k(0));
        this.indexExpiry.delete(k(0));
        return names.length + Number(this.values.delete(k(1)));
      }
      case 6: {
        const value = this.read(k(0));
        if (value === null) return 0;
        const record = JSON.parse(value);
        if (record.counter !== n(0) || n(1) <= record.counter) return 0;
        const expiry = this.values.get(k(0))?.expiry;
        if (expiry === undefined || expiry <= this.clock) return 0;
        record.counter = n(1);
        this.set(k(0), JSON.stringify(record), expiry - this.clock);
        return 1;
      }
      case 7: {
        let used = Number(this.read(k(1)) ?? 0);
        let actor = Number(this.read(k(2)) ?? 0);
        if (this.read(k(0)) === '1' || used >= n(0) || actor >= n(2))
          return [0, used, actor, 0];
        used++;
        actor++;
        this.set(k(1), String(used), n(1) * 1000);
        this.set(k(2), String(actor), n(1) * 1000);
        const warning = used >= n(3) && this.read(k(3)) === null;
        if (warning) this.set(k(3), '1', n(1) * 1000);
        return [1, used, actor, Number(warning)];
      }
      default:
        throw new Error(`Unmodeled native-integrity Lua script: ${digest}`);
    }
  }
}
