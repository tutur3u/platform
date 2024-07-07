'use client';

import { NeoCrushGame } from './game';

export default function NeoCrushGamePage() {
  return (
    <div className="flex h-fit flex-col items-center justify-center gap-4 overflow-hidden p-4 pt-8 md:flex-row md:pt-32">
      {/* <div className="bg-foreground/5 rounded border p-4">
        <div className="font-semibold">Võ Hoàng Phúc</div>
        <div>s3926761@rmit.edu.vn</div>
      </div> */}
      <NeoCrushGame />
      {/* <div className="bg-foreground/5 rounded border p-4">
        <div className="font-semibold">Võ Hoàng Phúc</div>
        <div>s3926761@rmit.edu.vn</div>
      </div> */}
    </div>
  );
}
