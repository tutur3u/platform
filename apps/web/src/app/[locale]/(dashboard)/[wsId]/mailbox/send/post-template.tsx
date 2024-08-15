import { UserGroupPost } from '../../users/groups/[groupId]/posts';
import { Head, Html, Tailwind } from '@react-email/components';

const PostEmailTemplate = ({ post }: { post: UserGroupPost }) => {
  const forcePost: Partial<UserGroupPost> = {
    id: '1',
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
        <div className="bg-gray-100 p-6 font-sans">
          <div className="mx-auto max-w-md overflow-hidden rounded-lg bg-white shadow-lg">
            <div className="px-6 py-4">
              <div className="flex items-center">
                <img
                  className="h-10 w-10 rounded-full"
                  src="https://via.placeholder.com/150"
                  alt="User Avatar"
                />
                <div className="ml-4">
                  <div className="text-lg font-semibold text-gray-800">
                    Võ Hoàng Phúc
                  </div>
                  <div className="text-sm text-gray-500">
                    mentioned you in{' '}
                    <a href="#" className="text-blue-500">
                      Group: {nextPost.group_name}
                    </a>
                  </div>
                  <div className="text-xs text-gray-400">
                    {nextPost.created_at}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-4">
              <p className="text-sm text-gray-600">Hi, member </p>
              <p className="text-sm text-gray-600">
                You receive a {nextPost.title}
              </p>
              <p className="text-sm text-gray-600">
                Content: {nextPost.content}
              </p>
              <p className="text-sm text-gray-600">Notes: {nextPost.notes}</p>
            </div>
            <div className="px-6 py-4">
              <a
                href="tuturuu.com"
                className="block rounded bg-blue-500 px-4 py-2 text-center font-semibold text-white"
              >
                Go to page
              </a>
            </div>
            <hr />
            <div className="flex items-center px-6 py-4">
              <img
                className="h-6 w-6"
                src="https://via.placeholder.com/24"
                alt="Brand Logo"
              />
              <div className="ml-2">
                <p className="text-sm font-semibold text-gray-700">Tuturuu</p>
                <p className="text-xs text-gray-500">
                  <a href="#" className="text-blue-500">
                    Tuturuuu
                  </a>{' '}
                  make everything connected.
                </p>
              </div>
            </div>
            <div className="bg-gray-50 px-6 py-4">
              <a href="#" className="text-xs text-gray-500">
                Update your email settings
              </a>
            </div>
          </div>
        </div>
      </Tailwind>
    </Html>
  );
};

export { PostEmailTemplate };
