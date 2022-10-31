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

  const enableQR = method === 'login';

  const label = emailSent ? 'One last step...' : upperFirst(method);

  const toggleMethod = () => toggle();
  const onSignup = () => setEmailSent(true);

  return (
    <AuthContainer enableQR={enableQR}>
      <AuthTitle label={label} />

      <div
        className={`${
          enableQR ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'
        } grid gap-7 md:gap-3 transition duration-300`}
      >
        <AuthForm
          method={method}
          emailSent={emailSent}
          onMethodToggle={toggleMethod}
          onSignup={onSignup}
        />
        <AuthQR className={`${enableQR ? 'md:block' : ''} hidden`} />
      </div>
    </AuthContainer>
  );
}
