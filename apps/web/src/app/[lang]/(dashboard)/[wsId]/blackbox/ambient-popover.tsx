import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/ui/popover';
import { Slider } from '@repo/ui/components/ui/slider';
import { Sun } from 'lucide-react';

export function AmbientPopover({
  intensity,
  setIntensity,
}: {
  intensity: number;
  setIntensity: (size: number | ((prev: number) => number)) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="icon">
          <Sun size={24} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">
              Ambient Light Intensity
            </h4>
            <p className="text-muted-foreground text-sm">
              Set the intensity of the ambient light
            </p>
          </div>
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Input
                placeholder="X"
                value={intensity}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  // If value is not a number, do nothing
                  if (
                    e.target.value !== '' &&
                    (isNaN(value) || !e.target.value)
                  )
                    return;

                  setIntensity(value < 0 ? 0 : value > 100 ? 100 : value);
                }}
              />
              <Slider
                defaultValue={[1]}
                max={10}
                step={0.1}
                value={[intensity]}
                onValueChange={(v) => setIntensity(v?.[0] || 0)}
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
