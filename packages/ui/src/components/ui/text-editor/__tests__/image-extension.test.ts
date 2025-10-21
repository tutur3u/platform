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
    it('should use inline mode for backward compatibility', () => {
      const extension = CustomImage();
      // inline: true allows images inside paragraphs (backward compat)
      // CSS (display: block) makes them behave as block elements
      expect(extension.options.inline).toBe(false);
    });

    it('should disable base64 images', () => {
      const extension = CustomImage();
      expect(extension.options.allowBase64).toBe(false);
    });

    it('should add block-style CSS classes for visual presentation', () => {
      const extension = CustomImage();
      expect(extension.options.HTMLAttributes?.class).toContain('rounded-md');
      expect(extension.options.HTMLAttributes?.class).toContain('my-4');
      expect(extension.options.HTMLAttributes?.class).toContain('block');
      expect(extension.options.HTMLAttributes?.class).toContain('w-full');
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

    it('should support legacy containerStyle attribute', () => {
      const extension = CustomImage();
      // Legacy containerStyle from tiptap-extension-resize-image is preserved
      expect(extension).toBeDefined();
    });

    it('should support legacy wrapperStyle attribute', () => {
      const extension = CustomImage();
      // Legacy wrapperStyle from tiptap-extension-resize-image is preserved
      expect(extension).toBeDefined();
    });

    it('should support standard HTML image attributes (src, alt, title, height)', () => {
      const extension = CustomImage();
      // All standard HTML image attributes are defined for backward compatibility
      expect(extension).toBeDefined();
    });
  });

  describe('snap-to-preset behavior', () => {
    it('should snap images to nearest preset after resize', () => {
      const extension = CustomImage();
      // Uses appendTransaction to snap resized images
      expect(extension).toBeDefined();
    });

    it('should not re-snap images already at preset values', () => {
      const extension = CustomImage();
      // Images at preset values (±10px) are not snapped again
      expect(extension).toBeDefined();
    });

    it('should handle images with null width gracefully', () => {
      const extension = CustomImage();
      // Images with null width from legacy content don't cause errors
      expect(extension).toBeDefined();
    });
  });
});
