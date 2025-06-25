import { atom, useAtom } from 'jotai';
import { type Mail, mails } from './data';

type Config = {
  selected: Mail['id'] | null;
};

const configAtom = atom<Config>({
  selected: mails?.[0]?.id || null,
});

export function useMail() {
  return useAtom(configAtom);
}
