import { IS_PRODUCTION_DB, PROD_MODE } from '@/constants/common';

export function ProductionIndicator() {
  if (!IS_PRODUCTION_DB || PROD_MODE) return null;

  return (
    <div className="fixed top-2 right-2 z-1000 flex items-center justify-center rounded border border-dynamic-red/20 bg-dynamic-red/20 p-1 font-mono text-xs font-semibold text-dynamic-red backdrop-blur-xl transition duration-300 hover:opacity-0">
      Connected to production database
    </div>
  );
}
