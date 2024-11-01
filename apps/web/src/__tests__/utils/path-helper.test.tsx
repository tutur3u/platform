import { joinPath } from '@/utils/path-helper';
import { expect, it } from 'vitest';

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
