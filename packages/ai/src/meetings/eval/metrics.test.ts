import { describe, expect, it } from 'vitest';
import {
  editDistance,
  normalizeText,
  rates,
  scoreTranscript,
  sumCounts,
} from './metrics';

describe('Vietnamese transcription metrics', () => {
  it('canonicalizes decomposed accents, case, punctuation and whitespace', () => {
    const text = '  NGUYỄN,\n cà-phê!  ';
    expect(normalizeText(text.normalize('NFD'))).toBe('nguyễn cà phê');
    expect(
      scoreTranscript('Xin chào, Việt Nam!', 'XIN CHÀO VIỆT NAM', []).wordErrors
    ).toBe(0);
  });
  it('preserves tone marks and đ rather than hiding Vietnamese errors', () => {
    expect(scoreTranscript('má đỗ', 'ma do', []).wordErrors).toBe(2);
    expect(normalizeText('á à ả ã ạ ă â ê ô ơ ư đ')).toBe(
      'á à ả ã ạ ă â ê ô ơ ư đ'
    );
  });
  it('counts substitutions, deletions and insertions', () => {
    expect(editDistance(['a', 'b', 'c'], ['a', 'x', 'c', 'd'])).toBe(2);
    expect(editDistance(['a', 'b'], ['a'])).toBe(1);
    const counts = scoreTranscript('a b c', 'a x c d', []);
    expect(rates(counts).wer).toBeCloseTo(2 / 3);
    expect(rates(counts).cer).toBeCloseTo(2 / 3);
  });
  it('uses Unicode characters, excludes spaces, and retains insertions on silence', () => {
    expect(scoreTranscript('cà phê', 'càphê', []).characterErrors).toBe(0);
    expect(scoreTranscript('ắ', 'a', []).referenceCharacters).toBe(1);
    const silence = scoreTranscript('', 'invented words', []);
    expect(silence.wordErrors).toBe(2);
    expect(rates(silence).wer).toBeNull();
    expect(scoreTranscript('', '', []).characterErrors).toBe(0);
    expect(rates(scoreTranscript('a', 'a b c', [])).wer).toBe(2);
  });
  it('scores whole multiword terms, repeated names and absent glossary entries', () => {
    const counts = scoreTranscript(
      'An gọi An ở Hà Nội',
      'An gọi Anh ở Hà Nội',
      ['An', 'AN', 'Hà Nội', 'missing', '']
    );
    expect(counts.referenceTerms).toBe(3);
    expect(counts.termHits).toBe(2);
    expect(rates(counts).termAccuracy).toBeCloseTo(2 / 3);
    expect(scoreTranscript('An', 'An An An', ['An']).termHits).toBe(1);
    expect(
      rates(scoreTranscript('abc', 'abc', ['An'])).termAccuracy
    ).toBeNull();
  });
  it('micro averages by reference lengths, including silence insertions', () => {
    const sum = sumCounts([
      scoreTranscript('a b c', 'a b c', []),
      scoreTranscript('d', 'x', []),
      scoreTranscript('', 'y', []),
    ]);
    expect(rates(sum).wer).toBe(0.5);
    expect(rates(sum).cer).toBe(0.5);
    expect(rates(sumCounts([]))).toEqual({
      wer: null,
      cer: null,
      termAccuracy: null,
    });
  });
});
