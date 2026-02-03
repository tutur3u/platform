import { Link, router } from 'expo-router';
import { useState } from 'react';
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

import { useAuthStore } from '@/lib/stores';

const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export default function LoginScreen() {
  const { signInWithEmail, signInWithGoogle, signInWithApple, isLoading } =
    useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {}
  );
  const [generalError, setGeneralError] = useState<string | null>(null);

  const handleLogin = async () => {
    // Clear previous errors
    setErrors({});
    setGeneralError(null);

    // Validate input
    const result = loginSchema.safeParse({ email, password });
    if (!result.success) {
      const fieldErrors: { email?: string; password?: string } = {};
      result.error.errors.forEach((err) => {
        if (err.path[0] === 'email') fieldErrors.email = err.message;
        if (err.path[0] === 'password') fieldErrors.password = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Attempt sign in
    const { success, error } = await signInWithEmail(email, password);

    if (!success && error) {
      setGeneralError(error.message);
      return;
    }

    // Successful login - navigation handled by auth layout redirect
    router.replace('/(protected)/workspace-select');
  };

  const handleGoogleSignIn = async () => {
    setGeneralError(null);
    const { success, error } = await signInWithGoogle();
    if (!success && error) {
      setGeneralError(error.message);
    }
  };

  const handleAppleSignIn = async () => {
    setGeneralError(null);
    const { success, error } = await signInWithApple();
    if (!success && error) {
      setGeneralError(error.message);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-white dark:bg-zinc-900">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        className="flex-1"
      >
        <ScrollView
          contentContainerClassName="flex-grow justify-center px-6"
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View className="mb-8">
            <Text className="font-bold text-3xl text-zinc-900 dark:text-white">
              Welcome back
            </Text>
            <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
              Sign in to continue to Tuturuuu
            </Text>
          </View>

          {/* General Error */}
          {generalError && (
            <View className="mb-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <Text className="text-red-600 dark:text-red-400">
                {generalError}
              </Text>
            </View>
          )}

          {/* Email Input */}
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

          {/* Password Input */}
          <View className="mb-6">
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
              <Text className="mt-1 text-red-500 text-sm">
                {errors.password}
              </Text>
            )}
          </View>

          {/* Forgot Password Link */}
          <Link href="/(auth)/forgot-password" asChild>
            <Pressable className="mb-6">
              <Text className="text-right text-blue-600 text-sm dark:text-blue-400">
                Forgot password?
              </Text>
            </Pressable>
          </Link>

          {/* Sign In Button */}
          <Pressable
            onPress={handleLogin}
            disabled={isLoading}
            className={`mb-4 rounded-lg py-4 ${
              isLoading ? 'bg-blue-400' : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-center font-semibold text-white">
                Sign In
              </Text>
            )}
          </Pressable>

          {/* Divider */}
          <View className="mb-4 flex-row items-center">
            <View className="flex-1 border-zinc-300 border-b dark:border-zinc-700" />
            <Text className="mx-4 text-zinc-500 dark:text-zinc-400">or</Text>
            <View className="flex-1 border-zinc-300 border-b dark:border-zinc-700" />
          </View>

          {/* OAuth Buttons */}
          <Pressable
            onPress={handleGoogleSignIn}
            disabled={isLoading}
            className="mb-3 flex-row items-center justify-center rounded-lg border border-zinc-300 bg-white py-4 active:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:active:bg-zinc-700"
          >
            <Text className="font-medium text-zinc-900 dark:text-white">
              Continue with Google
            </Text>
          </Pressable>

          {Platform.OS === 'ios' && (
            <Pressable
              onPress={handleAppleSignIn}
              disabled={isLoading}
              className="mb-6 flex-row items-center justify-center rounded-lg bg-black py-4 active:bg-zinc-800"
            >
              <Text className="font-medium text-white">
                Continue with Apple
              </Text>
            </Pressable>
          )}

          {/* Sign Up Link */}
          <View className="flex-row justify-center">
            <Text className="text-zinc-500 dark:text-zinc-400">
              Don&apos;t have an account?{' '}
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
