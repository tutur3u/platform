import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PluginKey } from 'prosemirror-state';
import {
  imageUploadPlaceholderPluginKey,
  videoUploadPlaceholderPluginKey,
  generateUploadId,
  createLoadingPlaceholder,
  findUploadPlaceholder,
} from '../upload-placeholder';

describe('upload-placeholder', () => {
  describe('plugin keys', () => {
    it('should export imageUploadPlaceholderPluginKey', () => {
      expect(imageUploadPlaceholderPluginKey).toBeInstanceOf(PluginKey);
      expect(imageUploadPlaceholderPluginKey.key).toBe('imageUploadPlaceholder$');
    });

    it('should export videoUploadPlaceholderPluginKey', () => {
      expect(videoUploadPlaceholderPluginKey).toBeInstanceOf(PluginKey);
      expect(videoUploadPlaceholderPluginKey.key).toBe('videoUploadPlaceholder$');
    });

    it('should have different plugin keys', () => {
      expect(imageUploadPlaceholderPluginKey).not.toBe(videoUploadPlaceholderPluginKey);
    });
  });

  describe('generateUploadId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateUploadId();
      const id2 = generateUploadId();
      const id3 = generateUploadId();

      expect(id1).toMatch(/^upload-\d+-\d+$/);
      expect(id2).toMatch(/^upload-\d+-\d+$/);
      expect(id3).toMatch(/^upload-\d+-\d+$/);

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const id = generateUploadId();
      const after = Date.now();

      const timestamp = parseInt(id.split('-')[1] || '0');
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it('should increment counter', () => {
      const id1 = generateUploadId();
      const id2 = generateUploadId();

      const counter1 = parseInt(id1.split('-')[2] || '0');
      const counter2 = parseInt(id2.split('-')[2] || '0');

      expect(counter2).toBe(counter1 + 1);
    });
  });

  describe('createLoadingPlaceholder', () => {
    let styleElement: HTMLStyleElement | null;

    beforeEach(() => {
      // Clean up any existing style elements
      const existing = document.querySelector('#upload-spinner-styles');
      if (existing) existing.remove();
      styleElement = null;
    });

    afterEach(() => {
      if (styleElement) {
        styleElement.remove();
      }
    });

    it('should create placeholder for image', () => {
      const placeholder = createLoadingPlaceholder(800, 600, 'image');

      expect(placeholder.tagName).toBe('DIV');
      expect(placeholder.className).toContain('upload-placeholder');
      expect(placeholder.style.width).toBe('600px'); // Min of 800 and 600
      expect(placeholder.style.height).toBe('400px'); // Min of 600 and 400
    });

    it('should create placeholder for video', () => {
      const placeholder = createLoadingPlaceholder(1920, 1080, 'video');

      expect(placeholder.tagName).toBe('DIV');
      expect(placeholder.className).toContain('upload-placeholder');

      // Check for text content
      const text = placeholder.querySelector('span');
      expect(text?.textContent).toBe('Uploading video...');
    });

    it('should default to image type', () => {
      const placeholder = createLoadingPlaceholder(800, 600);

      const text = placeholder.querySelector('span');
      expect(text?.textContent).toBe('Uploading image...');
    });

    it('should limit width to 600px max', () => {
      const placeholder = createLoadingPlaceholder(2000, 1500);

      expect(placeholder.style.width).toBe('600px');
    });

    it('should limit height to 400px max', () => {
      const placeholder = createLoadingPlaceholder(1500, 2000);

      expect(placeholder.style.height).toBe('400px');
    });

    it('should set minimum width and height', () => {
      const placeholder = createLoadingPlaceholder(100, 50);

      expect(placeholder.style.minWidth).toBe('200px');
      expect(placeholder.style.minHeight).toBe('120px');
    });

    it('should contain spinner with correct styles', () => {
      const placeholder = createLoadingPlaceholder(800, 600);

      // Find spinner div
      const spinnerContainer = placeholder.querySelector('.flex.flex-col');
      expect(spinnerContainer).toBeTruthy();

      const spinner = spinnerContainer?.querySelector('.w-8.h-8');
      expect(spinner).toBeTruthy();
      expect(spinner?.className).toContain('border-muted-foreground');
      expect(spinner?.className).toContain('rounded-full');
    });

    it('should inject spin animation styles only once', () => {
      createLoadingPlaceholder(800, 600);

      const styles1 = document.querySelectorAll('#upload-spinner-styles');
      expect(styles1.length).toBe(1);

      createLoadingPlaceholder(800, 600);

      const styles2 = document.querySelectorAll('#upload-spinner-styles');
      expect(styles2.length).toBe(1); // Still only one
    });

    it('should contain animation keyframes', () => {
      createLoadingPlaceholder(800, 600);

      const style = document.querySelector('#upload-spinner-styles');
      expect(style?.textContent).toContain('@keyframes spin');
      expect(style?.textContent).toContain('transform: rotate(360deg)');
    });

    it('should have backdrop filter', () => {
      const placeholder = createLoadingPlaceholder(800, 600);

      const innerPlaceholder = placeholder.firstElementChild as HTMLElement;
      expect(innerPlaceholder.style.backdropFilter).toBe('blur(4px)');
    });
  });

  describe('findUploadPlaceholder', () => {
    let mockState: any;
    let mockPluginKey: PluginKey;

    beforeEach(() => {
      mockPluginKey = new PluginKey('test');
    });

    it('should return null if decorations not found', () => {
      mockState = {};

      mockPluginKey.getState = vi.fn(() => null);

      const result = findUploadPlaceholder(mockState, 'test-id', mockPluginKey);

      expect(result).toBeNull();
    });

    it('should return null if decoration with id not found', () => {
      const mockDecorations = {
        find: () => [
          { from: 0, spec: { id: 'other-id' } },
          { from: 10, spec: { id: 'another-id' } },
        ],
      };

      mockPluginKey.getState = vi.fn(() => mockDecorations);

      const result = findUploadPlaceholder(mockState, 'test-id', mockPluginKey);

      expect(result).toBeNull();
    });

    it('should return decoration position and spec when found', () => {
      const mockDecorations = {
        find: () => [
          { from: 0, spec: { id: 'other-id' } },
          { from: 10, spec: { id: 'test-id' } },
          { from: 20, spec: { id: 'another-id' } },
        ],
      };

      mockPluginKey.getState = vi.fn(() => mockDecorations);

      const result = findUploadPlaceholder(mockState, 'test-id', mockPluginKey);

      expect(result).toEqual({
        pos: 10,
        spec: { id: 'test-id' },
      });
    });

    it('should return first match if multiple exist', () => {
      const mockDecorations = {
        find: () => [
          { from: 5, spec: { id: 'test-id' } },
          { from: 15, spec: { id: 'test-id' } }, // Duplicate
        ],
      };

      mockPluginKey.getState = vi.fn(() => mockDecorations);

      const result = findUploadPlaceholder(mockState, 'test-id', mockPluginKey);

      expect(result).toEqual({
        pos: 5,
        spec: { id: 'test-id' },
      });
    });

    it('should handle decorations with no spec', () => {
      const mockDecorations = {
        find: () => [{ from: 0 }, { from: 10, spec: { id: 'test-id' } }],
      };

      mockPluginKey.getState = vi.fn(() => mockDecorations);

      const result = findUploadPlaceholder(mockState, 'test-id', mockPluginKey);

      expect(result).toEqual({
        pos: 10,
        spec: { id: 'test-id' },
      });
    });

    it('should work with different plugin keys', () => {
      const mockDecorations1 = {
        find: () => [{ from: 5, spec: { id: 'test-id' } }],
      };
      const mockDecorations2 = {
        find: () => [{ from: 15, spec: { id: 'test-id' } }],
      };

      const key1 = new PluginKey('key1');
      const key2 = new PluginKey('key2');

      key1.getState = vi.fn(() => mockDecorations1);
      key2.getState = vi.fn(() => mockDecorations2);

      const result1 = findUploadPlaceholder(mockState, 'test-id', key1);
      const result2 = findUploadPlaceholder(mockState, 'test-id', key2);

      expect(result1?.pos).toBe(5);
      expect(result2?.pos).toBe(15);
    });
  });
});
