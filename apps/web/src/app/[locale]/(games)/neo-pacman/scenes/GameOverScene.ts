import * as Phaser from 'phaser';

interface GameOverData {
  won: boolean;
  score: number;
}

export class GameOverScene extends Phaser.Scene {
  private won: boolean = false;
  private score: number = 0;

  constructor() {
    super({ key: 'GameOverScene' });
  }

  init(data: GameOverData): void {
    this.won = data.won || false;
    this.score = data.score || 0;
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Background
    this.add.rectangle(0, 0, width, height, 0x000000, 0.8).setOrigin(0);

    // Title
    const title = this.won ? 'VICTORY!' : 'GAME OVER';
    const titleColor = this.won ? '#00ff00' : '#ff0000';

    this.add
      .text(width / 2, height / 2 - 100, title, {
        fontSize: '64px',
        color: titleColor,
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Score
    this.add
      .text(width / 2, height / 2 - 20, `Final Score: ${this.score}`, {
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Message
    const message = this.won ? 'You ate all the food!' : 'The ghosts got you!';

    this.add
      .text(width / 2, height / 2 + 40, message, {
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Play Again button
    const playAgainBtn = this.add
      .text(width / 2, height / 2 + 120, 'Play Again', {
        fontSize: '28px',
        color: '#ffffff',
        backgroundColor: '#1a1a1a',
        padding: { x: 30, y: 15 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    playAgainBtn.on('pointerover', () => {
      playAgainBtn.setStyle({ color: '#ffff00' });
    });

    playAgainBtn.on('pointerout', () => {
      playAgainBtn.setStyle({ color: '#ffffff' });
    });

    playAgainBtn.on('pointerdown', () => {
      this.scene.start('MenuScene');
    });

    // Change Map button
    const changeMapBtn = this.add
      .text(width / 2, height / 2 + 180, 'Change Map', {
        fontSize: '28px',
        color: '#ffffff',
        backgroundColor: '#1a1a1a',
        padding: { x: 30, y: 15 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    changeMapBtn.on('pointerover', () => {
      changeMapBtn.setStyle({ color: '#ffff00' });
    });

    changeMapBtn.on('pointerout', () => {
      changeMapBtn.setStyle({ color: '#ffffff' });
    });

    changeMapBtn.on('pointerdown', () => {
      this.scene.start('MenuScene');
    });
  }
}
