import { AIChat } from '@tuturuuu/types/db';

export default function Types() {
  const aiChatInstance: AIChat = {
    id: '1',
    title: 'Gemini 2.0 Flash 001',
    model: 'gemini-2.0-flash-001',
    latest_summarized_message_id: null,
    is_public: false,
    summary: null,
    pinned: false,
    creator_id: null,
    created_at: new Date().toISOString(),
  };

  return (
    <div>
      Types
      <p>AIChat instance created with model: {aiChatInstance.model}</p>
      <p>AIChat ID: {aiChatInstance.id}</p>
      <p>Is public: {aiChatInstance.is_public ? 'Yes' : 'No'}</p>
      <p>Created at: {aiChatInstance.created_at}</p>
    </div>
  );
}
