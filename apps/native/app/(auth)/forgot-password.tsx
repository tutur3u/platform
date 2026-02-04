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

const resetSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

export default function ForgotPasswordScreen() {
  const { resetPassword, isLoading } = useAuthStore();

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleResetPassword = async () => {
    // Clear previous state
    setError(null);
    setSuccessMessage(null);

    // Validate input
    const result = resetSchema.safeParse({ email });
    if (!result.success) {
      setError(result.error.errors[0]?.message ?? 'Invalid email');
      return;
    }

    // Attempt password reset
    const { success, error: resetError } = await resetPassword(email);

    if (!success && resetError) {
      setError(resetError.message);
      return;
    }

    setSuccessMessage(
      'Password reset instructions have been sent to your email address.'
    );
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
          {/* Back Button */}
          <Pressable
            onPress={() => router.back()}
            className="mb-6 self-start rounded-full p-2 active:bg-zinc-100 dark:active:bg-zinc-800"
          >
            <Text className="text-lg text-zinc-600 dark:text-zinc-400">
              {'<'} Back
            </Text>
          </Pressable>

          {/* Header */}
          <View className="mb-8">
            <Text className="font-bold text-3xl text-zinc-900 dark:text-white">
              Reset password
            </Text>
            <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
              Enter your email address and we&apos;ll send you instructions to
              reset your password
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

          {/* Error Message */}
          {error && (
            <View className="mb-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
              <Text className="text-red-600 dark:text-red-400">{error}</Text>
            </View>
          )}

          {/* Email Input */}
          <View className="mb-6">
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
              editable={!successMessage}
              className={`rounded-lg border px-4 py-3 text-zinc-900 dark:text-white ${
                error
                  ? 'border-red-500'
                  : 'border-zinc-300 dark:border-zinc-700'
              } bg-zinc-50 dark:bg-zinc-800 ${successMessage ? 'opacity-50' : ''}`}
            />
          </View>

          {/* Reset Button */}
          <Pressable
            onPress={handleResetPassword}
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
                {successMessage ? 'Email Sent' : 'Send Reset Instructions'}
              </Text>
            )}
          </Pressable>

          {/* Back to Login Link */}
          <View className="flex-row justify-center">
            <Text className="text-zinc-500 dark:text-zinc-400">
              Remember your password?{' '}
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
