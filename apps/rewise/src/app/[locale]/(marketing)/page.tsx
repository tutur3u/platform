import Chat from './chat';
import { getChats } from './helper';

interface Props {
  searchParams: {
    lang: string;
  };
}

export default async function AIPage({ searchParams }: Props) {
  const { lang: locale } = searchParams;
  const { data: chats, count } = await getChats();

  return <Chat chats={chats} count={count} locale={locale} />;
}
