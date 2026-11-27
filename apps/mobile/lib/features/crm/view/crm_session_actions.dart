part of 'crm_page.dart';

extension _CrmSessionActions on _CrmPageState {
  Future<void> _editSessionOccurrence(CrmSession session) async {
    final wsId = _wsId;
    final actor = widget.actorId;
    final auth = context.read<AuthCubit?>();
    final workspace = context.read<WorkspaceCubit?>();
    final l10n = context.l10n;
    bool isCurrent() =>
        mounted &&
        widget.actorId == actor &&
        _wsId == wsId &&
        (auth == null || auth.state.user?.id == actor) &&
        (workspace == null || workspace.state.currentWorkspace?.id == wsId) &&
        _tab == _CrmTab.users &&
        _directory == _ContactDirectory.schedule &&
        _canViewFeedbacks &&
        _canUpdateGroups;
    if (wsId == null || !session.isPersisted || !isCurrent()) return;

    Future<void> requireScope() async {
      final online = await hasNetworkConnection();
      if (!isCurrent()) {
        throw ApiException(
          message: l10n.contactsEditSessionDenied,
          statusCode: 403,
        );
      }
      if (!online) {
        throw ApiException(
          message: l10n.contactsEditSessionOffline,
          statusCode: 0,
        );
      }
    }

    try {
      await requireScope();
    } on ApiException catch (error) {
      _toast(error.message, destructive: true);
      return;
    }
    if (!mounted || !isCurrent()) return;

    final saved = await _showOwnedSheet<bool>(
      context: context,
      builder: (context) => ContactSessionEditor(
        session: session,
        onUncertain: () async {
          if (isCurrent()) await CacheStore.awaitRevalidation(_loadSessions);
        },
        onSave: (title, startsAt, endsAt) async {
          await requireScope();
          await _repository.updateSessionOccurrence(
            wsId,
            actorId: actor,
            session: session,
            title: title,
            startsAt: startsAt,
            endsAt: endsAt,
            beforeDispatch: requireScope,
          );
        },
      ),
    );
    if (saved != true || !isCurrent()) return;
    _toast(l10n.contactsSaved);
    await CacheStore.awaitRevalidation(_loadSessions);
  }
}
