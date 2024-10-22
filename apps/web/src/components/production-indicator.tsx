import { IS_PRODUCTION_DB, PROD_MODE } from '@/constants/common';

export function ProductionIndicator() {
  if (!IS_PRODUCTION_DB || PROD_MODE) return null;

  return (
    <div className="bg-destructive/10 border-destructive/10 text-destructive fixed right-2 top-2 z-[1000] flex items-center justify-center rounded border p-1 font-mono text-xs font-semibold backdrop-blur-xl transition duration-300 hover:opacity-0">
      Connected to production database
    </div>
  );
}
