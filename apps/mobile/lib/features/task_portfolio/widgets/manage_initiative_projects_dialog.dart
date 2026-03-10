part of 'task_portfolio_dialogs.dart';

class ManageInitiativeProjectsDialog extends StatefulWidget {
  const ManageInitiativeProjectsDialog({
    required this.initiative,
    required this.availableProjects,
    required this.onLink,
    required this.onUnlink,
    required this.isMutating,
    super.key,
  });

  final TaskInitiativeSummary initiative;
  final List<TaskProjectSummary> availableProjects;
  final Future<void> Function(String projectId) onLink;
  final Future<void> Function(String projectId) onUnlink;
  final bool isMutating;

  @override
  State<ManageInitiativeProjectsDialog> createState() =>
      _ManageInitiativeProjectsDialogState();
}

class _ManageInitiativeProjectsDialogState
    extends State<ManageInitiativeProjectsDialog> {
  String? _selectedProjectId;

  @override
  Widget build(BuildContext context) {
    final hasSelectedProject =
        _selectedProjectId != null &&
        widget.availableProjects.any(
          (project) => project.id == _selectedProjectId,
        );
    final selectedProjectId = hasSelectedProject ? _selectedProjectId : null;

    return shad.AlertDialog(
      title: Text(context.l10n.taskPortfolioManageProjects),
      content: SizedBox(
        width: double.maxFinite,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              context.l10n.taskPortfolioLinkedProjects,
              style: shad.Theme.of(context).typography.small.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(8),
            if (widget.initiative.linkedProjects.isEmpty)
              Text(
                context.l10n.taskPortfolioNoLinkedProjects,
                style: shad.Theme.of(context).typography.textMuted,
              )
            else
              ...widget.initiative.linkedProjects.map(
                (project) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    children: [
                      Expanded(child: Text(project.name)),
                      shad.GhostButton(
                        density: shad.ButtonDensity.icon,
                        onPressed: widget.isMutating
                            ? null
                            : () => widget.onUnlink(project.id),
                        child: const Icon(Icons.link_off_outlined, size: 18),
                      ),
                    ],
                  ),
                ),
              ),
            const shad.Gap(16),
            Text(
              context.l10n.taskPortfolioLinkProject,
              style: shad.Theme.of(context).typography.small.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
            const shad.Gap(8),
            if (widget.availableProjects.isEmpty)
              Text(
                context.l10n.taskPortfolioAllProjectsLinked,
                style: shad.Theme.of(context).typography.textMuted,
              )
            else
              DropdownButtonFormField<String>(
                initialValue: selectedProjectId,
                decoration: InputDecoration(
                  border: const OutlineInputBorder(),
                  hintText: context.l10n.taskPortfolioNoAvailableProjects,
                ),
                items: widget.availableProjects
                    .map(
                      (project) => DropdownMenuItem<String>(
                        value: project.id,
                        child: Text(project.name),
                      ),
                    )
                    .toList(growable: false),
                onChanged: widget.isMutating
                    ? null
                    : (value) => setState(() => _selectedProjectId = value),
              ),
          ],
        ),
      ),
      actions: [
        shad.OutlineButton(
          onPressed: () => Navigator.of(context).pop(),
          child: Text(context.l10n.commonCancel),
        ),
        shad.PrimaryButton(
          onPressed: widget.isMutating || selectedProjectId == null
              ? null
              : () => widget.onLink(selectedProjectId),
          child: Text(context.l10n.taskPortfolioLinkProject),
        ),
      ],
    );
  }
}
