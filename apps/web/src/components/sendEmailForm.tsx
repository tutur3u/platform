'use client';

import ReportEmail from '@/app/email/emailContents';
import useEmail from '@/hooks/useEmail';

const MyComponent = () => {
  const { sendEmail, loading, error, success } = useEmail();

  const handleSendEmail = async () => {
    await sendEmail({
      to: 'tanphat.huynh23@gmail.com',
      subject: 'Your Report Preview',
      component: <ReportEmail></ReportEmail>,
    });
  };

  return (
    <div>
      <button onClick={handleSendEmail} disabled={loading}>
        {loading ? 'Sending...' : 'Send Email'}
      </button>
      {error && <p>Error: {error}</p>}
      {success && <p>Email sent successfully!</p>}
    </div>
  );
};

export default MyComponent;
