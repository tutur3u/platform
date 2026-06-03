export const MAX_HIVE_OBJECT_FOOTPRINT_DIMENSION = 16;
export const MAX_HIVE_OBJECT_FOOTPRINT_CELLS =
  MAX_HIVE_OBJECT_FOOTPRINT_DIMENSION * MAX_HIVE_OBJECT_FOOTPRINT_DIMENSION;

export type HiveObjectFootprint = {
  autoExpandTerrain?: boolean;
  depth: number;
  width: number;
};

type HiveObjectFootprintInput =
  | Partial<Record<keyof HiveObjectFootprint, unknown>>
  | null
  | undefined;

export type HiveObjectStateFootprintValidationError = {
  message: string;
  path: (number | string)[];
};

const FOOTPRINT_DIMENSION_MESSAGE = `Hive object footprint dimensions must be integers from 1 to ${MAX_HIVE_OBJECT_FOOTPRINT_DIMENSION}.`;
const FOOTPRINT_CELL_MESSAGE = `Hive object footprints must cover at most ${MAX_HIVE_OBJECT_FOOTPRINT_CELLS} cells.`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getValidFootprintDimension(value: unknown) {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > MAX_HIVE_OBJECT_FOOTPRINT_DIMENSION
  ) {
    return null;
  }

  return value;
}

export function normalizeHiveObjectFootprint(
  footprint: HiveObjectFootprintInput
): HiveObjectFootprint | null {
  if (!footprint) {
    return null;
  }

  const width = getValidFootprintDimension(footprint.width);
  const depth = getValidFootprintDimension(footprint.depth);

  if (!width || !depth || width * depth > MAX_HIVE_OBJECT_FOOTPRINT_CELLS) {
    return null;
  }

  return {
    autoExpandTerrain: footprint.autoExpandTerrain === true,
    depth,
    width,
  };
}

export function getHiveObjectStateFootprintValidationError(
  state: Record<string, unknown> | null | undefined
): HiveObjectStateFootprintValidationError | null {
  const footprint = state?.footprint;

  if (footprint === undefined) {
    return null;
  }

  if (!isRecord(footprint)) {
    return {
      message: 'Hive object footprint must be an object.',
      path: ['footprint'],
    };
  }

  const width = getValidFootprintDimension(footprint.width);
  if (!width) {
    return {
      message: FOOTPRINT_DIMENSION_MESSAGE,
      path: ['footprint', 'width'],
    };
  }

  const depth = getValidFootprintDimension(footprint.depth);
  if (!depth) {
    return {
      message: FOOTPRINT_DIMENSION_MESSAGE,
      path: ['footprint', 'depth'],
    };
  }

  if (width * depth > MAX_HIVE_OBJECT_FOOTPRINT_CELLS) {
    return {
      message: FOOTPRINT_CELL_MESSAGE,
      path: ['footprint'],
    };
  }

  return null;
}
