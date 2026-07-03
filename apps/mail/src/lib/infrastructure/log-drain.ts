type LogMetadata = Record<string, unknown>;

function log(level: 'debug' | 'error' | 'info' | 'warn') {
  return (message: string, metadata?: LogMetadata) => {
    const logger = console[level] ?? console.log;
    logger(message, metadata ?? {});
  };
}

export const serverLogger = {
  debug: log('debug'),
  error: log('error'),
  info: log('info'),
  warn: log('warn'),
};
