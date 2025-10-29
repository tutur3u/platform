'use client';

import { GameOverScene } from './scenes/GameOverScene';
import { GameScene } from './scenes/GameScene';
import { MenuScene } from './scenes/MenuScene';
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
  }, []);

  return (
    <div className="flex flex-col items-center justify-center">
      <div className="relative">
        {/* Glow effect behind the game */}
        <div className="absolute -inset-4 rounded-2xl bg-linear-to-r from-yellow-400/20 via-blue-500/20 to-purple-500/20 opacity-75 blur-2xl" />

        {/* Game container */}
        <div
          ref={parentRef}
          className="relative overflow-hidden rounded-xl border-4 border-yellow-500 bg-black shadow-[0_0_50px_rgba(251,191,36,0.3)] transition-all hover:border-yellow-400 hover:shadow-[0_0_60px_rgba(251,191,36,0.4)]"
          style={{ width: '700px', height: '700px' }}
        />
      </div>
    </div>
  );
}
