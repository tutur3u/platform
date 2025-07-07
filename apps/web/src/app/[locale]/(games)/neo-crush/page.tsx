'use client';

import { NeoCrushGame } from './game';
import { Button } from '@ncthub/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@ncthub/ui/dialog';
import Image from 'next/image';

export default function NeoCrushGamePage() {
  return (
    <div className="flex h-fit flex-col items-center justify-center gap-4 overflow-hidden p-4 pt-8 text-center md:pt-32">
      <Image
        src="/club-day/sem-b-2024.jpg"
        width={2000}
        height={2000}
        alt="Neo Citrus Tech"
        className="h-64 w-64 rounded-full"
        priority
      />
      <div className="grid gap-2">
        <div className="font-serif text-5xl font-semibold tracking-wider">
          <span className="text-dynamic-yellow">N</span>
          <span className="text-dynamic-green">e</span>
          <span className="text-dynamic-red">o</span>
          <span> </span>
          <span className="text-dynamic-orange">C</span>
          <span className="text-dynamic-purple">r</span>
          <span className="text-dynamic-blue">u</span>
          <span className="text-dynamic-yellow">s</span>
          <span className="text-dynamic-green">h</span>
        </div>
        <div className="font-semibold opacity-70">
          Match group of citrus fruits to score points and compete with friends.
        </div>
      </div>
      <Dialog>
        <DialogTitle>Neo Crush</DialogTitle>
        <DialogTrigger asChild>
          <Button className="w-full max-w-sm">Start Game</Button>
        </DialogTrigger>
        <DialogContent className="max-w-sm md:max-w-4xl lg:max-w-6xl">
          <NeoCrushGame />
        </DialogContent>
      </Dialog>
    </div>
  );
}
