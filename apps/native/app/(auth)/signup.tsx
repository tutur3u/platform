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

const signupSchema = z
  .object({
    email: z.string().email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[a-z]/, 'Password must contain a lowercase letter')
      .regex(/[A-Z]/, 'Password must contain an uppercase letter')
      .regex(/[0-9]/, 'Password must contain a number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export default function SignupScreen() {
  const { signUpWithEmail, isLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSignup = async () => {
    // Clear previous state
    setErrors({});
    setGeneralError(null);
    setSuccessMessage(null);

    // Validate input
    const result = signupSchema.safeParse({ email, password, confirmPassword });
    if (!result.success) {
      const fieldErrors: {
        email?: string;
        password?: string;
        confirmPassword?: string;
      } = {};
      result.error.errors.forEach((err) => {
        const field = err.path[0] as keyof typeof fieldErrors;
        fieldErrors[field] = err.message;
      });
      setErrors(fieldErrors);
      return;
    }

    // Attempt sign up
    const { success, error } = await signUpWithEmail(email, password);

    if (!success && error) {
      setGeneralError(error.message);
      return;
    }

    // Show success message - user may need to verify email
    setSuccessMessage(
      'Account created! Please check your email to verify your account.'
    );

    // Redirect to login after a delay
    setTimeout(() => {
      router.replace('/(auth)/login');
    }, 3000);
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
              Create account
            </Text>
            <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
              Join Tuturuuu to get started
            </Text>
          </View>

          {/* Success Message */}
          {successMessage && (
            <View className="mb-4 rounded-lg bg-green-50 p-4 dark:bg-green-900/20">
              <Text className="text-green-600 dark:text-green-400">
                {successMessage}
              </Text>
            </View>
          )}

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
          <View className="mb-4">
            <Text className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
              Password
            </Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="Create a strong password"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
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

          {/* Confirm Password Input */}
          <View className="mb-6">
            <Text className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
              Confirm Password
            </Text>
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Confirm your password"
              placeholderTextColor="#9ca3af"
              secureTextEntry
              autoComplete="new-password"
              textContentType="newPassword"
              className={`rounded-lg border px-4 py-3 text-zinc-900 dark:text-white ${
                errors.confirmPassword
                  ? 'border-red-500'
                  : 'border-zinc-300 dark:border-zinc-700'
              } bg-zinc-50 dark:bg-zinc-800`}
            />
            {errors.confirmPassword && (
              <Text className="mt-1 text-red-500 text-sm">
                {errors.confirmPassword}
              </Text>
            )}
          </View>

          {/* Password Requirements */}
          <View className="mb-6 rounded-lg bg-zinc-100 p-4 dark:bg-zinc-800">
            <Text className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
              Password requirements:
            </Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {'\u2022'} At least 8 characters
            </Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {'\u2022'} One uppercase letter
            </Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {'\u2022'} One lowercase letter
            </Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {'\u2022'} One number
            </Text>
          </View>

          {/* Sign Up Button */}
          <Pressable
            onPress={handleSignup}
            disabled={isLoading || !!successMessage}
            className={`mb-6 rounded-lg py-4 ${
              isLoading || successMessage
                ? 'bg-blue-400'
                : 'bg-blue-600 active:bg-blue-700'
            }`}
          >
            {isLoading ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text className="text-center font-semibold text-white">
                Create Account
              </Text>
            )}
          </Pressable>

          {/* Terms Notice */}
          <Text className="mb-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
            By signing up, you agree to our Terms of Service and Privacy Policy
          </Text>

          {/* Sign In Link */}
          <View className="flex-row justify-center">
            <Text className="text-zinc-500 dark:text-zinc-400">
              Already have an account?{' '}
            </Text>
            <Link href="/(auth)/login" asChild>
              <Pressable>
                <Text className="font-semibold text-blue-600 dark:text-blue-400">
                  Sign In
                </Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
