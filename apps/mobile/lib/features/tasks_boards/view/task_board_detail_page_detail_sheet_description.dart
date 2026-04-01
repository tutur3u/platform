// ignore_for_file: deprecated_member_use, reason: flutter_markdown currently
// requires imageBuilder here to provide authenticated image requests.

part of 'task_board_detail_page.dart';

class _TaskBoardDescriptionAccordion extends StatelessWidget {
  const _TaskBoardDescriptionAccordion({
    required this.label,
    required this.description,
    required this.isExpanded,
    required this.onToggle,
  });

  final String label;
  final ParsedTipTapDescription description;
  final bool isExpanded;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);

    return Container(
      width: double.infinity,
      decoration: BoxDecoration(
        border: Border.all(color: theme.colorScheme.border),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Material(
            color: Colors.transparent,
            borderRadius: BorderRadius.circular(10),
            child: InkWell(
              borderRadius: BorderRadius.circular(10),
              onTap: onToggle,
              child: Padding(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 10,
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        label,
                        style: theme.typography.small.copyWith(
                          color: theme.colorScheme.mutedForeground,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                    Icon(
                      isExpanded ? Icons.expand_less : Icons.expand_more,
                      size: 18,
                      color: theme.colorScheme.mutedForeground,
                    ),
                  ],
                ),
              ),
            ),
          ),
          AnimatedSize(
            duration: const Duration(milliseconds: 180),
            curve: Curves.easeInOut,
            child: isExpanded
                ? Padding(
                    padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        _buildDescriptionMarkdown(context, theme),
                        const shad.Gap(8),
                        Align(
                          alignment: Alignment.centerRight,
                          child: Tooltip(
                            message: label,
                            child: shad.IconButton.ghost(
                              onPressed: onToggle,
                              icon: Icon(
                                Icons.expand_less,
                                size: 16,
                                color: theme.colorScheme.mutedForeground,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  )
                : const SizedBox.shrink(),
          ),
        ],
      ),
    );
  }

  Widget _buildDescriptionMarkdown(BuildContext context, shad.ThemeData theme) {
    final styleSheet = _taskDescriptionMarkdownStyle(context, theme);

    return MarkdownBody(
      data: description.markdown,
      selectable: true,
      styleSheet: styleSheet,
      inlineSyntaxes: [_TaskDescriptionMentionInlineSyntax()],
      builders: {
        'mention-chip': _TaskDescriptionMentionChipBuilder(
          description.mentions,
        ),
      },
      imageBuilder: (uri, title, alt) {
        final source = uri.toString();
        final resolved = _resolveTaskDescriptionUrl(source);
        final requestHeaders = _trustedAuthHeadersForUrl(resolved);

        return Padding(
          padding: const EdgeInsets.symmetric(vertical: 8),
          child: ClipRRect(
            borderRadius: BorderRadius.circular(8),
            child: AspectRatio(
              aspectRatio: 16 / 9,
              child: Image.network(
                resolved,
                fit: BoxFit.cover,
                headers: requestHeaders,
                errorBuilder: (_, error, stackTrace) => _buildImageFallback(
                  context,
                  alt: alt,
                ),
                loadingBuilder: (context, child, progress) {
                  if (progress == null) return child;
                  return Container(
                    color: theme.colorScheme.secondary.withValues(alpha: 0.4),
                    alignment: Alignment.center,
                    child: const SizedBox(
                      width: 18,
                      height: 18,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    ),
                  );
                },
              ),
            ),
          ),
        );
      },
    );
  }

  Widget _buildImageFallback(BuildContext context, {String? alt}) {
    final theme = shad.Theme.of(context);
    final label = alt?.trim().isNotEmpty == true ? alt!.trim() : 'Image';

    return Container(
      color: theme.colorScheme.secondary.withValues(alpha: 0.4),
      alignment: Alignment.center,
      padding: const EdgeInsets.symmetric(horizontal: 12),
      child: Text(
        label,
        style: theme.typography.small.copyWith(
          color: theme.colorScheme.mutedForeground,
        ),
        textAlign: TextAlign.center,
      ),
    );
  }
}

class _TaskDescriptionMentionInlineSyntax extends md.InlineSyntax {
  _TaskDescriptionMentionInlineSyntax()
    : super(r'@@mention:(\d+)@@', startCharacter: 64);

  @override
  bool onMatch(md.InlineParser parser, Match match) {
    final index = match.group(1);
    if (index == null) {
      return false;
    }

    final element = md.Element.empty('mention-chip');
    element.attributes['index'] = index;
    parser.addNode(element);
    return true;
  }
}

class _TaskDescriptionMentionChipBuilder extends MarkdownElementBuilder {
  _TaskDescriptionMentionChipBuilder(this.mentions);

  final List<TipTapMention> mentions;

  @override
  Widget? visitElementAfter(md.Element element, TextStyle? preferredStyle) {
    final indexString = element.attributes['index'];
    final index = int.tryParse(indexString ?? '');
    if (index == null || index < 0 || index >= mentions.length) {
      return Text('@mention', style: preferredStyle);
    }

    final mention = mentions[index];
    return Padding(
      padding: const EdgeInsets.only(right: 6, bottom: 4),
      child: _TaskDescriptionMentionChip(
        mention: mention,
        preferredStyle: preferredStyle,
      ),
    );
  }
}

class _TaskDescriptionMentionChip extends StatelessWidget {
  const _TaskDescriptionMentionChip({
    required this.mention,
    this.preferredStyle,
  });

  final TipTapMention mention;
  final TextStyle? preferredStyle;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final avatarUrl = mention.avatarUrl;
    final hasAvatar = avatarUrl != null && avatarUrl.trim().isNotEmpty;

    final tooltip = [
      if (mention.entityType != null) mention.entityType,
      if (mention.subtitle != null) mention.subtitle,
      if (mention.priority != null) mention.priority,
      if (mention.entityId != null) mention.entityId,
    ].whereType<String>().join(' | ');

    final chip = Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: const Color(0x3313B96D),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: const Color(0xFF13B96D)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 16,
            height: 16,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              border: Border.all(color: const Color(0xFF13B96D), width: 0.8),
            ),
            child: ClipOval(
              child: hasAvatar
                  ? (() {
                      final resolvedAvatarUrl = _resolveTaskDescriptionUrl(
                        avatarUrl,
                      );
                      return Image.network(
                        resolvedAvatarUrl,
                        fit: BoxFit.cover,
                        headers: _trustedAuthHeadersForUrl(resolvedAvatarUrl),
                        errorBuilder: (context, error, stackTrace) =>
                            const Icon(
                              Icons.person_outline,
                              size: 11,
                              color: Color(0xFF13B96D),
                            ),
                      );
                    })()
                  : const Icon(
                      Icons.person_outline,
                      size: 11,
                      color: Color(0xFF13B96D),
                    ),
            ),
          ),
          const SizedBox(width: 5),
          Text(
            '@${mention.displayName}',
            style:
                preferredStyle?.copyWith(
                  color: const Color(0xFF4CE28C),
                  fontWeight: FontWeight.w600,
                ) ??
                theme.typography.small.copyWith(
                  color: const Color(0xFF4CE28C),
                  fontWeight: FontWeight.w600,
                ),
          ),
        ],
      ),
    );

    if (tooltip.isEmpty) {
      return chip;
    }

    return Tooltip(message: tooltip, child: chip);
  }
}

String _resolveTaskDescriptionUrl(String value) {
  if (value.startsWith('http://') || value.startsWith('https://')) {
    return value;
  }

  if (value.startsWith('/')) {
    return '${ApiConfig.baseUrl}$value';
  }

  return value;
}

Map<String, String>? _taskDescriptionAuthHeaders() {
  final token = _currentSessionAccessToken();
  if (token == null || token.isEmpty) {
    return null;
  }

  return {'Authorization': 'Bearer $token'};
}

String? _currentSessionAccessToken() {
  return maybeSupabase?.auth.currentSession?.accessToken;
}

Map<String, String>? _trustedAuthHeadersForUrl(String? resolvedUrl) {
  if (!_isTrustedTaskDescriptionUrl(resolvedUrl)) {
    return null;
  }

  return _taskDescriptionAuthHeaders();
}

bool _isTrustedTaskDescriptionUrl(String? value) {
  final raw = value?.trim();
  if (raw == null || raw.isEmpty) return false;

  if (raw.startsWith('/')) {
    return true;
  }

  final uri = Uri.tryParse(raw);
  if (uri == null) {
    return false;
  }

  if (!uri.hasScheme || uri.scheme.isEmpty) {
    return false;
  }

  final scheme = uri.scheme.toLowerCase();
  if (scheme != 'http' && scheme != 'https') {
    return false;
  }

  final trustedHosts = _trustedTaskDescriptionHosts;
  if (uri.host.isEmpty) {
    return false;
  }

  return trustedHosts.contains(uri.host.toLowerCase());
}

Set<String> get _trustedTaskDescriptionHosts {
  final hosts = <String>{};

  void addHostFromUrl(String url) {
    final uri = Uri.tryParse(url.trim());
    final host = uri?.host;
    if (host == null || host.isEmpty) return;
    hosts.add(host.toLowerCase());
  }

  addHostFromUrl(ApiConfig.baseUrl);
  addHostFromUrl(Env.supabaseUrl);
  return hosts;
}

MarkdownStyleSheet _taskDescriptionMarkdownStyle(
  BuildContext context,
  shad.ThemeData theme,
) {
  final materialTheme = Theme.of(context);

  return MarkdownStyleSheet.fromTheme(materialTheme).copyWith(
    p: theme.typography.base.copyWith(height: 1.5),
    h1: theme.typography.large.copyWith(fontWeight: FontWeight.w700),
    h2: theme.typography.large.copyWith(fontWeight: FontWeight.w600),
    h3: theme.typography.base.copyWith(fontWeight: FontWeight.w600),
    listBullet: theme.typography.base,
    blockquote: theme.typography.base.copyWith(
      color: theme.colorScheme.mutedForeground,
      fontStyle: FontStyle.italic,
      height: 1.45,
    ),
    blockquotePadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
    blockquoteDecoration: BoxDecoration(
      color: theme.colorScheme.secondary.withValues(alpha: 0.25),
      borderRadius: BorderRadius.circular(10),
      border: Border.all(
        color: theme.colorScheme.border.withValues(alpha: 0.6),
      ),
    ),
    code: theme.typography.small.copyWith(
      fontFamily: 'monospace',
      backgroundColor: theme.colorScheme.secondary.withValues(alpha: 0.35),
    ),
    codeblockPadding: const EdgeInsets.all(10),
    codeblockDecoration: BoxDecoration(
      color: theme.colorScheme.secondary.withValues(alpha: 0.35),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(
        color: theme.colorScheme.border.withValues(alpha: 0.65),
      ),
    ),
    tableBorder: TableBorder.all(color: theme.colorScheme.border),
    tableHead: theme.typography.small.copyWith(fontWeight: FontWeight.w600),
    tableBody: theme.typography.small,
    tableCellsPadding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
    horizontalRuleDecoration: BoxDecoration(
      border: Border(
        top: BorderSide(color: theme.colorScheme.border.withValues(alpha: 0.8)),
      ),
    ),
  );
}
