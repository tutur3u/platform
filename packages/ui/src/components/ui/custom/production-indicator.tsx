export const IS_PRODUCTION_DB =
  process.env.NEXT_PUBLIC_SUPABASE_URL?.includes('.supabase.');

export const PROD_MODE = process.env.NODE_ENV === 'production';

export function ProductionIndicator() {
  if (!IS_PRODUCTION_DB || PROD_MODE) return null;

  return (
    <div className="fixed top-2 right-2 z-1000 flex items-center justify-center rounded border border-dynamic-red/20 bg-dynamic-red/20 p-1 font-mono font-semibold text-dynamic-red text-xs backdrop-blur-xl transition duration-300 hover:opacity-0">
      Connected to production database
    </div>
  );
}
