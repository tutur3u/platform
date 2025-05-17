import type { UserGroupPost } from '../../users/groups/[groupId]/posts/[postId]/card';
import { Head, Html, Img, Tailwind } from '@tuturuuu/transactional/react/email';
import { cn } from '@tuturuuu/utils/format';

interface Props {
  post: UserGroupPost;
  isHomeworkDone?: boolean;
  username: string | undefined;
  notes: string | undefined;
}

const PostEmailTemplate = ({
  post,
  isHomeworkDone,
  username,
  notes,
}: Props) => {
  return (
    <Html>
      <Head />
      <Tailwind>
        <div className="m-4 rounded-lg border bg-gray-100 p-6 font-sans">
          <div className="mx-auto max-w-md overflow-hidden rounded-lg bg-white shadow-lg">
            <div className="px-6 py-4">
              <div className="text-center">
                <div className="w-full text-center">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      width: '100%',
                    }}
                  >
                    <Img
                      src="https://tuturuuu.com/media/logos/easy.png"
                      width="100"
                      height="38"
                    />
                  </div>
                  <div className="text-lg font-bold text-gray-800">
                    Easy Center
                  </div>
                  <div className="font-semibold text-gray-500">
                    24 Trường Sa - Phước Long - Nha Trang
                  </div>
                  <div className="text-sm text-gray-500">
                    (0258) 6557 457 - 0977 183 161
                  </div>
                </div>
              </div>
            </div>
            <hr />
            <div className="px-6 py-4">
              {/* <div className="flex w-full items-center justify-center text-center">
                <div className="w-fit rounded-full bg-black px-4 py-1 text-xs font-semibold text-white">
                  Tiếng Việt
                </div>
              </div> */}
              <div className="w-full pt-4 text-center">
                <div className="text-center font-semibold uppercase">
                  Báo cáo tiến độ học tập theo ngày
                </div>
                {isHomeworkDone !== undefined && (
                  <div
                    className={cn(
                      'text-lg font-semibold uppercase',
                      isHomeworkDone ? 'text-green-600' : 'text-red-600'
                    )}
                  >
                    {(isHomeworkDone
                      ? 'Đã làm bài tập'
                      : 'Chưa làm bài tập'
                    ).toUpperCase()}
                  </div>
                )}
              </div>
              <p className="text-sm text-gray-600">
                Trung tâm Easy thân gửi phụ huynh báo cáo tiến độ học tập của em{' '}
                <span className="font-semibold text-purple-600">
                  {username || '<Chưa có tên>'}
                </span>{' '}
                trong ngày{' '}
                {new Date().toLocaleDateString('vi', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                , lớp{' '}
                <span className="font-semibold underline">
                  {post.group_name}
                </span>
                , với nội dung như sau:
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Bài học:</span>{' '}
                <span className="">{post.title || 'Không rõ'}</span>
              </p>
              {post.content && (
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Nội dung:</span>{' '}
                  <span className="whitespace-pre-line">{post.content}</span>
                </p>
              )}
              {notes && (
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Ghi chú:</span>{' '}
                  <span className="whitespace-pre-line">{notes}</span>
                </p>
              )}
            </div>
            <hr />
            <div className="px-6 py-4">
              {/* <div className="flex w-full items-center justify-center text-center">
                <div className="w-fit rounded-full bg-black px-4 py-1 text-xs font-semibold text-white">
                  English
                </div>
              </div> */}
              <div className="w-full pt-4 text-center">
                <div className="text-center font-semibold uppercase">
                  Daily learning progress report
                </div>
                <div
                  className={cn(
                    'text-lg font-semibold uppercase',
                    isHomeworkDone ? 'text-green-600' : 'text-red-600'
                  )}
                >
                  {(isHomeworkDone
                    ? 'Homework completed'
                    : 'Homework incompleted'
                  ).toUpperCase()}
                </div>
              </div>
              <p className="text-sm text-gray-600">
                Easy Center kindly sends parents a report on the learning
                progress of{' '}
                <span className="font-semibold text-purple-600">
                  {username || '<No name>'}
                </span>{' '}
                on{' '}
                {new Date().toLocaleDateString('en-US', {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                , class{' '}
                <span className="font-semibold underline">
                  {post.group_name}
                </span>
                , with the following content:
              </p>
              <p className="text-sm text-gray-600">
                <span className="font-semibold">Lesson:</span>{' '}
                <span className="">{post.title || 'Unknown'}</span>
              </p>
              {post.content && (
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Content:</span>{' '}
                  <span className="whitespace-pre-line">{post.content}</span>
                </p>
              )}
              {notes && (
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">Note:</span>{' '}
                  <span className="whitespace-pre-line">{notes}</span>
                </p>
              )}
            </div>
          </div>
        </div>
      </Tailwind>
    </Html>
  );
};

export default PostEmailTemplate;
