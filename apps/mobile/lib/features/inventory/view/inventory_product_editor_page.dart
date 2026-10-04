import 'dart:async';

import 'package:flutter/material.dart' hide Scaffold;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/input/platform_text_context_menu.dart';
import 'package:mobile/core/utils/currency_formatter.dart';
import 'package:mobile/data/models/finance/category.dart';
import 'package:mobile/data/models/inventory/inventory_models.dart';
import 'package:mobile/data/repositories/finance_repository.dart';
import 'package:mobile/data/repositories/inventory_repository.dart';
import 'package:mobile/data/repositories/settings_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/auth/cubit/auth_state.dart';
import 'package:mobile/features/finance/widgets/finance_modal_scaffold.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/inventory/widgets/inventory_form_scaffold.dart';
import 'package:mobile/features/inventory/widgets/inventory_product_image.dart';
import 'package:mobile/features/inventory/widgets/inventory_ui.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/features/workspace/cubit/workspace_state.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'inventory_editor_fields.dart';
part 'inventory_editor_operations.dart';
part 'inventory_editor_presentation.dart';
part 'inventory_editor_selectors.dart';
part 'inventory_product_stock_rows.dart';

Future<T?> showInventoryProductEditorPage<T>(
  BuildContext context, {
  String? productId,
}) {
  return showFinanceFullscreenModal<T>(
    context: context,
    builder: (context) => InventoryProductEditorPage(productId: productId),
  );
}

class InventoryProductEditorPage extends StatefulWidget {
  const InventoryProductEditorPage({
    super.key,
    this.embedded = false,
    this.productId,
    this.inventoryRepository,
    this.financeRepository,
    this.settingsRepository,
  });

  final bool embedded;
  final String? productId;
  final InventoryRepository? inventoryRepository;
  final FinanceRepository? financeRepository;
  final SettingsRepository? settingsRepository;

  @override
  State<InventoryProductEditorPage> createState() =>
      _InventoryProductEditorPageState();
}

class _InventoryProductEditorPageState
    extends State<InventoryProductEditorPage> {
  late final InventoryRepository _inventoryRepository;
  late final FinanceRepository _financeRepository;
  late final SettingsRepository _settingsRepository;
  late final TextEditingController _nameController;
  late final TextEditingController _descriptionController;
  late final TextEditingController _usageController;

  InventoryProduct? _loadedProduct;
  bool _loading = false;
  bool _refreshing = false;
  bool _hasLoaded = false;
  int _loadGeneration = 0;
  (String?, String?)? _loadedScope;
  (String?, String?) get _scope =>
      (context.read<AuthCubit>().state.user?.id, _wsId);
  bool _saving = false;

  String? _categoryId;
  String? _manufacturerId;
  String? _ownerId;
  String? _financeCategoryId;

  String? _formError;
  bool _hasUnavailableOptions = false;
  String? _nameError;
  String? _categoryError;
  String? _ownerError;

  List<InventoryLookupItem> _categories = const [];
  List<InventoryLookupItem> _manufacturers = const [];
  List<InventoryOwner> _owners = const [];
  List<InventoryLookupItem> _units = const [];
  List<InventoryLookupItem> _warehouses = const [];
  List<TransactionCategory> _financeCategories = const [];
  List<_InventoryRowDraft> _rows = [];

  String? get _wsId =>
      context.read<WorkspaceCubit>().state.currentWorkspace?.id;

  @override
  void initState() {
    super.initState();
    _inventoryRepository = widget.inventoryRepository ?? InventoryRepository();
    _financeRepository = widget.financeRepository ?? FinanceRepository();
    _settingsRepository = widget.settingsRepository ?? SettingsRepository();
    _nameController = TextEditingController();
    _descriptionController = TextEditingController();
    _usageController = TextEditingController();
    unawaited(_load());
  }

  @override
  void dispose() {
    _nameController.dispose();
    _descriptionController.dispose();
    _usageController.dispose();
    for (final row in _rows) {
      row.dispose();
    }
    super.dispose();
  }

  void _update(VoidCallback change) => setState(change);

  @override
  Widget build(BuildContext context) => MultiBlocListener(
    listeners: [
      BlocListener<AuthCubit, AuthState>(
        listenWhen: (a, b) => a.user?.id != b.user?.id,
        listener: (_, _) => unawaited(_load()),
      ),
      BlocListener<WorkspaceCubit, WorkspaceState>(
        listenWhen: (a, b) => a.currentWorkspace?.id != b.currentWorkspace?.id,
        listener: (_, _) => unawaited(_load()),
      ),
    ],
    child: _buildEditor(context),
  );
}
