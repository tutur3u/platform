import { CropType } from './crop';

export interface InventoryItem {
  type: CropType;
  quantity: number;
}

export interface SeedData {
  type: CropType;
  cost: number;
  name: string;
}

export class Inventory {
  private seeds: Map<CropType, number>;
  private harvestedCrops: Map<CropType, number>;
  private money: number;

  constructor() {
    this.seeds = new Map();
    this.harvestedCrops = new Map();
    this.money = 100; // Starting money

    // Initialize with some starting seeds
    this.addSeeds(CropType.WHEAT, 5);
    this.addSeeds(CropType.CARROT, 3);
  }

  static getSeedData(): SeedData[] {
    return [
      { type: CropType.WHEAT, cost: 5, name: 'Wheat Seeds' },
      { type: CropType.CORN, cost: 8, name: 'Corn Seeds' },
      { type: CropType.TOMATO, cost: 12, name: 'Tomato Seeds' },
      { type: CropType.CARROT, cost: 3, name: 'Carrot Seeds' },
    ];
  }

  getMoney(): number {
    return this.money;
  }

  addMoney(amount: number): void {
    this.money += amount;
  }

  spendMoney(amount: number): boolean {
    if (this.money >= amount) {
      this.money -= amount;
      return true;
    }
    return false;
  }

  getSeeds(type: CropType): number {
    return this.seeds.get(type) || 0;
  }

  addSeeds(type: CropType, quantity: number): void {
    const current = this.seeds.get(type) || 0;
    this.seeds.set(type, current + quantity);
  }

  useSeed(type: CropType): boolean {
    const current = this.seeds.get(type) || 0;
    if (current > 0) {
      this.seeds.set(type, current - 1);
      return true;
    }
    return false;
  }

  getHarvestedCrops(type: CropType): number {
    return this.harvestedCrops.get(type) || 0;
  }

  addHarvestedCrop(type: CropType, quantity: number): void {
    const current = this.harvestedCrops.get(type) || 0;
    this.harvestedCrops.set(type, current + quantity);
  }

  sellCrop(type: CropType, quantity: number): number {
    const current = this.harvestedCrops.get(type) || 0;
    if (current >= quantity) {
      this.harvestedCrops.set(type, current - quantity);

      // Calculate sell value
      const sellValue = this.getCropSellValue(type) * quantity;
      this.addMoney(sellValue);
      return sellValue;
    }
    return 0;
  }

  private getCropSellValue(type: CropType): number {
    switch (type) {
      case CropType.WHEAT:
        return 8;
      case CropType.CORN:
        return 12;
      case CropType.TOMATO:
        return 20;
      case CropType.CARROT:
        return 6;
      default:
        return 8;
    }
  }

  getAllSeeds(): Map<CropType, number> {
    return new Map(this.seeds);
  }

  getAllHarvestedCrops(): Map<CropType, number> {
    return new Map(this.harvestedCrops);
  }

  buySeeds(type: CropType, quantity: number): boolean {
    const seedData = Inventory.getSeedData().find((s) => s.type === type);
    if (!seedData) return false;

    const totalCost = seedData.cost * quantity;
    if (this.spendMoney(totalCost)) {
      this.addSeeds(type, quantity);
      return true;
    }
    return false;
  }
}
