import Cookies from 'js-cookie';

export const authenticated = () => {
  return Cookies.get('tuturuuu-auth') !== undefined;
};
