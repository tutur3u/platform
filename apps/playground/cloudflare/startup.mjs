export function assertStartupEnvironment(env) {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error('Worker requires NODE_ENV=production');
  }
  if (!env.ASSETS || typeof env.ASSETS.fetch !== 'function') {
    throw new Error('Missing required binding: ASSETS');
  }
}
