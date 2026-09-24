import 'package:mobile/features/calendar/cubit/calendar_cubit.dart';
import 'package:mobile/features/finance/cubit/finance_cubit.dart';
import 'package:mobile/features/finance/view/transaction_categories_page.dart';
import 'package:mobile/features/finance/view/wallets_page.dart';
import 'package:mobile/features/habits/cubit/habits_cubit.dart';

Future<void> clearAuthFeatureCaches({String? userId}) async {
  FinanceCubit.clearUserCache(userId);
  if (userId?.isEmpty ?? false) FinanceCubit.clearUserCache(null);
  WalletsPage.clearCache();
  TransactionCategoriesPage.clearCaches();
  HabitsCubit.clearCache();
  CalendarCubit.clearCache();
}
