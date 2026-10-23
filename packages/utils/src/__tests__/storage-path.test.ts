import { describe, expect, it } from 'vitest';
import {
  sanitizeFilename,
  sanitizeFolderName,
  sanitizePath,
  sanitizePathSegments,
  sanitizePathStrict,
} from '../storage-path';

describe('Storage Path Sanitization', () => {
  describe('sanitizePath', () => {
    it('returns empty string for empty input', () => {
      expect(sanitizePath('')).toBe('');
    });

    it('handles simple paths', () => {
      expect(sanitizePath('folder/subfolder')).toBe('folder/subfolder');
    });

    it('handles single segment paths', () => {
      expect(sanitizePath('folder')).toBe('folder');
    });

    it('canonicalizes legacy paths while retaining strict segment checks', () => {
      expect(sanitizePathSegments('folder/subfolder')).toEqual([
        'folder',
        'subfolder',
      ]);
      expect(sanitizePath('folder\\subfolder')).toBe('folder/subfolder');
      expect(sanitizePath(' folder/subfolder ')).toBe('folder/subfolder');
      expect(sanitizePath('50% done')).toBe('50% done');
      expect(sanitizePath('docs/')).toBe('docs');
      expect(sanitizePath('/docs')).toBe('docs');
      expect(sanitizePathStrict('docs/')).toBeNull();
      expect(sanitizePathStrict('/docs')).toBeNull();
    });

    it('rejects leading and trailing separators', () => {
      expect(sanitizePathStrict('/folder/subfolder')).toBeNull();
      expect(sanitizePathStrict('folder/subfolder/')).toBeNull();
    });

    it('rejects path traversal with double dots', () => {
      expect(sanitizePath('../../../etc/passwd')).toBeNull();
      expect(sanitizePath('folder/../other')).toBeNull();
      expect(sanitizePath('folder/..hidden')).toBeNull();
    });

    it('rejects single dot segments', () => {
      expect(sanitizePath('./folder')).toBeNull();
      expect(sanitizePath('folder/./subfolder')).toBeNull();
    });

    it('rejects standalone double dots', () => {
      expect(sanitizePath('..')).toBeNull();
    });

    it('rejects standalone single dot', () => {
      expect(sanitizePath('.')).toBeNull();
    });

    it('rejects empty path segments and backslashes', () => {
      expect(sanitizePath('folder//subfolder')).toBe('folder/subfolder');
      expect(sanitizePath('folder///sub///deep')).toBe('folder/sub/deep');
      expect(sanitizePathStrict('folder\\sub/deep\\deeper')).toBeNull();
    });

    it.each([
      '../outside',
      '%2e%2e/outside',
      '%2E%2E/outside',
      '%2e./outside',
      '.%2e/outside',
      '%2E./outside',
      '.%2E/outside',
      'folder/%2f/outside',
      'folder/%2Foutside',
      'folder/%5coutside',
      'folder/%5Coutside',
      'folder\\..\\outside',
      'folder/\u0000name',
      'folder/\u001fname',
      'folder/https://outside.test/object',
      'https://outside.test/object',
      'folder/%00name',
      'folder/%0Aname',
      'folder/%252e%252e/outside',
    ])('rejects unsafe original path %j', (path) => {
      expect(sanitizePathStrict(path)).toBeNull();
      expect(sanitizePathSegments(path)).toBeNull();
    });

    it.each(['x?', 'x#'])(
      'rejects raw URL delimiters only in strict mode %j',
      (path) => {
        expect(sanitizePathStrict(path)).toBeNull();
        expect(sanitizePath(path)).toBe(path);
      }
    );

    it.each(['x%3F', 'x%23'])('allows encoded URL delimiters in %j', (path) => {
      expect(sanitizePathStrict(path)).toBe(path);
    });

    it.each([
      'folder/a\u0085b',
      'folder/a\u009fb',
      'folder/a%C2%85b',
      'folder/a%7Fb',
    ])('rejects raw and encoded control characters in %j', (path) => {
      expect(sanitizePathStrict(path)).toBeNull();
      expect(sanitizePath(path)).toBeNull();
    });

    it('handles complex valid paths', () => {
      expect(sanitizePath('users/uploads/documents/2024')).toBe(
        'users/uploads/documents/2024'
      );
    });

    it('handles paths with underscores and hyphens', () => {
      expect(sanitizePath('my-folder/sub_folder')).toBe('my-folder/sub_folder');
    });

    it('handles paths with numbers', () => {
      expect(sanitizePath('folder1/2024/files123')).toBe(
        'folder1/2024/files123'
      );
    });
  });

  describe('sanitizeFolderName', () => {
    it('returns null for empty input', () => {
      expect(sanitizeFolderName('')).toBeNull();
    });

    it('handles simple folder names', () => {
      expect(sanitizeFolderName('my-folder')).toBe('my-folder');
    });

    it('handles folder names with underscores', () => {
      expect(sanitizeFolderName('my_folder')).toBe('my_folder');
    });

    it('trims whitespace', () => {
      expect(sanitizeFolderName('  folder  ')).toBe('folder');
    });

    it('strips leading slashes and returns folder name', () => {
      expect(sanitizeFolderName('/folder')).toBe('folder');
    });

    it('strips trailing slashes and returns folder name', () => {
      expect(sanitizeFolderName('folder/')).toBe('folder');
    });

    it('rejects folder names containing slashes', () => {
      expect(sanitizeFolderName('folder/subfolder')).toBeNull();
    });

    it('rejects folder names containing backslashes', () => {
      expect(sanitizeFolderName('folder\\subfolder')).toBeNull();
    });

    it('rejects double dot path traversal', () => {
      expect(sanitizeFolderName('..')).toBeNull();
    });

    it('rejects encoded traversal as a single folder name', () => {
      expect(sanitizeFolderName('%2e%2e')).toBeNull();
    });

    it('rejects single dot', () => {
      expect(sanitizeFolderName('.')).toBeNull();
    });

    it('rejects folder names containing double dots', () => {
      expect(sanitizeFolderName('folder..name')).toBeNull();
      expect(sanitizeFolderName('..hidden')).toBeNull();
    });

    it('handles folder names with spaces', () => {
      expect(sanitizeFolderName('my folder')).toBe('my folder');
    });

    it('handles folder names with numbers', () => {
      expect(sanitizeFolderName('folder123')).toBe('folder123');
      expect(sanitizeFolderName('2024')).toBe('2024');
    });
  });

  describe('sanitizeFilename', () => {
    it('returns null for empty input', () => {
      expect(sanitizeFilename('')).toBeNull();
    });

    it('handles simple filenames', () => {
      expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
    });

    it('handles filenames without extensions', () => {
      expect(sanitizeFilename('README')).toBe('README');
    });

    it('handles filenames with multiple dots', () => {
      expect(sanitizeFilename('file.backup.txt')).toBe('file.backup.txt');
    });

    it('handles filenames with underscores and hyphens', () => {
      expect(sanitizeFilename('my-file_name.txt')).toBe('my-file_name.txt');
    });

    it('handles filenames with spaces', () => {
      expect(sanitizeFilename('my file.txt')).toBe('my file.txt');
    });

    it('handles filenames with numbers', () => {
      expect(sanitizeFilename('file123.txt')).toBe('file123.txt');
      expect(sanitizeFilename('2024-01-01.log')).toBe('2024-01-01.log');
    });

    it('rejects path traversal attempts', () => {
      expect(sanitizeFilename('../../../etc/passwd')).toBeNull();
      expect(sanitizeFilename('folder/file.txt')).toBeNull();
    });

    it('rejects backslash paths', () => {
      expect(sanitizeFilename('folder\\file.txt')).toBeNull();
    });

    it('rejects control characters', () => {
      expect(sanitizeFilename('file\x00name.txt')).toBeNull();
      expect(sanitizeFilename('file\x1fname.txt')).toBeNull();
    });

    it('rejects filenames starting with space', () => {
      expect(sanitizeFilename(' hidden.txt')).toBeNull();
    });

    it('rejects filenames ending with space', () => {
      expect(sanitizeFilename('file.txt ')).toBeNull();
    });

    it('rejects filenames starting with dot', () => {
      expect(sanitizeFilename('.hidden')).toBeNull();
      expect(sanitizeFilename('.gitignore')).toBeNull();
    });

    it('rejects filenames ending with dot', () => {
      expect(sanitizeFilename('file.')).toBeNull();
    });

    it('rejects filenames exceeding 255 characters', () => {
      const longName = `${'a'.repeat(256)}.txt`;
      expect(sanitizeFilename(longName)).toBeNull();
    });

    it('accepts filenames at exactly 255 characters', () => {
      const maxName = `${'a'.repeat(251)}.txt`;
      expect(sanitizeFilename(maxName)).toBe(maxName);
    });

    it('rejects non-ASCII characters', () => {
      expect(sanitizeFilename('файл.txt')).toBeNull();
      expect(sanitizeFilename('文件.txt')).toBeNull();
      expect(sanitizeFilename('résumé.pdf')).toBeNull();
    });

    it('rejects special characters not in allowlist', () => {
      expect(sanitizeFilename('file@name.txt')).toBeNull();
      expect(sanitizeFilename('file#name.txt')).toBeNull();
      expect(sanitizeFilename('file$name.txt')).toBeNull();
      expect(sanitizeFilename('file%name.txt')).toBeNull();
      expect(sanitizeFilename('file&name.txt')).toBeNull();
      expect(sanitizeFilename('file*name.txt')).toBeNull();
    });

    it('handles uppercase filenames', () => {
      expect(sanitizeFilename('DOCUMENT.PDF')).toBe('DOCUMENT.PDF');
    });

    it('handles mixed case filenames', () => {
      expect(sanitizeFilename('MyDocument.Pdf')).toBe('MyDocument.Pdf');
    });
  });
});
