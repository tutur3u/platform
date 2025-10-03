import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { DatabaseZap } from 'lucide-react';

export const IS_PRODUCTION_DB =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('.supabase.');

export const PROD_MODE = process.env.NODE_ENV === 'production';

export function ProductionIndicator() {
  if (!IS_PRODUCTION_DB || PROD_MODE) return null;

  return (
    <Tooltip>
      <TooltipTrigger className="fixed right-10 bottom-2 z-1000 rounded-lg border border-dynamic-red/20 bg-dynamic-red/20 p-1 font-semibold text-dynamic-red text-xs backdrop-blur-xl transition duration-300 hover:opacity-0">
        <DatabaseZap className="size-4" />
      </TooltipTrigger>
      <TooltipContent className="rounded-lg bg-dynamic-red/20 p-2 font-semibold text-dynamic-red text-xs backdrop-blur-xl">
        Connected to production database
      </TooltipContent>
    </Tooltip>
  );
}
