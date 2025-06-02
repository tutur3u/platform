import { WorkspaceDocument } from '@tuturuuu/types/db';
import { ReactNode, createContext, useContext } from 'react';
import { mutate } from 'swr';

const DocumentContext = createContext({
  createDocument: (wsId: string, document: WorkspaceDocument) =>
    console.log(wsId, document),
  updateDocument: (wsId: string, document: WorkspaceDocument) =>
    console.log(wsId, document),
  deleteDocument: (wsId: string, document: WorkspaceDocument) =>
    console.log(wsId, document),
});

export const DocumentProvider = ({ children }: { children: ReactNode }) => {
  const createDocument = async (wsId: string, document: WorkspaceDocument) => {
    try {
      const res = await fetch(`/api/workspaces/${wsId}/documents`, {
        method: 'POST',
        body: JSON.stringify({
          name: document?.name || '',
          content: document?.content || '',
        }),
      });

      if (!res.ok) throw new Error('Failed to create document');
      await mutate(`/api/workspaces/${wsId}/documents`);
    } catch (e) {
      // showNotification({
      //   title: 'Failed to create document',
      //   message: 'Make sure you have permission to create new documents',
      //   color: 'red',
      // });
    }
  };

  const updateDocument = async (wsId: string, document: WorkspaceDocument) => {
    try {
      const res = await fetch(
        `/api/workspaces/${wsId}/documents/${document.id}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            name: document?.name || '',
            content: document?.content || '',
          }),
        }
      );

      if (!res.ok) throw new Error('Failed to update document');
      await mutate(`/api/workspaces/${wsId}/documents`);
    } catch (e) {
      // showNotification({
      //   title: 'Failed to update document',
      //   message: 'Make sure you have permission to update documents',
      //   color: 'red',
      // });
    }
  };

  const deleteDocument = async (wsId: string, document: WorkspaceDocument) => {
    try {
      const res = await fetch(
        `/api/workspaces/${wsId}/documents/${document.id}`,
        {
          method: 'DELETE',
        }
      );

      if (!res.ok) throw new Error('Failed to delete document');
      await mutate(`/api/workspaces/${wsId}/documents`);
    } catch (e) {
      // showNotification({
      //   title: 'Failed to delete document',
      //   message: 'Make sure you have permission to delete documents',
      //   color: 'red',
      // });
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
