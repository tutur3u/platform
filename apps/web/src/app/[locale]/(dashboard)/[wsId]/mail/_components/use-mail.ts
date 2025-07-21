'use client';

import type { InternalEmail } from '@tuturuuu/types/db';
import { atom, useAtom } from 'jotai';

type Config = {
  selected: InternalEmail['id'] | null;
};

const configAtom = atom<Config>({
  selected: null,
});

export function useMail() {
  return useAtom(configAtom);
}
