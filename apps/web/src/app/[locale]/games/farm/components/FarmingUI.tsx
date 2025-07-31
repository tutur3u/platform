'use client';

import { CropType, GrowthStage } from '../engine/crop';
import { Inventory, SeedData } from '../engine/inventory';

interface FarmingUIProps {
  inventory: Inventory;
  selectedTool: 'plant' | 'water' | 'harvest' | null;
  selectedSeed: CropType | null;
  onToolSelect: (tool: 'plant' | 'water' | 'harvest' | null) => void;
  onSeedSelect: (seed: CropType | null) => void;
  onBuySeeds: (type: CropType, quantity: number) => void;
  onSellCrops: (type: CropType, quantity: number) => void;
}

const cropColors = {
  [CropType.WHEAT]: 'bg-dynamic-yellow',
  [CropType.CORN]: 'bg-dynamic-orange',
  [CropType.TOMATO]: 'bg-dynamic-red',
  [CropType.CARROT]: 'bg-dynamic-orange',
};

const cropNames = {
  [CropType.WHEAT]: 'Wheat',
  [CropType.CORN]: 'Corn',
  [CropType.TOMATO]: 'Tomato',
  [CropType.CARROT]: 'Carrot',
};

export function FarmingUI({
  inventory,
  selectedTool,
  selectedSeed,
  onToolSelect,
  onSeedSelect,
  onBuySeeds,
  onSellCrops,
}: FarmingUIProps) {
  const seedData = Inventory.getSeedData();

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-dynamic-gray/20 bg-dynamic-gray/5 p-4">
      {/* Money Display */}
      <div className="text-center">
        <div className="text-lg font-bold text-dynamic-green">
          ${inventory.getMoney()}
        </div>
        <div className="text-xs text-dynamic-gray/70">Money</div>
      </div>

      {/* Tools */}
      <div>
        <div className="mb-2 text-sm font-semibold">Tools</div>
        <div className="flex gap-2">
          <button
            onClick={() => onToolSelect('plant')}
            className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
              selectedTool === 'plant'
                ? 'bg-dynamic-blue text-white'
                : 'bg-dynamic-gray/20 text-dynamic-gray hover:bg-dynamic-gray/30'
            }`}
          >
            Plant
          </button>
          <button
            onClick={() => onToolSelect('water')}
            className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
              selectedTool === 'water'
                ? 'bg-dynamic-blue text-white'
                : 'bg-dynamic-gray/20 text-dynamic-gray hover:bg-dynamic-gray/30'
            }`}
          >
            Water
          </button>
          <button
            onClick={() => onToolSelect('harvest')}
            className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
              selectedTool === 'harvest'
                ? 'bg-dynamic-blue text-white'
                : 'bg-dynamic-gray/20 text-dynamic-gray hover:bg-dynamic-gray/30'
            }`}
          >
            Harvest
          </button>
        </div>
      </div>

      {/* Seeds */}
      <div>
        <div className="mb-2 text-sm font-semibold">Seeds</div>
        <div className="grid grid-cols-2 gap-2">
          {seedData.map((seed) => (
            <div
              key={seed.type}
              className={`cursor-pointer rounded border p-2 transition-colors ${
                selectedSeed === seed.type
                  ? 'border-dynamic-blue bg-dynamic-blue/10'
                  : 'border-dynamic-gray/30 hover:border-dynamic-gray/50'
              }`}
              onClick={() =>
                onSeedSelect(selectedSeed === seed.type ? null : seed.type)
              }
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded ${cropColors[seed.type]}`} />
                  <span className="text-sm">{cropNames[seed.type]}</span>
                </div>
                <span className="text-xs text-dynamic-gray/70">
                  {inventory.getSeeds(seed.type)}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-xs text-dynamic-gray/70">
                  ${seed.cost}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onBuySeeds(seed.type, 1);
                  }}
                  className="rounded bg-dynamic-green/20 px-2 py-1 text-xs text-dynamic-green hover:bg-dynamic-green/30"
                >
                  Buy
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Harvested Crops */}
      <div>
        <div className="mb-2 text-sm font-semibold">Harvested Crops</div>
        <div className="space-y-2">
          {Object.values(CropType).map((cropType) => {
            const quantity = inventory.getHarvestedCrops(cropType);
            if (quantity === 0) return null;

            return (
              <div
                key={cropType}
                className="flex items-center justify-between rounded bg-dynamic-gray/10 p-2"
              >
                <div className="flex items-center gap-2">
                  <div className={`h-3 w-3 rounded ${cropColors[cropType]}`} />
                  <span className="text-sm">{cropNames[cropType]}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm">{quantity}</span>
                  <button
                    onClick={() => onSellCrops(cropType, 1)}
                    className="rounded bg-dynamic-orange/20 px-2 py-1 text-xs text-dynamic-orange hover:bg-dynamic-orange/30"
                  >
                    Sell
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Instructions */}
      <div className="space-y-1 text-xs text-dynamic-gray/70">
        <div>• Select a tool and press SPACE to use it</div>
        <div>• Plant seeds on empty soil</div>
        <div>• Water crops to keep them alive</div>
        <div>• Harvest mature crops for money</div>
      </div>
    </div>
  );
}
