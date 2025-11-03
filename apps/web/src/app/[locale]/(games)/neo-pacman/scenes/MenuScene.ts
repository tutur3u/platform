import { MAPS_DATA } from '../maps';
import * as Phaser from 'phaser';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Title
    this.add
      .text(width / 2, 50, 'NEO PACMAN', {
        fontSize: '48px',
        color: '#ffff00',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    // Subtitle
    this.add
      .text(width / 2, 100, 'Select a Map', {
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // Display map options
    const startY = 150;
    const spacing = 60;

    Object.entries(MAPS_DATA).forEach(([id, map], index) => {
      const y = startY + index * spacing;

      // Map name and info
      const mapText = this.add
        .text(
          width / 2,
          y,
          `${map.name} - ${map.data.length}x${map.data[0]?.length || 0} (${map.difficulty})`,
          {
            fontSize: '20px',
            color: '#ffffff',
            backgroundColor: '#1a1a1a',
            padding: { x: 20, y: 10 },
          }
        )
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      // Hover effect
      mapText.on('pointerover', () => {
        mapText.setStyle({ color: '#ffff00' });
      });

      mapText.on('pointerout', () => {
        mapText.setStyle({ color: '#ffffff' });
      });

      // Click to select map
      mapText.on('pointerdown', () => {
        this.scene.start('GameScene', { mapId: id });
      });
    });

    // Instructions
    this.add
      .text(
        width / 2,
        height - 50,
        'Use Arrow Keys to move Pacman | Eat all foods to win!',
        {
          fontSize: '16px',
          color: '#aaaaaa',
        }
      )
      .setOrigin(0.5);
  }
}
