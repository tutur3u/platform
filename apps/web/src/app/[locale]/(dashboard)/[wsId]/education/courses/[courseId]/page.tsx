import { permanentRedirect } from 'next/navigation';

interface Props {
  params: Promise<{
    courseId: string;
    wsId: string;
  }>;
}

export default async function WorkspaceCourseLegacyRedirectPage({
  params,
}: Props) {
  const { courseId, wsId } = await params;
  permanentRedirect(`/${wsId}/education/courses/${courseId}/builder`);
}
