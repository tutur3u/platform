import { Link, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { z } from 'zod';

import { OtpInput } from '@/components/auth/otp-input';
import { useAuthStore } from '@/lib/stores';

const emailSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

const otpSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  otp: z.string().regex(/^\d{6}$/, 'Please enter the 6-digit code'),
});

const passwordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const COOLDOWN_DURATION = 60;

type LoginMethod = 'passwordless' | 'password';

export default function LoginScreen() {
  const { signInWithEmail, sendOtp, verifyOtp, isLoading } = useAuthStore();

  const [loginMethod, setLoginMethod] = useState<LoginMethod>('passwordless');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    otp?: string;
    general?: string;
  }>({});

  useEffect(() => {
    if (resendCooldown <= 0) return;

    const timer = setTimeout(() => {
      setResendCooldown((prev) => Math.max(prev - 1, 0));
    }, 1000);

    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const tabStyles = useMemo(
    () => ({
      passwordless:
        loginMethod === 'passwordless'
          ? 'bg-white dark:bg-zinc-700'
          : 'bg-transparent',
      password:
        loginMethod === 'password'
          ? 'bg-white dark:bg-zinc-700'
          : 'bg-transparent',
      textActive: 'text-zinc-900 dark:text-white',
      textInactive: 'text-zinc-500 dark:text-zinc-400',
    }),
    [loginMethod]
  );

  const resetErrors = () => {
    setErrors({});
  };

  const handleTabChange = (method: LoginMethod) => {
    if (method === 'password') {
      setOtpSent(false);
      setOtp('');
      setResendCooldown(0);
    }
    setLoginMethod(method);
    resetErrors();
  };

  const handleSendOtp = async () => {
    resetErrors();

    const result = emailSchema.safeParse({ email });

    if (!result.success) {
      setErrors({ email: result.error.issues[0]?.message });
      return;
    }

    const response = await sendOtp(email);
    if (!response.success && response.error) {
      setErrors({
        general: response.error.message,
      });
      if (response.retryAfter) {
        setResendCooldown(response.retryAfter);
      }
      return;
    }

    setOtpSent(true);
    setOtp('');
    setResendCooldown(COOLDOWN_DURATION);
  };

  const handleVerifyOtp = async () => {
    resetErrors();

    const result = otpSchema.safeParse({ email, otp });
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0] === 'email') fieldErrors.email = issue.message;
        if (issue.path[0] === 'otp') fieldErrors.otp = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    const response = await verifyOtp(email, otp);
    if (!response.success && response.error) {
      setErrors({ otp: response.error.message });
      setOtp('');
      return;
    }

    router.replace('/(protected)/workspace-select');
  };

  const handlePasswordLogin = async () => {
    resetErrors();

    const result = passwordSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: typeof errors = {};
      result.error.issues.forEach((issue) => {
        if (issue.path[0] === 'email') fieldErrors.email = issue.message;
        if (issue.path[0] === 'password') fieldErrors.password = issue.message;
      });
      setErrors(fieldErrors);
      return;
    }

    const response = await signInWithEmail(email, password);
    if (!response.success && response.error) {
      setErrors({ general: response.error.message });
      return;
    }

    router.replace('/(protected)/workspace-select');
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0 || isLoading) return;
    await handleSendOtp();
  };

  const renderOtpSection = () => (
    <View className="mt-2">
      {!otpSent ? (
        <>
          <View className="mb-4">
            <Text className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
              Email
            </Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor="#9ca3af"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              className={`rounded-lg border px-4 py-3 text-zinc-900 dark:text-white ${
                errors.email
                  ? 'border-red-500'
                  : 'border-zinc-300 dark:border-zinc-700'
              } bg-zinc-50 dark:bg-zinc-800`}
            />
            {errors.email && (
              <Text className="mt-1 text-red-500 text-sm">{errors.email}</Text>
            )}
          </View>

          {errors.general && (
            <View className="mb-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <Text className="text-red-600 dark:text-red-400">
                {errors.general}
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleSendOtp}
            disabled={isLoading || resendCooldown > 0}
            className={`mb-4 rounded-lg py-4 ${
              isLoading || resendCooldown > 0
                ? 'bg-blue-400'
                : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-center font-semibold text-white">
                {resendCooldown > 0
                  ? `Try again in ${resendCooldown}s`
                  : 'Send verification code'}
              </Text>
            )}
          </Pressable>
        </>
      ) : (
        <>
          <View className="mb-4">
            <Text className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
              Verification code
            </Text>
            <OtpInput value={otp} onChange={setOtp} isDisabled={isLoading} />
            <Text className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Enter the 6-digit code sent to {email}
            </Text>
            {errors.otp && (
              <Text className="mt-1 text-red-500 text-sm">{errors.otp}</Text>
            )}
          </View>

          {errors.general && (
            <View className="mb-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <Text className="text-red-600 dark:text-red-400">
                {errors.general}
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleVerifyOtp}
            disabled={isLoading || otp.length !== 6}
            className={`mb-3 rounded-lg py-4 ${
              isLoading || otp.length !== 6
                ? 'bg-blue-400'
                : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-center font-semibold text-white">
                Verify code
              </Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleResendOtp}
            disabled={isLoading || resendCooldown > 0}
            className={`mb-4 rounded-lg border py-4 ${
              resendCooldown > 0
                ? 'border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800'
                : 'border-zinc-300 bg-white active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900'
            }`}
          >
            <Text className="text-center font-semibold text-zinc-700 dark:text-zinc-300">
              {resendCooldown > 0
                ? `Resend code (${resendCooldown}s)`
                : 'Resend code'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setOtpSent(false);
              setOtp('');
              setResendCooldown(0);
              resetErrors();
            }}
            className="mb-2"
          >
            <Text className="text-center text-blue-600 text-sm dark:text-blue-400">
              Use a different email
            </Text>
          </Pressable>
        </>
      )}
    </View>
  );

  const renderPasswordSection = () => (
    <View className="mt-2">
      <View className="mb-4">
        <Text className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
          Email
        </Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          placeholderTextColor="#9ca3af"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          textContentType="emailAddress"
          className={`rounded-lg border px-4 py-3 text-zinc-900 dark:text-white ${
            errors.email
              ? 'border-red-500'
              : 'border-zinc-300 dark:border-zinc-700'
          } bg-zinc-50 dark:bg-zinc-800`}
        />
        {errors.email && (
          <Text className="mt-1 text-red-500 text-sm">{errors.email}</Text>
        )}
      </View>

      <View className="mb-4">
        <Text className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
          Password
        </Text>
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          placeholderTextColor="#9ca3af"
          secureTextEntry
          autoComplete="password"
          textContentType="password"
          className={`rounded-lg border px-4 py-3 text-zinc-900 dark:text-white ${
            errors.password
              ? 'border-red-500'
              : 'border-zinc-300 dark:border-zinc-700'
          } bg-zinc-50 dark:bg-zinc-800`}
        />
        {errors.password && (
          <Text className="mt-1 text-red-500 text-sm">{errors.password}</Text>
        )}
      </View>

      {errors.general && (
        <View className="mb-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
          <Text className="text-red-600 dark:text-red-400">
            {errors.general}
          </Text>
        </View>
      )}

      <Link href="/(auth)/forgot-password" asChild>
        <Pressable className="mb-6">
          <Text className="text-right text-blue-600 text-sm dark:text-blue-400">
            Forgot password?
          </Text>
        </Pressable>
      </Link>

      <Pressable
        onPress={handlePasswordLogin}
        disabled={isLoading}
        className={`mb-4 rounded-lg py-4 ${
          isLoading ? 'bg-blue-400' : 'bg-blue-600 active:bg-blue-700'
        }`}
      >
        {isLoading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text className="text-center font-semibold text-white">Sign In</Text>
        )}
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView className="bg-white dark:bg-zinc-900" style={{ flex: 1 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View className="mb-8">
            <Text className="font-bold text-3xl text-zinc-900 dark:text-white">
              Welcome back
            </Text>
            <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
              Sign in to continue to Tuturuuu
            </Text>
          </View>

          <View className="mb-6 flex-row rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800">
            <Pressable
              onPress={() => handleTabChange('passwordless')}
              className={`flex-1 rounded-lg py-2 ${tabStyles.passwordless}`}
            >
              <Text
                className={`text-center font-semibold ${
                  loginMethod === 'passwordless'
                    ? tabStyles.textActive
                    : tabStyles.textInactive
                }`}
              >
                OTP
              </Text>
            </Pressable>
            <Pressable
              onPress={() => handleTabChange('password')}
              className={`flex-1 rounded-lg py-2 ${tabStyles.password}`}
            >
              <Text
                className={`text-center font-semibold ${
                  loginMethod === 'password'
                    ? tabStyles.textActive
                    : tabStyles.textInactive
                }`}
              >
                Password
              </Text>
            </Pressable>
          </View>

          {loginMethod === 'passwordless'
            ? renderOtpSection()
            : renderPasswordSection()}

          <View className="mt-6 flex-row justify-center">
            <Text className="text-zinc-500 dark:text-zinc-400">
              Don't have an account?{' '}
            </Text>
            <Link href="/(auth)/signup" asChild>
              <Pressable>
                <Text className="font-semibold text-blue-600 dark:text-blue-400">
                  Sign Up
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
