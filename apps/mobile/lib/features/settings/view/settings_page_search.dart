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
    settingsFocusRequest.removeListener(_consumeFocusRequest);
    _searchController.dispose();
    super.dispose();
  }

  void _onSearchChanged(String value) => setState(() => _searchQuery = value);

  /// Consumes a pending [settingsFocusRequest], such as Calendar's time
  /// zone link, whether this page was already mounted or is new.
  void _listenForFocusRequests() {
    settingsFocusRequest.addListener(_consumeFocusRequest);
    WidgetsBinding.instance.addPostFrameCallback((_) => _consumeFocusRequest());
  }

  void _consumeFocusRequest() {
    final group = settingsFocusRequest.value;
    if (group == null || !mounted) return;
    settingsFocusRequest.value = null;
    _jumpTo(group);
  }

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
      String section, {
      List<String> terms = const [],
    }) => SettingsSearchEntry(
      id: id,
      icon: icon,
      title: title,
      section: section,
      terms: terms,
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
        terms: [l10n.settingsProfileEdit],
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
        terms: [
          l10n.settingsSearchBrowserTerm,
          l10n.settingsLinkBrowserBuiltIn,
          l10n.settingsLinkBrowserExternal,
        ],
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
        terms: [l10n.settingsNavWorkspace],
      ),
      route(
        'experiments',
        shad.LucideIcons.flaskConical,
        l10n.settingsExperimentalAppsSectionTitle,
        general,
        Routes.settingsExperiments,
        terms: [
          for (final module in AppRegistry.experimentalModules)
            module.label(l10n),
        ],
      ),
      route(
        'offline',
        shad.LucideIcons.hardDriveDownload,
        l10n.offlineSectionTitle,
        general,
        Routes.settingsOffline,
        terms: [
          l10n.settingsAppOfflineData,
          l10n.navTasks,
          l10n.navCalendar,
          l10n.navFinance,
          l10n.inventoryTitle,
        ],
      ),
      if (showInfrastructure)
        route(
          'infrastructure',
          shad.LucideIcons.server,
          l10n.settingsInfrastructureSectionTitle,
          general,
          Routes.settingsInfrastructure,
          terms: [l10n.adminAccountsTitle, l10n.settingsMobileVersions],
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
