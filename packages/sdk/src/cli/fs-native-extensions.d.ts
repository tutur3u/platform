declare module 'fs-native-extensions' {
  /** Nonblocking, descriptor-owned exclusive lock; closing the fd releases it. */
  export function tryLock(fd: number): boolean;
}
