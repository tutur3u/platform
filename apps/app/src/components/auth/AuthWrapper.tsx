import { useRouter } from 'next/router';
import React, { useState } from 'react';
import { AuthMethod } from '../../utils/auth-handler';
import { DEV_MODE } from '../../constants/common';
import AuthForm from './AuthForm';

export default function AuthWrapper() {
  const router = useRouter();

  const [method, setMethod] = useState<AuthMethod>('login');
  const [emailSent, setEmailSent] = useState<boolean>(false);

  const onSignup = () =>
    DEV_MODE ? router.push('/calendar') : setEmailSent(true);

  return (
    <AuthForm
      method={method}
      emailSent={emailSent}
      setMethod={setMethod}
      onSignup={onSignup}
    />
  );
}
