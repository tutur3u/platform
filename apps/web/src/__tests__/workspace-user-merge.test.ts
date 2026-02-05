import type {
  CollisionDetail,
  DuplicateCluster,
  DuplicateUser,
  MergeResult,
} from '@tuturuuu/types/primitives';
import { describe, expect, it } from 'vitest';

/**
 * Test suite for workspace user merge functionality
 * Tests: Type definitions, merge result handling, collision detection, both-linked validation
 */

describe('workspace-user-merge', () => {
  // Sample test data
  const createMockUser = (
    overrides: Partial<DuplicateUser> = {}
  ): DuplicateUser => ({
    id: crypto.randomUUID(),
    fullName: 'Test User',
    email: 'test@example.com',
    phone: '+1234567890',
    isLinked: false,
    linkedPlatformUserId: null,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  const createMockCluster = (
    users: DuplicateUser[],
    overrides: Partial<DuplicateCluster> = {}
  ): DuplicateCluster => ({
    clusterId: 1,
    matchReason: 'email',
    users,
    suggestedTargetId: users[0]?.id || '',
    ...overrides,
  });

  const createMockMergeResult = (
    overrides: Partial<MergeResult> = {}
  ): MergeResult => ({
    success: true,
    sourceUserId: crypto.randomUUID(),
    targetUserId: crypto.randomUUID(),
    migratedTables: [],
    collisionTables: [],
    customFieldsMerged: 0,
    ...overrides,
  });

  describe('MergeResult type', () => {
    it('should have correct structure for successful merge', () => {
      const result: MergeResult = createMockMergeResult({
        migratedTables: ['workspace_user_groups', 'invoice_products'],
        customFieldsMerged: 3,
      });

      expect(result.success).toBe(true);
      expect(result.migratedTables).toHaveLength(2);
      expect(result.collisionTables).toHaveLength(0);
      expect(result.customFieldsMerged).toBe(3);
    });

    it('should have correct structure for merge with collisions', () => {
      const collisionDetails: CollisionDetail[] = [
        {
          table: 'attendance',
          deleted_count: 2,
          pk_column: 'date',
          deleted_pk_values: ['2024-01-01', '2024-01-02'],
        },
      ];

      const result: MergeResult = createMockMergeResult({
        collisionTables: ['attendance'],
        collisionDetails,
      });

      expect(result.collisionTables).toContain('attendance');
      expect(result.collisionDetails).toBeDefined();
      expect(result.collisionDetails![0]!.deleted_count).toBe(2);
    });

    it('should have correct structure for failed merge', () => {
      const result: MergeResult = createMockMergeResult({
        success: false,
        error: 'Permission denied: delete_users required',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should include platform user IDs when both-linked error occurs', () => {
      const sourceId = crypto.randomUUID();
      const targetId = crypto.randomUUID();

      const result: MergeResult = createMockMergeResult({
        success: false,
        error:
          'Cannot merge: Both users are linked to different platform accounts.',
        sourcePlatformUserId: sourceId,
        targetPlatformUserId: targetId,
      });

      expect(result.success).toBe(false);
      expect(result.sourcePlatformUserId).toBe(sourceId);
      expect(result.targetPlatformUserId).toBe(targetId);
    });
  });

  describe('CollisionDetail type', () => {
    it('should track collision information correctly', () => {
      const detail: CollisionDetail = {
        table: 'invoice_products',
        deleted_count: 5,
        pk_column: 'invoice_id',
        deleted_pk_values: ['inv-1', 'inv-2', 'inv-3', 'inv-4', 'inv-5'],
      };

      expect(detail.table).toBe('invoice_products');
      expect(detail.deleted_count).toBe(5);
      expect(detail.deleted_pk_values).toHaveLength(5);
    });

    it('should handle empty collision details', () => {
      const detail: CollisionDetail = {
        table: 'empty_table',
        deleted_count: 0,
        pk_column: 'id',
        deleted_pk_values: [],
      };

      expect(detail.deleted_count).toBe(0);
      expect(detail.deleted_pk_values).toHaveLength(0);
    });
  });

  describe('DuplicateCluster type', () => {
    it('should represent email-matched cluster correctly', () => {
      const user1 = createMockUser({ email: 'shared@example.com' });
      const user2 = createMockUser({
        id: crypto.randomUUID(),
        email: 'shared@example.com',
      });

      const cluster = createMockCluster([user1, user2], {
        matchReason: 'email',
      });

      expect(cluster.matchReason).toBe('email');
      expect(cluster.users).toHaveLength(2);
      expect(cluster.users[0]!.email).toBe(cluster.users[1]!.email);
    });

    it('should represent phone-matched cluster correctly', () => {
      const user1 = createMockUser({ phone: '+1234567890' });
      const user2 = createMockUser({
        id: crypto.randomUUID(),
        phone: '+1234567890',
      });

      const cluster = createMockCluster([user1, user2], {
        matchReason: 'phone',
      });

      expect(cluster.matchReason).toBe('phone');
    });

    it('should represent both-matched cluster correctly', () => {
      const user1 = createMockUser({
        email: 'shared@example.com',
        phone: '+1234567890',
      });
      const user2 = createMockUser({
        id: crypto.randomUUID(),
        email: 'shared@example.com',
        phone: '+1234567890',
      });

      const cluster = createMockCluster([user1, user2], {
        matchReason: 'both',
      });

      expect(cluster.matchReason).toBe('both');
    });
  });

  describe('both-linked detection', () => {
    /**
     * Helper to check if a cluster has both users linked to different platform accounts
     * This mirrors the logic in duplicate-users-dialog.tsx
     */
    const isBothLinkedCluster = (
      cluster: DuplicateCluster,
      targetId: string
    ): boolean => {
      const sourceUsers = cluster.users.filter((u) => u.id !== targetId);
      const targetUser = cluster.users.find((u) => u.id === targetId);

      if (!targetUser?.isLinked) return false;

      return sourceUsers.some(
        (source) =>
          source.isLinked &&
          source.linkedPlatformUserId !== targetUser.linkedPlatformUserId
      );
    };

    it('should return false when target is not linked', () => {
      const linkedUser = createMockUser({
        isLinked: true,
        linkedPlatformUserId: crypto.randomUUID(),
      });
      const virtualUser = createMockUser({ isLinked: false });

      const cluster = createMockCluster([linkedUser, virtualUser]);

      // virtualUser as target - not linked, so no conflict
      expect(isBothLinkedCluster(cluster, virtualUser.id)).toBe(false);
    });

    it('should return false when source is not linked', () => {
      const linkedUser = createMockUser({
        isLinked: true,
        linkedPlatformUserId: crypto.randomUUID(),
      });
      const virtualUser = createMockUser({ isLinked: false });

      const cluster = createMockCluster([linkedUser, virtualUser]);

      // linkedUser as target, virtualUser as source - source not linked
      expect(isBothLinkedCluster(cluster, linkedUser.id)).toBe(false);
    });

    it('should return true when both are linked to DIFFERENT platform users', () => {
      const platformUser1 = crypto.randomUUID();
      const platformUser2 = crypto.randomUUID();

      const linkedUser1 = createMockUser({
        isLinked: true,
        linkedPlatformUserId: platformUser1,
      });
      const linkedUser2 = createMockUser({
        id: crypto.randomUUID(),
        isLinked: true,
        linkedPlatformUserId: platformUser2,
      });

      const cluster = createMockCluster([linkedUser1, linkedUser2]);

      expect(isBothLinkedCluster(cluster, linkedUser1.id)).toBe(true);
      expect(isBothLinkedCluster(cluster, linkedUser2.id)).toBe(true);
    });

    it('should return false when both are linked to SAME platform user', () => {
      const samePlatformUser = crypto.randomUUID();

      const linkedUser1 = createMockUser({
        isLinked: true,
        linkedPlatformUserId: samePlatformUser,
      });
      const linkedUser2 = createMockUser({
        id: crypto.randomUUID(),
        isLinked: true,
        linkedPlatformUserId: samePlatformUser,
      });

      const cluster = createMockCluster([linkedUser1, linkedUser2]);

      // Same platform user - this is a valid merge (dedupe scenario)
      expect(isBothLinkedCluster(cluster, linkedUser1.id)).toBe(false);
    });

    it('should handle cluster with multiple source users', () => {
      const platformUser1 = crypto.randomUUID();
      const platformUser2 = crypto.randomUUID();

      const target = createMockUser({
        isLinked: true,
        linkedPlatformUserId: platformUser1,
      });
      const source1 = createMockUser({
        id: crypto.randomUUID(),
        isLinked: false, // Not linked
      });
      const source2 = createMockUser({
        id: crypto.randomUUID(),
        isLinked: true,
        linkedPlatformUserId: platformUser2, // Different platform user
      });

      const cluster = createMockCluster([target, source1, source2]);

      // Even though source1 is safe, source2 creates a conflict
      expect(isBothLinkedCluster(cluster, target.id)).toBe(true);
    });
  });

  describe('merge request validation', () => {
    it('should reject self-merge', () => {
      const userId = crypto.randomUUID();

      // Simulating the validation in the API route
      const isValidMerge = (sourceId: string, targetId: string) =>
        sourceId !== targetId;

      expect(isValidMerge(userId, userId)).toBe(false);
    });

    it('should allow merge of different users', () => {
      const isValidMerge = (sourceId: string, targetId: string) =>
        sourceId !== targetId;

      expect(isValidMerge(crypto.randomUUID(), crypto.randomUUID())).toBe(true);
    });
  });

  describe('collision handling simulation', () => {
    /**
     * Simulates the collision detection logic from the RPC function
     */
    const simulateCollisionCheck = (
      sourceRecords: string[],
      targetRecords: string[]
    ): { hasCollision: boolean; collidingIds: string[] } => {
      const collidingIds = sourceRecords.filter((id) =>
        targetRecords.includes(id)
      );
      return {
        hasCollision: collidingIds.length > 0,
        collidingIds,
      };
    };

    it('should detect no collision when records are unique', () => {
      const sourceRecords = ['inv-1', 'inv-2'];
      const targetRecords = ['inv-3', 'inv-4'];

      const result = simulateCollisionCheck(sourceRecords, targetRecords);

      expect(result.hasCollision).toBe(false);
      expect(result.collidingIds).toHaveLength(0);
    });

    it('should detect collision when records overlap', () => {
      const sourceRecords = ['inv-1', 'inv-2', 'inv-3'];
      const targetRecords = ['inv-2', 'inv-3', 'inv-4'];

      const result = simulateCollisionCheck(sourceRecords, targetRecords);

      expect(result.hasCollision).toBe(true);
      expect(result.collidingIds).toContain('inv-2');
      expect(result.collidingIds).toContain('inv-3');
      expect(result.collidingIds).toHaveLength(2);
    });

    it('should handle empty source records', () => {
      const sourceRecords: string[] = [];
      const targetRecords = ['inv-1', 'inv-2'];

      const result = simulateCollisionCheck(sourceRecords, targetRecords);

      expect(result.hasCollision).toBe(false);
    });

    it('should handle empty target records', () => {
      const sourceRecords = ['inv-1', 'inv-2'];
      const targetRecords: string[] = [];

      const result = simulateCollisionCheck(sourceRecords, targetRecords);

      expect(result.hasCollision).toBe(false);
    });
  });

  describe('link transfer logic simulation', () => {
    /**
     * Simulates the link transfer logic from the RPC function
     */
    const shouldTransferLink = (
      sourceLinked: boolean,
      targetLinked: boolean
    ): boolean => {
      return sourceLinked && !targetLinked;
    };

    it('should transfer link when source is linked and target is not', () => {
      expect(shouldTransferLink(true, false)).toBe(true);
    });

    it('should not transfer link when target is already linked', () => {
      expect(shouldTransferLink(true, true)).toBe(false);
    });

    it('should not transfer link when source is not linked', () => {
      expect(shouldTransferLink(false, false)).toBe(false);
      expect(shouldTransferLink(false, true)).toBe(false);
    });
  });

  describe('cluster sorting', () => {
    /**
     * Tests the cluster sorting logic from duplicate-users-dialog.tsx
     * Clusters with linked users should appear first
     */
    const sortClusters = (clusters: DuplicateCluster[]): DuplicateCluster[] => {
      return [...clusters].sort((a, b) => {
        const aHasLinked = a.users.some((u) => u.isLinked);
        const bHasLinked = b.users.some((u) => u.isLinked);
        if (aHasLinked && !bHasLinked) return -1;
        if (!aHasLinked && bHasLinked) return 1;
        return 0;
      });
    };

    it('should put linked clusters first', () => {
      const linkedUser = createMockUser({
        isLinked: true,
        linkedPlatformUserId: crypto.randomUUID(),
      });
      const virtualUser1 = createMockUser({ isLinked: false });
      const virtualUser2 = createMockUser({
        id: crypto.randomUUID(),
        isLinked: false,
      });
      const virtualUser3 = createMockUser({
        id: crypto.randomUUID(),
        isLinked: false,
      });

      const linkedCluster = createMockCluster([linkedUser, virtualUser1], {
        clusterId: 1,
      });
      const virtualCluster = createMockCluster([virtualUser2, virtualUser3], {
        clusterId: 2,
      });

      // Input order: virtual first
      const sorted = sortClusters([virtualCluster, linkedCluster]);

      expect(sorted[0]!.clusterId).toBe(1); // linked cluster first
      expect(sorted[1]!.clusterId).toBe(2);
    });

    it('should maintain order when both have same link status', () => {
      const virtual1 = createMockUser({ isLinked: false });
      const virtual2 = createMockUser({
        id: crypto.randomUUID(),
        isLinked: false,
      });
      const virtual3 = createMockUser({
        id: crypto.randomUUID(),
        isLinked: false,
      });
      const virtual4 = createMockUser({
        id: crypto.randomUUID(),
        isLinked: false,
      });

      const cluster1 = createMockCluster([virtual1, virtual2], {
        clusterId: 1,
      });
      const cluster2 = createMockCluster([virtual3, virtual4], {
        clusterId: 2,
      });

      const sorted = sortClusters([cluster1, cluster2]);

      // Should maintain relative order
      expect(sorted[0]!.clusterId).toBe(1);
      expect(sorted[1]!.clusterId).toBe(2);
    });
  });

  describe('data merge simulation', () => {
    /**
     * Simulates COALESCE behavior from the RPC function
     * Target value is kept if not null, otherwise source value is used
     */
    const mergeField = <T>(target: T | null, source: T | null): T | null => {
      return target ?? source;
    };

    it('should keep target value when not null', () => {
      expect(mergeField('target@email.com', 'source@email.com')).toBe(
        'target@email.com'
      );
    });

    it('should use source value when target is null', () => {
      expect(mergeField(null, 'source@email.com')).toBe('source@email.com');
    });

    it('should return null when both are null', () => {
      expect(mergeField(null, null)).toBeNull();
    });

    /**
     * Simulates GREATEST behavior for balance field
     */
    const mergeBalance = (
      target: number | null,
      source: number | null
    ): number => {
      return Math.max(target ?? 0, source ?? 0);
    };

    it('should keep higher balance', () => {
      expect(mergeBalance(100, 50)).toBe(100);
      expect(mergeBalance(50, 100)).toBe(100);
    });

    it('should handle null balances', () => {
      expect(mergeBalance(null, 50)).toBe(50);
      expect(mergeBalance(50, null)).toBe(50);
      expect(mergeBalance(null, null)).toBe(0);
    });
  });
});
