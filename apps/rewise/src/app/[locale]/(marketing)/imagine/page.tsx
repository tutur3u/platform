import Chat from '../chat';
import { getChats } from '../helper';
import { models } from '@tuturuuu/ai/models';

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
      inputModel={models.find(
        (m) => m.value === 'imagen-3.0-fast-generate-001'
      )}
      defaultChat={{
        model: 'imagen3',
      }}
      chats={chats}
      count={count}
      locale={locale}
      noEmptyPage
      disabled
    />
  );
}
