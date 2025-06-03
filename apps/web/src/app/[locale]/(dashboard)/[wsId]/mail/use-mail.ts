import { Mail, mails } from './data';
import { atom, useAtom } from 'jotai';

type Config = {
  selected: Mail['id'] | null;
};

const configAtom = atom<Config>({
  selected: mails?.[0]?.id || null,
});

export function useMail() {
  return useAtom(configAtom);
}
