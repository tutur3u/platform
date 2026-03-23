import { Search, Smile } from '@ncthub/ui/icons';

interface EmptyStateProps {
  onClearFilters: () => void;
}

export default function EmptyState({ onClearFilters }: EmptyStateProps) {
  return (
    <div className="py-12 text-center">
      <div className="mb-6">
        <Search className="mx-auto h-16 w-16 text-yellow-400 md:h-20 md:w-20" />
      </div>
      <h3 className="mb-2 font-extrabold text-xl leading-normal md:text-4xl lg:text-5xl">
        <span className="whitespace-nowrap border-[#FBC721] border-b-4 text-[#5FC6E5]">
          NEOThing's
        </span>{' '}
        <span className="text-foreground"> Here :(</span>
      </h3>
      <p className="mb-6 flex items-center justify-center gap-2 font-bold text-lg text-muted-foreground leading-normal md:text-xl lg:text-2xl">
        Try Clearing the Filters u just click{' '}
        <Smile className="h-6 w-6 text-yellow-400 md:h-8 md:w-8" />
      </p>
      <button
        type="button"
        onClick={onClearFilters}
        className="inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-[#5FC6E5] to-[#1AF4E6] px-6 py-3 font-bold text-lg text-primary-foreground transition-all duration-300 hover:scale-105 hover:shadow-lg"
      >
        Clear Filters
      </button>
    </div>
  );
}
