import { extractYoutubeId, isValidURL } from '@/utils/url-helper';
import { expect, it } from 'vitest';

it('should return true for URLs with different protocols', () => {
  expect(isValidURL('ftp://ftp.example.com')).toBe(true);
  expect(isValidURL('mailto:someone@example.com')).toBe(true);
});

it('should return true for URLs with subdomains', () => {
  expect(isValidURL('https://subdomain.example.com')).toBe(true);
});

it('should return true for URLs with ports', () => {
  expect(isValidURL('http://localhost:8080')).toBe(true);
});

it('should return true for URLs with paths', () => {
  expect(isValidURL('https://www.example.com/path/to/resource')).toBe(true);
});

it('should return true for URLs with query parameters', () => {
  expect(isValidURL('https://www.example.com/search?q=query')).toBe(true);
});

it('should return true for URLs with fragment identifiers', () => {
  expect(isValidURL('https://www.example.com/page#section')).toBe(true);
});

it('should return false for URLs missing a protocol', () => {
  expect(isValidURL('www.example.com')).toBe(false);
});

it('should return true for URLs with special characters', () => {
  expect(isValidURL('https://www.example.com/?key=value&key2=value2')).toBe(
    true
  );
  expect(
    isValidURL('https://www.example.com/path/to/resource?query=あいうえお')
  ).toBe(true);
});

it('should return true for international domain names', () => {
  expect(isValidURL('https://www.例子.测试')).toBe(true);
  expect(isValidURL('https://www.例え.テスト')).toBe(true);
});

it('should return false for URLs with invalid characters', () => {
  expect(isValidURL('https://www.exa<mple.com')).toBe(false);
  expect(isValidURL('https://www.exa>mple.com')).toBe(false);
});

it('should return false for URLs that are JavaScript code', () => {
  expect(isValidURL('javascript:alert("XSS")')).toBe(false);
});

it('should return false for URLs that are data URIs', () => {
  expect(
    isValidURL('data:text/html;base64,PHNjcmlwdD5hbGVydCgiWFNTIik8L3NjcmlwdD4=')
  ).toBe(false);
});

it('should return true for URLs with different protocols', () => {
  expect(isValidURL('ftp://ftp.example.com')).toBe(true);
  expect(isValidURL('mailto:someone@example.com')).toBe(true);
});

it('should return true for URLs with subdomains', () => {
  expect(isValidURL('https://subdomain.example.com')).toBe(true);
});

it('should return true for URLs with ports', () => {
  expect(isValidURL('http://localhost:8080')).toBe(true);
});

it('should return true for URLs with paths', () => {
  expect(isValidURL('https://www.example.com/path/to/resource')).toBe(true);
});

it('should return true for URLs with query parameters', () => {
  expect(isValidURL('https://www.example.com/search?q=query')).toBe(true);
});

it('should return true for URLs with fragment identifiers', () => {
  expect(isValidURL('https://www.example.com/page#section')).toBe(true);
});

it('should return false for URLs missing a protocol', () => {
  expect(isValidURL('www.example.com')).toBe(false);
});

it('should return true for URLs with special characters', () => {
  expect(isValidURL('https://www.example.com/?key=value&key2=value2')).toBe(
    true
  );
  expect(
    isValidURL('https://www.example.com/path/to/resource?query=あいうえお')
  ).toBe(true);
});

it('should return true for international domain names', () => {
  expect(isValidURL('https://www.例子.测试')).toBe(true);
  expect(isValidURL('https://www.例え.テスト')).toBe(true);
});

it('should return false for URLs with invalid characters', () => {
  expect(isValidURL('https://www.exa<mple.com')).toBe(false);
  expect(isValidURL('https://www.exa>mple.com')).toBe(false);
});

it('should return false for URLs that are JavaScript code', () => {
  expect(isValidURL('javascript:alert("XSS")')).toBe(false);
});

it('should return false for URLs that are data URIs', () => {
  expect(
    isValidURL('data:text/html;base64,PHNjcmlwdD5hbGVydCgiWFNTIik8L3NjcmlwdD4=')
  ).toBe(false);
});

it('should extract YouTube video ID from standard URL', () => {
  expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
    'dQw4w9WgXcQ'
  );
});

it('should extract YouTube video ID from shortened URL', () => {
  expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
});

it('should return undefined for non-YouTube URLs', () => {
  expect(
    extractYoutubeId('https://www.example.com/watch?v=dQw4w9WgXcQ')
  ).toBeUndefined();
});

it('should return undefined for empty URL', () => {
  expect(extractYoutubeId('')).toBeUndefined();
});

it('should extract YouTube video ID from URL with additional parameters', () => {
  expect(
    extractYoutubeId(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=youtu.be'
    )
  ).toBe('dQw4w9WgXcQ');
});

it('should extract YouTube video ID from URL with path segments', () => {
  expect(extractYoutubeId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe(
    'dQw4w9WgXcQ'
  );
});

it('should extract YouTube video ID from URL with time parameter', () => {
  expect(
    extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s')
  ).toBe('dQw4w9WgXcQ');
});

it('should extract YouTube video ID from URL with playlist parameter', () => {
  expect(
    extractYoutubeId(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL3A5849BDE0581B19'
    )
  ).toBe('dQw4w9WgXcQ');
});

it('should extract YouTube video ID from URL with start parameter', () => {
  expect(
    extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&start=90')
  ).toBe('dQw4w9WgXcQ');
});

it('should extract YouTube video ID from URL with embed path', () => {
  expect(extractYoutubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
    'dQw4w9WgXcQ'
  );
});

it('should extract YouTube video ID from URL with short embed path', () => {
  expect(extractYoutubeId('https://www.youtube.com/v/dQw4w9WgXcQ')).toBe(
    'dQw4w9WgXcQ'
  );
});

// YouTube ID extraction tests
it('should extract video ID from standard YouTube URL', () => {
  expect(extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
    'dQw4w9WgXcQ'
  );
  expect(extractYoutubeId('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
    'dQw4w9WgXcQ'
  );
});

it('should extract video ID from shortened YouTube URL', () => {
  expect(extractYoutubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
});

it('should handle invalid YouTube URLs', () => {
  expect(extractYoutubeId('https://example.com')).toBeUndefined();
  expect(extractYoutubeId('https://youtube.com')).toBeUndefined();
  expect(extractYoutubeId('https://youtube.com/watch')).toBeUndefined();
});

it('should handle malformed YouTube URLs', () => {
  expect(extractYoutubeId('')).toBeUndefined();
  expect(extractYoutubeId('not a url')).toBeUndefined();
});

it('should handle YouTube URLs with additional parameters', () => {
  expect(
    extractYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=123')
  ).toBe('dQw4w9WgXcQ');
  expect(
    extractYoutubeId(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share'
    )
  ).toBe('dQw4w9WgXcQ');
});
