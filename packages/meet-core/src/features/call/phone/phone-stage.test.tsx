import { expect, it } from 'vitest';
import { fitTileGrid } from '../components/stage-grid-fit';
import { PHONE_TILE_ASPECT, pickPhoneSpeaker } from './phone-stage';

const tiles = ['a', 'b', 'c', 'd', 'e'].map((id) => ({
  key: `${id}:camera`,
  userId: id,
}));

it('leads with the first active speaker that is not the local person', () => {
  expect(pickPhoneSpeaker(tiles, ['a', 'c', 'd'], 'a')?.userId).toBe('c');
});

it('falls back to recent speakers, then the first remote tile', () => {
  expect(pickPhoneSpeaker(tiles, ['zzz'], 'a')?.userId).toBe('b');
  expect(pickPhoneSpeaker(tiles, [], 'b')?.userId).toBe('a');
});

it('uses the local tile when nobody else is on screen', () => {
  expect(pickPhoneSpeaker([tiles[0] as never], [], 'a')?.userId).toBe('a');
});

it('fits four people in two portrait columns on a 390 pt phone', () => {
  const fit = fitTileGrid({
    count: 4,
    width: 374,
    height: 540,
    gap: 12,
    minWidth: 160,
    aspect: PHONE_TILE_ASPECT,
  });
  expect(fit?.columns).toBe(2);
  expect(fit?.rows).toBe(2);
  expect(fit?.scroll).toBe(false);
  expect((fit?.tileHeight ?? 0) > (fit?.tileWidth ?? 1)).toBe(true);
});

it('keeps the landscape single column for four people without the phone aspect', () => {
  const fit = fitTileGrid({
    count: 4,
    width: 374,
    height: 540,
    gap: 12,
    minWidth: 160,
  });
  expect(fit?.columns).toBe(1);
});
