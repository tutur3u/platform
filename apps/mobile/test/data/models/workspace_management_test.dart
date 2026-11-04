import 'package:flutter_test/flutter_test.dart';
import 'package:mobile/data/models/workspace_management.dart';

void main() {
  group('WorkspaceRolePermissionState', () {
    test('reads id and enabled', () {
      final state = WorkspaceRolePermissionState.fromJson({
        'id': 'manage_members',
        'enabled': true,
      });

      expect(state.id, 'manage_members');
      expect(state.enabled, isTrue);
    });

    test('falls back to the permission key, then to empty', () {
      expect(
        WorkspaceRolePermissionState.fromJson({'permission': 'p'}).id,
        'p',
      );
      final empty = WorkspaceRolePermissionState.fromJson(const {});
      expect(empty.id, '');
      expect(empty.enabled, isFalse);
    });

    test('stringifies a non-string id', () {
      expect(WorkspaceRolePermissionState.fromJson({'id': 42}).id, '42');
    });
  });

  group('WorkspaceRoleListItem', () {
    test('parses fields and keeps createdAt as the raw string', () {
      final item = WorkspaceRoleListItem.fromJson({
        'id': 'r1',
        'name': 'Admin',
        'created_at': '2026-10-01T00:00:00Z',
      });

      expect(item.id, 'r1');
      expect(item.name, 'Admin');
      expect(item.createdAt, '2026-10-01T00:00:00Z');
    });

    test('defaults to empty strings and null createdAt', () {
      final item = WorkspaceRoleListItem.fromJson(const {});

      expect(item.id, '');
      expect(item.name, '');
      expect(item.createdAt, isNull);
    });
  });

  group('WorkspaceRoleDetail', () {
    test('parses permissions and drops non-map entries', () {
      final detail = WorkspaceRoleDetail.fromJson({
        'id': 'r1',
        'name': 'Editor',
        'permissions': [
          {'id': 'a', 'enabled': true},
          'garbage',
          {'permission': 'b'},
        ],
        'created_at': '2026-10-01',
      });

      expect(detail.name, 'Editor');
      expect(detail.permissions.map((p) => p.id), ['a', 'b']);
      expect(detail.permissions.map((p) => p.enabled), [true, false]);
      expect(detail.createdAt, '2026-10-01');
    });

    test('defaults to no permissions', () {
      final detail = WorkspaceRoleDetail.fromJson(const {});

      expect(detail.id, '');
      expect(detail.permissions, isEmpty);
    });
  });

  group('WorkspaceRoleMember', () {
    test('uses user_id when id is absent', () {
      expect(WorkspaceRoleMember.fromJson({'user_id': 'u9'}).id, 'u9');
    });

    test('label prefers display name, then full name', () {
      expect(
        const WorkspaceRoleMember(
          id: 'u',
          displayName: ' Ada ',
          fullName: 'Ada Lovelace',
        ).label,
        'Ada',
      );
      expect(
        const WorkspaceRoleMember(id: 'u', fullName: 'Ada Lovelace').label,
        'Ada Lovelace',
      );
    });

    test('label skips blank names and falls back to email then id', () {
      expect(
        const WorkspaceRoleMember(
          id: 'u',
          displayName: '  ',
          email: ' a@b.co ',
        ).label,
        'a@b.co',
      );
      expect(
        const WorkspaceRoleMember(id: 'u', displayName: '', email: ' ').label,
        'u',
      );
    });

    test('a blank display name does not fall through to full name', () {
      expect(
        const WorkspaceRoleMember(
          id: 'u',
          displayName: '',
          fullName: 'Ada',
        ).label,
        'u',
      );
    });
  });

  group('WorkspaceMemberRoleSummary', () {
    test('parses and defaults', () {
      final role = WorkspaceMemberRoleSummary.fromJson({
        'id': 'r',
        'name': 'Viewer',
      });
      expect(role.id, 'r');
      expect(role.name, 'Viewer');

      final empty = WorkspaceMemberRoleSummary.fromJson(const {});
      expect(empty.id, '');
      expect(empty.name, '');
    });
  });

  group('WorkspaceMemberListItem', () {
    test('parses flags, roles and optional strings', () {
      final member = WorkspaceMemberListItem.fromJson({
        'id': 'm1',
        'pending': true,
        'is_creator': true,
        'roles': [
          {'id': 'r1', 'name': 'Admin'},
          5,
        ],
        'handle': 'ada',
        'email': 'ada@example.com',
        'display_name': 'Ada',
        'avatar_url': 'https://example.com/a.png',
        'created_at': '2026-10-01',
      });

      expect(member.id, 'm1');
      expect(member.pending, isTrue);
      expect(member.isCreator, isTrue);
      expect(member.roles.map((r) => r.name), ['Admin']);
      expect(member.handle, 'ada');
      expect(member.email, 'ada@example.com');
      expect(member.displayName, 'Ada');
      expect(member.avatarUrl, 'https://example.com/a.png');
      expect(member.createdAt, '2026-10-01');
    });

    test('defaults flags to false and lists to empty', () {
      final member = WorkspaceMemberListItem.fromJson(const {});

      expect(member.id, '');
      expect(member.pending, isFalse);
      expect(member.isCreator, isFalse);
      expect(member.roles, isEmpty);
      expect(member.handle, isNull);
    });

    test('label prefers display name, then email, then @handle, then id', () {
      expect(
        const WorkspaceMemberListItem(
          id: 'm',
          pending: false,
          isCreator: false,
          roles: [],
          displayName: ' Ada ',
          email: 'a@b.co',
          handle: 'ada',
        ).label,
        'Ada',
      );
      expect(
        const WorkspaceMemberListItem(
          id: 'm',
          pending: false,
          isCreator: false,
          roles: [],
          displayName: ' ',
          email: ' a@b.co ',
          handle: 'ada',
        ).label,
        'a@b.co',
      );
      expect(
        const WorkspaceMemberListItem(
          id: 'm',
          pending: false,
          isCreator: false,
          roles: [],
          handle: ' ada ',
        ).label,
        '@ada',
      );
      expect(
        const WorkspaceMemberListItem(
          id: 'm',
          pending: false,
          isCreator: false,
          roles: [],
          handle: ' ',
        ).label,
        'm',
      );
    });
  });

  group('WorkspaceInviteLink', () {
    test('parses counters, flags and timestamps', () {
      final link = WorkspaceInviteLink.fromJson({
        'id': 'i1',
        'code': 'ABC123',
        'current_uses': 2.0,
        'is_expired': true,
        'is_full': true,
        'max_uses': 5,
        'expires_at': '2026-11-01',
        'created_at': '2026-10-01',
      });

      expect(link.id, 'i1');
      expect(link.code, 'ABC123');
      expect(link.currentUses, 2);
      expect(link.isExpired, isTrue);
      expect(link.isFull, isTrue);
      expect(link.maxUses, 5);
      expect(link.expiresAt, '2026-11-01');
      expect(link.createdAt, '2026-10-01');
    });

    test('defaults to an unlimited, non-expired link', () {
      final link = WorkspaceInviteLink.fromJson(const {});

      expect(link.code, '');
      expect(link.currentUses, 0);
      expect(link.isExpired, isFalse);
      expect(link.isFull, isFalse);
      expect(link.maxUses, isNull);
      expect(link.expiresAt, isNull);
    });
  });
}
