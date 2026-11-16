import type { CiteContributor, CiteWork } from './model';
import { issuedYear } from './model';

function bibtexText(value: string) {
  return value
    .replace(/[{}\\%]/g, (character) => `\\${character}`)
    .replace(/[\r\n]+/g, ' ');
}
const contributorName = (author: CiteContributor) =>
  author.kind === 'organization'
    ? `{${bibtexText(author.name)}}`
    : `${bibtexText(author.family)}${author.given ? `, ${bibtexText(author.given)}` : ''}`;

export function toBibTeX(work: CiteWork): string {
  const type =
    work.type === 'journal-article'
      ? 'article'
      : ['book', 'edited-book'].includes(work.type)
        ? 'book'
        : work.type === 'book-chapter'
          ? 'incollection'
          : work.type === 'conference-paper'
            ? 'inproceedings'
            : work.type === 'thesis'
              ? 'phdthesis'
              : 'misc';
  const fields: [string, string | undefined][] = [
    ['title', work.title],
    [
      'author',
      work.authors.length
        ? work.authors.map(contributorName).join(' and ')
        : undefined,
    ],
    [
      'editor',
      work.editors.length
        ? work.editors.map(contributorName).join(' and ')
        : undefined,
    ],
    ['year', issuedYear(work)?.toString()],
    [type === 'article' ? 'journal' : 'booktitle', work.containerTitle],
    ['publisher', work.publisher],
    ['address', work.publisherPlace],
    ['volume', work.volume],
    ['number', work.issue],
    ['pages', work.pages],
    ['edition', work.edition],
    ['doi', work.doi],
    ['isbn', work.isbn],
    ['url', work.url],
  ];
  const key = work.id.replace(/[^a-z0-9:_-]/gi, '_');
  return `@${type}{${key},\n${fields
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(
      ([name, value]) =>
        `  ${name} = {${name === 'author' || name === 'editor' ? value : bibtexText(value)}}`
    )
    .join(',\n')}\n}`;
}

export function toRIS(work: CiteWork): string {
  const type =
    work.type === 'journal-article'
      ? 'JOUR'
      : ['book', 'edited-book'].includes(work.type)
        ? 'BOOK'
        : work.type === 'book-chapter'
          ? 'CHAP'
          : work.type === 'conference-paper'
            ? 'CONF'
            : work.type === 'dataset'
              ? 'DATA'
              : work.type === 'thesis'
                ? 'THES'
                : 'GEN';
  const fields: [string, string | undefined][] = [
    ['TY', type],
    ['ID', work.id],
    ['TI', work.title],
    ...work.authors.map((author): [string, string] => [
      'AU',
      author.kind === 'organization'
        ? author.name
        : `${author.family}${author.given ? `, ${author.given}` : ''}`,
    ]),
    ['PY', issuedYear(work)?.toString()],
    ['T2', work.containerTitle],
    ['PB', work.publisher],
    ['CY', work.publisherPlace],
    ['VL', work.volume],
    ['IS', work.issue],
    ['SP', work.pages],
    ['DO', work.doi],
    ['SN', work.isbn ?? work.issn],
    ['UR', work.url],
    ['ER', ''],
  ];
  return fields
    .filter(
      ([tag, value]) => value !== undefined && (Boolean(value) || tag === 'ER')
    )
    .map(
      ([tag, value]) => `${tag}  - ${(value ?? '').replace(/[\r\n]+/g, ' ')}`
    )
    .join('\n');
}
