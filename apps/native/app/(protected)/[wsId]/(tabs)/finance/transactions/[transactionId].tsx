import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatCurrency,
  useFinanceMutations,
  useTransaction,
} from '@/hooks/features/finance';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TransactionDetailScreen() {
  const { wsId, transactionId } = useLocalSearchParams<{
    wsId: string;
    transactionId: string;
  }>();
  const colorScheme = useColorScheme();

  const {
    data: transaction,
    isLoading,
    error,
  } = useTransaction(wsId, transactionId);
  const { deleteTransaction } = useFinanceMutations(wsId ?? '');

  const handleDelete = () => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!transactionId) return;
            try {
              await deleteTransaction.mutateAsync(transactionId);
              router.back();
            } catch (err) {
              Alert.alert(
                'Error',
                err instanceof Error
                  ? err.message
                  : 'Failed to delete transaction'
              );
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (error || !transaction) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-100 px-6 dark:bg-zinc-900">
        <Ionicons
          name="alert-circle-outline"
          size={64}
          color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
        />
        <Text className="mt-4 font-semibold text-lg text-zinc-900 dark:text-white">
          Transaction not found
        </Text>
        <Pressable
          onPress={() => router.back()}
          className="mt-4 rounded-lg bg-blue-600 px-6 py-3"
        >
          <Text className="font-medium text-white">Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const isIncome = transaction.amount >= 0;

  return (
    <SafeAreaView
      className="flex-1 bg-zinc-100 dark:bg-zinc-900"
      edges={['bottom']}
    >
      <ScrollView contentContainerClassName="p-6">
        {/* Amount */}
        <View className="mb-6 items-center rounded-xl bg-white py-8 shadow-sm dark:bg-zinc-800">
          <View
            className="mb-4 h-16 w-16 items-center justify-center rounded-full"
            style={{
              backgroundColor: transaction.category?.color ?? '#e4e4e7',
            }}
          >
            <Text className="text-2xl">
              {transaction.category?.icon ?? '$'}
            </Text>
          </View>
          <Text
            className={`font-bold text-4xl ${
              isIncome
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {isIncome ? '+' : ''}
            {formatCurrency(
              transaction.amount,
              transaction.wallet?.currency ?? 'USD'
            )}
          </Text>
          <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
            {isIncome ? 'Income' : 'Expense'}
          </Text>
        </View>

        {/* Details */}
        <View className="rounded-xl bg-white shadow-sm dark:bg-zinc-800">
          {/* Description */}
          <View className="border-zinc-100 border-b p-4 dark:border-zinc-700">
            <Text className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">
              Description
            </Text>
            <Text className="text-base text-zinc-900 dark:text-white">
              {transaction.description ?? 'No description'}
            </Text>
          </View>

          {/* Category */}
          <View className="border-zinc-100 border-b p-4 dark:border-zinc-700">
            <Text className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">
              Category
            </Text>
            <Text className="text-base text-zinc-900 dark:text-white">
              {transaction.category?.name ?? 'Uncategorized'}
            </Text>
          </View>

          {/* Wallet */}
          <View className="border-zinc-100 border-b p-4 dark:border-zinc-700">
            <Text className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">
              Wallet
            </Text>
            <Text className="text-base text-zinc-900 dark:text-white">
              {transaction.wallet?.name ?? 'Unknown'}
            </Text>
          </View>

          {/* Date */}
          <View className="p-4">
            <Text className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">
              Date
            </Text>
            <Text className="text-base text-zinc-900 dark:text-white">
              {new Date(transaction.taken_at).toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
        </View>

        {/* Delete Button */}
        <Pressable
          onPress={handleDelete}
          className="mt-6 rounded-xl bg-red-50 py-4 active:bg-red-100 dark:bg-red-900/20 dark:active:bg-red-900/30"
        >
          <Text className="text-center font-medium text-red-600 dark:text-red-400">
            Delete Transaction
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}
