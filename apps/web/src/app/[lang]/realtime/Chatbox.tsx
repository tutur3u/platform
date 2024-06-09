import { Message } from './types';
import { Loader } from 'lucide-react';
import { FC, RefObject } from 'react';

interface Props {
  messages: Message[];
  chatboxRef: RefObject<any>;
  messagesInTransit: string[];
  areMessagesFetched: boolean;
}

const Chatbox: FC<Props> = ({
  messages,
  chatboxRef,
  messagesInTransit,
  areMessagesFetched,
}) => {
  return (
    <div className="flex max-h-[235px] flex-col overflow-y-scroll break-all rounded-md">
      <div
        className="w-[400px] space-y-1 px-4 py-2"
        style={{ backgroundColor: 'rgba(0, 207, 144, 0.05)' }}
      >
        {!areMessagesFetched ? (
          <div className="flex items-center space-x-2">
            <Loader className="text-scale-1200 animate-spin" size={14} />
            <p className="text-scale-1100 text-sm">Loading messages</p>
          </div>
        ) : messages.length === 0 && messagesInTransit.length === 0 ? (
          <div className="text-scale-1200 text-sm opacity-75">
            <span>Type anything to start chatting 🥳</span>
          </div>
        ) : (
          <div />
        )}
        {messages.map((message) => (
          <p
            key={message.id}
            className="text-scale-1200 whitespace-pre-line text-sm"
          >
            {message.message}
          </p>
        ))}
        {messagesInTransit.map((message, idx: number) => (
          <p key={`transit-${idx}`} className="text-scale-1100 text-sm">
            {message}
          </p>
        ))}
        <div ref={chatboxRef} className="!mt-0" />
      </div>
    </div>
  );
};

export default Chatbox;
