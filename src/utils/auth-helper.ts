const devMode = process.env.NODE_ENV === 'development';

const authProdUrl = 'https://auth.tuturuuu.com';
const authDevUrl = 'http://localhost:7802';

export const getAuthUrl = () => {
  if (devMode) return authDevUrl;
  else return authProdUrl;
};

export const authenticated = () => {
  const cookie = document.cookie
    .split(';')
    .find((c) => c.includes('tuturuuu-auth'));

  return cookie !== undefined;
};
