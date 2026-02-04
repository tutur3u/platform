import { Ionicons } from '@expo/vector-icons';
import { Link, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  formatCurrency,
  useTransactions,
  type WalletTransaction,
} from '@/hooks/features/finance';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TransactionsScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const colorScheme = useColorScheme();

  const {
    data: transactionsData,
    isLoading,
    error,
    refetch,
  } = useTransactions(wsId);
  const transactions = transactionsData as WalletTransaction[] | undefined;

  const renderItem = ({
    item,
  }: {
    item: NonNullable<typeof transactions>[number];
  }) => (
    <Link
      href={`/(protected)/${wsId}/(tabs)/finance/transactions/${item.id}`}
      asChild
    >
      <Pressable className="mb-2 flex-row items-center rounded-xl bg-white p-4 shadow-sm active:bg-zinc-50 dark:bg-zinc-800 dark:active:bg-zinc-700">
        {/* Category Icon */}
        <View
          className="mr-3 h-12 w-12 items-center justify-center rounded-full"
          style={{
            backgroundColor: item.category?.color ?? '#e4e4e7',
          }}
        >
          <Text className="text-lg">{item.category?.icon ?? '$'}</Text>
        </View>

        {/* Details */}
        <View className="flex-1">
          <Text
            className="font-medium text-zinc-900 dark:text-white"
            numberOfLines={1}
          >
            {item.description ?? 'Transaction'}
          </Text>
          <Text className="text-sm text-zinc-500 dark:text-zinc-400">
            {item.category?.name ?? 'Uncategorized'} • {item.wallet?.name}
          </Text>
          <Text className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
            {new Date(item.taken_at).toLocaleDateString(undefined, {
              weekday: 'short',
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>

        {/* Amount */}
        <Text
          className={`font-semibold text-lg ${
            item.amount >= 0
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          }`}
        >
          {item.amount >= 0 ? '+' : ''}
          {formatCurrency(item.amount, item.wallet?.currency ?? 'USD')}
        </Text>
      </Pressable>
    </Link>
  );

  const renderEmptyState = () => (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <Ionicons
        name="receipt-outline"
        size={64}
        color={colorScheme === 'dark' ? '#3f3f46' : '#d4d4d8'}
      />
      <Text className="mt-4 font-semibold text-lg text-zinc-900 dark:text-white">
        No transactions
      </Text>
      <Text className="mt-1 text-center text-zinc-500 dark:text-zinc-400">
        Your transactions will appear here
      </Text>
    </View>
  );

  return (
    <SafeAreaView
      className="flex-1 bg-zinc-100 dark:bg-zinc-900"
      edges={['bottom']}
    >
      {/* Error State */}
      {error && (
        <View className="mx-6 mt-4 rounded-lg bg-red-50 p-4 dark:bg-red-900/20">
          <Text className="text-red-600 dark:text-red-400">
            {error instanceof Error
              ? error.message
              : 'Failed to load transactions'}
          </Text>
        </View>
      )}

      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerClassName="p-6 flex-grow"
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      />

      {isLoading && (!transactions || transactions.length === 0) && (
        <View className="absolute inset-0 items-center justify-center bg-zinc-100/80 dark:bg-zinc-900/80">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}
    </SafeAreaView>
  );
}
