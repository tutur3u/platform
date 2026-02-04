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
  type FinanceWallet,
  formatCurrency,
  useWallets,
} from '@/hooks/features/finance';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function WalletsScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const colorScheme = useColorScheme();

  const { data: walletsData, isLoading, error, refetch } = useWallets(wsId);
  const wallets = walletsData as FinanceWallet[] | undefined;

  const renderItem = ({
    item,
  }: {
    item: NonNullable<typeof wallets>[number];
  }) => (
    <Link
      href={`/(protected)/${wsId}/(tabs)/finance/wallets/${item.id}`}
      asChild
    >
      <Pressable className="mb-3 rounded-xl bg-white p-4 shadow-sm active:bg-zinc-50 dark:bg-zinc-800 dark:active:bg-zinc-700">
        <View className="flex-row items-center">
          {/* Wallet Icon */}
          <View className="mr-4 h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
            <Ionicons name="wallet" size={24} color="#3b82f6" />
          </View>

          {/* Details */}
          <View className="flex-1">
            <Text className="font-semibold text-lg text-zinc-900 dark:text-white">
              {item.name}
            </Text>
            <Text className="text-sm text-zinc-500 dark:text-zinc-400">
              {item.currency ?? 'USD'}
            </Text>
          </View>

          {/* Balance */}
          <Text className="font-bold text-xl text-zinc-900 dark:text-white">
            {formatCurrency(item.balance ?? 0, item.currency ?? 'USD')}
          </Text>
        </View>
      </Pressable>
    </Link>
  );

  const renderEmptyState = () => (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <Ionicons
        name="wallet-outline"
        size={64}
        color={colorScheme === 'dark' ? '#3f3f46' : '#d4d4d8'}
      />
      <Text className="mt-4 font-semibold text-lg text-zinc-900 dark:text-white">
        No wallets
      </Text>
      <Text className="mt-1 text-center text-zinc-500 dark:text-zinc-400">
        Create a wallet on the web app to get started
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
            {error instanceof Error ? error.message : 'Failed to load wallets'}
          </Text>
        </View>
      )}

      <FlatList
        data={wallets}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerClassName="p-6 flex-grow"
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      />

      {isLoading && (!wallets || wallets.length === 0) && (
        <View className="absolute inset-0 items-center justify-center bg-zinc-100/80 dark:bg-zinc-900/80">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}
    </SafeAreaView>
  );
}
