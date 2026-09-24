declare module '*.open-next/worker.js' {
  const worker: {
    fetch(
      request: Request,
      env: unknown,
      ctx: ExecutionContext
    ): Promise<Response>;
  };
  export default worker;
  export const DOQueueHandler: unknown;
  export const DOShardedTagCache: unknown;
  export const BucketCachePurge: unknown;
}
