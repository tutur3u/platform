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
  loadThread: () => PromiseLike<{
    data: { role?: string }[] | null;
    error: { message: string } | null;
  }>;
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

export async function moveTempFilesToThread({
  loadThread,
  listFiles,
  moveFile,
  wsId,
  chatId,
  userId,
}: MoveTempFilesToThreadParams): Promise<Response | null> {
  if (!wsId) {
    return null;
  }

  const { data: thread, error: threadError } = await loadThread();

  if (threadError) {
    console.error('Error getting thread:', threadError);
    return new Response(threadError.message, { status: 500 });
  }

  if (!thread || thread.length === 0) {
    return null;
  }

  const tempStoragePath = `${wsId}/chats/ai/resources/temp/${userId}`;
  const { data: files, error: listError } = await listFiles(tempStoragePath);

  if (listError) {
    console.error('Error getting files:', listError);
    return null;
  }

  if (!files?.length) {
    return null;
  }

  await Promise.all(
    files.map(async (file) => {
      const fileName = file.name;
      const { error: copyError } = await moveFile(
        `${tempStoragePath}/${fileName}`,
        `${wsId}/chats/ai/resources/${chatId}/${fileName}`
      );

      if (copyError) {
        console.error('File copy error:', { fileName, copyError });
      }
    })
  );

  return null;
}
