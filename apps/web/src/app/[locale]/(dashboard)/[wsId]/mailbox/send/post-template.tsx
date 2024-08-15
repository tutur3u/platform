import { UserGroupPost } from '../../users/groups/[groupId]/posts';
import {
  Body,
  Head,
  Html,
  Section,
  Tailwind,
  Text,
} from '@react-email/components';

const PostEmailTemplate = ({ post }: { post: UserGroupPost }) => {
  const forcePost: Partial<UserGroupPost> = {
    // id: '1',
    group_name: 'Group Name',
    title: 'Post Title',
    content: 'Post Content',
    notes: 'Post Notes',
  };
  const nextPost = forcePost.id ? forcePost : post;

  return (
    <Html>
      <Head />
      <Tailwind>
        <Body className="bg-gray-100 p-6">
          <Section className="rounded-lg bg-white p-6 shadow-md">
            <Section className="mb-6 flex items-center justify-between">
              <Section className="flex flex-col">
                <Text className="text-lg font-bold">
                  {process.env.NEXT_PUBLIC_SOURCE_NAME}
                </Text>
                <Text className="ml-[30px] text-sm">
                  24 Trường Sa - Phước Long - Nha Trang
                </Text>
                <Text className="ml-[50px] text-sm">
                  (0258) 6 557 457 — 0977 183 161
                </Text>
              </Section>
              <Section className="text-right">
                <Text className="text-sm text-gray-500">
                  {new Date().toLocaleDateString()}
                </Text>
              </Section>
            </Section>

            <Section className="mb-6 text-center">
              <Text className="text-xl font-bold uppercase">
                Group: {nextPost.group_name}
              </Text>
            </Section>

            <Section className="mb-4">
              <Text className="text-lg font-semibold">Title:</Text>
              <Text className="text-base">{nextPost.title}</Text>
            </Section>

            <Section className="mb-4">
              <Text className="text-lg font-semibold">Content:</Text>
              <Text className="text-base">{nextPost.content}</Text>
            </Section>

            <Section className="mb-4">
              <Text className="text-lg font-semibold">Notes:</Text>
              <Text className="text-base">{nextPost.notes}</Text>
            </Section>
          </Section>
        </Body>
      </Tailwind>
    </Html>
  );
};

export { PostEmailTemplate };
