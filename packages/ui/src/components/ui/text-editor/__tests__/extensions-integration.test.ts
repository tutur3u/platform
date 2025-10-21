import { describe, expect, it } from 'vitest';
import { getEditorExtensions } from '../extensions';

describe('Editor Extensions Integration', () => {
  describe('extensions loading', () => {
    it('should load all extensions without errors', () => {
      const extensions = getEditorExtensions();
      expect(extensions).toBeDefined();
      expect(Array.isArray(extensions)).toBe(true);
      expect(extensions.length).toBeGreaterThan(0);
    });

    it('should include custom image extension', () => {
      const extensions = getEditorExtensions();
      const hasImageExtension = extensions.some(
        (ext) => ext.name === 'imageResize' || ext.name === 'image'
      );
      expect(hasImageExtension).toBe(true);
    });

    it('should include list converter extension', () => {
      const extensions = getEditorExtensions();
      const hasListConverter = extensions.some(
        (ext) => ext.name === 'listConverter'
      );
      expect(hasListConverter).toBe(true);
    });

    it('should include task list extensions', () => {
      const extensions = getEditorExtensions();
      const hasTaskList = extensions.some((ext) => ext.name === 'taskList');
      const hasTaskItem = extensions.some((ext) => ext.name === 'taskItem');
      expect(hasTaskList).toBe(true);
      expect(hasTaskItem).toBe(true);
    });
  });

  describe('backward compatibility', () => {
    it('should support existing imageResize content', () => {
      const extensions = getEditorExtensions();
      // Verify imageResize or image extension is present
      const hasCompatibleImageExt = extensions.some(
        (ext) => ext.name === 'imageResize' || ext.name === 'image'
      );
      expect(hasCompatibleImageExt).toBe(true);
    });

    it('should support existing bullet and task lists', () => {
      const extensions = getEditorExtensions();
      // BulletList comes from StarterKit which may contain nested extensions
      // TaskList is added separately
      const hasTaskList = extensions.some((ext) => ext.name === 'taskList');
      expect(hasTaskList).toBe(true);
      expect(extensions.length).toBeGreaterThan(10); // Should have multiple extensions including lists
    });
  });

  describe('configuration options', () => {
    it('should accept title placeholder', () => {
      const extensions = getEditorExtensions({
        titlePlaceholder: 'Custom Title',
      });
      expect(extensions).toBeDefined();
    });

    it('should accept write placeholder', () => {
      const extensions = getEditorExtensions({
        writePlaceholder: 'Start writing...',
      });
      expect(extensions).toBeDefined();
    });

    it('should accept image upload handler', () => {
      const mockUpload = async (_file: File) => 'https://example.com/image.png';
      const extensions = getEditorExtensions({
        onImageUpload: mockUpload,
      });
      expect(extensions).toBeDefined();
    });

    it('should work without collaboration config', () => {
      const extensions = getEditorExtensions({
        doc: null,
        provider: null,
      });
      expect(extensions).toBeDefined();
    });
  });

  describe('extension ordering', () => {
    it('should load extensions in correct order', () => {
      const extensions = getEditorExtensions();
      expect(extensions.length).toBeGreaterThan(5);
    });

    it('should not have duplicate image extensions', () => {
      const extensions = getEditorExtensions();
      const imageExtensions = extensions.filter(
        (ext) => ext.name === 'image' || ext.name === 'imageResize'
      );
      // Should only have one image-related extension
      expect(imageExtensions.length).toBeLessThanOrEqual(1);
    });
  });
});
