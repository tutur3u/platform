import { Button } from '@tuturuuu/ui/button';
import { LayoutGrid, LayoutList } from '@tuturuuu/ui/icons';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { cn } from '@tuturuuu/utils/format';

interface ChallengeOption {
  id: string;
  title: string;
}

interface ProblemOption {
  id: string;
  title: string;
  challenge_id: string;
}

interface SubmissionFiltersProps {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  viewMode: 'table' | 'grid';
  setViewMode: (mode: 'table' | 'grid') => void;
  selectedChallenge: string;
  handleChallengeChange: (value: string) => void;
  selectedProblem: string;
  handleProblemChange: (value: string) => void;
  handleClearFilters: () => void;
  challenges: ChallengeOption[];
  filteredProblems: ProblemOption[];
}

export function SubmissionFilters({
  searchQuery,
  setSearchQuery,
  viewMode,
  setViewMode,
  selectedChallenge,
  handleChallengeChange,
  selectedProblem,
  handleProblemChange,
  handleClearFilters,
  challenges,
  filteredProblems,
}: SubmissionFiltersProps) {
  return (
    <>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="relative w-full max-w-sm">
          <Input
            type="text"
            placeholder="Search submissions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-8"
          />
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex rounded-md border p-1">
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'rounded-sm px-2',
                    viewMode === 'table' && 'bg-accent'
                  )}
                  onClick={() => setViewMode('table')}
                >
                  <LayoutList className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'rounded-sm px-2',
                    viewMode === 'grid' && 'bg-accent'
                  )}
                  onClick={() => setViewMode('grid')}
                >
                  <LayoutGrid className="h-4 w-4" />
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Toggle view mode</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-end gap-4">
        <div className="w-full max-w-xs">
          <label className="mb-2 block text-sm font-medium">
            Filter by Challenge
          </label>
          <Select
            value={selectedChallenge || 'all'}
            onValueChange={handleChallengeChange}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Challenges" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Challenges</SelectItem>
              {challenges.map((challenge) => (
                <SelectItem key={challenge.id} value={challenge.id}>
                  {challenge.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="w-full max-w-xs">
          <label className="mb-2 block text-sm font-medium">
            Filter by Problem
          </label>
          <Select
            value={selectedProblem || 'all'}
            onValueChange={handleProblemChange}
            disabled={filteredProblems.length === 0}
          >
            <SelectTrigger>
              <SelectValue placeholder="All Problems" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Problems</SelectItem>
              {filteredProblems.map((problem) => (
                <SelectItem key={problem.id} value={problem.id}>
                  {problem.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {(selectedChallenge || selectedProblem) && (
          <Button
            variant="outline"
            onClick={handleClearFilters}
            className="mb-[1px]"
          >
            Clear Filters
          </Button>
        )}
      </div>
    </>
  );
}
