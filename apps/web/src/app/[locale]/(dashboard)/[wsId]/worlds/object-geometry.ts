import {
  containsPoint,
  objectBounds,
  type World,
  type WorldObject,
} from '@tuturuuu/worlds';

export const geometryFields = [
  'x',
  'z',
  'width',
  'depth',
  'elevation',
] as const;
export const headings = [0, 90, 180, 270] as const;

type GeometryResult =
  | { status: 'invalid_numbers' | 'outside_bounds' }
  | { status: 'valid'; object: WorldObject };

function readNumber(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' && value.trim() ? Number(value) : NaN;
}

export function validateObjectGeometry(
  form: FormData,
  object: WorldObject,
  bounds: World['bounds']
): GeometryResult {
  const x = readNumber(form, 'x');
  const z = readNumber(form, 'z');
  const width = readNumber(form, 'width');
  const depth = readNumber(form, 'depth');
  const elevation = readNumber(form, 'elevation');
  const heading = headings.find(
    (angle) => String(angle) === form.get('heading')
  );

  if (
    ![x, z, width, depth, elevation].every(Number.isFinite) ||
    width <= 0 ||
    depth <= 0 ||
    elevation < 0 ||
    heading === undefined
  ) {
    return { status: 'invalid_numbers' };
  }

  const next = { ...object, x, z, width, depth, elevation, heading };
  const { min, max } = objectBounds(next);
  if (!containsPoint(bounds, min) || !containsPoint(bounds, max)) {
    return { status: 'outside_bounds' };
  }

  return { status: 'valid', object: next };
}
