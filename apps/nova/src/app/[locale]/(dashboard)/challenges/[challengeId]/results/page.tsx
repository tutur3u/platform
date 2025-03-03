'use client';

import ResultComponent from './result-page-component';

interface Props {
  params: Promise<{ challengeId: string }>;
}

export default async function Page({ params }: Props) {
  const { challengeId } = await params;
  return <ResultComponent challengeId={challengeId} />;
}
