import { upperFirst, useToggle } from '@mantine/hooks';
import React, { useState } from 'react';
import { AuthMethod } from '../../utils/auth-handler';
import AuthContainer from './AuthContainer';
import AuthForm from './AuthForm';
import AuthQR from './AuthQR';
import AuthTitle from './AuthTitle';

export default function AuthWrapper() {
  const [method, toggle] = useToggle<AuthMethod>(['login', 'signup']);
  const [emailSent, setEmailSent] = useState<boolean>(false);

  const showQR =
    method === 'login' && process?.env?.NEXT_PUBLIC_QR_ENABLED === 'true';

  const label = emailSent ? 'One last step...' : upperFirst(method);

  const toggleMethod = () => toggle();
  const onSignup = () => setEmailSent(true);

  return (
    <AuthContainer showQR={showQR}>
      <AuthTitle label={label} />

      <div
        className={`${
          showQR ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
        } grid gap-7 md:gap-3 transition duration-300`}
      >
        <AuthForm
          method={method}
          emailSent={emailSent}
          onMethodToggle={toggleMethod}
          onSignup={onSignup}
        />
        <AuthQR disabled={!showQR} />
      </div>
    </AuthContainer>
  );
}
