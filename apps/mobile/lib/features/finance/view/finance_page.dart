import 'package:flutter/material.dart';
import 'package:mobile/l10n/l10n.dart';

class FinancePage extends StatelessWidget {
  const FinancePage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;

    return Scaffold(
      appBar: AppBar(title: Text(l10n.financeTitle)),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          _FinanceSectionCard(
            icon: Icons.account_balance_wallet_outlined,
            title: l10n.financeWallets,
            onTap: () {},
          ),
          const SizedBox(height: 12),
          _FinanceSectionCard(
            icon: Icons.swap_horiz,
            title: l10n.financeTransactions,
            onTap: () {},
          ),
          const SizedBox(height: 12),
          _FinanceSectionCard(
            icon: Icons.category_outlined,
            title: l10n.financeCategories,
            onTap: () {},
          ),
        ],
      ),
    );
  }
}

class _FinanceSectionCard extends StatelessWidget {
  const _FinanceSectionCard({
    required this.icon,
    required this.title,
    required this.onTap,
  });

  final IconData icon;
  final String title;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
