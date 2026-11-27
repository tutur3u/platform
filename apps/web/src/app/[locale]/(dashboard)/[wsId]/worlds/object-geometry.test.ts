import { edufestHall } from '@tuturuuu/worlds/edufest-hall';
import { describe, expect, it } from 'vitest';
import { geometryFields, validateObjectGeometry } from './object-geometry';

const booth = edufestHall.objects[0]!;
const bounds = edufestHall.bounds;

function edit(values: Record<string, string> = {}) {
  const form = new FormData();
  for (const field of [...geometryFields, 'heading'] as const) {
    form.set(field, values[field] ?? String(booth[field]));
  }
  return validateObjectGeometry(form, booth, bounds);
}

describe('Worlds editor geometry', () => {
  it('applies valid changes while retaining the sample object identity', () => {
    expect(edit({ x: '10', width: '3.5', heading: '90' })).toEqual({
      status: 'valid',
      object: { ...booth, x: 10, width: 3.5, heading: 90 },
    });
  });

  it.each([
    ['x', ''],
    ['z', 'Infinity'],
    ['elevation', '-1'],
    ['depth', '0'],
    ['heading', '45'],
  ])('rejects invalid %s value %j', (field, value) => {
    expect(edit({ [field]: value })).toEqual({ status: 'invalid_numbers' });
  });

  it('checks the rotated footprint even when its center is inside the hall', () => {
    const position = { x: '1', width: '2.8', depth: '1.8' };
    expect(edit({ ...position, heading: '0' })).toEqual({
      status: 'outside_bounds',
    });
    expect(edit({ ...position, heading: '90' }).status).toBe('valid');
  });
});
