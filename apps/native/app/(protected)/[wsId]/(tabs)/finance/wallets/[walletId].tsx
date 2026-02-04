import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatCurrency,
  useTransactions,
  useWallet,
} from '@/hooks/features/finance';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function WalletDetailScreen() {
  const { wsId, walletId } = useLocalSearchParams<{
    wsId: string;
    walletId: string;
  }>();
  const colorScheme = useColorScheme();

  const { data: wallet, isLoading, error } = useWallet(wsId, walletId);
  const { data: transactions } = useTransactions(wsId, { walletId });

  // Get recent transactions for this wallet
  const recentTransactions = transactions?.slice(0, 5) ?? [];

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-100 dark:bg-zinc-900">
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  if (error || !wallet) {
    return (
      <View className="flex-1 items-center justify-center bg-zinc-100 px-6 dark:bg-zinc-900">
        <Ionicons
          name="alert-circle-outline"
          size={64}
          color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
        />
        <Text className="mt-4 font-semibold text-lg text-zinc-900 dark:text-white">
          Wallet not found
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

  return (
    <SafeAreaView
      className="flex-1 bg-zinc-100 dark:bg-zinc-900"
      edges={['bottom']}
    >
      <ScrollView contentContainerClassName="p-6">
        {/* Wallet Card */}
        <View className="mb-6 items-center rounded-xl bg-gradient-to-br from-blue-600 to-blue-700 py-8">
          <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-white/20">
            <Ionicons name="wallet" size={32} color="white" />
          </View>
          <Text className="text-blue-100 text-lg">{wallet.name}</Text>
          <Text className="mt-2 font-bold text-4xl text-white">
            {formatCurrency(wallet.balance ?? 0, wallet.currency ?? 'USD')}
          </Text>
          <Text className="mt-1 text-blue-200">{wallet.currency ?? 'USD'}</Text>
        </View>

        {/* Wallet Details */}
        <View className="mb-6 rounded-xl bg-white shadow-sm dark:bg-zinc-800">
          <View className="border-zinc-100 border-b p-4 dark:border-zinc-700">
            <Text className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">
              Currency
            </Text>
            <Text className="text-base text-zinc-900 dark:text-white">
              {wallet.currency ?? 'USD'}
            </Text>
          </View>
          <View className="p-4">
            <Text className="mb-1 text-sm text-zinc-500 dark:text-zinc-400">
              Created
            </Text>
            <Text className="text-base text-zinc-900 dark:text-white">
              {new Date(wallet.created_at).toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
            </Text>
          </View>
        </View>

        {/* Recent Transactions */}
        <Text className="mb-3 font-semibold text-lg text-zinc-900 dark:text-white">
          Recent Transactions
        </Text>
        {recentTransactions.length === 0 ? (
          <View className="items-center rounded-xl bg-white py-8 dark:bg-zinc-800">
            <Ionicons
              name="receipt-outline"
              size={40}
              color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
            />
            <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
              No transactions yet
            </Text>
          </View>
        ) : (
          <View className="rounded-xl bg-white shadow-sm dark:bg-zinc-800">
            {recentTransactions.map((transaction, index) => (
              <View
                key={transaction.id}
                className={`flex-row items-center p-4 ${
                  index < recentTransactions.length - 1
                    ? 'border-zinc-100 border-b dark:border-zinc-700'
                    : ''
                }`}
              >
                <View className="flex-1">
                  <Text className="font-medium text-zinc-900 dark:text-white">
                    {transaction.description ?? 'Transaction'}
                  </Text>
                  <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                    {new Date(transaction.taken_at).toLocaleDateString()}
                  </Text>
                </View>
                <Text
                  className={`font-semibold ${
                    transaction.amount >= 0
                      ? 'text-green-600 dark:text-green-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {transaction.amount >= 0 ? '+' : ''}
                  {formatCurrency(transaction.amount, wallet.currency ?? 'USD')}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
