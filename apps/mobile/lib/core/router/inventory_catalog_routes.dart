import 'package:go_router/go_router.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/features/inventory/view/inventory_catalog_hub.dart';
import 'package:mobile/features/inventory/view/inventory_manage_page.dart';
import 'package:mobile/features/inventory/view/inventory_sales_periods_page.dart';

/// Inventory-only child registrations; shared shell and back handling stay
/// owned
/// by the app router.
final inventoryCatalogRoutes = [
  GoRoute(
    path: Routes.inventoryCatalog,
    builder: (context, state) {
      final section = InventoryCatalogSection.values
          .where((section) => section.name == state.pathParameters['catalog'])
          .firstOrNull;
      return InventoryManagePage(section: section);
    },
  ),
  GoRoute(
    path: Routes.inventorySalesPeriods,
    builder: (context, state) => const InventorySalesPeriodsPage(),
  ),
];
