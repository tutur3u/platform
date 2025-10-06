'use client';

import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@tuturuuu/ui/popover';
import { cn } from '@tuturuuu/utils/format';
import { DollarSign, X } from 'lucide-react';
import { useState } from 'react';

interface AmountRangeFilterProps {
  minAmount?: string;
  maxAmount?: string;
  onAmountRangeChange: (
    min: string | undefined,
    max: string | undefined
  ) => void;
  className?: string;
}

export function AmountRangeFilter({
  minAmount,
  maxAmount,
  onAmountRangeChange,
  className,
}: AmountRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localMin, setLocalMin] = useState(minAmount || '');
  const [localMax, setLocalMax] = useState(maxAmount || '');

  const hasActiveFilter = !!minAmount || !!maxAmount;

  const handleApply = () => {
    onAmountRangeChange(localMin || undefined, localMax || undefined);
    setIsOpen(false);
  };

  const handleClear = () => {
    setLocalMin('');
    setLocalMax('');
    onAmountRangeChange(undefined, undefined);
    setIsOpen(false);
  };

  // Update local state when props change
  const handleOpen = (open: boolean) => {
    if (open) {
      setLocalMin(minAmount || '');
      setLocalMax(maxAmount || '');
    }
    setIsOpen(open);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Popover open={isOpen} onOpenChange={handleOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5">
            <DollarSign className="h-3 w-3" />
            <span className="text-xs">Filter by amount</span>
            {hasActiveFilter && (
              <Badge
                variant="secondary"
                className="ml-1 h-5 rounded-full px-1.5 text-xs"
              >
                {[minAmount, maxAmount].filter(Boolean).length}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[280px]" align="start">
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium text-sm">Amount Range</h4>
              <p className="text-muted-foreground text-xs">
                Set minimum and maximum amounts
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="min-amount" className="text-xs">
                  Minimum Amount
                </Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={localMin}
                  onChange={(e) => setLocalMin(e.target.value)}
                  className="h-8"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="max-amount" className="text-xs">
                  Maximum Amount
                </Label>
                <Input
                  type="number"
                  placeholder="No limit"
                  value={localMax}
                  onChange={(e) => setLocalMax(e.target.value)}
                  className="h-8"
                />
              </div>
            </div>

            <div className="flex gap-2">
              {hasActiveFilter && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClear}
                  className="flex-1 text-destructive"
                >
                  <X className="mr-2 h-3 w-3" />
                  Clear
                </Button>
              )}
              <Button size="sm" onClick={handleApply} className="flex-1">
                Apply
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
