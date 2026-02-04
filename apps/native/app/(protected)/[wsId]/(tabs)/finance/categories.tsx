import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  type TransactionCategory,
  useTransactionCategories,
} from '@/hooks/features/finance';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function CategoriesScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const colorScheme = useColorScheme();

  const {
    data: categoriesData,
    isLoading,
    error,
    refetch,
  } = useTransactionCategories(wsId);
  const categories = categoriesData as TransactionCategory[] | undefined;

  const renderItem = ({
    item,
  }: {
    item: NonNullable<typeof categories>[number];
  }) => (
    <View className="mb-2 flex-row items-center rounded-xl bg-white p-4 shadow-sm dark:bg-zinc-800">
      {/* Category Icon */}
      <View
        className="mr-4 h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: item.color ?? '#e4e4e7' }}
      >
        <Text className="text-xl">{item.icon ?? '?'}</Text>
      </View>

      {/* Name */}
      <Text className="flex-1 font-medium text-lg text-zinc-900 dark:text-white">
        {item.name}
      </Text>
    </View>
  );

  const renderEmptyState = () => (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <Ionicons
        name="folder-outline"
        size={64}
        color={colorScheme === 'dark' ? '#3f3f46' : '#d4d4d8'}
      />
      <Text className="mt-4 font-semibold text-lg text-zinc-900 dark:text-white">
        No categories
      </Text>
      <Text className="mt-1 text-center text-zinc-500 dark:text-zinc-400">
        Create categories on the web app to organize your transactions
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
              : 'Failed to load categories'}
          </Text>
        </View>
      )}

      <FlatList
        data={categories}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerClassName="p-6 flex-grow"
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        refreshControl={
          <RefreshControl refreshing={isLoading} onRefresh={refetch} />
        }
      />

      {isLoading && (!categories || categories.length === 0) && (
        <View className="absolute inset-0 items-center justify-center bg-zinc-100/80 dark:bg-zinc-900/80">
          <ActivityIndicator size="large" color="#3b82f6" />
        </View>
      )}
    </SafeAreaView>
  );
}
