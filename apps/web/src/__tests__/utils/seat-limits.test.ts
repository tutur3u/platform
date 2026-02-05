import { describe, expect, it, vi } from 'vitest';
import {
  canCreateInvitation,
  enforceSeatLimit,
  getSeatStatus,
} from '../../utils/seat-limits';

describe('seat-limits utils', () => {
  const wsId = 'ws-123';

  const createMockSupabase = (
    subscription: any,
    memberCount: number,
    invites: { workspace: number; email: number } = { workspace: 0, email: 0 }
  ) => {
    const mockQuery: any = {
      from: vi.fn().mockImplementation((table) => {
        if (table === 'workspace_subscriptions') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: subscription }),
          };
        }
        if (table === 'workspace_members') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: memberCount }),
          };
        }
        if (table === 'workspace_invites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: invites.workspace }),
          };
        }
        if (table === 'workspace_email_invites') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockResolvedValue({ count: invites.email }),
          };
        }
        return {};
      }),
    };
    return mockQuery;
  };

  describe('getSeatStatus', () => {
    it('should return non-seat-based status when no subscription exists', async () => {
      const supabase = createMockSupabase(null, 0);
      const status = await getSeatStatus(supabase as any, wsId);

      expect(status.isSeatBased).toBe(false);
      expect(status.seatCount).toBe(Infinity);
      expect(status.canAddMember).toBe(true);
    });

    it('should return non-seat-based status for fixed pricing model', async () => {
      const subscription = { pricing_model: 'fixed' };
      const supabase = createMockSupabase(subscription, 10);
      const status = await getSeatStatus(supabase as any, wsId);

      expect(status.isSeatBased).toBe(false);
      expect(status.seatCount).toBe(Infinity);
    });

    it('should return correct seat status for seat-based pricing', async () => {
      const subscription = {
        seat_count: 5,
        workspace_subscription_products: {
          pricing_model: 'seat_based',
          price_per_seat: 1000,
        },
      };
      const supabase = createMockSupabase(subscription, 3);
      const status = await getSeatStatus(supabase as any, wsId);

      expect(status.isSeatBased).toBe(true);
      expect(status.seatCount).toBe(5);
      expect(status.memberCount).toBe(3);
      expect(status.availableSeats).toBe(2);
      expect(status.canAddMember).toBe(true);
      expect(status.pricePerSeat).toBe(1000);
    });

    it('should cap available seats at 0 when over limit', async () => {
      const subscription = {
        workspace_subscription_products: {
          pricing_model: 'seat_based',
        },
        seat_count: 5,
      };
      const supabase = createMockSupabase(subscription, 7);
      const status = await getSeatStatus(supabase as any, wsId);

      expect(status.availableSeats).toBe(0);
      expect(status.canAddMember).toBe(false);
    });

    it('should increase available seats when member count decreases', async () => {
      const subscription = {
        seat_count: 5,
        workspace_subscription_products: {
          pricing_model: 'seat_based',
        },
      };

      // Case 1: 5 members, 0 available
      let supabase = createMockSupabase(subscription, 5);
      let status = await getSeatStatus(supabase as any, wsId);
      expect(status.availableSeats).toBe(0);
      expect(status.canAddMember).toBe(false);

      // Case 2: 4 members (one removed), 1 available
      supabase = createMockSupabase(subscription, 4);
      status = await getSeatStatus(supabase as any, wsId);
      expect(status.availableSeats).toBe(1);
      expect(status.canAddMember).toBe(true);
    });
  });

  describe('enforceSeatLimit', () => {
    it('should allow adding member when not seat-based', async () => {
      const subscription = {
        workspace_subscription_products: { pricing_model: 'fixed' },
      };
      const supabase = createMockSupabase(subscription, 100);
      const result = await enforceSeatLimit(supabase as any, wsId);

      expect(result.allowed).toBe(true);
    });

    it('should allow adding member when seats are available', async () => {
      const subscription = {
        workspace_subscription_products: { pricing_model: 'seat_based' },
        seat_count: 5,
      };
      const supabase = createMockSupabase(subscription, 4);
      const result = await enforceSeatLimit(supabase as any, wsId);

      expect(result.allowed).toBe(true);
    });

    it('should block adding member when seat limit is reached', async () => {
      const subscription = {
        workspace_subscription_products: { pricing_model: 'seat_based' },
        seat_count: 5,
      };
      const supabase = createMockSupabase(subscription, 5);
      const result = await enforceSeatLimit(supabase as any, wsId);

      expect(result.allowed).toBe(false);
      expect(result.message).toContain('Seat limit reached');
    });
  });

  describe('canCreateInvitation', () => {
    it('should allow invitation when not seat-based', async () => {
      const subscription = {
        workspace_subscription_products: { pricing_model: 'fixed' },
      };
      const supabase = createMockSupabase(subscription, 100);
      const result = await canCreateInvitation(supabase as any, wsId);

      expect(result.allowed).toBe(true);
    });

    it('should account for pending invitations', async () => {
      const subscription = {
        workspace_subscription_products: { pricing_model: 'seat_based' },
        seat_count: 10,
      };
      // 5 members + 3 workspace invites + 1 email invite = 9 used
      const supabase = createMockSupabase(subscription, 5, {
        workspace: 3,
        email: 1,
      });
      const result = await canCreateInvitation(supabase as any, wsId);

      expect(result.allowed).toBe(true);
      expect(result.status?.availableSeats).toBe(1);
    });

    it('should block invitation when pending + members reach limit', async () => {
      const subscription = {
        workspace_subscription_products: { pricing_model: 'seat_based' },
        seat_count: 10,
      };
      // 7 members + 2 workspace invites + 1 email invite = 10 used
      const supabase = createMockSupabase(subscription, 7, {
        workspace: 2,
        email: 1,
      });
      const result = await canCreateInvitation(supabase as any, wsId);

      expect(result.allowed).toBe(false);
      expect(result.status?.availableSeats).toBe(0);
      expect(result.message).toContain(
        'No seats available for new invitations'
      );
    });
  });
});
