'use client';

import { Comments } from './comments';

interface CommentsTabProps {
  wsId: string;
  projectId: string;
}

export default function CommentsTab({ wsId, projectId }: CommentsTabProps) {
  return <Comments wsId={wsId} projectId={projectId} />;
}
