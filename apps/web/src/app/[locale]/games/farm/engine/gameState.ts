import { Crop, CropType, GrowthStage } from './crop';
import { Inventory } from './inventory';
import { Player } from './player';
import { Position } from './position';

export interface GameState {
  player: Player;
  gridSize: number;
  isGameRunning: boolean;
  crops: Map<string, Crop>;
  inventory: Inventory;
  selectedTool: 'plant' | 'water' | 'harvest' | null;
  selectedSeed: CropType | null;
}

export class GameStateManager {
  private state: GameState;
  private lastUpdateTime: number;

  constructor(gridSize: number = 20) {
    this.state = {
      player: new Player(
        new Position(Math.floor(gridSize / 2), Math.floor(gridSize / 2))
      ),
      gridSize,
      isGameRunning: true,
      crops: new Map(),
      inventory: new Inventory(),
      selectedTool: null,
      selectedSeed: null,
    };
    this.lastUpdateTime = Date.now();
  }

  getState(): GameState {
    return { ...this.state };
  }

  movePlayer(direction: 'up' | 'down' | 'left' | 'right'): boolean {
    if (!this.state.isGameRunning) return false;

    const newPlayer = new Player(
      new Position(
        this.state.player.getPosition().getX(),
        this.state.player.getPosition().getY()
      )
    );

    newPlayer.move(direction);

    // Check bounds
    const pos = newPlayer.getPosition();
    if (
      pos.getX() < 0 ||
      pos.getX() >= this.state.gridSize ||
      pos.getY() < 0 ||
      pos.getY() >= this.state.gridSize
    ) {
      return false; // Movement blocked by bounds
    }

    this.state.player = newPlayer;
    return true;
  }

  getPlayerPosition(): Position {
    return this.state.player.getPosition();
  }

  pauseGame(): void {
    this.state.isGameRunning = false;
  }

  resumeGame(): void {
    this.state.isGameRunning = true;
  }

  // Farming methods
  plantSeed(cropType: CropType): boolean {
    const pos = this.state.player.getPosition();
    const key = `${pos.getX()},${pos.getY()}`;

    // Check if cell is empty
    if (this.state.crops.has(key)) return false;

    // Check if player has seeds
    if (!this.state.inventory.useSeed(cropType)) return false;

    // Plant the crop
    const crop = new Crop(cropType, Date.now());
    this.state.crops.set(key, crop);
    return true;
  }

  waterCrop(): boolean {
    const pos = this.state.player.getPosition();
    const key = `${pos.getX()},${pos.getY()}`;
    const crop = this.state.crops.get(key);

    if (!crop) return false;

    crop.water();
    return true;
  }

  harvestCrop(): number {
    const pos = this.state.player.getPosition();
    const key = `${pos.getX()},${pos.getY()}`;
    const crop = this.state.crops.get(key);

    if (!crop || !crop.isHarvestable()) return 0;

    const harvestValue = crop.harvest();
    if (harvestValue > 0) {
      this.state.inventory.addHarvestedCrop(crop.getData().type, 1);
    }
    return harvestValue;
  }

  getCropAt(x: number, y: number): Crop | null {
    const key = `${x},${y}`;
    return this.state.crops.get(key) || null;
  }

  getAllCrops(): Map<string, Crop> {
    return new Map(this.state.crops);
  }

  updateCrops(): void {
    const currentTime = Date.now();
    this.state.crops.forEach((crop, key) => {
      crop.update(currentTime);

      // Remove dead crops
      if (crop.isDead()) {
        this.state.crops.delete(key);
      }
    });
    this.lastUpdateTime = currentTime;
  }

  setSelectedTool(tool: 'plant' | 'water' | 'harvest' | null): void {
    this.state.selectedTool = tool;
    if (tool !== 'plant') {
      this.state.selectedSeed = null;
    }
  }

  setSelectedSeed(seedType: CropType | null): void {
    this.state.selectedSeed = seedType;
    if (seedType) {
      this.state.selectedTool = 'plant';
    }
  }

  getInventory(): Inventory {
    return this.state.inventory;
  }

  // Action method that combines tool selection with player action
  performAction(): boolean {
    const pos = this.state.player.getPosition();
    const key = `${pos.getX()},${pos.getY()}`;

    switch (this.state.selectedTool) {
      case 'plant':
        if (this.state.selectedSeed) {
          return this.plantSeed(this.state.selectedSeed);
        }
        break;
      case 'water':
        return this.waterCrop();
      case 'harvest':
        return this.harvestCrop() > 0;
    }
    return false;
  }
}
