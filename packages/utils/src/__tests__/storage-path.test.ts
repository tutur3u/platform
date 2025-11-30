import { describe, expect, it } from 'vitest';
import {
  sanitizeFilename,
  sanitizeFolderName,
  sanitizePath,
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

    it('normalizes backslashes to forward slashes', () => {
      expect(sanitizePath('folder\\subfolder')).toBe('folder/subfolder');
      expect(sanitizePath('folder\\sub\\deep')).toBe('folder/sub/deep');
    });

    it('removes leading slashes', () => {
      expect(sanitizePath('/folder/subfolder')).toBe('folder/subfolder');
      expect(sanitizePath('///folder/subfolder')).toBe('folder/subfolder');
    });

    it('removes trailing slashes', () => {
      expect(sanitizePath('folder/subfolder/')).toBe('folder/subfolder');
      expect(sanitizePath('folder/subfolder///')).toBe('folder/subfolder');
    });

    it('trims whitespace', () => {
      expect(sanitizePath('  folder/subfolder  ')).toBe('folder/subfolder');
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

    it('handles paths with multiple consecutive slashes', () => {
      expect(sanitizePath('folder//subfolder')).toBe('folder/subfolder');
      expect(sanitizePath('folder///sub///deep')).toBe('folder/sub/deep');
    });

    it('handles mixed separators', () => {
      expect(sanitizePath('folder\\sub/deep\\deeper')).toBe(
        'folder/sub/deep/deeper'
      );
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
      const longName = 'a'.repeat(256) + '.txt';
      expect(sanitizeFilename(longName)).toBeNull();
    });

    it('accepts filenames at exactly 255 characters', () => {
      const maxName = 'a'.repeat(251) + '.txt';
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
