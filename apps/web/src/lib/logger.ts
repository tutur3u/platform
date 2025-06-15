export const logger = {
  info: (message: string, meta?: object) => {
    console.log(`[INFO] ${message}`, meta || '');
  },
  error: (message: string, error: unknown) => {
    console.error(`[ERROR] ${message}`, error);
  },
};
