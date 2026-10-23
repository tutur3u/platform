part of 'settings_page.dart';

/// Quick-jump search over every Settings destination. Routed settings open
/// directly; inline rows scroll their group into view.
mixin _SettingsPageSearch on State<_SettingsView>, _SettingsPageActions {
  final TextEditingController _searchController = TextEditingController();
  final Map<String, GlobalKey> _anchors = {};
  String _searchQuery = '';

  GlobalKey _anchor(String id) =>
      _anchors.putIfAbsent(id, () => GlobalKey(debugLabel: 'settings-$id'));

  @override
  void dispose() {
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) => setState(() => _searchQuery = value);

  void _jumpTo(String groupId) {
    _searchController.clear();
    setState(() => _searchQuery = '');
    WidgetsBinding.instance.addPostFrameCallback((_) {
      final target = _anchors[groupId]?.currentContext;
      if (target == null || !target.mounted) return;
      unawaited(
        Scrollable.ensureVisible(
          target,
          alignment: 0.05,
          duration: const Duration(milliseconds: 280),
          curve: Curves.easeOutCubic,
        ),
      );
    });
  }

  List<SettingsSearchEntry> _searchEntries(
    BuildContext context, {
    required bool showInfrastructure,
  }) {
    final l10n = context.l10n;
    SettingsSearchEntry route(
      String id,
      IconData icon,
      String title,
      String section,
      String location, {
      List<String> terms = const [],
    }) => SettingsSearchEntry(
      id: id,
      icon: icon,
      title: title,
      section: section,
      terms: terms,
      onOpen: () => unawaited(context.push(location)),
    );
    SettingsSearchEntry jump(
      String id,
      IconData icon,
      String title,
      String groupId,
      String section,
    ) => SettingsSearchEntry(
      id: id,
      icon: icon,
      title: title,
      section: section,
      onOpen: () => _jumpTo(groupId),
    );

    final appearance = l10n.settingsAppearanceLanguage;
    final zones = l10n.settingsTimeZoneGroup;
    final interaction = l10n.settingsNotificationsInteraction;
    final general = l10n.settingsGeneralGroup;
    final support = l10n.settingsSupportGroup;
    return [
      route(
        'profile',
        shad.LucideIcons.userRound,
        l10n.settingsProfileEdit,
        l10n.settingsAccountSectionTitle,
        Routes.settingsProfile,
        terms: [
          l10n.profileDisplayName,
          l10n.profileFullName,
          l10n.profileEmail,
          l10n.profileAvatarSectionTitle,
        ],
      ),
      route(
        'accounts',
        shad.LucideIcons.userCog,
        l10n.authManageAccounts,
        l10n.settingsAccountSectionTitle,
        Routes.settingsAccounts,
      ),
      route(
        'appearance',
        shad.LucideIcons.palette,
        l10n.settingsAppearance,
        appearance,
        Routes.settingsAppearance,
      ),
      SettingsSearchEntry(
        id: 'language',
        icon: shad.LucideIcons.globe,
        title: l10n.settingsLanguage,
        section: appearance,
        onOpen: () => unawaited(_showLanguageDialog()),
      ),
      jump(
        'timezone',
        shad.LucideIcons.earth,
        l10n.settingsTimezone,
        'time-zone',
        zones,
      ),
      jump(
        'workspace-timezone',
        shad.LucideIcons.clock,
        l10n.settingsWorkspaceTimezone,
        'time-zone',
        zones,
      ),
      route(
        'reminders',
        shad.LucideIcons.bellRing,
        l10n.remindersTitle,
        interaction,
        Routes.settingsReminders,
        terms: [l10n.notificationsTitle],
      ),
      SettingsSearchEntry(
        id: 'haptics',
        icon: shad.LucideIcons.vibrate,
        title: l10n.settingsHaptics,
        section: interaction,
        onOpen: () => unawaited(_showHapticsDialog()),
      ),
      jump(
        'link-browser',
        shad.LucideIcons.squareArrowOutUpRight,
        l10n.settingsLinkBrowser,
        'interaction',
        interaction,
      ),
      for (final app in productSettingsRegistry.where(
        (app) => app.visible(context),
      )) ...[
        SettingsSearchEntry(
          id: 'app-${app.id}',
          icon: app.icon,
          title: app.title(context),
          section: l10n.settingsAppsGroup,
          onOpen: () => unawaited(app.open(context)),
        ),
        for (final (index, keyword) in app.keywords(l10n).indexed)
          SettingsSearchEntry(
            id: 'app-${app.id}-$index',
            icon: app.icon,
            title: keyword,
            section: '${l10n.settingsAppsGroup} · ${app.title(context)}',
            onOpen: () => unawaited(app.open(context)),
          ),
      ],
      route(
        'workspace',
        shad.LucideIcons.building2,
        l10n.settingsNavWorkspace,
        general,
        Routes.settingsWorkspace,
        terms: [
          l10n.settingsWorkspaceMembersTitle,
          l10n.settingsWorkspaceRolesTitle,
          l10n.settingsWorkspaceSecretsTitle,
          l10n.settingsWorkspaceDefaultCurrencyTitle,
        ],
      ),
      jump(
        'hidden-workspaces',
        shad.LucideIcons.eyeOff,
        l10n.workspaceHiddenTitle,
        'general',
        general,
      ),
      route(
        'experiments',
        shad.LucideIcons.flaskConical,
        l10n.settingsExperimentalAppsSectionTitle,
        general,
        Routes.settingsExperiments,
      ),
      route(
        'offline',
        shad.LucideIcons.hardDriveDownload,
        l10n.offlineSectionTitle,
        general,
        Routes.settingsOffline,
      ),
      if (showInfrastructure)
        route(
          'infrastructure',
          shad.LucideIcons.server,
          l10n.settingsInfrastructureSectionTitle,
          general,
          Routes.settingsInfrastructure,
        ),
      route(
        'feedback',
        shad.LucideIcons.messageSquareText,
        l10n.feedbackTitle,
        support,
        Routes.settingsFeedback,
      ),
      route(
        'whats-new',
        shad.LucideIcons.sparkles,
        l10n.settingsWhatsNew,
        support,
        Routes.settingsWhatsNew,
      ),
      jump(
        'onboarding',
        shad.LucideIcons.compass,
        l10n.connectedOnboardingSettingsTitle,
        'support',
        support,
      ),
      jump(
        'licenses',
        shad.LucideIcons.fileText,
        l10n.settingsLicensesSectionTitle,
        'support',
        support,
      ),
      route(
        'about',
        shad.LucideIcons.info,
        l10n.settingsAboutSectionTitle,
        support,
        Routes.settingsAbout,
      ),
      route(
        'session',
        shad.LucideIcons.logOut,
        l10n.settingsDangerSectionTitle,
        support,
        Routes.settingsSession,
        terms: [l10n.authLogOut, l10n.securitySessionsTitle],
      ),
    ];
  }
}
