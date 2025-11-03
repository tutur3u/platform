import { GAME_CONFIG } from '../config';
import { Ghost } from '../entities/Ghost';
import { Pacman } from '../entities/Pacman';
import { CollisionManager } from '../managers/CollisionManager';
import { FoodManager } from '../managers/FoodManager';
import { MapManager } from '../managers/MapManager';
import { FoodType, GhostState, GhostType } from '../types';
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
  private scoreText!: Phaser.GameObjects.Text;
  private livesText!: Phaser.GameObjects.Text;
  private mapId: string = '';
  private quitDialog: Phaser.GameObjects.Container | null = null;
  private isPaused: boolean = false;
  private isReady: boolean = false;
  private readyText: Phaser.GameObjects.Text | null = null;
  private currentGhostPhase: GhostState = GhostState.SCATTER;
  private gameStateTimer!: Phaser.Time.TimerEvent;
  private fruitSpawnTimer!: Phaser.Time.TimerEvent;
  private ghostPhaseTimer!: Phaser.Time.TimerEvent;

  constructor() {
    super({ key: 'GameScene' });
  }

  init(data: GameData): void {
    this.mapId = data.mapId;
    this.score = 0;
    this.lives = GAME_CONFIG.INITIAL_LIVES;
    this.ghosts = [];
    this.currentGhostPhase = GhostState.SCATTER;
  }

  preload(): void {
    // Load Pacman animations for each direction
    for (let i = 1; i <= 3; i++) {
      this.load.image(`pacman-up-${i}`, `/neo-pacman/pacman-up/${i}.png`);
      this.load.image(`pacman-down-${i}`, `/neo-pacman/pacman-down/${i}.png`);
      this.load.image(`pacman-left-${i}`, `/neo-pacman/pacman-left/${i}.png`);
      this.load.image(`pacman-right-${i}`, `/neo-pacman/pacman-right/${i}.png`);
    }

    // Load ghost images
    this.load.image('blinky', '/neo-pacman/ghosts/blinky.png');
    this.load.image('pinky', '/neo-pacman/ghosts/pinky.png');
    this.load.image('inky', '/neo-pacman/ghosts/inky.png');
    this.load.image('clyde', '/neo-pacman/ghosts/clyde.png');
    this.load.image('blue_ghost', '/neo-pacman/ghosts/blue_ghost.png');

    // Load food images
    this.load.image('apple', '/neo-pacman/other/apple.png');
    this.load.image('dot', '/neo-pacman/other/dot.png');
    this.load.image('strawberry', '/neo-pacman/other/strawberry.png');
  }

  create(): void {
    // Initialize managers
    this.collisionManager = new CollisionManager();
    this.mapManager = new MapManager(this);
    this.foodManager = new FoodManager(this, this.mapManager);

    // Load and create map
    const mapData = this.mapManager.loadMap(this.mapId);
    this.mapManager.createTilemap(mapData);

    // Setup camera
    const { width, height } = this.mapManager.getMapDimensions();
    this.cameras.main.setBounds(0, 0, width, height);
    this.cameras.main.setBackgroundColor('#000000');

    // Spawn Pacman
    this.spawnPacman();

    // Spawn ghosts
    this.spawnGhosts();

    // Spawn food
    this.foodManager.spawnInitialFood();

    // Setup physics collisions
    this.setupPhysicsCollisions();

    // Create UI
    this.createUI();

    // Initialize game timers
    this.initGameTimers();

    // Show ready message and start game after delay
    this.showReadyMessage();
  }

  private spawnPacman(): void {
    const entities = this.mapManager.getMapEntities();
    if (!entities?.pacmanSpawn) {
      console.warn('No Pacman spawn point defined in map, using fallback');
      const fallbackSpawn = this.mapManager.getRandomSpawnPoint();
      if (fallbackSpawn) {
        this.pacman = new Pacman(this, this.mapManager, fallbackSpawn);
      }
      return;
    }

    this.pacman = new Pacman(this, this.mapManager, entities.pacmanSpawn);
  }

  private spawnGhosts(): void {
    const entities = this.mapManager.getMapEntities();
    if (!entities) {
      console.warn('No map entities found');
      return;
    }

    const ghostTypes = Object.values(GhostType);

    ghostTypes.forEach((type) => {
      const spawnPos = entities.ghostSpawns.get(type);
      if (spawnPos) {
        const ghost = new Ghost(this, this.mapManager, type, spawnPos);
        this.ghosts.push(ghost);
      } else {
        console.warn(
          `No spawn point defined for ghost type: ${type}, using center as fallback`
        );
        const centerSpawn = this.mapManager.getCenterSpawnPoint();
        const ghost = new Ghost(this, this.mapManager, type, centerSpawn);
        this.ghosts.push(ghost);
      }
    });
  }

  private setupPhysicsCollisions(): void {
    const wallsGroup = this.mapManager.getWallsGroup();
    if (!wallsGroup) return;

    // Pacman collides with walls
    this.physics.add.collider(this.pacman.sprite, wallsGroup);

    // Ghosts collide with walls (except when in EATEN state - handled in movement logic)
    this.ghosts.forEach((ghost) => {
      this.physics.add.collider(ghost.sprite, wallsGroup);
    });
  }

  private createUI(): void {
    // Quit button
    const quitBtn = this.add
      .text(10, 10, 'Quit', {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#800000',
        padding: { x: 10, y: 5 },
      })
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true });

    quitBtn.on('pointerover', () => {
      quitBtn.setStyle({ backgroundColor: '#ff0000' });
    });

    // Score
    this.scoreText = this.add
      .text(this.cameras.main.width - 10, 10, `Score: ${this.score}`, {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

    // Lives
    this.livesText = this.add
      .text(this.cameras.main.width - 10, 40, `Lives: ${this.lives}`, {
        fontSize: '20px',
        color: '#ffffff',
        backgroundColor: '#000000',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(100);

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

  private handlePacmanDeath(): void {
    this.pacman.die();
    this.lives--;
    this.livesText.setText(`Lives: ${this.lives}`);

    if (this.lives > 0) {
      // Respawn after delay
      this.time.delayedCall(1000, () => this.reset());
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
    // Check if player won (all food eaten)
    if (!this.foodManager.hasFood()) {
      this.scene.start('GameOverScene', {
        won: true,
        score: this.score,
      });
    }
  }

  private showReadyMessage(): void {
    // Set ready state
    this.isReady = true;

    // Pause game timers
    this.pauseGameTimers();

    // Create ready text in center of screen
    const width = this.cameras.main.width;
    const height = this.cameras.main.height;

    this.readyText = this.add
      .text(width / 2, height / 2, 'READY!!!', {
        fontSize: '64px',
        color: '#ffff00',
        fontStyle: 'bold',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(150);

    // Hide message and start game after 2 seconds
    this.time.delayedCall(2000, () => {
      if (this.readyText) {
        this.readyText.destroy();
        this.readyText = null;
      }
      this.isReady = false;
      // Resume game timers
      this.resumeGameTimers();
    });
  }

  private showQuitDialog(): void {
    if (this.quitDialog) return;

    // Pause the game
    this.isPaused = true;
    this.pauseGameTimers();

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
      this.resumeGameTimers();
    }
  }

  private switchGhostPhase(): void {
    // Toggle between chase and scatter
    if (this.currentGhostPhase === GhostState.SCATTER) {
      this.currentGhostPhase = GhostState.CHASE;
      this.ghostPhaseTimer.reset({
        delay: GAME_CONFIG.GHOST_CHASE_TIME,
        callback: () => this.switchGhostPhase(),
        callbackScope: this,
        loop: true,
      });
    } else {
      this.currentGhostPhase = GhostState.SCATTER;
      this.ghostPhaseTimer.reset({
        delay: GAME_CONFIG.GHOST_SCATTER_TIME,
        callback: () => this.switchGhostPhase(),
        callbackScope: this,
        loop: true,
      });
    }

    // Apply phase to all ghosts
    this.ghosts.forEach((ghost) => {
      if (
        ghost.state === GhostState.CHASE ||
        ghost.state === GhostState.SCATTER
      ) {
        ghost.setState(this.currentGhostPhase);
      }
    });
  }

  private initGameTimers(): void {
    this.gameStateTimer = this.time.addEvent({
      delay: 100,
      callback: this.checkGameState,
      callbackScope: this,
      loop: true,
    });
    this.fruitSpawnTimer = this.time.addEvent({
      delay: GAME_CONFIG.FRUIT_SPAWN_INTERVAL,
      callback: () => {
        this.foodManager.spawnFruits();
      },
      callbackScope: this,
      loop: true,
    });
    this.ghostPhaseTimer = this.time.addEvent({
      delay: GAME_CONFIG.GHOST_SCATTER_TIME,
      callback: () => this.switchGhostPhase(),
      callbackScope: this,
      loop: true,
    });
  }

  private resetGameTimers(): void {
    if (this.gameStateTimer) {
      this.gameStateTimer.reset({
        delay: 100,
        callback: this.checkGameState,
        callbackScope: this,
        loop: true,
      });
    }
    if (this.fruitSpawnTimer) {
      this.fruitSpawnTimer.reset({
        delay: GAME_CONFIG.FRUIT_SPAWN_INTERVAL,
        callback: () => {
          this.foodManager.spawnFruits();
        },
        callbackScope: this,
        loop: true,
      });
    }
    if (this.ghostPhaseTimer) {
      this.ghostPhaseTimer.reset({
        delay: GAME_CONFIG.GHOST_SCATTER_TIME,
        callback: () => this.switchGhostPhase(),
        callbackScope: this,
        loop: true,
      });
    }
  }

  private pauseGameTimers(): void {
    if (this.gameStateTimer) {
      this.gameStateTimer.paused = true;
    }
    if (this.fruitSpawnTimer) {
      this.fruitSpawnTimer.paused = true;
    }
    if (this.ghostPhaseTimer) {
      this.ghostPhaseTimer.paused = true;
    }
  }

  private resumeGameTimers(): void {
    if (this.gameStateTimer) {
      this.gameStateTimer.paused = false;
    }
    if (this.fruitSpawnTimer) {
      this.fruitSpawnTimer.paused = false;
    }
    if (this.ghostPhaseTimer) {
      this.ghostPhaseTimer.paused = false;
    }
  }

  update(): void {
    if (!this.pacman || this.isPaused || this.isReady) return;

    // Update Pacman
    this.pacman.update();

    // Update ghosts
    this.ghosts.forEach((ghost) => {
      ghost.update(this.pacman);
    });

    // Check food collision
    const { foodsEaten, points } =
      this.collisionManager.checkPacmanFoodCollision(
        this.pacman,
        this.foodManager.getAllFood()
      );
    if (points > 0) {
      this.score += points;
      this.scoreText.setText(`Score: ${this.score}`);

      foodsEaten.forEach((food) => {
        this.foodManager.removeFood(food.position);
      });

      // Power pellet eaten - make ghosts frightened
      const powerPelletEaten = foodsEaten.some(
        (food) => food.type === FoodType.POWER_PELLET
      );
      if (powerPelletEaten) {
        this.ghosts.forEach((ghost) =>
          ghost.makeFrightened(this.currentGhostPhase)
        );
      }
    }

    // Check ghost collision
    const {
      pacmanEaten,
      ghostsEaten,
      points: ghostPoints,
    } = this.collisionManager.checkPacmanGhostCollision(
      this.pacman,
      this.ghosts
    );

    if (pacmanEaten) {
      this.handlePacmanDeath();
    }

    if (ghostsEaten.length > 0) {
      this.score += ghostPoints;
      this.scoreText.setText(`Score: ${this.score}`);
    }
  }

  reset(): void {
    this.pacman.reset();
    this.ghosts.forEach((ghost) => ghost.reset());

    // Reset ghost phase to scatter
    this.currentGhostPhase = GhostState.SCATTER;
    this.resetGameTimers();

    this.showReadyMessage();
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
