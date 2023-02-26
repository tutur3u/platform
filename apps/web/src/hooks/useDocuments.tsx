import { mutate } from 'swr';

import { createContext, useContext, ReactNode } from 'react';
import { Document } from '../types/primitives/Document';
import { showNotification } from '@mantine/notifications';

const DocumentContext = createContext({
  createDocument: (projectId: string, document: Document) =>
    console.log(projectId, document),
  updateDocument: (projectId: string, document: Document) =>
    console.log(projectId, document),
  deleteDocument: (projectId: string, document: Document) =>
    console.log(projectId, document),
});

export const DocumentProvider = ({ children }: { children: ReactNode }) => {
  const createDocument = async (projectId: string, document: Document) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          name: document?.name || '',
          content: document?.content || '',
        }),
      });

      if (!res.ok) throw new Error('Failed to create document');
      mutate(`/api/projects/${projectId}/documents`);
    } catch (e) {
      showNotification({
        title: 'Failed to create document',
        message: 'Make sure you have permission to create new documents',
        color: 'red',
      });
    }
  };

  const updateDocument = async (projectId: string, document: Document) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/documents/${document.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: document?.name || '',
            content: document?.content || '',
          }),
        }
      );

      if (!res.ok) throw new Error('Failed to update document');
      mutate(`/api/projects/${projectId}/documents`);
    } catch (e) {
      showNotification({
        title: 'Failed to update document',
        message: 'Make sure you have permission to update documents',
        color: 'red',
      });
    }
  };

  const deleteDocument = async (projectId: string, document: Document) => {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/documents/${document.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) throw new Error('Failed to delete document');
      mutate(`/api/projects/${projectId}/documents`);
    } catch (e) {
      showNotification({
        title: 'Failed to delete document',
        message: 'Make sure you have permission to delete documents',
        color: 'red',
      });
    }
  };

  const values = {
    createDocument,
    updateDocument,
    deleteDocument,
  };

  return (
    <DocumentContext.Provider value={values}>
      {children}
    </DocumentContext.Provider>
  );
};

export const useDocuments = () => {
  const context = useContext(DocumentContext);

  if (context === undefined)
    throw new Error(`useDocuments() must be used within a DocumentProvider.`);

  return context;
};
