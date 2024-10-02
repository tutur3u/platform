import { isValidURL } from '@/utils/url-helper';
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
