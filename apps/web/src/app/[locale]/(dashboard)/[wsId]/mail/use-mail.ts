import type { Mail } from './client';
import { atom, useAtom } from 'jotai';

type Config = {
  selected: Mail['id'] | null;
};

const configAtom = atom<Config>({
  selected: null,
});

export function useMail() {
  return useAtom(configAtom);
}
