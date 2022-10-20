import React from 'react';
import Auth from '../components/auth/Auth';
import { AuthRedirect } from '../hooks/useUser';

const LoginPage = () => {
  AuthRedirect();
  return <Auth />;
};

export default LoginPage;
