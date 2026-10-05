import 'dart:async';

import 'package:flutter/material.dart' hide Card;
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:go_router/go_router.dart';
import 'package:mobile/core/cache/cache_store.dart';
import 'package:mobile/core/responsive/adaptive_sheet.dart';
import 'package:mobile/core/responsive/responsive_padding.dart';
import 'package:mobile/core/responsive/responsive_values.dart';
import 'package:mobile/core/responsive/responsive_wrapper.dart';
import 'package:mobile/core/router/routes.dart';
import 'package:mobile/data/models/cms/cms_models.dart';
import 'package:mobile/data/repositories/cms_repository.dart';
import 'package:mobile/data/sources/api_client.dart';
import 'package:mobile/features/auth/cubit/auth_cubit.dart';
import 'package:mobile/features/cms/widgets/cms_loading_skeleton.dart';
import 'package:mobile/features/finance/widgets/finance_ui.dart';
import 'package:mobile/features/shell/cubit/shell_chrome_actions_cubit.dart';
import 'package:mobile/features/shell/view/shell_chrome_actions.dart';
import 'package:mobile/features/shell/view/shell_mini_nav.dart';
import 'package:mobile/features/shell/view/shell_title_override.dart';
import 'package:mobile/features/workspace/cubit/workspace_cubit.dart';
import 'package:mobile/l10n/l10n.dart';
import 'package:mobile/widgets/nova_loading_indicator.dart';
import 'package:mobile/widgets/pending_sync_frame.dart';
import 'package:shadcn_flutter/shadcn_flutter.dart' as shad;

part 'cms_collection_editor.dart';
part 'cms_entry_editor.dart';
part 'cms_overview.dart';
part 'cms_owned_overlay.dart';
part 'cms_page_actions.dart';
part 'cms_page_data.dart';
part 'cms_page_layout.dart';
part 'cms_page_widgets.dart';

class CmsPage extends StatelessWidget {
  const CmsPage({super.key, this.repository});
  final CmsRepository? repository;

  @override
  Widget build(BuildContext context) {
    final actor = context.select<AuthCubit, String?>(
      (cubit) => cubit.state.user?.id,
    );
    final workspace = context.select<WorkspaceCubit, String?>(
      (cubit) => cubit.state.currentWorkspace?.id,
    );
    if (actor == null || workspace == null) return const SizedBox.shrink();
    return CmsWorkspace(
      key: ValueKey('$actor:$workspace'),
      actorId: actor,
      workspaceId: workspace,
      repository: repository,
    );
  }
}

/// The CMS surface and its overlays belong to one account/workspace session.
class CmsWorkspace extends StatefulWidget {
  const CmsWorkspace({
    required this.actorId,
    required this.workspaceId,
    super.key,
    this.repository,
  });
  final String actorId;
  final String workspaceId;
  final CmsRepository? repository;
  @override
  State<CmsWorkspace> createState() => _CmsPageState();
}

class _CmsPageState extends State<CmsWorkspace> {
  static const _statuses = ['draft', 'scheduled', 'published', 'archived'];
  late final CmsRepository _repository;
  final _searchController = TextEditingController();
  final ValueNotifier<bool> _alive = ValueNotifier(true);
  CmsSummary? _summary;
  List<CmsCollection> _collections = const [];
  List<CmsEntry> _entries = const [];
  String? _selectedCollectionId;
  String? _status;
  String? _error;
  bool _isLoading = true;
  bool _searching = false;
  bool _denied = false;
  int _section = 0;
  int _requestToken = 0;
  String get _wsId => widget.workspaceId;

  @override
  void initState() {
    super.initState();
    _repository =
        widget.repository ?? CmsRepository(expectedUserId: widget.actorId);
    unawaited(Future<void>.delayed(Duration.zero, _reload));
  }

  @override
  void dispose() {
    _alive.value = false;
    _requestToken++;
    _searchController.dispose();
    if (widget.repository == null) _repository.dispose();
    super.dispose();
  }

  void _updateState(VoidCallback update) {
    if (mounted) setState(update);
  }

  void _resetSearch() => setState(() {
    _searching = false;
    _searchController.clear();
  });

  Future<void> _back() async {
    if (_searching) {
      _resetSearch();
    } else {
      context.go(Routes.apps);
    }
  }

  @override
  Widget build(BuildContext context) => _buildWorkspace(context);
}
