part of 'time_tracker_requests_page.dart';

// ---------------------------------------------------------------------------
// _RequestTile
// ---------------------------------------------------------------------------

class _RequestTile extends StatelessWidget {
  const _RequestTile({required this.request, this.onTap});

  final TimeTrackingRequest request;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final l10n = context.l10n;

    final duration = request.duration;
    final hasDuration = duration != Duration.zero;
    final showFooter = _hasActionFooter(request);

    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: colorScheme.border),
        color: colorScheme.card,
      ),
      clipBehavior: Clip.antiAlias,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // ── Row 1: status badge + duration ────────────────────────
                Row(
                  children: [
                    RequestStatusBadge(status: request.approvalStatus),
                    const Spacer(),
                    if (hasDuration) _DurationChip(duration: duration),
                  ],
                ),

                const SizedBox(height: 10),

                // ── Row 2: title ──────────────────────────────────────────
                Text(
                  request.title ?? l10n.timerWorkSession,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.typography.p.copyWith(
                    fontWeight: FontWeight.w600,
                    fontSize: 16,
                    height: 1.3,
                  ),
                ),

                const SizedBox(height: 12),

                // ── Row 3: user avatar + name (prominent) ─────────────────
                if (request.userDisplayName != null)
                  _UserRow(
                    displayName: request.userDisplayName!,
                    avatarUrl: request.userAvatarUrl,
                  ),

                if (request.userDisplayName != null) const SizedBox(height: 8),

                // ── Row 4: date range + attachments ───────────────────────
                Wrap(
                  spacing: 12,
                  runSpacing: 6,
                  children: [
                    if (request.startTime != null)
                      _MetaChip(
                        icon: Icons.calendar_today_outlined,
                        label: _formatDateRange(
                          request.startTime!,
                          request.endTime,
                        ),
                      ),
                    if (request.images.isNotEmpty)
                      _MetaChip(
                        icon: Icons.attach_file_rounded,
                        label: l10n.timerAttachmentCount(
                          request.images.length,
                        ),
                      ),
                  ],
                ),

                // ── Row 5: action footer (approved / rejected / needs info)
                if (showFooter) ...[
                  const SizedBox(height: 10),
                  _ActionFooter(request: request),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  static bool _hasActionFooter(TimeTrackingRequest r) =>
      (r.approvalStatus == ApprovalStatus.approved &&
          r.approvedByName != null) ||
      (r.approvalStatus == ApprovalStatus.rejected &&
          r.rejectedByName != null) ||
      (r.approvalStatus == ApprovalStatus.needsInfo &&
          r.needsInfoRequestedByName != null);

  static String _formatDateRange(DateTime start, DateTime? end) {
    final startLocal = start.toLocal();
    final startStr = DateFormat('MMM d, h:mm a').format(startLocal);
    if (end == null) return startStr;
    final endLocal = end.toLocal();
    final sameDay =
        startLocal.year == endLocal.year &&
        startLocal.month == endLocal.month &&
        startLocal.day == endLocal.day;
    final endStr = sameDay
        ? DateFormat('h:mm a').format(endLocal)
        : DateFormat('MMM d, h:mm a').format(endLocal);
    return '$startStr – $endStr';
  }
}

// ---------------------------------------------------------------------------
// _UserRow  –  avatar initials circle + bold display name
// ---------------------------------------------------------------------------

class _UserRow extends StatelessWidget {
  const _UserRow({required this.displayName, this.avatarUrl});

  final String displayName;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;

    final initials = _initials(displayName);

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Avatar circle
        CircleAvatar(
          radius: 13,
          backgroundColor: colorScheme.primary.withValues(alpha: 0.12),
          backgroundImage: avatarUrl?.trim().isNotEmpty == true
              ? NetworkImage(avatarUrl!.trim())
              : null,
          child: avatarUrl?.trim().isNotEmpty == true
              ? null
              : Text(
                  initials,
                  style: TextStyle(
                    color: colorScheme.primary,
                    fontWeight: FontWeight.w700,
                    fontSize: 11,
                    height: 1,
                  ),
                ),
        ),
        const SizedBox(width: 8),
        // Display name
        Flexible(
          child: Text(
            displayName,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.typography.small.copyWith(
              fontWeight: FontWeight.w600,
              color: colorScheme.foreground,
              fontSize: 13,
            ),
          ),
        ),
      ],
    );
  }

  static String _initials(String name) {
    final parts = name.trim().split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      return '${parts.first[0]}${parts[1][0]}'.toUpperCase();
    }
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }
}

// ---------------------------------------------------------------------------
// _DurationChip  –  "2h 30m" with a clock icon
// ---------------------------------------------------------------------------

class _DurationChip extends StatelessWidget {
  const _DurationChip({required this.duration});

  final Duration duration;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final muted = theme.colorScheme.mutedForeground;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(Icons.access_time_rounded, size: 13, color: muted),
        const SizedBox(width: 3),
        Text(
          _label(duration),
          style: theme.typography.small.copyWith(
            color: muted,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  static String _label(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60);
    if (h == 0) return '${m}m';
    if (m == 0) return '${h}h';
    return '${h}h ${m}m';
  }
}

// ---------------------------------------------------------------------------
// _MetaChip  –  small icon + text for secondary info
// ---------------------------------------------------------------------------

class _MetaChip extends StatelessWidget {
  const _MetaChip({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final muted = theme.colorScheme.mutedForeground;

    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 13, color: muted),
        const SizedBox(width: 4),
        Text(
          label,
          style: theme.typography.textSmall.copyWith(
            color: muted,
            fontSize: 12,
          ),
        ),
      ],
    );
  }
}

// ---------------------------------------------------------------------------
// _ActionFooter  –  tinted banner for approved / rejected / needs-info
// ---------------------------------------------------------------------------

class _ActionFooter extends StatelessWidget {
  const _ActionFooter({required this.request});

  final TimeTrackingRequest request;

  @override
  Widget build(BuildContext context) {
    final theme = shad.Theme.of(context);
    final colorScheme = theme.colorScheme;
    final colors = DynamicColors.of(context);
    final l10n = context.l10n;

    final (text, accentColor, icon) = _resolve(request, colors, l10n);
    if (text == null || accentColor == null || icon == null) {
      return const SizedBox.shrink();
    }

    return Container(
      decoration: BoxDecoration(
        color: accentColor.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(8),
      ),
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(top: 1),
            child: Icon(icon, size: 14, color: accentColor),
          ),
          const SizedBox(width: 6),
          Expanded(
            child: Text(
              text,
              style: theme.typography.small.copyWith(
                color: colorScheme.mutedForeground,
                fontSize: 12,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ),
        ],
      ),
    );
  }

  static (String?, Color?, IconData?) _resolve(
    TimeTrackingRequest r,
    DynamicColors colors,
    AppLocalizations l10n,
  ) {
    switch (r.approvalStatus) {
      case ApprovalStatus.approved when r.approvedByName != null:
        final date = r.approvedAt != null
            ? DateFormat('MMM d, yyyy').format(r.approvedAt!.toLocal())
            : '';
        return (
          l10n.timerRequestApprovedByAt(r.approvedByName!, date),
          colors.green,
          Icons.check_circle_outline_rounded,
        );
      case ApprovalStatus.rejected when r.rejectedByName != null:
        final date = r.rejectedAt != null
            ? DateFormat('MMM d, yyyy').format(r.rejectedAt!.toLocal())
            : '';
        return (
          l10n.timerRequestRejectedByAt(r.rejectedByName!, date),
          colors.red,
          Icons.cancel_outlined,
        );
      case ApprovalStatus.needsInfo when r.needsInfoRequestedByName != null:
        return (
          'Info requested by ${r.needsInfoRequestedByName}',
          colors.blue,
          Icons.info_outline_rounded,
        );
      case ApprovalStatus.pending:
        return (null, null, null);
      case _:
        return (null, null, null);
    }
  }
}
