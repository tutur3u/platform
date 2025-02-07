import { joinPath, popPath } from '@/utils/path-helper';
import { describe, expect, it } from 'vitest';

describe('joinPath', () => {
  it('should join path without duplicate separator', () => {
    expect(joinPath('base-path', 'child-path')).toBe('base-path/child-path');
  });

  it('should join separator-included path without duplicate separator', () => {
    expect(joinPath('base-path/', '/child-path')).toBe('base-path/child-path');
  });

  it('should join path with tailing separator untrimmed', () => {
    expect(joinPath('base-path', '/child-path/')).toBe('base-path/child-path/');
  });

  it('should join multiple path input accurately', () => {
    expect(joinPath('first', 'second', 'third', 'fourth', 'fifth')).toBe(
      'first/second/third/fourth/fifth'
    );
  });

  it('should not trim relative path', () => {
    expect(joinPath('../outer-directory', 'somewhere-else')).toBe(
      '../outer-directory/somewhere-else'
    );
  });

  it('should not consists empty path', () => {
    expect(joinPath('/////', '/////')).toBe('/');
  });

  it('should not duplicate separator', () => {
    expect(joinPath('//base', '//child')).toBe('/base/child');
  });

  it('should handle empty string as empty path', () => {
    expect(joinPath('base', '', '//child')).toBe('base/child');
  });

  it('should handle dots in paths', () => {
    expect(joinPath('./base', './child')).toBe('./base/child');
    expect(joinPath('base/./child')).toBe('base/child');
  });

  it('should handle special characters in paths', () => {
    expect(joinPath('base path', 'child path')).toBe('base path/child path');
    expect(joinPath('base#path', 'child?path')).toBe('base#path/child?path');
  });
});

describe('popPath', () => {
  it('should pop path by traverse to parent path', () => {
    expect(popPath('/base-path/child-path')).toBe('/base-path');
  });

  it('should pop path by traverse to parent path with trailing slash', () => {
    expect(popPath('/base-path/child-path/')).toBe('/base-path');
  });

  it('should pop path by traverse to parent path with duplicate separator', () => {
    expect(popPath('//base-path//child-path//')).toBe('/base-path');
  });

  it('should pop top-level path', () => {
    expect(popPath('/base-path')).toBe('/');
  });

  it('should not pop path that is empty', () => {
    expect(popPath('')).toBe('/');
  });

  it('should handle root path', () => {
    expect(popPath('//')).toBe('/');
  });

  it('should handle multiple directory levels', () => {
    expect(popPath('/a/b/c/d')).toBe('/a/b/c');
    expect(popPath('/a/b/c/d/')).toBe('/a/b/c');
  });

  it('should handle paths with dots', () => {
    expect(popPath('/path/./to/file')).toBe('/path/./to');
    expect(popPath('./relative/path')).toBe('./relative');
  });

  it('should handle paths with spaces and special characters', () => {
    expect(popPath('/path with spaces/file')).toBe('/path with spaces');
    expect(popPath('/path#with?chars/file')).toBe('/path#with?chars');
  });

  it('should maintain leading slash in result', () => {
    expect(popPath('base/child')).toBe('/base');
    expect(popPath('/base/child')).toBe('/base');
  });
});
