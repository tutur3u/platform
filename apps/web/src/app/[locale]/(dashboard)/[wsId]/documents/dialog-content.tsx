'use client';

import { Button } from '@repo/ui/components/ui/button';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@repo/ui/components/ui/dialog';
import { Input } from '@repo/ui/components/ui/input';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

interface MyDialogContentProps {
  wsId: string;
}

async function createDocumentAction(
  wsId: string,
  documentName: string,
  router: ReturnType<typeof useRouter>,
  callback: () => void
) {
  try {
    const response = await fetch(`/api/v1/workspaces/${wsId}/documents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: documentName,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to create document');
    }

    callback();
    const docId = (await response.json()).id;
    router.push(`/${wsId}/documents/${docId}`);
    router.refresh();
  } catch (error) {
    console.error('Error creating document:', error);
  }
}

export default function MyDialogContent({ wsId }: MyDialogContentProps) {
  const [documentName, setDocumentName] = useState('');
  const [emptyCheck, setEmptyCheck] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleCreateDocument = async () => {
    if (!documentName.trim()) {
      setEmptyCheck(true);
      return;
    }

    setLoading(true);
    try {
      await createDocumentAction(wsId, documentName, router, () => {
        setDocumentName('');
        setEmptyCheck(false);
      });
    } catch (error) {
      console.error('Failed to create document:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Create new document</DialogTitle>
      </DialogHeader>
      <DialogDescription>
        Please input a name for the document
      </DialogDescription>

      <Input
        value={documentName}
        onChange={(e) => setDocumentName(e.target.value)}
        placeholder="Document Name"
        required
      />
      {emptyCheck && (
        <h3 className="text-sm text-red-700">
          Cannot leave the name for the document empty
        </h3>
      )}

      <DialogClose asChild>
        <Button onClick={handleCreateDocument} disabled={loading}>
          {loading ? 'Creating...' : 'Create'}
        </Button>
      </DialogClose>
    </DialogContent>
  );
}
