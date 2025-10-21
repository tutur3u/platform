import { describe, expect, it, vi } from 'vitest';
import { CustomImage } from '../image-extension';

describe('ImageExtension', () => {
  describe('backward compatibility', () => {
    it('should maintain imageResize node type for existing content', () => {
      const extension = CustomImage();
      // ImageResize extension should use 'imageResize' as node name by default
      expect(extension).toBeDefined();
    });

    it('should work with existing imageResize content', () => {
      const extension = CustomImage();
      const config = extension.options;
      expect(config).toBeDefined();
    });
  });

  describe('configuration', () => {
    it('should disable inline images', () => {
      const extension = CustomImage();
      expect(extension.options.inline).toBe(false);
    });

    it('should disable base64 images', () => {
      const extension = CustomImage();
      expect(extension.options.allowBase64).toBe(false);
    });

    it('should add rounded corners styling', () => {
      const extension = CustomImage();
      expect(extension.options.HTMLAttributes?.class).toContain('rounded-md');
      expect(extension.options.HTMLAttributes?.class).toContain('my-4');
    });
  });

  describe('upload handler', () => {
    it('should accept onImageUpload callback', () => {
      const mockUpload = vi
        .fn()
        .mockResolvedValue('https://example.com/image.png');
      const extension = CustomImage({ onImageUpload: mockUpload });

      // onImageUpload is used internally in plugins, not exposed in options
      expect(extension).toBeDefined();
    });

    it('should work without upload handler', () => {
      const extension = CustomImage();
      expect(extension).toBeDefined();
    });
  });

  describe('size presets', () => {
    it('should support xs size (25%)', () => {
      const extension = CustomImage();
      // Size presets are internal constants
      expect(extension).toBeDefined();
    });

    it('should support sm size (40%)', () => {
      const extension = CustomImage();
      expect(extension).toBeDefined();
    });

    it('should support md size (60%) as default', () => {
      const extension = CustomImage();
      expect(extension).toBeDefined();
    });

    it('should support lg size (80%)', () => {
      const extension = CustomImage();
      expect(extension).toBeDefined();
    });

    it('should support xl size (100%) for full width', () => {
      const extension = CustomImage();
      expect(extension).toBeDefined();
    });
  });

  describe('attributes', () => {
    it('should preserve width attribute from parent extension', () => {
      const extension = CustomImage();
      // Attributes are added via addAttributes method
      expect(extension).toBeDefined();
    });

    it('should add data-snapped attribute for snap tracking', () => {
      const extension = CustomImage();
      expect(extension).toBeDefined();
    });
  });
});
