part of 'avatar_dropdown_menu.dart';

class _UserAvatar extends StatefulWidget {
  const _UserAvatar({
    required this.name,
    this.avatarUrl,
    this.avatarCacheKey,
    this.size = 36,
    this.rounded = 12,
  });

  final String name;
  final String? avatarUrl;
  final String? avatarCacheKey;
  final double size;
  final double rounded;

  @override
  State<_UserAvatar> createState() => _UserAvatarState();
}

class _UserAvatarState extends State<_UserAvatar> {
  ImageProvider<Object>? _imageProvider;
  String? _resolvedAvatarUrl;
  String? _resolvedAvatarCacheKey;

  @override
  void initState() {
    super.initState();
    _syncImageProvider();
  }

  @override
  void didUpdateWidget(covariant _UserAvatar oldWidget) {
    super.didUpdateWidget(oldWidget);
    _syncImageProvider();
  }

  void _syncImageProvider() {
    final avatarUrl = widget.avatarUrl?.trim();
    final hasAvatar = avatarUrl != null && avatarUrl.isNotEmpty;
    if (!hasAvatar) {
      _imageProvider = null;
      _resolvedAvatarUrl = null;
      _resolvedAvatarCacheKey = null;
      return;
    }

    final avatarCacheKey = widget.avatarCacheKey?.trim().isNotEmpty == true
        ? widget.avatarCacheKey!.trim()
        : avatarUrl;

    if (avatarUrl == _resolvedAvatarUrl &&
        avatarCacheKey == _resolvedAvatarCacheKey &&
        _imageProvider != null) {
      return;
    }

    _resolvedAvatarUrl = avatarUrl;
    _resolvedAvatarCacheKey = avatarCacheKey;
    _imageProvider = CachedNetworkImageProvider(
      avatarUrl,
      cacheKey: avatarCacheKey,
    );
  }

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;
    final theme = shad.Theme.of(context);

    return ClipRRect(
      borderRadius: BorderRadius.circular(widget.rounded),
      child: Container(
        width: widget.size,
        height: widget.size,
        color: colorScheme.surfaceContainerHighest,
        child: _imageProvider != null
            ? Image(
                image: _imageProvider!,
                fit: BoxFit.cover,
                gaplessPlayback: true,
                errorBuilder: (context, error, stackTrace) => _AvatarFallback(
                  name: widget.name,
                  textStyle: theme.typography.small,
                ),
              )
            : _AvatarFallback(
                name: widget.name,
                textStyle: theme.typography.small,
              ),
      ),
    );
  }
}

class _AvatarFallback extends StatelessWidget {
  const _AvatarFallback({required this.name, required this.textStyle});

  final String name;
  final TextStyle textStyle;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Center(
      child: Text(
        _initials(name),
        style: textStyle.copyWith(
          color: colorScheme.onSurface,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }

  String _initials(String value) {
    final trimmed = value.trim();
    if (trimmed.isEmpty) {
      return 'U';
    }

    final parts = trimmed.split(RegExp(r'\s+'));
    if (parts.length == 1) {
      return parts.first.characters.first.toUpperCase();
    }

    final first = parts.first.characters.first.toUpperCase();
    final last = parts.last.characters.first.toUpperCase();
    return '$first$last';
  }
}

class _InteractiveCard extends StatelessWidget {
  const _InteractiveCard({
    required this.child,
    required this.onTap,
    this.padding = const EdgeInsets.all(14),
  });

  final Widget child;
  final VoidCallback onTap;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colorScheme = Theme.of(context).colorScheme;

    return Material(
      color: Colors.transparent,
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Ink(
          padding: padding,
          decoration: BoxDecoration(
            color: colorScheme.surfaceContainerLow,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: colorScheme.outlineVariant.withValues(alpha: 0.18),
            ),
          ),
          child: child,
        ),
      ),
    );
  }
}
