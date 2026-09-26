import 'dart:async';

import 'package:flutter/material.dart';
import 'package:mobile/features/assistant/data/assistant_repository.dart';
import 'package:mobile/features/assistant/models/assistant_models.dart';
import 'package:mobile/features/assistant/widgets/assistant_model_picker_tile.dart';
import 'package:mobile/l10n/l10n.dart';

class AssistantModelPickerSheet extends StatefulWidget {
  const AssistantModelPickerSheet({
    required this.selected,
    required this.models,
    required this.isAllowed,
    this.repository,
    this.workspaceId,
    super.key,
  });

  final AssistantGatewayModel selected;
  final List<AssistantGatewayModel> models;
  final bool Function(AssistantGatewayModel) isAllowed;
  final AssistantRepository? repository;
  final String? workspaceId;

  @override
  State<AssistantModelPickerSheet> createState() =>
      _AssistantModelPickerSheetState();
}

class _AssistantModelPickerSheetState extends State<AssistantModelPickerSheet> {
  final _search = TextEditingController();
  Set<String> _favorites = {};
  String? _provider;
  String? _pendingFavorite;
  bool _favoritesOnly = false;
  bool _hideLocked = false;
  bool _favoritesError = false;
  bool _favoritesLoading = true;

  bool get _canSyncFavorites =>
      widget.repository != null &&
      widget.workspaceId != null &&
      widget.workspaceId!.isNotEmpty;

  @override
  void initState() {
    super.initState();
    _search.addListener(_refresh);
    if (_canSyncFavorites) unawaited(_loadFavorites());
  }

  Future<void> _loadFavorites() async {
    if (!_favoritesLoading && mounted) {
      setState(() {
        _favoritesLoading = true;
        _favoritesError = false;
      });
    }
    try {
      final favorites = await widget.repository!.fetchModelFavorites(
        widget.workspaceId!,
      );
      if (mounted) {
        setState(() {
          _favorites = favorites;
          _favoritesError = false;
        });
      }
    } on Object {
      if (mounted) setState(() => _favoritesError = true);
    } finally {
      if (mounted) setState(() => _favoritesLoading = false);
    }
  }

  Future<void> _toggleFavorite(AssistantGatewayModel model) async {
    if (!_canSyncFavorites || _favoritesLoading || _pendingFavorite != null) {
      return;
    }
    final wasFavorite = _favorites.contains(model.value);
    setState(() {
      _pendingFavorite = model.value;
      _favoritesError = false;
      if (wasFavorite) {
        _favorites.remove(model.value);
      } else {
        _favorites.add(model.value);
      }
    });
    try {
      await widget.repository!.toggleModelFavorite(
        widget.workspaceId!,
        model.value,
        isFavorited: wasFavorite,
      );
    } on Object {
      if (mounted) {
        setState(() {
          _favoritesError = true;
          if (wasFavorite) {
            _favorites.add(model.value);
          } else {
            _favorites.remove(model.value);
          }
        });
      }
    } finally {
      if (mounted) setState(() => _pendingFavorite = null);
    }
  }

  void _refresh() => setState(() {});

  @override
  void dispose() {
    _search.removeListener(_refresh);
    _search.dispose();
    super.dispose();
  }

  List<AssistantGatewayModel> get _visible {
    final query = _search.text.trim().toLowerCase();
    return widget.models
        .where(
          (model) =>
              (_provider == null || model.provider == _provider) &&
              (!_favoritesOnly || _favorites.contains(model.value)) &&
              (!_hideLocked || widget.isAllowed(model)) &&
              '${model.provider} ${model.label} ${model.description ?? ''} ${model.tags.join(' ')}'
                  .toLowerCase()
                  .contains(query),
        )
        .toList()
      ..sort((a, b) {
        final favorite =
            (_favorites.contains(b.value) ? 1 : 0) -
            (_favorites.contains(a.value) ? 1 : 0);
        if (favorite != 0) return favorite;
        final provider = a.provider.compareTo(b.provider);
        return provider != 0 ? provider : a.label.compareTo(b.label);
      });
  }

  @override
  Widget build(BuildContext context) {
    final providers =
        widget.models.map((model) => model.provider).toSet().toList()..sort();
    final visible = _visible;
    return SafeArea(
      child: Padding(
        padding: EdgeInsets.only(
          bottom: MediaQuery.viewInsetsOf(context).bottom,
        ),
        child: SizedBox(
          height: MediaQuery.sizeOf(context).height * 0.78,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Padding(
                padding: const EdgeInsets.fromLTRB(16, 0, 16, 8),
                child: Text(
                  context.l10n.assistantModelLabel,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
              ),
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16),
                child: TextField(
                  controller: _search,
                  decoration: InputDecoration(
                    prefixIcon: const Icon(Icons.search_rounded),
                    hintText: context.l10n.assistantSearchModels,
                  ),
                ),
              ),
              const SizedBox(height: 8),
              SizedBox(
                height: 42,
                child: ListView(
                  scrollDirection: Axis.horizontal,
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  children: [
                    _filterChip(
                      context.l10n.assistantModelAll,
                      !_favoritesOnly && _provider == null,
                      () => setState(() {
                        _favoritesOnly = false;
                        _provider = null;
                      }),
                    ),
                    if (_canSyncFavorites)
                      _filterChip(
                        context.l10n.assistantModelFavorites,
                        _favoritesOnly,
                        () => setState(() {
                          _favoritesOnly = true;
                          _provider = null;
                        }),
                        enabled: !_favoritesLoading,
                      ),
                    for (final provider in providers)
                      _filterChip(
                        provider,
                        !_favoritesOnly && _provider == provider,
                        () => setState(() {
                          _favoritesOnly = false;
                          _provider = provider;
                        }),
                      ),
                  ],
                ),
              ),
              SwitchListTile.adaptive(
                dense: true,
                contentPadding: const EdgeInsets.symmetric(horizontal: 16),
                title: Text(context.l10n.assistantModelHideLocked),
                value: _hideLocked,
                onChanged: (value) => setState(() => _hideLocked = value),
              ),
              if (_favoritesError)
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16),
                  child: Row(
                    children: [
                      Expanded(
                        child: Text(
                          context.l10n.assistantModelFavoritesError,
                          style: TextStyle(
                            color: Theme.of(context).colorScheme.error,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: context.l10n.commonRetry,
                        onPressed: () => unawaited(_loadFavorites()),
                        icon: const Icon(Icons.refresh_rounded),
                      ),
                    ],
                  ),
                ),
              const Divider(height: 1),
              Expanded(
                child: visible.isEmpty
                    ? Center(child: Text(context.l10n.assistantModelEmpty))
                    : ListView.builder(
                        itemCount: visible.length,
                        itemBuilder: (context, index) {
                          final model = visible[index];
                          return AssistantModelPickerTile(
                            model: model,
                            selected: model.value == widget.selected.value,
                            allowed: widget.isAllowed(model),
                            favorited: _favorites.contains(model.value),
                            showFavorite: _canSyncFavorites,
                            favoriteEnabled:
                                !_favoritesLoading && _pendingFavorite == null,
                            onFavorite: () => unawaited(_toggleFavorite(model)),
                            onSelect: () => Navigator.of(context).pop(model),
                          );
                        },
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _filterChip(
    String label,
    bool selected,
    VoidCallback onSelected, {
    bool enabled = true,
  }) => Padding(
    padding: const EdgeInsets.only(right: 8),
    child: ChoiceChip(
      label: Text(label),
      selected: selected,
      onSelected: enabled ? (_) => onSelected() : null,
      visualDensity: VisualDensity.compact,
    ),
  );
}
