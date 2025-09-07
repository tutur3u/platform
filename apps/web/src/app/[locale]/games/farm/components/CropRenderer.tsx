import { type Crop, CropType, GrowthStage } from '../engine/crop';

interface CropRendererProps {
  crop: Crop;
  cellSize: number;
  x: number;
  y: number;
}

const cropColors = {
  [CropType.WHEAT]: {
    [GrowthStage.SEED]: 'bg-dynamic-brown',
    [GrowthStage.SPROUT]: 'bg-dynamic-green/60',
    [GrowthStage.GROWING]: 'bg-dynamic-green/80',
    [GrowthStage.MATURE]: 'bg-dynamic-yellow',
    [GrowthStage.HARVESTED]: 'bg-dynamic-gray/30',
  },
  [CropType.CORN]: {
    [GrowthStage.SEED]: 'bg-dynamic-brown',
    [GrowthStage.SPROUT]: 'bg-dynamic-green/60',
    [GrowthStage.GROWING]: 'bg-dynamic-green/80',
    [GrowthStage.MATURE]: 'bg-dynamic-orange',
    [GrowthStage.HARVESTED]: 'bg-dynamic-gray/30',
  },
  [CropType.TOMATO]: {
    [GrowthStage.SEED]: 'bg-dynamic-brown',
    [GrowthStage.SPROUT]: 'bg-dynamic-green/60',
    [GrowthStage.GROWING]: 'bg-dynamic-green/80',
    [GrowthStage.MATURE]: 'bg-dynamic-red',
    [GrowthStage.HARVESTED]: 'bg-dynamic-gray/30',
  },
  [CropType.CARROT]: {
    [GrowthStage.SEED]: 'bg-dynamic-brown',
    [GrowthStage.SPROUT]: 'bg-dynamic-green/60',
    [GrowthStage.GROWING]: 'bg-dynamic-green/80',
    [GrowthStage.MATURE]: 'bg-dynamic-orange',
    [GrowthStage.HARVESTED]: 'bg-dynamic-gray/30',
  },
};

const cropSizes = {
  [GrowthStage.SEED]: 0.3,
  [GrowthStage.SPROUT]: 0.5,
  [GrowthStage.GROWING]: 0.7,
  [GrowthStage.MATURE]: 0.9,
  [GrowthStage.HARVESTED]: 0.2,
};

export function CropRenderer({ crop, cellSize, x, y }: CropRendererProps) {
  const data = crop.getData();
  const color = cropColors[data.type][data.stage];
  const size = cropSizes[data.stage];
  const isDead = crop.isDead();
  const isHarvestable = crop.isHarvestable();
  const waterLevel = data.waterLevel / data.maxWaterLevel;

  const cropSize = cellSize * size;
  const offset = (cellSize - cropSize) / 2;

  return (
    <>
      {/* Crop */}
      <div
        className={`absolute rounded-full border-2 transition-all duration-300 ${
          isDead ? 'border-dynamic-red/30 bg-dynamic-red/50' : color
        } ${isHarvestable ? 'animate-pulse' : ''}`}
        style={{
          left: x * cellSize + offset,
          top: y * cellSize + offset,
          width: cropSize,
          height: cropSize,
        }}
      />

      {/* Water indicator */}
      {data.stage !== GrowthStage.SEED &&
        data.stage !== GrowthStage.HARVESTED && (
          <div
            className="absolute bottom-0 left-0 rounded-sm bg-dynamic-blue/60"
            style={{
              left: x * cellSize + 2,
              bottom: y * cellSize + 2,
              width: (cellSize - 4) * waterLevel,
              height: 2,
            }}
          />
        )}

      {/* Growth progress indicator */}
      {data.stage !== GrowthStage.HARVESTED && (
        <div
          className="absolute top-0 left-0 rounded-sm bg-dynamic-green/60"
          style={{
            left: x * cellSize + 2,
            top: y * cellSize + 2,
            width: (cellSize - 4) * crop.getGrowthProgress(),
            height: 2,
          }}
        />
      )}
    </>
  );
}
