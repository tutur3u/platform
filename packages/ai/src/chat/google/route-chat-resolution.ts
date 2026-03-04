type AdminClientLike = {
  message?: string;
};

export async function resolveChatIdForUser(
  requestedChatId: string | undefined,
  fetchLatestChatId: () => PromiseLike<{
    data: { id: string } | null;
    error: { message: string } | null;
  }>
): Promise<{ chatId: string } | { error: Response }> {
  if (requestedChatId) {
    return { chatId: requestedChatId };
  }

  const { data, error } = await fetchLatestChatId();

  if (error) {
    console.error(error.message);
    return { error: new Response(error.message, { status: 500 }) };
  }

  if (!data) {
    return { error: new Response('Internal Server Error', { status: 500 }) };
  }

  return { chatId: data.id };
}

type MoveTempFilesToThreadParams = {
  listFiles: (tempStoragePath: string) => PromiseLike<{
    data: { name: string }[] | null;
    error: AdminClientLike | null;
  }>;
  moveFile: (
    fromPath: string,
    toPath: string
  ) => PromiseLike<{ error: AdminClientLike | null }>;
  wsId?: string;
  chatId: string;
  userId: string;
};

type MoveTempFilesToThreadResult =
  | { error: Response; movedPaths?: never }
  | { error: null; movedPaths: Map<string, string> };

export async function moveTempFilesToThread({
  listFiles,
  moveFile,
  wsId,
  chatId,
  userId,
}: MoveTempFilesToThreadParams): Promise<MoveTempFilesToThreadResult> {
  if (!wsId) {
    return { error: null, movedPaths: new Map() };
  }

  const tempStoragePath = `${wsId}/chats/ai/resources/temp/${userId}`;
  const { data: files, error: listError } = await listFiles(tempStoragePath);

  if (listError) {
    console.error('Error getting files:', listError);
    return {
      error: new Response(listError.message || 'Failed to list temp files', {
        status: 500,
      }),
    };
  }

  if (!files?.length) {
    return { error: null, movedPaths: new Map() };
  }

  const movedPaths = new Map<string, string>();
  const moveResults = await Promise.all(
    files.map(async (file) => {
      const fileName = file.name;
      const fromPath = `${tempStoragePath}/${fileName}`;
      const toPath = `${wsId}/chats/ai/resources/${chatId}/${fileName}`;
      const { error: copyError } = await moveFile(fromPath, toPath);

      if (copyError) {
        console.error('File copy error:', { fileName, copyError });
        return {
          error: copyError,
          fileName,
          fromPath,
          toPath,
        };
      }

      movedPaths.set(fromPath, toPath);
      return null;
    })
  );

  const failedMove = moveResults.find((result) => result !== null);
  if (failedMove) {
    return {
      error: new Response(
        failedMove.error.message || 'Failed to move one or more temp files',
        { status: 500 }
      ),
    };
  }

  return { error: null, movedPaths };
}
