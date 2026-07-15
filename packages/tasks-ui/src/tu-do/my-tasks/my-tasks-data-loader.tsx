import MyTasksContent from './my-tasks-content';

export async function MyTasksDataLoader({
  wsId,
  userId,
  isPersonal,
}: {
  wsId: string;
  userId: string;
  isPersonal: boolean;
}) {
  return (
    <div className="mx-auto mt-32 max-w-4xl space-y-4 md:space-y-6">
      <MyTasksContent wsId={wsId} userId={userId} isPersonal={isPersonal} />
    </div>
  );
}
