import { createAdminClient } from '@ncthub/supabase/next/server';

export const validateEmail = async (email?: string | null) => {
  if (!email) throw 'Email is required';

  const regex = /\S+@\S+\.\S+/;
  if (!regex.test(email)) throw 'Email is invalid';

  return email.toLowerCase();
};

export const validateOtp = async (otp?: string | null) => {
  if (!otp) throw 'OTP is required';

  const regex = /^\d{6}$/;
  if (!regex.test(otp)) throw 'OTP is invalid';

  return otp;
};

export const checkIfUserExists = async ({ email }: { email: string }) => {
  const sbAdmin = await createAdminClient();

  const { data, error } = await sbAdmin
    .from('user_private_details')
    .select('id:user_id')
    .eq('email', email)
    .maybeSingle();

  if (error) throw error.message;
  return data?.id;
};

export const generateRandomPassword = () => {
  const length = 16;
  const charset =
    'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+~`|}{[]:;?><,./-=';

  let temp = '';
  for (let i = 0, n = charset.length; i < length; ++i)
    temp += charset.charAt(Math.floor(Math.random() * n));

  return temp;
};
