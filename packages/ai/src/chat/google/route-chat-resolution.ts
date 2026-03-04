type AdminClientLike = {
  message?: string;
};

function maskIdentifier(value: string | undefined): string {
  if (!value) return 'unknown';
  if (value.length <= 4) return '****';
  if (value.length <= 8) {
    return `${value.slice(0, 2)}...${value.slice(-2)}`;
  }
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

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
    console.error('list_temp_files_failed', {
      wsId: maskIdentifier(wsId),
      userId: maskIdentifier(userId),
    });
    return {
      error: new Response('Failed to list temp files', {
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
        console.error('temp_file_move_failed', {
          chatId: maskIdentifier(chatId),
          userId: maskIdentifier(userId),
          wsId: maskIdentifier(wsId),
        });
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

  const failedMoves = moveResults.filter((result) => result !== null);
  if (failedMoves.length > 0) {
    console.error('One or more temp files could not be moved', {
      failedCount: failedMoves.length,
      movedCount: movedPaths.size,
      chatId: maskIdentifier(chatId),
      userId: maskIdentifier(userId),
      wsId: maskIdentifier(wsId),
      status: 'partial_move_failure',
    });
  }

  return { error: null, movedPaths };
}
