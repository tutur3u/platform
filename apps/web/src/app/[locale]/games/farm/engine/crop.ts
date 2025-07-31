export enum CropType {
  WHEAT = 'wheat',
  CORN = 'corn',
  TOMATO = 'tomato',
  CARROT = 'carrot',
}

export enum GrowthStage {
  SEED = 'seed',
  SPROUT = 'sprout',
  GROWING = 'growing',
  MATURE = 'mature',
  HARVESTED = 'harvested',
}

export interface CropData {
  type: CropType;
  stage: GrowthStage;
  plantedAt: number;
  growthTime: number;
  harvestValue: number;
  waterLevel: number;
  maxWaterLevel: number;
}

export class Crop {
  private data: CropData;

  constructor(type: CropType, plantedAt: number) {
    this.data = {
      type,
      stage: GrowthStage.SEED,
      plantedAt,
      growthTime: this.getGrowthTime(type),
      harvestValue: this.getHarvestValue(type),
      waterLevel: 100,
      maxWaterLevel: 100,
    };
  }

  private getGrowthTime(type: CropType): number {
    switch (type) {
      case CropType.WHEAT:
        return 30000; // 30 seconds
      case CropType.CORN:
        return 45000; // 45 seconds
      case CropType.TOMATO:
        return 60000; // 60 seconds
      case CropType.CARROT:
        return 25000; // 25 seconds
      default:
        return 30000;
    }
  }

  private getHarvestValue(type: CropType): number {
    switch (type) {
      case CropType.WHEAT:
        return 10;
      case CropType.CORN:
        return 15;
      case CropType.TOMATO:
        return 25;
      case CropType.CARROT:
        return 8;
      default:
        return 10;
    }
  }

  update(currentTime: number): void {
    if (this.data.stage === GrowthStage.HARVESTED) return;

    const elapsed = currentTime - this.data.plantedAt;
    const stageProgress = elapsed / this.data.growthTime;

    // Update growth stage based on progress
    if (stageProgress >= 1.0) {
      this.data.stage = GrowthStage.MATURE;
    } else if (stageProgress >= 0.7) {
      this.data.stage = GrowthStage.GROWING;
    } else if (stageProgress >= 0.3) {
      this.data.stage = GrowthStage.SPROUT;
    }

    // Decrease water level over time
    this.data.waterLevel = Math.max(0, this.data.waterLevel - 0.5);
  }

  water(): void {
    this.data.waterLevel = Math.min(
      this.data.maxWaterLevel,
      this.data.waterLevel + 30
    );
  }

  harvest(): number {
    if (this.data.stage !== GrowthStage.MATURE) return 0;

    this.data.stage = GrowthStage.HARVESTED;
    return this.data.harvestValue;
  }

  getData(): CropData {
    return { ...this.data };
  }

  isHarvestable(): boolean {
    return this.data.stage === GrowthStage.MATURE;
  }

  isDead(): boolean {
    return this.data.waterLevel <= 0 && this.data.stage !== GrowthStage.SEED;
  }

  getGrowthProgress(): number {
    if (this.data.stage === GrowthStage.HARVESTED) return 1.0;

    const elapsed = Date.now() - this.data.plantedAt;
    return Math.min(1.0, elapsed / this.data.growthTime);
  }
}
