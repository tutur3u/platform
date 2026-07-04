'use client';

import { type LucideIcon, Scissors, Sprout, Waves } from '@tuturuuu/icons';
import { useState } from 'react';
import { CropType } from './engine/crop';
import { Inventory } from './engine/inventory';

type FarmTool = 'plant' | 'water' | 'harvest';
type FarmTab = 'tools' | 'seeds' | 'crops' | 'stats';

interface FarmingUIProps {
  inventory: Inventory;
  selectedTool: FarmTool | null;
  selectedSeed: CropType | null;
  onToolSelect: (tool: FarmTool | null) => void;
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

const cropSellValues = {
  [CropType.WHEAT]: 8,
  [CropType.CORN]: 12,
  [CropType.TOMATO]: 20,
  [CropType.CARROT]: 6,
};

const toolConfig: Record<
  FarmTool,
  {
    description: string;
    Icon: LucideIcon;
    label: string;
  }
> = {
  harvest: {
    description: 'Harvest mature crops',
    Icon: Scissors,
    label: 'Harvest',
  },
  plant: {
    description: 'Plant seeds in soil',
    Icon: Sprout,
    label: 'Plant',
  },
  water: {
    description: 'Water crops to keep them alive',
    Icon: Waves,
    label: 'Water',
  },
};

export function FarmingUI(props: FarmingUIProps) {
  const [activeTab, setActiveTab] = useState<FarmTab>('tools');
  const totals = getInventoryTotals(props.inventory);

  return (
    <div className="flex min-w-80 flex-col gap-4 rounded-lg border border-dynamic-gray/20 bg-dynamic-gray/5 p-4">
      <MoneySummary inventory={props.inventory} totals={totals} />
      <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="min-h-75">
        {activeTab === 'tools' && <ToolsPanel {...props} />}
        {activeTab === 'seeds' && <SeedsPanel {...props} />}
        {activeTab === 'crops' && <CropsPanel {...props} />}
        {activeTab === 'stats' && (
          <StatsPanel inventory={props.inventory} totals={totals} />
        )}
      </div>
      <QuickActions
        inventory={props.inventory}
        onBuySeeds={props.onBuySeeds}
        onSellCrops={props.onSellCrops}
      />
    </div>
  );
}

function getInventoryTotals(inventory: Inventory) {
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
    return sum + quantity * cropSellValues[type];
  }, 0);

  return { totalCrops, totalSeeds, totalValue };
}

function MoneySummary({
  inventory,
  totals,
}: {
  inventory: Inventory;
  totals: ReturnType<typeof getInventoryTotals>;
}) {
  return (
    <>
      <div className="text-center">
        <div className="font-bold text-2xl text-dynamic-green">
          ${inventory.getMoney().toLocaleString()}
        </div>
        <div className="text-dynamic-gray/70 text-xs">Available Money</div>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <StatTile label="Seeds" tone="blue" value={totals.totalSeeds} />
        <StatTile label="Crops" tone="orange" value={totals.totalCrops} />
        <StatTile label="Value" tone="green" value={`$${totals.totalValue}`} />
      </div>
    </>
  );
}

function StatTile({
  label,
  tone,
  value,
}: {
  label: string;
  tone: 'blue' | 'green' | 'orange';
  value: number | string;
}) {
  const colorClass = {
    blue: 'bg-dynamic-blue/10 text-dynamic-blue',
    green: 'bg-dynamic-green/10 text-dynamic-green',
    orange: 'bg-dynamic-orange/10 text-dynamic-orange',
  }[tone];

  return (
    <div className={`rounded p-2 ${colorClass}`}>
      <div className="font-semibold text-sm">{value}</div>
      <div className="text-dynamic-gray/70 text-xs">{label}</div>
    </div>
  );
}

function TabNavigation({
  activeTab,
  onTabChange,
}: {
  activeTab: FarmTab;
  onTabChange: (tab: FarmTab) => void;
}) {
  return (
    <div className="flex gap-1 rounded bg-dynamic-gray/10 p-1">
      {(['tools', 'seeds', 'crops', 'stats'] as const).map((tab) => (
        <button
          className={`flex-1 rounded px-2 py-1 font-medium text-xs capitalize transition-colors ${
            activeTab === tab
              ? 'bg-background text-dynamic-gray shadow-sm'
              : 'text-dynamic-gray/70 hover:text-dynamic-gray'
          }`}
          key={tab}
          onClick={() => onTabChange(tab)}
          type="button"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

function ToolsPanel({
  onToolSelect,
  selectedTool,
}: Pick<FarmingUIProps, 'onToolSelect' | 'selectedTool'>) {
  return (
    <div className="space-y-3">
      <div className="font-semibold text-sm">Farming Tools</div>
      <div className="grid grid-cols-1 gap-2">
        {(Object.keys(toolConfig) as FarmTool[]).map((tool) => {
          const { description, Icon, label } = toolConfig[tool];
          const selected = selectedTool === tool;

          return (
            <button
              className={`flex items-center gap-3 rounded p-3 text-left transition-all ${
                selected
                  ? 'bg-dynamic-blue text-white shadow-md'
                  : 'bg-dynamic-gray/10 text-dynamic-gray hover:bg-dynamic-gray/20'
              }`}
              key={tool}
              onClick={() => onToolSelect(selected ? null : tool)}
              type="button"
            >
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" />
              <span>
                <span className="block font-medium">{label}</span>
                <span className="block text-xs opacity-70">{description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function SeedsPanel({
  inventory,
  onBuySeeds,
  onSeedSelect,
  selectedSeed,
}: Pick<
  FarmingUIProps,
  'inventory' | 'onBuySeeds' | 'onSeedSelect' | 'selectedSeed'
>) {
  return (
    <div className="space-y-3">
      <div className="font-semibold text-sm">Seed Inventory</div>
      <div className="space-y-2">
        {Inventory.getSeedData().map((seed) => (
          <div
            className={`flex items-center justify-between gap-3 rounded border p-3 transition-all ${
              selectedSeed === seed.type
                ? 'border-dynamic-blue bg-dynamic-blue/10'
                : 'border-dynamic-gray/30 hover:border-dynamic-gray/50 hover:bg-dynamic-gray/10'
            }`}
            key={seed.type}
          >
            <button
              className="flex min-w-0 flex-1 items-center gap-3 text-left"
              onClick={() =>
                onSeedSelect(selectedSeed === seed.type ? null : seed.type)
              }
              type="button"
            >
              <span className={`h-4 w-4 rounded ${cropColors[seed.type]}`} />
              <span className="min-w-0">
                <span className="block font-medium">
                  {cropNames[seed.type]}
                </span>
                <span className="block text-dynamic-gray/70 text-xs">
                  ${seed.cost} per seed
                </span>
              </span>
            </button>
            <div className="text-right">
              <div className="font-semibold">
                {inventory.getSeeds(seed.type)}
              </div>
              <button
                className="rounded bg-dynamic-green/20 px-2 py-1 text-dynamic-green text-xs hover:bg-dynamic-green/30"
                onClick={() => onBuySeeds(seed.type, 1)}
                type="button"
              >
                Buy
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CropsPanel({
  inventory,
  onSellCrops,
}: Pick<FarmingUIProps, 'inventory' | 'onSellCrops'>) {
  const harvestedCropTypes = Object.values(CropType).filter(
    (cropType) => inventory.getHarvestedCrops(cropType) > 0
  );

  return (
    <div className="space-y-3">
      <div className="font-semibold text-sm">Harvested Crops</div>
      <div className="space-y-2">
        {harvestedCropTypes.map((cropType) => (
          <div
            className="flex items-center justify-between rounded bg-dynamic-gray/10 p-3"
            key={cropType}
          >
            <div className="flex items-center gap-3">
              <div className={`h-4 w-4 rounded ${cropColors[cropType]}`} />
              <div>
                <div className="font-medium">{cropNames[cropType]}</div>
                <div className="text-dynamic-gray/70 text-xs">
                  ${cropSellValues[cropType]} each
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-semibold">
                {inventory.getHarvestedCrops(cropType)}
              </div>
              <button
                className="rounded bg-dynamic-orange/20 px-2 py-1 text-dynamic-orange text-xs hover:bg-dynamic-orange/30"
                onClick={() => onSellCrops(cropType, 1)}
                type="button"
              >
                Sell
              </button>
            </div>
          </div>
        ))}
        {harvestedCropTypes.length === 0 && (
          <div className="py-8 text-center text-dynamic-gray/70 text-sm">
            No harvested crops yet
          </div>
        )}
      </div>
    </div>
  );
}
function StatsPanel({
  inventory,
  totals,
}: {
  inventory: Inventory;
  totals: ReturnType<typeof getInventoryTotals>;
}) {
  return (
    <div className="space-y-3">
      <div className="font-semibold text-sm">Farming Statistics</div>
      <div className="space-y-2 text-sm">
        <StatsRow label="Total Seeds" value={totals.totalSeeds} />
        <StatsRow label="Total Crops" value={totals.totalCrops} />
        <StatsRow label="Crop Value" value={`$${totals.totalValue}`} />
        <StatsRow
          label="Net Worth"
          value={`$${(inventory.getMoney() + totals.totalValue).toLocaleString()}`}
        />
      </div>
      <div className="mt-4 rounded bg-dynamic-blue/10 p-3">
        <div className="mb-2 font-semibold text-dynamic-blue text-xs">Tips</div>
        <ul className="list-disc space-y-1 pl-4 text-dynamic-gray/70 text-xs">
          <li>Water crops regularly to prevent death</li>
          <li>Harvest mature crops for maximum profit</li>
          <li>Different crops have different growth times</li>
          <li>Sell crops when you need money for seeds</li>
        </ul>
      </div>
    </div>
  );
}

function StatsRow({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex justify-between">
      <span>{label}:</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}

function QuickActions({
  inventory,
  onBuySeeds,
  onSellCrops,
}: Pick<FarmingUIProps, 'inventory' | 'onBuySeeds' | 'onSellCrops'>) {
  return (
    <div className="border-dynamic-gray/20 border-t pt-3">
      <div className="mb-2 font-semibold text-xs">Quick Actions</div>
      <div className="flex gap-2">
        <button
          className="flex-1 rounded bg-dynamic-orange/20 px-2 py-1 text-dynamic-orange text-xs hover:bg-dynamic-orange/30"
          onClick={() => {
            Object.values(CropType).forEach((type) => {
              const quantity = inventory.getHarvestedCrops(type);
              if (quantity > 0) onSellCrops(type, quantity);
            });
          }}
          type="button"
        >
          Sell All
        </button>
        <button
          className="flex-1 rounded bg-dynamic-green/20 px-2 py-1 text-dynamic-green text-xs hover:bg-dynamic-green/30"
          onClick={() => {
            Object.values(CropType).forEach((type) => {
              onBuySeeds(type, 1);
            });
          }}
          type="button"
        >
          Buy All
        </button>
      </div>
    </div>
  );
}
