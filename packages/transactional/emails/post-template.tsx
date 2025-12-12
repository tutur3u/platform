import { Head, Html, Img, Tailwind } from '@tuturuuu/transactional/react/email';

export interface UserGroupPost {
  id?: string;
  group_name?: string;
  title: string | null;
  content: string | null;
  notes: string | null;
  created_at?: string;
  student_name?: string | null;
}

const DEFAULT_USER_GROUP_POST: Partial<UserGroupPost> = {
  id: '1',
  group_name: '[COSC1234] Event Management',
  title: 'MINDSET 2 - UNIT 8 - FESTIVALS AND TRADITIONS',
  content: 'Listening - Exam skills',
  student_name: 'Huỳnh Tấn Phát',
};

const PostEmailTemplate = ({ post }: { post: UserGroupPost }) => {
  const nextPost = DEFAULT_USER_GROUP_POST.id ? DEFAULT_USER_GROUP_POST : post;

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : '';

  return (
    <Html>
      <Head />
      <Tailwind>
        <div className="m-4 rounded-lg border bg-gray-100 p-6 font-sans">
          <div className="mx-auto max-w-md overflow-hidden rounded-lg bg-white shadow-lg">
            <div className="px-6 py-4">
              <div className="text-center">
                <div className="w-full text-center">
                  <div className="flex items-center justify-center">
                    <Img
                      src={`${baseUrl}/media/logos/easy.png`}
                      width="100"
                      height="38"
                    />
                  </div>
                  <div className="font-bold text-gray-800 text-lg">
                    Easy Center
                  </div>
                  <div className="font-semibold text-gray-500">
                    24 Trường Sa - Phước Long - Nha Trang
                  </div>
                  <div className="text-gray-500 text-sm">
                    (0258) 6557 457 - 0977 183 161
                  </div>
                </div>
              </div>
            </div>
            <hr />
            <div className="px-6 py-4">
              <div className="flex w-full items-center justify-center text-center">
                <div className="w-fit rounded-full bg-black px-4 py-1 font-semibold text-white text-xs">
                  Tiếng Việt
                </div>
              </div>
              <div className="w-full pt-4 text-center">
                <div className="text-center font-semibold uppercase">
                  Báo cáo tiến độ học tập theo ngày
                </div>
                <div className="text-blue-500">{nextPost.group_name}</div>
              </div>
              <p className="text-muted-foreground text-sm">
                Trung tâm Easy thân gửi phụ huynh báo cáo tiến độ học tập của em{' '}
                <span className="font-semibold text-purple-600">
                  {nextPost.student_name}
                </span>{' '}
                trong ngày{' '}
                {new Date().toLocaleDateString('vi', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                , lớp{' '}
                <span className="font-semibold underline">
                  {nextPost.group_name}
                </span>
                , với nội dung như sau:
              </p>
              <p className="text-muted-foreground text-sm">
                <span className="font-semibold">Bài học:</span>{' '}
                <span className="">{nextPost.title}</span>
              </p>
              <p className="text-muted-foreground text-sm">
                <span className="font-semibold">Nội dung:</span>{' '}
                {nextPost.content}
              </p>
            </div>
            <hr />
            <div className="px-6 py-4">
              <div className="flex w-full items-center justify-center text-center">
                <div className="w-fit rounded-full bg-black px-4 py-1 font-semibold text-white text-xs">
                  English
                </div>
              </div>
              <div className="w-full pt-4 text-center">
                <div className="text-center font-semibold uppercase">
                  Daily learning progress report
                </div>
                <div className="text-blue-500">{nextPost.group_name}</div>
              </div>
              <p className="text-muted-foreground text-sm">
                Easy Center kindly sends parents a report on the learning
                progress of{' '}
                <span className="font-semibold text-purple-600">
                  {nextPost.student_name}
                </span>{' '}
                on{' '}
                {new Date().toLocaleDateString('en-US', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                , class{' '}
                <span className="font-semibold underline">
                  {nextPost.group_name}
                </span>
                , with the following content:
              </p>
              <p className="text-muted-foreground text-sm">
                <span className="font-semibold">Lesson:</span>{' '}
                <span className="">{nextPost.title}</span>
              </p>
              <p className="text-muted-foreground text-sm">
                <span className="font-semibold">Content:</span>{' '}
                {nextPost.content}
              </p>
            </div>
            {/* <hr />
            <div className="text-center px-6 py-4">
              <div className="ml-2">
                <p className="text-sm font-semibold text-gray-700">Tuturuuu</p>
                <p className="text-xs text-gray-500">
                  <a href="#" className="text-blue-500">
                    Tuturuuu
                  </a>{' '}
                  makes everything connected.
                </p>
              </div>
            </div> */}
            {/* <div className="bg-gray-50 px-6 py-4">
              <a href="#" className="text-xs text-gray-500">
                Update your email settings
              </a>
            </div> */}
          </div>
        </div>
      </Tailwind>
    </Html>
  );
};

export default PostEmailTemplate;
