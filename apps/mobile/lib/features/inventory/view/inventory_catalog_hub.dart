import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/l10n/l10n.dart';

/// Only catalog entities supported by the existing native APIs.
enum InventoryCatalogSection {
  owners,
  categories,
  manufacturers,
  units,
  warehouses,
  financeCategories,
}

String inventoryCatalogTitle(
  BuildContext context,
  InventoryCatalogSection section,
) {
  final l10n = context.l10n;
  return switch (section) {
    InventoryCatalogSection.owners => l10n.inventoryManageOwners,
    InventoryCatalogSection.categories => l10n.inventoryManageCategories,
    InventoryCatalogSection.manufacturers => l10n.inventoryManageManufacturers,
    InventoryCatalogSection.units => l10n.inventoryManageUnits,
    InventoryCatalogSection.warehouses => l10n.inventoryManageWarehouses,
    InventoryCatalogSection.financeCategories => l10n.financeCategories,
  };
}

class InventoryCatalogHub extends StatelessWidget {
  const InventoryCatalogHub({super.key});

  @override
  Widget build(BuildContext context) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
    children: [
      for (final section in InventoryCatalogSection.values)
        Card(
          child: ListTile(
            minVerticalPadding: 16,
            leading: Icon(switch (section) {
              InventoryCatalogSection.owners => Icons.people_outline,
              InventoryCatalogSection.categories => Icons.category_outlined,
              InventoryCatalogSection.manufacturers => Icons.factory_outlined,
              InventoryCatalogSection.units => Icons.straighten,
              InventoryCatalogSection.warehouses => Icons.warehouse_outlined,
              InventoryCatalogSection.financeCategories =>
                Icons.account_balance_wallet_outlined,
            }),
            title: Text(inventoryCatalogTitle(context, section)),
            trailing: const Icon(Icons.chevron_right),
            onTap: () =>
                context.push(Routes.inventoryCatalogPath(section.name)),
          ),
        ),
      Card(
        child: ListTile(
          minVerticalPadding: 16,
          leading: const Icon(Icons.date_range_outlined),
          title: Text(context.l10n.inventorySalesPeriodsTitle),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push(Routes.inventorySalesPeriods),
        ),
      ),
      Card(
        child: ListTile(
          minVerticalPadding: 16,
          leading: const Icon(Icons.history_outlined),
          title: Text(context.l10n.inventoryAuditLabel),
          trailing: const Icon(Icons.chevron_right),
          onTap: () => context.push(Routes.inventoryAuditLogs),
        ),
      ),
    ],
  );
}
