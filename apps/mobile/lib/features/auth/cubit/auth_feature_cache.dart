import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/features/assistant/data/assistant_reaction_journal.dart';
import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/view/transaction_categories_page.dart';
import 'package:mobile/features/finance/view/wallets_page.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';
import 'package:mobile/features/workspace/data/workspace_recents_store.dart';

Future<void> clearAuthFeatureCaches({String? userId}) async {
  FinanceCubit.clearUserCache(userId);
  if (userId?.isEmpty ?? false) FinanceCubit.clearUserCache(null);
  WalletsPage.clearCache();
  TransactionCategoriesPage.clearCaches();
  HabitsCubit.clearCache();
  CalendarCubit.clearCache();
  if (userId != null && userId.isNotEmpty) {
    await AssistantReactionJournal().clearActor(userId);
  }
}

/// Clears caches on sign-out and the per-account data this device keeps for
/// the signed-out account: [userId]'s, or every account's when
/// [allAccounts] is set. Account switches keep that data, so they use
/// [clearAuthFeatureCaches] alone.
Future<void> clearSignedOutAccountCaches(
  String? userId, {
  bool allAccounts = false,
}) async {
  await clearAuthFeatureCaches(userId: userId);
  await clearAccountDeviceData(userId: userId, allAccounts: allAccounts);
}

/// Removes the account's encrypted cache scope and device-local recents.
Future<void> clearRemovedAccountData(String accountId) async {
  await CacheStore.instance.clearScope(userId: accountId);
  await clearAccountDeviceData(userId: accountId);
}

/// Removes per-account data kept on this device, such as recent workspaces,
/// for [userId], or for every account when [allAccounts] is set.
Future<void> clearAccountDeviceData({
  String? userId,
  bool allAccounts = false,
  WorkspaceRecentsStore recents = const WorkspaceRecentsStore(),
}) async {
  if (allAccounts) {
    await recents.clearAll();
  } else if (userId != null && userId.isNotEmpty) {
    await recents.clear(userId);
  }
}
