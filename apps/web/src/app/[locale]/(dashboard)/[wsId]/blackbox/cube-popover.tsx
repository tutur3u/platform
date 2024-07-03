import { Size } from './types';
import { Button } from '@repo/ui/components/ui/button';
import { Input } from '@repo/ui/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@repo/ui/components/ui/popover';
import { Slider } from '@repo/ui/components/ui/slider';
import { SettingsIcon } from 'lucide-react';

export function CubePopover({
  size,
  setSize,
}: {
  size: Size;
  setSize: (size: Size | ((prev: Size) => Size)) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="icon">
          <SettingsIcon size={24} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Scale</h4>
            <p className="text-muted-foreground text-sm">
              Set the scale of the cube
            </p>
          </div>
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Input
                placeholder="X"
                value={size.x}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  // If value is not a number, do nothing
                  if (
                    e.target.value !== '' &&
                    (isNaN(value) || !e.target.value)
                  )
                    return;

                  setSize((s) => ({
                    ...s,
                    x: value < 0 ? 0 : value > 100 ? 100 : value,
                  }));
                }}
              />
              <Slider
                defaultValue={[1]}
                max={100}
                step={1}
                value={[size.x]}
                onValueChange={(v) =>
                  setSize((s) => ({ ...s, x: v?.[0] ?? 0 }))
                }
              />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Y"
                value={size.y}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  // If value is not a number, do nothing
                  if (
                    e.target.value !== '' &&
                    (isNaN(value) || !e.target.value)
                  )
                    return;

                  setSize((s) => ({
                    ...s,
                    y: value < 0 ? 0 : value > 100 ? 100 : value,
                  }));
                }}
              />
              <Slider
                defaultValue={[1]}
                max={100}
                step={1}
                value={[size.y]}
                onValueChange={(v) =>
                  setSize((s) => ({ ...s, y: v?.[0] ?? 0 }))
                }
              />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Z"
                value={size.z}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  // If value is not a number, do nothing
                  if (
                    e.target.value !== '' &&
                    (isNaN(value) || !e.target.value)
                  )
                    return;

                  setSize((s) => ({
                    ...s,
                    z: value < 0 ? 0 : value > 100 ? 100 : value,
                  }));
                }}
              />
              <Slider
                defaultValue={[1]}
                max={3}
                step={1}
                value={[size.z]}
                onValueChange={(v) =>
                  setSize((s) => ({ ...s, z: v?.[0] ?? 0 }))
                }
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
