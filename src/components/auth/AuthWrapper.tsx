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

  const label = emailSent ? 'One last step...' : upperFirst(method);

  const toggleMethod = () => toggle();
  const onSignup = () => setEmailSent(true);

  return (
    <AuthContainer>
        <AuthTitle label={label} />

      <div className='flex'>
      <AuthForm
        method={method}
        emailSent={emailSent}
        onMethodToggle={toggleMethod}
        onSignup={onSignup}
      />
      {method === 'login' && <AuthQR />}
      </div>
    </AuthContainer>
  );
}
