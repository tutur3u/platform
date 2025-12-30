'use client';

import { useState } from 'react';
import { CropType } from '../engine/crop';
import { Inventory } from '../engine/inventory';

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

const toolIcons = {
  plant: '🌱',
  water: '💧',
  harvest: '✂️',
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
  const [activeTab, setActiveTab] = useState<
    'tools' | 'seeds' | 'crops' | 'stats'
  >('tools');
  const seedData = Inventory.getSeedData();

  const totalSeeds = Object.values(CropType).reduce(
    (sum, type) => sum + inventory.getSeeds(type),
    0
  );
  const totalCrops = Object.values(CropType).reduce(
    (sum, type) => sum + inventory.getHarvestedCrops(type),
    0
  );
  const totalValue = Object.values(CropType).reduce((sum, type) => {
    const quantity = inventory.getHarvestedCrops(type);
    const sellValue = inventory.getMoney() > 0 ? 8 : 0; // Simplified calculation
    return sum + quantity * sellValue;
  }, 0);

  return (
    <div className="flex min-w-[320px] flex-col gap-4 rounded-lg border border-dynamic-gray/20 bg-dynamic-gray/5 p-4">
      {/* Money Display */}
      <div className="text-center">
        <div className="font-bold text-2xl text-dynamic-green">
          ${inventory.getMoney().toLocaleString()}
        </div>
        <div className="text-dynamic-gray/70 text-xs">Available Money</div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded bg-dynamic-blue/10 p-2">
          <div className="font-semibold text-dynamic-blue text-sm">
            {totalSeeds}
          </div>
          <div className="text-dynamic-gray/70 text-xs">Seeds</div>
        </div>
        <div className="rounded bg-dynamic-orange/10 p-2">
          <div className="font-semibold text-dynamic-orange text-sm">
            {totalCrops}
          </div>
          <div className="text-dynamic-gray/70 text-xs">Crops</div>
        </div>
        <div className="rounded bg-dynamic-green/10 p-2">
          <div className="font-semibold text-dynamic-green text-sm">
            ${totalValue}
          </div>
          <div className="text-dynamic-gray/70 text-xs">Value</div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 rounded bg-dynamic-gray/10 p-1">
        <button
          type="button"
          onClick={() => setActiveTab('tools')}
          className={`flex-1 rounded px-2 py-1 font-medium text-xs transition-colors ${
            activeTab === 'tools'
              ? 'bg-white text-dynamic-gray shadow-sm'
              : 'text-dynamic-gray/70 hover:text-dynamic-gray'
          }`}
        >
          Tools
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('seeds')}
          className={`flex-1 rounded px-2 py-1 font-medium text-xs transition-colors ${
            activeTab === 'seeds'
              ? 'bg-white text-dynamic-gray shadow-sm'
              : 'text-dynamic-gray/70 hover:text-dynamic-gray'
          }`}
        >
          Seeds
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('crops')}
          className={`flex-1 rounded px-2 py-1 font-medium text-xs transition-colors ${
            activeTab === 'crops'
              ? 'bg-white text-dynamic-gray shadow-sm'
              : 'text-dynamic-gray/70 hover:text-dynamic-gray'
          }`}
        >
          Crops
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('stats')}
          className={`flex-1 rounded px-2 py-1 font-medium text-xs transition-colors ${
            activeTab === 'stats'
              ? 'bg-white text-dynamic-gray shadow-sm'
              : 'text-dynamic-gray/70 hover:text-dynamic-gray'
          }`}
        >
          Stats
        </button>
      </div>

      {/* Tab Content */}
      <div className="min-h-[300px]">
        {activeTab === 'tools' && (
          <div className="space-y-3">
            <div className="font-semibold text-sm">Farming Tools</div>
            <div className="grid grid-cols-1 gap-2">
              {(['plant', 'water', 'harvest'] as const).map((tool) => (
                <button
                  type="button"
                  key={tool}
                  onClick={() =>
                    onToolSelect(selectedTool === tool ? null : tool)
                  }
                  className={`flex items-center gap-3 rounded p-3 text-left transition-all ${
                    selectedTool === tool
                      ? 'bg-dynamic-blue text-white shadow-md'
                      : 'bg-dynamic-gray/10 text-dynamic-gray hover:bg-dynamic-gray/20'
                  }`}
                >
                  <span className="text-lg">{toolIcons[tool]}</span>
                  <div>
                    <div className="font-medium capitalize">{tool}</div>
                    <div className="text-xs opacity-70">
                      {tool === 'plant' && 'Plant seeds in soil'}
                      {tool === 'water' && 'Water crops to keep them alive'}
                      {tool === 'harvest' && 'Harvest mature crops'}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'seeds' && (
          <div className="space-y-3">
            <div className="font-semibold text-sm">Seed Inventory</div>
            <div className="space-y-2">
              {seedData.map((seed) => (
                <div
                  key={seed.type}
                  className={`cursor-pointer rounded border p-3 transition-all ${
                    selectedSeed === seed.type
                      ? 'border-dynamic-blue bg-dynamic-blue/10'
                      : 'border-dynamic-gray/30 hover:border-dynamic-gray/50 hover:bg-dynamic-gray/10'
                  }`}
                  onClick={() =>
                    onSeedSelect(selectedSeed === seed.type ? null : seed.type)
                  }
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-4 w-4 rounded ${cropColors[seed.type]}`}
                      />
                      <div>
                        <div className="font-medium">
                          {cropNames[seed.type]}
                        </div>
                        <div className="text-dynamic-gray/70 text-xs">
                          ${seed.cost} per seed
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">
                        {inventory.getSeeds(seed.type)}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onBuySeeds(seed.type, 1);
                        }}
                        className="rounded bg-dynamic-green/20 px-2 py-1 text-dynamic-green text-xs hover:bg-dynamic-green/30"
                      >
                        Buy
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'crops' && (
          <div className="space-y-3">
            <div className="font-semibold text-sm">Harvested Crops</div>
            <div className="space-y-2">
              {Object.values(CropType).map((cropType) => {
                const quantity = inventory.getHarvestedCrops(cropType);
                if (quantity === 0) return null;

                return (
                  <div
                    key={cropType}
                    className="flex items-center justify-between rounded bg-dynamic-gray/10 p-3"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`h-4 w-4 rounded ${cropColors[cropType]}`}
                      />
                      <div>
                        <div className="font-medium">{cropNames[cropType]}</div>
                        <div className="text-dynamic-gray/70 text-xs">
                          $
                          {cropType === CropType.WHEAT
                            ? 8
                            : cropType === CropType.CORN
                              ? 12
                              : cropType === CropType.TOMATO
                                ? 20
                                : 6}{' '}
                          each
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{quantity}</div>
                      <button
                        type="button"
                        onClick={() => onSellCrops(cropType, 1)}
                        className="rounded bg-dynamic-orange/20 px-2 py-1 text-dynamic-orange text-xs hover:bg-dynamic-orange/30"
                      >
                        Sell
                      </button>
                    </div>
                  </div>
                );
              })}
              {Object.values(CropType).every(
                (type) => inventory.getHarvestedCrops(type) === 0
              ) && (
                <div className="py-8 text-center text-dynamic-gray/70 text-sm">
                  No harvested crops yet
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'stats' && (
          <div className="space-y-3">
            <div className="font-semibold text-sm">Farming Statistics</div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Total Seeds:</span>
                <span className="font-semibold">{totalSeeds}</span>
              </div>
              <div className="flex justify-between">
                <span>Total Crops:</span>
                <span className="font-semibold">{totalCrops}</span>
              </div>
              <div className="flex justify-between">
                <span>Crop Value:</span>
                <span className="font-semibold">${totalValue}</span>
              </div>
              <div className="flex justify-between">
                <span>Net Worth:</span>
                <span className="font-semibold">
                  ${(inventory.getMoney() + totalValue).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="mt-4 rounded bg-dynamic-blue/10 p-3">
              <div className="mb-2 font-semibold text-dynamic-blue text-xs">
                Tips
              </div>
              <div className="space-y-1 text-dynamic-gray/70 text-xs">
                <div>• Water crops regularly to prevent death</div>
                <div>• Harvest mature crops for maximum profit</div>
                <div>• Different crops have different growth times</div>
                <div>• Sell crops when you need money for seeds</div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="border-dynamic-gray/20 border-t pt-3">
        <div className="mb-2 font-semibold text-xs">Quick Actions</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              Object.values(CropType).forEach((type) => {
                const quantity = inventory.getHarvestedCrops(type);
                if (quantity > 0) onSellCrops(type, quantity);
              });
            }}
            className="flex-1 rounded bg-dynamic-orange/20 px-2 py-1 text-dynamic-orange text-xs hover:bg-dynamic-orange/30"
          >
            Sell All
          </button>
          <button
            type="button"
            onClick={() => {
              Object.values(CropType).forEach((type) => {
                onBuySeeds(type, 1);
              });
            }}
            className="flex-1 rounded bg-dynamic-green/20 px-2 py-1 text-dynamic-green text-xs hover:bg-dynamic-green/30"
          >
            Buy All
          </button>
        </div>
      </div>
    </div>
  );
}
