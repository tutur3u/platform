import { IS_PRODUCTION_DB, PROD_MODE } from '@/constants/common';

export function ProductionIndicator() {
  if (!IS_PRODUCTION_DB || PROD_MODE) return null;

  return (
    <div className="bg-destructive/30 text-foreground fixed bottom-2 left-2 z-[1000] flex items-center justify-center rounded p-1 font-mono text-xs backdrop-blur transition duration-300 hover:opacity-0">
      Connected to production database
    </div>
  );
}
