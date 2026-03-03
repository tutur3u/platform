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
    return { error: null, movedPaths: new Map() };
  }

  if (!files?.length) {
    return { error: null, movedPaths: new Map() };
  }

  const movedPaths = new Map<string, string>();
  await Promise.all(
    files.map(async (file) => {
      const fileName = file.name;
      const fromPath = `${tempStoragePath}/${fileName}`;
      const toPath = `${wsId}/chats/ai/resources/${chatId}/${fileName}`;
      const { error: copyError } = await moveFile(fromPath, toPath);

      if (copyError) {
        console.error('File copy error:', { fileName, copyError });
        return;
      }

      movedPaths.set(fromPath, toPath);
    })
  );

  return { error: null, movedPaths };
}
