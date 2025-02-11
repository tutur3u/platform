import { Problems } from '../challenges';
import ChatBox from './components/prompt-form';
import { Card } from '@repo/ui/components/ui/card';
import React from 'react';

export default function PromptComponent({ problem }: { problem: Problems }) {
  return (
    <Card className="h-[813px] w-1/2 overflow-y-auto p-4 pt-10">
      <ChatBox problem={problem}></ChatBox>
    </Card>
  );
}
