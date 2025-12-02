import { describe, expect, it } from 'vitest';
import { joinPath, popPath } from '../path-helper';

describe('Path Helper', () => {
  describe('joinPath', () => {
    it('returns "/" for empty input', () => {
      expect(joinPath()).toBe('/');
    });

    it('returns "/" for empty strings', () => {
      expect(joinPath('', '')).toBe('/');
    });

    it('joins two simple paths without leading slash', () => {
      // When first path doesn't start with /, no leading slash is added
      expect(joinPath('folder', 'subfolder')).toBe('folder/subfolder');
    });

    it('joins multiple path segments', () => {
      expect(joinPath('a', 'b', 'c', 'd')).toBe('a/b/c/d');
    });

    it('handles paths with slashes', () => {
      expect(joinPath('/folder/', '/subfolder/')).toBe('/folder/subfolder/');
    });

    it('preserves leading slash for absolute paths', () => {
      expect(joinPath('/root', 'child')).toBe('/root/child');
    });

    it('preserves relative path prefix ./', () => {
      expect(joinPath('./relative', 'path')).toBe('./relative/path');
    });

    it('preserves trailing slash when present', () => {
      expect(joinPath('folder', 'subfolder/')).toBe('folder/subfolder/');
    });

    it('handles mixed slashes with absolute first path', () => {
      expect(joinPath('/folder/', '/subfolder')).toBe('/folder/subfolder');
    });

    it('filters out empty segments', () => {
      expect(joinPath('folder', '', 'subfolder')).toBe('folder/subfolder');
    });

    it('skips dot segments', () => {
      expect(joinPath('folder', '.', 'subfolder')).toBe('folder/subfolder');
    });

    it('handles whitespace in paths', () => {
      expect(joinPath('  folder  ', '  subfolder  ')).toBe('folder/subfolder');
    });

    it('handles multiple consecutive slashes in absolute path', () => {
      expect(joinPath('/folder///', '///subfolder')).toBe('/folder/subfolder');
    });

    it('handles double slash protocol prefix', () => {
      expect(joinPath('//server', 'share')).toBe('/server/share');
    });

    it('handles single segment', () => {
      expect(joinPath('single')).toBe('single');
    });

    it('handles single absolute segment', () => {
      expect(joinPath('/single')).toBe('/single');
    });

    it('handles path with numbers', () => {
      expect(joinPath('2024', '01', '15')).toBe('2024/01/15');
    });

    it('handles absolute path with numbers', () => {
      expect(joinPath('/2024', '01', '15')).toBe('/2024/01/15');
    });

    it('handles paths with hyphens and underscores', () => {
      expect(joinPath('my-folder', 'sub_folder')).toBe('my-folder/sub_folder');
    });

    it('handles absolute path with special chars', () => {
      expect(joinPath('/my-folder', 'sub_folder')).toBe(
        '/my-folder/sub_folder'
      );
    });
  });

  describe('popPath', () => {
    it('returns "/" for empty input', () => {
      expect(popPath('')).toBe('/');
    });

    it('returns "/" for root path', () => {
      expect(popPath('/')).toBe('/');
    });

    it('returns "/" for single dot', () => {
      expect(popPath('.')).toBe('/');
    });

    it('returns parent directory for simple path', () => {
      expect(popPath('/folder/subfolder')).toBe('/folder');
    });

    it('returns "/" for single segment absolute path', () => {
      expect(popPath('/folder')).toBe('/');
    });

    it('handles paths with trailing slashes', () => {
      expect(popPath('/folder/subfolder/')).toBe('/folder');
    });

    it('handles paths with multiple trailing slashes', () => {
      expect(popPath('/folder/subfolder///')).toBe('/folder');
    });

    it('handles relative paths starting with ./', () => {
      expect(popPath('./folder/subfolder')).toBe('./folder');
    });

    it('returns "./" prefix for relative path with single segment', () => {
      expect(popPath('./folder')).toBe('./.');
    });

    it('handles paths without leading slash', () => {
      expect(popPath('folder/subfolder')).toBe('/folder');
    });

    it('handles deep paths', () => {
      expect(popPath('/a/b/c/d/e')).toBe('/a/b/c/d');
    });

    it('handles paths with consecutive slashes', () => {
      expect(popPath('/folder//subfolder')).toBe('/folder');
    });

    it('handles paths with numbers', () => {
      expect(popPath('/2024/01/15')).toBe('/2024/01');
    });

    it('handles whitespace in paths', () => {
      expect(popPath('  /folder/subfolder  ')).toBe('/folder');
    });

    it('handles single segment without slash', () => {
      // Function returns '/base' for non-relative single segment without slash
      expect(popPath('folder')).toBe('/base');
    });
  });
});
