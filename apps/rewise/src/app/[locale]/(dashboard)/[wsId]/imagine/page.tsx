import type { AIModelUI } from '@tuturuuu/types';
import Chat from '../chat';
import { getChats } from '../helper';

const IMAGEN_MODEL: AIModelUI = {
  value: 'vertex/imagen-3.0-fast-generate-001',
  label: 'imagen-3.0-fast-generate-001',
  provider: 'vertex',
  disabled: true,
};

interface Props {
  searchParams: Promise<{
    lang: string;
  }>;
}

export default async function AIPage({ searchParams }: Props) {
  const { lang: locale } = await searchParams;
  const { data: chats, count } = await getChats();

  return (
    <Chat
      inputModel={IMAGEN_MODEL}
      defaultChat={{
        model: IMAGEN_MODEL.value,
      }}
      chats={chats}
      count={count}
      locale={locale}
      noEmptyPage
      disabled
    />
  );
}
