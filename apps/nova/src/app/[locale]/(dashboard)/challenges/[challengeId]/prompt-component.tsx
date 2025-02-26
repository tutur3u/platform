import { Problems } from '../challenges';
import ChatBox from './components/prompt-form';
import { Card } from '@tuturuuu/ui/card';

export default function PromptComponent({
  problem,
  challengeId,
}: {
  problem: Problems;
  challengeId: string;
}) {
  return (
    <Card className="h-[813px] w-1/2 overflow-y-auto bg-foreground/10 p-4 pt-10 text-foreground">
      <ChatBox challengeId={challengeId} problem={problem}></ChatBox>
    </Card>
  );
}
