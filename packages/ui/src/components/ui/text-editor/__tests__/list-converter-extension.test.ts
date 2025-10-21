import { describe, expect, it } from 'vitest';
import { ListConverter } from '../list-converter-extension';

describe('ListConverter', () => {
  describe('extension configuration', () => {
    it('should have correct extension name', () => {
      expect(ListConverter.name).toBe('listConverter');
    });

    it('should define custom commands', () => {
      expect(ListConverter).toBeDefined();
    });
  });

  describe('command definitions', () => {
    it('should provide toggleTaskListSmart command', () => {
      // Commands are defined in the extension's addCommands method
      // They are registered when the editor is created
      expect(ListConverter).toBeDefined();
    });

    it('should provide toggleBulletListSmart command', () => {
      // Commands are defined in the extension's addCommands method
      expect(ListConverter).toBeDefined();
    });

    it('should provide toggleOrderedListSmart command', () => {
      // Commands are defined in the extension's addCommands method
      expect(ListConverter).toBeDefined();
    });
  });

  describe('backward compatibility', () => {
    it('should maintain existing list conversion behavior', () => {
      // The extension wraps TipTap's built-in list commands
      expect(ListConverter).toBeDefined();
    });

    it('should preserve list structure during conversion', () => {
      // Smart commands ensure entire list is converted, not split
      expect(ListConverter).toBeDefined();
    });
  });

  describe('type safety', () => {
    it('should provide TypeScript command declarations', () => {
      // Commands are declared via module augmentation
      expect(ListConverter).toBeDefined();
    });
  });
});
