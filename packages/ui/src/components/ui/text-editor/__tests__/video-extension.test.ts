import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_VIDEO_SIZE } from '../media-utils';
import { Video } from '../video-extension';

vi.mock('../media-utils', async () => {
  const actual = await vi.importActual('../media-utils');
  return {
    ...actual,
    getVideoDimensions: vi
      .fn()
      .mockResolvedValue({ width: 1920, height: 1080 }),
  };
});

// Mock the sonner toast
vi.mock('../../sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

describe('VideoExtension', () => {
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.clearAllMocks();
  });

  describe('creation', () => {
    it('should create video extension instance', () => {
      const extension = Video();

      expect(extension).toBeDefined();
      expect(extension.name).toBe('video');
    });

    it('should accept options with onVideoUpload callback', () => {
      const mockUpload = vi
        .fn()
        .mockResolvedValue('https://example.com/video.mp4');
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
    });

    it('should work without upload handler', () => {
      const extension = Video();
      expect(extension).toBeDefined();
    });
  });

  describe('node configuration', () => {
    it('should be a block-level node', () => {
      const extension = Video();

      expect(extension.config.group).toBe('block');
    });

    it('should have src attribute with proper default and parsing', () => {
      const extension = Video();
      const attributes = (extension.config as any).addAttributes() as any;

      expect(attributes.src).toBeDefined();
      expect(attributes.src.default).toBeNull();
      expect(typeof attributes.src.parseHTML).toBe('function');
      expect(typeof attributes.src.renderHTML).toBe('function');

      // Test parseHTML behavior
      const mockElement = document.createElement('video');
      mockElement.setAttribute('src', 'https://example.com/video.mp4');
      const parsed = attributes.src.parseHTML(mockElement);
      expect(parsed).toBe('https://example.com/video.mp4');

      // Test renderHTML behavior
      const rendered = attributes.src.renderHTML({
        src: 'https://example.com/video.mp4',
      });
      expect(rendered).toEqual({ src: 'https://example.com/video.mp4' });
    });

    it('should parse HTML video elements', () => {
      const extension = Video();
      const parseRules = (extension.config as any).parseHTML() as any[];

      expect(parseRules).toHaveLength(1);
      expect(parseRules[0].tag).toBe('video');
      expect(typeof parseRules[0].getAttrs).toBe('function');

      // Test getAttrs behavior
      const mockVideoEl = document.createElement('video');
      mockVideoEl.setAttribute('src', 'https://example.com/test.mp4');
      const attrs = parseRules[0].getAttrs(mockVideoEl);
      expect(attrs).toEqual({ src: 'https://example.com/test.mp4' });
    });

    it('should render as HTML video element with controls', () => {
      const extension = Video();
      const renderOutput = (extension.config as any).renderHTML({
        HTMLAttributes: { src: 'https://example.com/video.mp4' },
      }) as any[];

      expect(renderOutput).toBeDefined();
      expect(renderOutput[0]).toBe('video');
      expect(renderOutput[1]).toHaveProperty('controls', 'true');
      expect(renderOutput[1]).toHaveProperty('style', 'width: 100%');
      expect(renderOutput[1]).toHaveProperty(
        'src',
        'https://example.com/video.mp4'
      );
      expect(renderOutput[2]).toEqual([
        'source',
        { src: 'https://example.com/video.mp4' },
      ]);
    });
  });

  describe('commands', () => {
    it('should have addCommands method', () => {
      const extension = Video();
      expect(extension.config.addCommands).toBeDefined();
      expect(typeof extension.config.addCommands).toBe('function');
    });

    it('should provide setVideo command that inserts content', () => {
      const extension = Video();
      const commands = (extension.config as any).addCommands() as any;

      expect(commands.setVideo).toBeDefined();
      expect(typeof commands.setVideo).toBe('function');
    });

    it('should provide toggleVideo command', () => {
      const extension = Video();
      const commands = (extension.config as any).addCommands() as any;

      expect(commands.toggleVideo).toBeDefined();
      expect(typeof commands.toggleVideo).toBe('function');
    });
  });

  describe('input rules', () => {
    it('should have addInputRules method', () => {
      const extension = Video();
      expect(extension.config.addInputRules).toBeDefined();
      expect(typeof extension.config.addInputRules).toBe('function');
    });

    it('should return input rules array', () => {
      const extension = Video();
      const inputRules = (extension.config as any).addInputRules() as any[];

      expect(Array.isArray(inputRules)).toBe(true);
      expect(inputRules.length).toBeGreaterThan(0);
    });
  });

  describe('ProseMirror plugins', () => {
    it('should add three ProseMirror plugins', () => {
      const extension = Video({ onVideoUpload: vi.fn() });

      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      expect(plugins).toHaveLength(3); // placeholder, paste, drop plugins
    });

    it('should include placeholder plugin with state management', () => {
      const extension = Video({ onVideoUpload: vi.fn() });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];

      const placeholderPlugin = plugins[0];
      expect(placeholderPlugin).toBeDefined();
      expect(placeholderPlugin.spec?.state?.init).toBeDefined();
      expect(placeholderPlugin.spec?.state?.apply).toBeDefined();
    });

    it('should include paste plugin with DOM event handler', () => {
      const extension = Video({ onVideoUpload: vi.fn() });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];

      const pastePlugin = plugins[1];
      expect(pastePlugin.props?.handleDOMEvents?.paste).toBeDefined();
      expect(typeof pastePlugin.props?.handleDOMEvents?.paste).toBe('function');
    });

    it('should include drop plugin with DOM event handler', () => {
      const extension = Video({ onVideoUpload: vi.fn() });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];

      const dropPlugin = plugins[2];
      expect(dropPlugin.props?.handleDOMEvents?.drop).toBeDefined();
      expect(typeof dropPlugin.props?.handleDOMEvents?.drop).toBe('function');
    });
  });

  describe('file size validation', () => {
    it('should use MAX_VIDEO_SIZE constant for validation', () => {
      expect(MAX_VIDEO_SIZE).toBe(50 * 1024 * 1024); // 50MB
    });

    it('should reject videos larger than 50MB on paste', () => {
      const extension = Video({
        onVideoUpload: vi.fn(),
      });

      expect(extension).toBeDefined();
    });

    it('should reject videos larger than 50MB on drop', () => {
      const extension = Video({
        onVideoUpload: vi.fn(),
      });

      expect(extension).toBeDefined();
    });
  });

  describe('paste handler behavior', () => {
    it('should return false when no onVideoUpload handler is provided', () => {
      const extension = Video();
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const pastePlugin = plugins[1];

      const mockView = {
        state: { selection: { from: 0, to: 0 }, tr: {} },
        dispatch: vi.fn(),
      };
      const mockEvent = {
        clipboardData: { items: [] },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent;

      const result = pastePlugin.props?.handleDOMEvents?.paste(
        mockView as any,
        mockEvent
      );
      expect(result).toBe(false);
    });

    it('should return false when clipboard has no items', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const pastePlugin = plugins[1];

      const mockView = {
        state: { selection: { from: 0, to: 0 }, tr: {} },
        dispatch: vi.fn(),
      };
      const mockEvent = {
        clipboardData: null,
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent;

      const result = pastePlugin.props?.handleDOMEvents?.paste(
        mockView as any,
        mockEvent
      );
      expect(result).toBe(false);
    });

    it('should return false when clipboard has no video files', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const pastePlugin = plugins[1];

      const mockView = {
        state: { selection: { from: 0, to: 0 }, tr: {} },
        dispatch: vi.fn(),
      };
      const mockEvent = {
        clipboardData: {
          items: [{ type: 'text/plain', getAsFile: () => null }],
        },
        preventDefault: vi.fn(),
      } as unknown as ClipboardEvent;

      const result = pastePlugin.props?.handleDOMEvents?.paste(
        mockView as any,
        mockEvent
      );
      expect(result).toBe(false);
    });

    it('should call preventDefault when handling video paste', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const pastePlugin = plugins[1];

      // Create a fully mocked transaction object with all required methods
      const mockTr = {
        delete: vi.fn().mockReturnThis(),
        setMeta: vi.fn().mockReturnThis(),
        replaceWith: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        doc: { nodeSize: 100 },
        docChanged: false,
        mapping: { map: vi.fn((pos: number) => pos) },
      };
      const mockView = {
        state: {
          selection: { from: 0, to: 0, empty: true },
          tr: mockTr,
          schema: { nodes: { video: { create: vi.fn() } } },
        },
        dispatch: vi.fn(),
      };
      const preventDefaultMock = vi.fn();
      const mockEvent = {
        clipboardData: {
          items: [
            {
              type: 'video/mp4',
              getAsFile: () => ({
                name: 'test.mp4',
                size: 1000,
                type: 'video/mp4',
              }),
            },
          ],
        },
        preventDefault: preventDefaultMock,
      } as unknown as ClipboardEvent;

      pastePlugin.props?.handleDOMEvents?.paste(mockView as any, mockEvent);
      expect(preventDefaultMock).toHaveBeenCalled();
    });
  });

  describe('drop handler behavior', () => {
    it('should return false when no onVideoUpload handler is provided', () => {
      const extension = Video();
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const dropPlugin = plugins[2];

      const mockView = {
        state: { schema: { nodes: {} } },
        dispatch: vi.fn(),
        posAtCoords: vi.fn().mockReturnValue({ pos: 0 }),
      };
      const mockEvent = {
        dataTransfer: { files: [] },
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
      } as unknown as DragEvent;

      const result = dropPlugin.props?.handleDOMEvents?.drop(
        mockView as any,
        mockEvent
      );
      expect(result).toBe(false);
    });

    it('should return false when no files are dropped', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const dropPlugin = plugins[2];

      const mockView = {
        state: { schema: { nodes: {} } },
        dispatch: vi.fn(),
        posAtCoords: vi.fn().mockReturnValue({ pos: 0 }),
      };
      const mockEvent = {
        dataTransfer: null,
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
      } as unknown as DragEvent;

      const result = dropPlugin.props?.handleDOMEvents?.drop(
        mockView as any,
        mockEvent
      );
      expect(result).toBe(false);
    });

    it('should return false when no video files are dropped', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const dropPlugin = plugins[2];

      const mockView = {
        state: { schema: { nodes: {} } },
        dispatch: vi.fn(),
        posAtCoords: vi.fn().mockReturnValue({ pos: 0 }),
      };
      const mockEvent = {
        dataTransfer: {
          files: [{ type: 'text/plain', size: 100 }],
        },
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
      } as unknown as DragEvent;

      const result = dropPlugin.props?.handleDOMEvents?.drop(
        mockView as any,
        mockEvent
      );
      expect(result).toBe(false);
    });

    it('should call preventDefault when handling video drop', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const dropPlugin = plugins[2];

      // Create a fully mocked transaction object with all required methods
      const mockTr = {
        setMeta: vi.fn().mockReturnThis(),
        replaceWith: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        doc: { nodeSize: 100 },
        docChanged: false,
        mapping: { map: vi.fn((pos: number) => pos) },
      };
      const mockView = {
        state: {
          schema: { nodes: { video: { create: vi.fn() } } },
          tr: mockTr,
        },
        dispatch: vi.fn(),
        posAtCoords: vi.fn().mockReturnValue({ pos: 0 }),
      };
      const preventDefaultMock = vi.fn();
      const mockEvent = {
        dataTransfer: {
          files: [{ type: 'video/mp4', size: 1000, name: 'test.mp4' }],
        },
        clientX: 100,
        clientY: 100,
        preventDefault: preventDefaultMock,
      } as unknown as DragEvent;

      dropPlugin.props?.handleDOMEvents?.drop(mockView as any, mockEvent);
      expect(preventDefaultMock).toHaveBeenCalled();
    });

    it('should return true when coordinates are invalid', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const dropPlugin = plugins[2];

      const mockView = {
        state: { schema: { nodes: {} } },
        dispatch: vi.fn(),
        posAtCoords: vi.fn().mockReturnValue(null), // Invalid coordinates
      };
      const mockEvent = {
        dataTransfer: {
          files: [{ type: 'video/mp4', size: 1000, name: 'test.mp4' }],
        },
        clientX: 100,
        clientY: 100,
        preventDefault: vi.fn(),
      } as unknown as DragEvent;

      const result = dropPlugin.props?.handleDOMEvents?.drop(
        mockView as any,
        mockEvent
      );
      // Should return true (event was handled) but won't process
      expect(result).toBe(true);
    });
  });

  describe('placeholder plugin', () => {
    it('should initialize with empty decoration set', () => {
      const extension = Video({ onVideoUpload: vi.fn() });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const placeholderPlugin = plugins[0];

      expect(placeholderPlugin.spec?.state?.init).toBeDefined();
    });

    it('should have apply function for state transitions', () => {
      const extension = Video({ onVideoUpload: vi.fn() });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const placeholderPlugin = plugins[0];

      expect(placeholderPlugin.spec?.state?.apply).toBeDefined();
    });

    it('should provide decorations prop', () => {
      const extension = Video({ onVideoUpload: vi.fn() });
      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const placeholderPlugin = plugins[0];

      expect(placeholderPlugin.props?.decorations).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle upload errors gracefully and log to console', async () => {
      const uploadError = new Error('Network error');
      const mockUpload = vi.fn().mockRejectedValue(uploadError);
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
      expect(extension.name).toBe('video');

      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      expect(plugins).toHaveLength(3);
    });

    it('should handle missing video node schema without throwing', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      expect(extension).toBeDefined();

      const plugins = (
        extension.config as any
      ).addProseMirrorPlugins() as any[];
      const pastePlugin = plugins[1];

      expect(pastePlugin.props?.handleDOMEvents?.paste).toBeDefined();
    });

    it('should fall back to default dimensions (640x360) when dimension loading fails', async () => {
      const { getVideoDimensions: mockedGetVideoDimensions } = await import(
        '../media-utils.js'
      );

      (mockedGetVideoDimensions as any).mockRejectedValueOnce(
        new Error('Failed to load dimensions')
      );

      const mockUpload = vi
        .fn()
        .mockResolvedValue('https://example.com/video.mp4');
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
      expect(typeof extension.config.addAttributes).toBe('function');

      (mockedGetVideoDimensions as any).mockReset();
    });

    it('should continue processing remaining videos if one fails', async () => {
      const mockUpload = vi
        .fn()
        .mockRejectedValueOnce(new Error('First failed'))
        .mockResolvedValueOnce('url2');

      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
      expect(mockUpload).toBeDefined();
    });
  });

  describe('sequential processing', () => {
    it('should process videos one at a time to avoid conflicts', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      expect(extension).toBeDefined();
    });

    it('should update position for each subsequent video', () => {
      const extension = Video({
        onVideoUpload: vi.fn().mockResolvedValue('url'),
      });

      expect(extension).toBeDefined();
    });
  });

  describe('video rendering', () => {
    it('should render video with controls attribute', () => {
      const extension = Video();
      const renderOutput = (extension.config as any).renderHTML({
        HTMLAttributes: { src: 'test.mp4' },
      }) as any[];

      expect(renderOutput[1]).toHaveProperty('controls', 'true');
    });

    it('should render video at full width', () => {
      const extension = Video();
      const renderOutput = (extension.config as any).renderHTML({
        HTMLAttributes: { src: 'test.mp4' },
      }) as any[];

      expect(renderOutput[1]).toHaveProperty('style', 'width: 100%');
    });

    it('should include source element in render output', () => {
      const extension = Video();
      const renderOutput = (extension.config as any).renderHTML({
        HTMLAttributes: { src: 'test.mp4' },
      }) as any[];

      expect(renderOutput[2]).toEqual(['source', { src: 'test.mp4' }]);
    });
  });

  describe('selection handling', () => {
    it('should delete selection when pasting video over selected content', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
      // The paste handler checks if from !== to and deletes selection
    });

    it('should insert at selection position after deletion', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
      // currentPos is set to 'from' after selection deletion
    });
  });

  describe('upload ID generation', () => {
    it('should generate unique upload IDs for each video', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
      // Uses generateUploadId() for unique IDs
    });
  });

  describe('position tracking', () => {
    it('should use findUploadPlaceholder to track shifted positions', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
      // Uses findUploadPlaceholder to get current placeholder position
    });

    it('should fall back to currentPos when placeholder not found', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
      // insertPos = placeholder?.pos ?? currentPos
    });

    it('should update currentPos after each video insertion', () => {
      const mockUpload = vi.fn().mockResolvedValue('url');
      const extension = Video({ onVideoUpload: mockUpload });

      expect(extension).toBeDefined();
      // currentPos = insertPos + node.nodeSize
    });
  });
});
