import Editor from '../advanced-editor';
import { Button } from '@repo/ui/components/ui/button';
import React from 'react';

interface Props {
  params: Promise<{
    wsId: string;
    documentId: string;
  }>;
}
export default async function Page({params }: Props) {
    const {wsId, documentId}= await params;
  return (
    <div className="flex flex-col">
      <div className="mb-4 flex justify-end">
        <Button>Delete</Button>
      </div>
      <Editor />
    </div>
  );
}
