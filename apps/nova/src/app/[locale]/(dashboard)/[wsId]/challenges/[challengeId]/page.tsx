import { getChallenges } from '../challenges';
import ProblemComponent from './problem-component';
import TestCaseComponent from './test-case-component';
import { Card } from '@repo/ui/components/ui/card';
import React from 'react';

interface Props {
  params: Promise<{
    challengeId: string;
  }>;
}

export default async function Page({ params }: Props) {
  const { challengeId } = await params;

  return (
    <div className="flex gap-4 p-6">
      {/* Left side: Problem & Test Cases */}
      <div className="flex w-1/2 flex-col">
        <ProblemComponent />
        <TestCaseComponent />
      </div>

      {/* Right side: Chat Box / Editor */}
      <Card className="h-[813px] w-1/2 overflow-y-auto p-4 pt-10">
        <h2 className="text-lg font-semibold">Chat Box</h2>
        <p>Interact with the problem here...</p>
      </Card>
    </div>
  );
}
