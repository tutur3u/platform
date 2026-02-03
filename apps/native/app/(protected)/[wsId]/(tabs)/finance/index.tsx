import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
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
  useFinanceSummary,
  useTransactions,
  useWallets,
} from '@/hooks/features/finance';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function FinanceScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const colorScheme = useColorScheme();

  const { data: summary, isLoading: summaryLoading } = useFinanceSummary(wsId);
  const { data: wallets, isLoading: walletsLoading } = useWallets(wsId);
  const { data: transactions, isLoading: transactionsLoading } =
    useTransactions(wsId);

  // Get recent transactions (last 5)
  const recentTransactions = transactions?.slice(0, 5) ?? [];

  return (
    <SafeAreaView className="flex-1 bg-zinc-100 dark:bg-zinc-900">
      <ScrollView contentContainerClassName="p-6">
        {/* Header */}
        <Text className="mb-6 font-bold text-2xl text-zinc-900 dark:text-white">
          Finance
        </Text>

        {/* Summary Cards */}
        <View className="mb-6 flex-row gap-3">
          <View className="flex-1 rounded-xl bg-green-500 p-4">
            <Text className="text-green-100 text-sm">Income</Text>
            {summaryLoading ? (
              <ActivityIndicator color="white" className="mt-2" />
            ) : (
              <Text className="mt-1 font-bold text-white text-xl">
                {formatCurrency(summary?.income ?? 0)}
              </Text>
            )}
          </View>
          <View className="flex-1 rounded-xl bg-red-500 p-4">
            <Text className="text-red-100 text-sm">Expenses</Text>
            {summaryLoading ? (
              <ActivityIndicator color="white" className="mt-2" />
            ) : (
              <Text className="mt-1 font-bold text-white text-xl">
                {formatCurrency(summary?.expenses ?? 0)}
              </Text>
            )}
          </View>
        </View>

        {/* Balance Card */}
        <View className="mb-6 rounded-xl bg-blue-600 p-6">
          <Text className="text-blue-100 text-sm">Total Balance</Text>
          {summaryLoading ? (
            <ActivityIndicator color="white" className="mt-2" />
          ) : (
            <Text className="mt-2 font-bold text-3xl text-white">
              {formatCurrency(summary?.balance ?? 0)}
            </Text>
          )}
        </View>

        {/* Quick Actions */}
        <View className="mb-6 flex-row gap-3">
          <Link
            href={`/(protected)/${wsId}/(tabs)/finance/transactions`}
            asChild
          >
            <Pressable className="flex-1 flex-row items-center justify-center rounded-xl bg-white py-4 shadow-sm active:bg-zinc-50 dark:bg-zinc-800 dark:active:bg-zinc-700">
              <Ionicons
                name="receipt-outline"
                size={20}
                color={colorScheme === 'dark' ? '#a1a1aa' : '#52525b'}
              />
              <Text className="ml-2 font-medium text-zinc-700 dark:text-zinc-300">
                Transactions
              </Text>
            </Pressable>
          </Link>
          <Link href={`/(protected)/${wsId}/(tabs)/finance/wallets`} asChild>
            <Pressable className="flex-1 flex-row items-center justify-center rounded-xl bg-white py-4 shadow-sm active:bg-zinc-50 dark:bg-zinc-800 dark:active:bg-zinc-700">
              <Ionicons
                name="wallet-outline"
                size={20}
                color={colorScheme === 'dark' ? '#a1a1aa' : '#52525b'}
              />
              <Text className="ml-2 font-medium text-zinc-700 dark:text-zinc-300">
                Wallets
              </Text>
            </Pressable>
          </Link>
        </View>

        {/* Wallets */}
        <View className="mb-6">
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-semibold text-lg text-zinc-900 dark:text-white">
              Wallets
            </Text>
            <Link href={`/(protected)/${wsId}/(tabs)/finance/wallets`} asChild>
              <Pressable>
                <Text className="text-blue-600 text-sm dark:text-blue-400">
                  See all
                </Text>
              </Pressable>
            </Link>
          </View>

          {walletsLoading ? (
            <View className="items-center py-8">
              <ActivityIndicator size="large" color="#3b82f6" />
            </View>
          ) : !wallets || wallets.length === 0 ? (
            <View className="items-center rounded-xl bg-white py-8 dark:bg-zinc-800">
              <Ionicons
                name="wallet-outline"
                size={40}
                color={colorScheme === 'dark' ? '#71717a' : '#a1a1aa'}
              />
              <Text className="mt-2 text-zinc-500 dark:text-zinc-400">
                No wallets yet
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-3">
                {wallets.slice(0, 4).map((wallet) => (
                  <Link
                    key={wallet.id}
                    href={`/(protected)/${wsId}/(tabs)/finance/wallets/${wallet.id}`}
                    asChild
                  >
                    <Pressable className="w-40 rounded-xl bg-white p-4 shadow-sm active:bg-zinc-50 dark:bg-zinc-800 dark:active:bg-zinc-700">
                      <Text
                        className="font-medium text-zinc-900 dark:text-white"
                        numberOfLines={1}
                      >
                        {wallet.name}
                      </Text>
                      <Text className="mt-1 font-bold text-lg text-zinc-900 dark:text-white">
                        {formatCurrency(
                          wallet.balance ?? 0,
                          wallet.currency ?? 'USD'
                        )}
                      </Text>
                      <Text className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
                        {wallet.currency ?? 'USD'}
                      </Text>
                    </Pressable>
                  </Link>
                ))}
              </View>
            </ScrollView>
          )}
        </View>

        {/* Recent Transactions */}
        <View>
          <View className="mb-3 flex-row items-center justify-between">
            <Text className="font-semibold text-lg text-zinc-900 dark:text-white">
              Recent Transactions
            </Text>
            <Link
              href={`/(protected)/${wsId}/(tabs)/finance/transactions`}
              asChild
            >
              <Pressable>
                <Text className="text-blue-600 text-sm dark:text-blue-400">
                  See all
                </Text>
              </Pressable>
            </Link>
          </View>

          {transactionsLoading ? (
            <View className="items-center py-8">
              <ActivityIndicator size="large" color="#3b82f6" />
            </View>
          ) : recentTransactions.length === 0 ? (
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
                <Link
                  key={transaction.id}
                  href={`/(protected)/${wsId}/(tabs)/finance/transactions/${transaction.id}`}
                  asChild
                >
                  <Pressable
                    className={`flex-row items-center p-4 active:bg-zinc-50 dark:active:bg-zinc-700 ${
                      index < recentTransactions.length - 1
                        ? 'border-zinc-100 border-b dark:border-zinc-700'
                        : ''
                    }`}
                  >
                    {/* Category Icon */}
                    <View
                      className="mr-3 h-10 w-10 items-center justify-center rounded-full"
                      style={{
                        backgroundColor:
                          transaction.category?.color ?? '#e4e4e7',
                      }}
                    >
                      <Text>{transaction.category?.icon ?? '$'}</Text>
                    </View>

                    {/* Details */}
                    <View className="flex-1">
                      <Text
                        className="font-medium text-zinc-900 dark:text-white"
                        numberOfLines={1}
                      >
                        {transaction.description ?? 'Transaction'}
                      </Text>
                      <Text className="text-sm text-zinc-500 dark:text-zinc-400">
                        {new Date(transaction.taken_at).toLocaleDateString()}
                      </Text>
                    </View>

                    {/* Amount */}
                    <Text
                      className={`font-semibold ${
                        transaction.amount >= 0
                          ? 'text-green-600 dark:text-green-400'
                          : 'text-red-600 dark:text-red-400'
                      }`}
                    >
                      {transaction.amount >= 0 ? '+' : ''}
                      {formatCurrency(
                        transaction.amount,
                        transaction.wallet?.currency ?? 'USD'
                      )}
                    </Text>
                  </Pressable>
                </Link>
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
