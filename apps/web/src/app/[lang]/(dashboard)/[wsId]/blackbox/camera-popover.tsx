import { Size } from './types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { Camera } from 'lucide-react';

export function CameraPopover({
  position,
  quaternion,
  setPosition,
  setQuaternion,
}: {
  position: Size;
  quaternion: number[];
  setPosition: (position: Size | ((prev: Size) => Size)) => void;
  setQuaternion: (
    quaternion: number[] | ((prev: number[]) => number[])
  ) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="secondary" size="icon">
          <Camera size={24} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" onOpenAutoFocus={(e) => e.preventDefault()}>
        <div className="grid gap-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Camera Position</h4>
            <p className="text-muted-foreground text-sm">
              Set the position of the camera
            </p>
          </div>
          <div className="grid gap-2">
            <div className="flex gap-2">
              <Input
                placeholder="X"
                value={position.x}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  // If value is not a number, do nothing
                  if (
                    e.target.value !== '' &&
                    (isNaN(value) || !e.target.value)
                  )
                    return;

                  setPosition((s) => ({
                    ...s,
                    x: value < 0 ? 0 : value > 100 ? 100 : value,
                  }));
                }}
              />
              <Slider
                defaultValue={[1]}
                max={100}
                step={1}
                value={[position.x]}
                onValueChange={(v) => setPosition((s) => ({ ...s, x: v[0] }))}
              />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Y"
                value={position.y}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  // If value is not a number, do nothing
                  if (
                    e.target.value !== '' &&
                    (isNaN(value) || !e.target.value)
                  )
                    return;

                  setPosition((s) => ({
                    ...s,
                    y: value < 0 ? 0 : value > 100 ? 100 : value,
                  }));
                }}
              />
              <Slider
                defaultValue={[1]}
                max={100}
                step={1}
                value={[position.y]}
                onValueChange={(v) => setPosition((s) => ({ ...s, y: v[0] }))}
              />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Z"
                value={position.z}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  // If value is not a number, do nothing
                  if (
                    e.target.value !== '' &&
                    (isNaN(value) || !e.target.value)
                  )
                    return;

                  setPosition((s) => ({
                    ...s,
                    z: value < 0 ? 0 : value > 100 ? 100 : value,
                  }));
                }}
              />
              <Slider
                defaultValue={[1]}
                max={100}
                step={1}
                value={[position.z]}
                onValueChange={(v) => setPosition((s) => ({ ...s, z: v[0] }))}
              />
            </div>

            <Separator className="my-2" />

            <h4 className="font-medium leading-none">Camera Rotation</h4>
            <p className="text-muted-foreground text-sm">
              Set the rotation of the camera
            </p>

            <div className="flex gap-2">
              <Input
                placeholder="X"
                value={quaternion[0]}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  // If value is not a number, do nothing
                  if (
                    e.target.value !== '' &&
                    (isNaN(value) || !e.target.value)
                  )
                    return;

                  setQuaternion((q) => {
                    const newQ = [...q];
                    newQ[0] = value;
                    return newQ;
                  });
                }}
                disabled
              />
              <Slider
                defaultValue={[0]}
                max={360}
                step={1}
                value={[quaternion[0]]}
                onValueChange={(v) =>
                  setQuaternion((q) => {
                    const newQ = [...q];
                    newQ[0] = v[0];
                    return newQ;
                  })
                }
                disabled
              />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Y"
                value={quaternion[1]}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  // If value is not a number, do nothing
                  if (
                    e.target.value !== '' &&
                    (isNaN(value) || !e.target.value)
                  )
                    return;

                  setQuaternion((q) => {
                    const newQ = [...q];
                    newQ[1] = value;
                    return newQ;
                  });
                }}
                disabled
              />
              <Slider
                defaultValue={[0]}
                max={360}
                step={1}
                value={[quaternion[1]]}
                onValueChange={(v) =>
                  setQuaternion((q) => {
                    const newQ = [...q];
                    newQ[1] = v[0];
                    return newQ;
                  })
                }
                disabled
              />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="Z"
                value={quaternion[2]}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  // If value is not a number, do nothing
                  if (
                    e.target.value !== '' &&
                    (isNaN(value) || !e.target.value)
                  )
                    return;

                  setQuaternion((q) => {
                    const newQ = [...q];
                    newQ[2] = value;
                    return newQ;
                  });
                }}
                disabled
              />
              <Slider
                defaultValue={[0]}
                max={360}
                step={1}
                value={[quaternion[2]]}
                onValueChange={(v) =>
                  setQuaternion((q) => {
                    const newQ = [...q];
                    newQ[2] = v[0];
                    return newQ;
                  })
                }
                disabled
              />
            </div>

            <div className="flex gap-2">
              <Input
                placeholder="W"
                value={quaternion[3]}
                onChange={(e) => {
                  const value = Number(e.target.value);

                  // If value is not a number, do nothing
                  if (
                    e.target.value !== '' &&
                    (isNaN(value) || !e.target.value)
                  )
                    return;

                  setQuaternion((q) => {
                    const newQ = [...q];
                    newQ[3] = value;
                    return newQ;
                  });
                }}
                disabled
              />
              <Slider
                defaultValue={[0]}
                max={360}
                step={1}
                value={[quaternion[3]]}
                onValueChange={(v) =>
                  setQuaternion((q) => {
                    const newQ = [...q];
                    newQ[3] = v[0];
                    return newQ;
                  })
                }
                disabled
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
