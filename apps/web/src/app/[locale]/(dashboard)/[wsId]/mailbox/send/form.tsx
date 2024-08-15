'use client';

import { UserGroupPost } from '../../users/groups/[groupId]/posts';
import { PostEmailTemplate } from './post-template';
import useEmail from '@/hooks/useEmail';
import { Button } from '@repo/ui/components/ui/button';

const PostEmailForm = ({ post }: { post: UserGroupPost }) => {
  const { sendEmail, loading, error, success } = useEmail();

  const handleSendEmail = async () => {
    await sendEmail({
      recipients: ['vohoangphuc@tuturuuu.com'],
      subject: `New post from ${post.group_name}`,
      component: <PostEmailTemplate post={post} />,
    });
  };

  return (
    <div>
      <Button onClick={handleSendEmail} disabled={loading}>
        {loading ? 'Sending...' : 'Send Email'}
      </Button>
      {error && <p>Error: {error}</p>}
      {success && <p>Email sent successfully!</p>}
    </div>
  );
};

export { PostEmailForm };
