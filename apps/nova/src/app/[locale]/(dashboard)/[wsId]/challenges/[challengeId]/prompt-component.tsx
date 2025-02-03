import { Card } from '@repo/ui/components/ui/card';
import React from 'react';
import ChatBox from './components/prompt-form';
export default function PromptComponent() {
  return (
    <Card className="h-[813px] w-1/2 overflow-y-auto p-4 pt-10">
    <ChatBox></ChatBox>
    </Card>
  );
}
