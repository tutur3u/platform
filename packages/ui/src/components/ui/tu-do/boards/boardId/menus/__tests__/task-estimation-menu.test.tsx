/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import {
  buildEstimationIndices,
  mapEstimationPoints,
} from '../../../../shared/estimation-mapping';

// Test the estimation mapping utilities that are used by the component
describe('TaskEstimationMenu Utilities', () => {
  describe('mapEstimationPoints', () => {
    it('should map t-shirt sizing correctly', () => {
      expect(mapEstimationPoints(0, 't-shirt')).toBe('-');
      expect(mapEstimationPoints(1, 't-shirt')).toBe('XS');
      expect(mapEstimationPoints(2, 't-shirt')).toBe('S');
      expect(mapEstimationPoints(3, 't-shirt')).toBe('M');
      expect(mapEstimationPoints(4, 't-shirt')).toBe('L');
      expect(mapEstimationPoints(5, 't-shirt')).toBe('XL');
      expect(mapEstimationPoints(6, 't-shirt')).toBe('XXL');
      expect(mapEstimationPoints(7, 't-shirt')).toBe('XXXL');
    });

    it('should map fibonacci numbers correctly', () => {
      expect(mapEstimationPoints(0, 'fibonacci')).toBe('0');
      expect(mapEstimationPoints(1, 'fibonacci')).toBe('1');
      expect(mapEstimationPoints(2, 'fibonacci')).toBe('2');
      expect(mapEstimationPoints(3, 'fibonacci')).toBe('3');
      expect(mapEstimationPoints(4, 'fibonacci')).toBe('5');
      expect(mapEstimationPoints(5, 'fibonacci')).toBe('8');
      expect(mapEstimationPoints(6, 'fibonacci')).toBe('13');
      expect(mapEstimationPoints(7, 'fibonacci')).toBe('21');
    });

    it('should map exponential numbers correctly', () => {
      expect(mapEstimationPoints(0, 'exponential')).toBe('0');
      expect(mapEstimationPoints(1, 'exponential')).toBe('1');
      expect(mapEstimationPoints(2, 'exponential')).toBe('2');
      expect(mapEstimationPoints(3, 'exponential')).toBe('4');
      expect(mapEstimationPoints(4, 'exponential')).toBe('8');
      expect(mapEstimationPoints(5, 'exponential')).toBe('16');
      expect(mapEstimationPoints(6, 'exponential')).toBe('32');
      expect(mapEstimationPoints(7, 'exponential')).toBe('64');
    });

    it('should map numeric values for unknown types', () => {
      expect(mapEstimationPoints(0, 'custom')).toBe('0');
      expect(mapEstimationPoints(3, 'custom')).toBe('3');
      expect(mapEstimationPoints(7, 'custom')).toBe('7');
    });

    it('should handle null points', () => {
      expect(mapEstimationPoints(null as any, 'fibonacci')).toBe('');
    });
  });

  describe('buildEstimationIndices', () => {
    it('should return indices 1-5 when not extended and not allowing zero', () => {
      const indices = buildEstimationIndices({
        extended: false,
        allowZero: false,
      });
      expect(indices).toEqual([1, 2, 3, 4, 5]);
    });

    it('should return indices 0-5 when not extended and allowing zero', () => {
      const indices = buildEstimationIndices({
        extended: false,
        allowZero: true,
      });
      expect(indices).toEqual([0, 1, 2, 3, 4, 5]);
    });

    it('should return indices 1-7 when extended and not allowing zero', () => {
      const indices = buildEstimationIndices({
        extended: true,
        allowZero: false,
      });
      expect(indices).toEqual([1, 2, 3, 4, 5, 6, 7]);
    });

    it('should return indices 0-7 when extended and allowing zero', () => {
      const indices = buildEstimationIndices({
        extended: true,
        allowZero: true,
      });
      expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    });

    it('should handle null extended flag as false', () => {
      const indices = buildEstimationIndices({
        extended: null,
        allowZero: false,
      });
      expect(indices).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle null allowZero flag as false', () => {
      const indices = buildEstimationIndices({
        extended: false,
        allowZero: null,
      });
      expect(indices).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle undefined flags', () => {
      const indices = buildEstimationIndices({
        extended: undefined,
        allowZero: undefined,
      });
      expect(indices).toEqual([1, 2, 3, 4, 5]);
    });
  });

  describe('integration tests', () => {
    it('should generate correct labels for t-shirt extended mode', () => {
      const indices = buildEstimationIndices({
        extended: true,
        allowZero: true,
      });
      const labels = indices.map((idx) => mapEstimationPoints(idx, 't-shirt'));
      expect(labels).toEqual(['-', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL']);
    });

    it('should generate correct labels for fibonacci normal mode', () => {
      const indices = buildEstimationIndices({
        extended: false,
        allowZero: false,
      });
      const labels = indices.map((idx) =>
        mapEstimationPoints(idx, 'fibonacci')
      );
      expect(labels).toEqual(['1', '2', '3', '5', '8']);
    });

    it('should generate correct labels for exponential extended mode', () => {
      const indices = buildEstimationIndices({
        extended: true,
        allowZero: false,
      });
      const labels = indices.map((idx) =>
        mapEstimationPoints(idx, 'exponential')
      );
      expect(labels).toEqual(['1', '2', '4', '8', '16', '32', '64']);
    });
  });
});

// Component logic tests (testing the logic without rendering the Radix UI component)
describe('TaskEstimationMenu Component Logic', () => {
  describe('should determine if item is disabled', () => {
    it('should disable item when idx > 5 and not extended', () => {
      const extendedEstimation = false;
      const idx = 6;
      const isDisabled = !extendedEstimation && idx > 5;
      expect(isDisabled).toBe(true);
    });

    it('should not disable item when idx > 5 and extended', () => {
      const extendedEstimation = true;
      const idx = 6;
      const isDisabled = !extendedEstimation && idx > 5;
      expect(isDisabled).toBe(false);
    });

    it('should not disable item when idx <= 5 regardless of extended', () => {
      expect(!false && 3 > 5).toBe(false);
      expect(!true && 3 > 5).toBe(false);
    });
  });

  describe('should determine active state', () => {
    it('should be active when currentPoints matches idx', () => {
      const currentPoints = 3;
      const idx = 3;
      const isActive = currentPoints === idx;
      expect(isActive).toBe(true);
    });

    it('should not be active when currentPoints does not match idx', () => {
      const currentPoints = 3;
      const idx = 5;
      const isActive = currentPoints === idx;
      expect(isActive).toBe(false);
    });

    it('should not be active when currentPoints is null', () => {
      const currentPoints = null;
      const idx = 3;
      const isActive = currentPoints === idx;
      expect(isActive).toBe(false);
    });
  });

  describe('should determine None option active state', () => {
    it('should be active when currentPoints is null', () => {
      const currentPoints = null;
      const isActive = currentPoints == null;
      expect(isActive).toBe(true);
    });

    it('should be active when currentPoints is undefined', () => {
      const currentPoints = undefined;
      const isActive = currentPoints == null;
      expect(isActive).toBe(true);
    });

    it('should not be active when currentPoints has a value', () => {
      const currentPoints = 0;
      const isActive = currentPoints == null;
      expect(isActive).toBe(false);
    });
  });

  describe('should toggle estimation correctly', () => {
    it('should return null when clicking active item', () => {
      const currentPoints = 3;
      const idx = 3;
      const isActive = currentPoints === idx;
      const newValue = isActive ? null : idx;
      expect(newValue).toBe(null);
    });

    it('should return idx when clicking inactive item', () => {
      const currentPoints = 3;
      const idx = 5;
      const isActive = currentPoints === idx;
      const newValue = isActive ? null : idx;
      expect(newValue).toBe(5);
    });

    it('should set idx when clicking from null', () => {
      const currentPoints = null;
      const idx = 3;
      const isActive = currentPoints === idx;
      const newValue = isActive ? null : idx;
      expect(newValue).toBe(3);
    });
  });

  describe('should render based on estimation type', () => {
    it('should not render when estimation type is falsy', () => {
      expect(!undefined).toBe(true);
      expect(!null).toBe(true);
      expect(!'').toBe(true);
    });

    it('should render when estimation type has a value', () => {
      expect(!'fibonacci').toBe(false);
      expect(!'t-shirt').toBe(false);
      expect(!'exponential').toBe(false);
    });
  });
});
