'use client';

import { GameOverScene } from './scenes/GameOverScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
import { Button } from '@ncthub/ui/button';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp } from '@ncthub/ui/icons';
import * as Phaser from 'phaser';
import { useEffect, useRef } from 'react';

export function PacmanGame() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !parentRef.current ||
      gameRef.current
    ) {
      return;
    }

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: parentRef.current,
      width: 700,
      height: 700,
      backgroundColor: '#000000',
      scene: [MenuScene, GameScene, GameOverScene],
      physics: {
        default: 'arcade',
        arcade: {
          debug: false,
        },
      },
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
      },
    };

    gameRef.current = new Phaser.Game(config);

    return () => {
      gameRef.current?.destroy(true);
      gameRef.current = null;
    };
  });

  const dispatchKeyEvent = (key: string, type: 'keydown' | 'keyup') => {
    const event = new KeyboardEvent(type, {
      key,
      code: key,
      keyCode: getKeyCode(key),
      which: getKeyCode(key),
      bubbles: true,
    });
    window.dispatchEvent(event);
  };

  const getKeyCode = (key: string): number => {
    const keyCodes: Record<string, number> = {
      ArrowUp: 38,
      ArrowDown: 40,
      ArrowLeft: 37,
      ArrowRight: 39,
    };
    return keyCodes[key] || 0;
  };

  return (
    <div className="flex w-full flex-col items-center justify-center gap-8 px-4 md:px-0">
      <div className="relative w-full max-w-[512px]">
        {/* Glow effect behind the game */}
        <div className="bg-linear-to-r absolute -inset-4 rounded-2xl from-yellow-400/20 via-blue-500/20 to-purple-500/20 opacity-75 blur-2xl" />

        {/* Game container */}
        <div
          ref={parentRef}
          className="relative aspect-square overflow-hidden rounded-xl border-4 border-yellow-500 bg-black shadow-[0_0_50px_rgba(251,191,36,0.3)] transition-all hover:border-yellow-400 hover:shadow-[0_0_60px_rgba(251,191,36,0.4)]"
        />
      </div>

      {/* Control Buttons */}
      <div className="flex flex-col items-center gap-6">
        <p className="text-muted-foreground text-md font-semibold">
          Touch Controls
        </p>
        <div className="grid grid-cols-3 grid-rows-3 gap-1.5">
          {/* Top row - Up button */}
          <div className="col-start-2">
            <Button
              variant="outline"
              size="icon"
              className="border-dynamic-light-blue/50 bg-dynamic-blue/10 hover:bg-dynamic-blue/20 hover:border-dynamic-light-blue size-12 transition-all active:scale-95"
              onMouseDown={() => dispatchKeyEvent('ArrowUp', 'keydown')}
              onMouseUp={() => dispatchKeyEvent('ArrowUp', 'keyup')}
              onTouchStart={() => dispatchKeyEvent('ArrowUp', 'keydown')}
              onTouchEnd={() => dispatchKeyEvent('ArrowUp', 'keyup')}
            >
              <ArrowUp className="size-6" />
            </Button>
          </div>

          {/* Middle row - Left and Right buttons */}
          <div className="col-start-1">
            <Button
              variant="outline"
              size="icon"
              className="border-dynamic-light-blue/50 bg-dynamic-blue/10 hover:bg-dynamic-blue/20 hover:border-dynamic-light-blue size-12 transition-all active:scale-95"
              onMouseDown={() => dispatchKeyEvent('ArrowLeft', 'keydown')}
              onMouseUp={() => dispatchKeyEvent('ArrowLeft', 'keyup')}
              onTouchStart={() => dispatchKeyEvent('ArrowLeft', 'keydown')}
              onTouchEnd={() => dispatchKeyEvent('ArrowLeft', 'keyup')}
            >
              <ArrowLeft className="size-6" />
            </Button>
          </div>
          <div className="col-start-3">
            <Button
              variant="outline"
              size="icon"
              className="border-dynamic-light-blue/50 bg-dynamic-blue/10 hover:bg-dynamic-blue/20 hover:border-dynamic-light-blue size-12 transition-all active:scale-95"
              onMouseDown={() => dispatchKeyEvent('ArrowRight', 'keydown')}
              onMouseUp={() => dispatchKeyEvent('ArrowRight', 'keyup')}
              onTouchStart={() => dispatchKeyEvent('ArrowRight', 'keydown')}
              onTouchEnd={() => dispatchKeyEvent('ArrowRight', 'keyup')}
            >
              <ArrowRight className="size-6" />
            </Button>
          </div>

          {/* Bottom row - Down button */}
          <div className="col-start-2">
            <Button
              variant="outline"
              size="icon"
              className="border-dynamic-light-blue/50 bg-dynamic-blue/10 hover:bg-dynamic-blue/20 hover:border-dynamic-light-blue size-12 transition-all active:scale-95"
              onMouseDown={() => dispatchKeyEvent('ArrowDown', 'keydown')}
              onMouseUp={() => dispatchKeyEvent('ArrowDown', 'keyup')}
              onTouchStart={() => dispatchKeyEvent('ArrowDown', 'keydown')}
              onTouchEnd={() => dispatchKeyEvent('ArrowDown', 'keyup')}
            >
              <ArrowDown className="size-6" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
