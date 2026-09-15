import { expect, it } from 'vitest';
import { mailSnippetText } from './mail-snippet-text';

it('cleans nested or truncated emphasis in mail descriptions', () => {
  expect(
    mailSnippetText(
      '*Dear **Dr. Justin Xavier* and **Ms. Tien, We are incredib...'
    )
  ).toBe('Dear Dr. Justin Xavier and Ms. Tien, We are incredib...');
  expect(
    mailSnippetText('**Hello** _world_ [read more](https://example.com)')
  ).toBe('Hello world read more');
});
it('preserves addresses and ordinary punctuation', () => {
  expect(mailSnippetText('Contact first_last@example.com. 2 * 3 = 6.')).toBe(
    'Contact first_last@example.com. 2 * 3 = 6.'
  );
});
