'use client';

import { NeoCrushGame } from './game';
import { Button } from '@repo/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from '@repo/ui/components/ui/dialog';

export default function NeoCrushGamePage() {
  return (
    <div className="flex h-fit flex-col items-center justify-center gap-4 overflow-hidden p-4 pt-8 md:flex-row md:pt-32">
      {/* <div className="bg-foreground/5 rounded border p-4">
        <div className="font-semibold">Võ Hoàng Phúc</div>
        <div>s3926761@rmit.edu.vn</div>
      </div> */}
      <Dialog>
        <DialogTrigger asChild>
          <Button>Start Game</Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm md:max-w-4xl lg:max-w-6xl">
          <NeoCrushGame />
        </DialogContent>
      </Dialog>
      {/* <div className="bg-foreground/5 rounded border p-4">
        <div className="font-semibold">Võ Hoàng Phúc</div>
        <div>s3926761@rmit.edu.vn</div>
      </div> */}
    </div>
  );
}
