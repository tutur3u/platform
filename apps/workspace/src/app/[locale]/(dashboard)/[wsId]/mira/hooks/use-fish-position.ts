'use client';

import { atom, useAtomValue, useSetAtom } from 'jotai';

export interface FishPosition {
  x: number;
  y: number;
  facingLeft: boolean;
}

const fishPositionAtom = atom<FishPosition>({ x: 0, y: 0, facingLeft: false });

export const useFishPosition = () => useAtomValue(fishPositionAtom);
export const useSetFishPosition = () => useSetAtom(fishPositionAtom);
