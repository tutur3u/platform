import { GAME_CONFIG, GHOST_COLORS } from '../config';
import { Ghost } from '../entities/Ghost';
import { Pacman } from '../entities/Pacman';
import { CollisionManager } from '../managers/CollisionManager';
import { FoodManager } from '../managers/FoodManager';
import { MapManager } from '../managers/MapManager';
import { GhostType } from '../types';
import { tileToPixelCentered } from '../utils/constants';
import * as Phaser from 'phaser';

interface GameData {
  mapId: string;
}

export class GameScene extends Phaser.Scene {
  private mapManager!: MapManager;
  private foodManager!: FoodManager;
  private collisionManager!: CollisionManager;
  private pacman!: Pacman;
  private ghosts: Ghost[] = [];
  private score: number = 0;
  private lives: number = GAME_CONFIG.INITIAL_LIVES;
  private ghostsEatenCount: number = 0;
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private mapId: string = '';
  private quitDialog: Phaser.GameObjects.Container | null = null;
  private isPaused: boolean = false;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameData): void {
    this.mapId = data.mapId;
    this.score = 0;
    this.lives = GAME_CONFIG.INITIAL_LIVES;
    this.ghostsEatenCount = 0;
    this.ghosts = [];
  }

  create(): void {
    // Initialize managers
    this.mapManager = new MapManager(this);
    this.foodManager = new FoodManager(this, this.mapManager);
    this.collisionManager = new CollisionManager(this, this.foodManager);

    // Load and create map
    const mapData = this.mapManager.loadMap(this.mapId);
    this.mapManager.createTilemap(mapData);

    // Setup camera
    const { width, height } = this.mapManager.getMapDimensions();
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.setBackgroundColor('#000000');

    // Spawn Pacman
    const pacmanSpawn = this.mapManager.getRandomSpawnPoint();
    if (pacmanSpawn) {
      const pacmanPos = tileToPixelCentered(pacmanSpawn.row, pacmanSpawn.col);
      const offset = this.mapManager.getMapOffset();
      this.pacman = new Pacman(
        this,
        pacmanPos.x + offset.x,
        pacmanPos.y + offset.y,
        this.mapManager
      );
    }

    // Spawn ghosts
    this.spawnGhosts();

    // Spawn food
    this.foodManager.spawnInitialFood();
    this.foodManager.startRegeneration();

    // Create UI
    this.createUI();

    // Setup game over check
    this.time.addEvent({
      delay: 100,
      callback: this.checkGameState,
      callbackScope: this,
      loop: true,
    });
  }

  private spawnGhosts(): void {
    const centerSpawn = this.mapManager.getCenterSpawnPoint();
    const mapOffset = this.mapManager.getMapOffset();
    const ghostTypes = [
      { type: GhostType.BLINKY, color: GHOST_COLORS.BLINKY },
      { type: GhostType.PINKY, color: GHOST_COLORS.PINKY },
      { type: GhostType.INKY, color: GHOST_COLORS.INKY },
      { type: GhostType.CLYDE, color: GHOST_COLORS.CLYDE },
    ];

    ghostTypes.forEach((ghostConfig, index) => {
      const offset = index - 1.5; // Spread ghosts around center
      const pos = tileToPixelCentered(
        centerSpawn.row,
        centerSpawn.col + Math.floor(offset)
      );

      const ghost = new Ghost(
        this,
        pos.x + mapOffset.x,
        pos.y + mapOffset.y,
        ghostConfig.type,
        ghostConfig.color,
        this.mapManager
      );

      this.ghosts.push(ghost);
    });
  }

  private createUI(): void {
    // Score
    this.scoreText = this.add
      .text(10, 10, `Score: ${this.score}`, {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    // Lives
    this.livesText = this.add
      .text(10, 40, `Lives: ${this.lives}`, {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 },
      })
      .setScrollFactor(0)
      .setDepth(100);

    // Ghosts eaten
    this.add
      .text(10, 70, `Ghosts Eaten: 0/4`, {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 },
      })
      .setScrollFactor(0)
      .setDepth(100)
      .setName('ghostsEatenText');

    // Quit button
    const quitBtn = this.add
      .text(this.cameras.main.width - 10, 10, 'Quit', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#800000',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });

    quitBtn.on('pointerover', () => {
      quitBtn.setStyle({ backgroundColor: '#ff0000' });
    });

    quitBtn.on('pointerout', () => {
      quitBtn.setStyle({ backgroundColor: '#800000' });
    });

    quitBtn.on('pointerdown', () => {
      this.showQuitDialog();
    });

    // ESC key to quit
    this.input.keyboard?.on('keydown-ESC', () => {
      if (!this.quitDialog) {
        this.showQuitDialog();
      }
    });
  }

  update(): void {
    if (!this.pacman || this.isPaused) return;

    // Update Pacman
    this.pacman.update();

    // Update ghosts
    this.ghosts.forEach((ghost) => {
      ghost.update(this.pacman);
    });

    // Check food collision
    const foodResult = this.collisionManager.checkPacmanFoodCollision(
      this.pacman
    );
    if (foodResult.points > 0) {
      this.score += foodResult.points;
      this.scoreText.setText(`Score: ${this.score}`);

      // Power pellet eaten - make ghosts frightened
      if (foodResult.powerPelletEaten) {
        this.ghosts.forEach((ghost) => ghost.makeFrightened());
      }
    }

    // Check ghost collision
    const ghostResult = this.collisionManager.checkPacmanGhostCollision(
      this.pacman,
      this.ghosts
    );

    if (ghostResult.pacmanEaten) {
      this.handlePacmanDeath();
    }

    if (ghostResult.ghostsEaten.length > 0) {
      this.score += ghostResult.points;
      this.scoreText.setText(`Score: ${this.score}`);

      // Update ghosts eaten count
      this.ghostsEatenCount += ghostResult.ghostsEaten.length;
      const ghostsEatenText = this.children.getByName(
        'ghostsEatenText'
      ) as Phaser.GameObjects.Text;
      if (ghostsEatenText) {
        ghostsEatenText.setText(`Ghosts Eaten: ${this.ghostsEatenCount}/4`);
      }
    }
  }

  private handlePacmanDeath(): void {
    this.pacman.die();
    this.lives--;
    this.livesText.setText(`Lives: ${this.lives}`);

    if (this.lives > 0) {
      // Respawn after delay
      this.time.delayedCall(1000, () => {
        const pacmanSpawn = this.mapManager.getRandomSpawnPoint();
        if (pacmanSpawn) {
          const pacmanPos = tileToPixelCentered(
            pacmanSpawn.row,
            pacmanSpawn.col
          );
          const offset = this.mapManager.getMapOffset();
          this.pacman.reset(pacmanPos.x + offset.x, pacmanPos.y + offset.y);
        }
      });
    } else {
      // Game over
      this.time.delayedCall(1000, () => {
        this.scene.start('GameOverScene', {
          won: false,
          score: this.score,
        });
      });
    }
  }

  private checkGameState(): void {
    // Check if player won (all ghosts eaten)
    if (this.ghostsEatenCount >= GAME_CONFIG.GHOSTS_TO_EAT_TO_WIN) {
      this.foodManager.stopRegeneration();
      this.scene.start('GameOverScene', {
        won: true,
        score: this.score,
      });
    }
  }

  private showQuitDialog(): void {
    if (this.quitDialog) return;

    // Pause the game
    this.isPaused = true;

    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    // Create container for dialog
    this.quitDialog = this.add.container(0, 0);

    // Semi-transparent overlay
    const overlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0.7)
      .setOrigin(0)
      .setScrollFactor(0)
      .setInteractive();

    // Dialog background
    const dialogBg = this.add
      .rectangle(width / 2, height / 2, 400, 250, 0x1a1a1a)
      .setScrollFactor(0)
      .setStrokeStyle(4, 0xffffff);

    // Title text
    const titleText = this.add
      .text(width / 2, height / 2 - 70, 'Quit Game?', {
        fontSize: '32px',
        color: '#ffff00',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setScrollFactor(0);

    // Message text
    const messageText = this.add
      .text(
        width / 2,
        height / 2 - 20,
        'Are you sure you want to quit?\nYour progress will be lost.',
        {
          fontSize: '18px',
          color: '#ffffff',
          align: 'center',
        }
      )
      .setOrigin(0.5)
      .setScrollFactor(0);

    // Confirm button
    const confirmBtn = this.add
      .text(width / 2 - 80, height / 2 + 60, 'Quit', {
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#cc0000',
        padding: { x: 30, y: 10 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    confirmBtn.on('pointerover', () => {
      confirmBtn.setStyle({ backgroundColor: '#ff0000' });
    });

    confirmBtn.on('pointerout', () => {
      confirmBtn.setStyle({ backgroundColor: '#cc0000' });
    });

    confirmBtn.on('pointerdown', () => {
      this.hideQuitDialog();
      this.scene.start('MenuScene');
    });

    // Cancel button
    const cancelBtn = this.add
      .text(width / 2 + 80, height / 2 + 60, 'Cancel', {
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: { x: 30, y: 10 },
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    cancelBtn.on('pointerover', () => {
      cancelBtn.setStyle({ backgroundColor: '#555555' });
    });

    cancelBtn.on('pointerout', () => {
      cancelBtn.setStyle({ backgroundColor: '#333333' });
    });

    cancelBtn.on('pointerdown', () => {
      this.hideQuitDialog();
    });

    // Add all elements to container
    this.quitDialog.add([
      overlay,
      dialogBg,
      titleText,
      messageText,
      confirmBtn,
      cancelBtn,
    ]);
    this.quitDialog.setDepth(200);
  }

  private hideQuitDialog(): void {
    if (this.quitDialog) {
      this.quitDialog.destroy();
      this.quitDialog = null;
      this.isPaused = false;
    }
  }

  shutdown(): void {
    // Cleanup
    this.hideQuitDialog();
    this.foodManager?.destroy();
    this.pacman?.destroy();
    this.ghosts.forEach((ghost) => ghost.destroy());
    this.mapManager?.destroy();
  }
}
