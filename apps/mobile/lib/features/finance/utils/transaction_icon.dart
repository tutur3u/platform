import 'package:flutter/widgets.dart';
import 'package:lucide_icons/lucide_icons.dart' as lucide;
import 'package:mobile/data/models/finance/transaction.dart';

IconData resolveTransactionCategoryIcon(Transaction tx) {
  if (tx.isTransfer) {
    return lucide.LucideIcons.arrowLeftRight;
  }

  final iconName = (tx.categoryIcon ?? '').toLowerCase().replaceAll('-', '_');
  final categoryName = (tx.categoryName ?? '').toLowerCase();
  final searchText = '$iconName $categoryName';

  if (searchText.contains('wallet') ||
      searchText.contains('cash') ||
      searchText.contains('money')) {
    return lucide.LucideIcons.wallet;
  }
  if (searchText.contains('bank')) {
    return lucide.LucideIcons.landmark;
  }
  if (searchText.contains('education') ||
      searchText.contains('school') ||
      searchText.contains('tuition') ||
      searchText.contains('study')) {
    return lucide.LucideIcons.graduationCap;
  }
  if (searchText.contains('book')) {
    return lucide.LucideIcons.book;
  }
  if (searchText.contains('food') ||
      searchText.contains('meal') ||
      searchText.contains('restaurant') ||
      searchText.contains('eat')) {
    return lucide.LucideIcons.utensils;
  }
  if (searchText.contains('shopping') ||
      searchText.contains('shop') ||
      searchText.contains('market')) {
    return lucide.LucideIcons.shoppingCart;
  }
  if (searchText.contains('health') ||
      searchText.contains('medical') ||
      searchText.contains('hospital') ||
      searchText.contains('doctor')) {
    return lucide.LucideIcons.stethoscope;
  }
  if (searchText.contains('transport') ||
      searchText.contains('travel') ||
      searchText.contains('car') ||
      searchText.contains('fuel') ||
      searchText.contains('bus') ||
      searchText.contains('train') ||
      searchText.contains('flight')) {
    return lucide.LucideIcons.car;
  }
  if (searchText.contains('home') ||
      searchText.contains('house') ||
      searchText.contains('rent')) {
    return lucide.LucideIcons.home;
  }
  if (searchText.contains('salary') ||
      searchText.contains('income') ||
      searchText.contains('work') ||
      searchText.contains('business')) {
    return lucide.LucideIcons.briefcase;
  }
  if (searchText.contains('gift')) {
    return lucide.LucideIcons.gift;
  }

  final amount = tx.amount ?? 0;
  if (amount < 0) {
    return lucide.LucideIcons.arrowDown;
  }
  return lucide.LucideIcons.arrowUp;
}
