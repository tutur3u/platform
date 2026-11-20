type LinkParameters = {
  p_ws_id: string;
  p_contact_id: string;
  p_actor_id: string;
};

export type ContactLinkDatabase = {
  private: {
    Tables: Record<never, never>;
    Views: Record<never, never>;
    Functions: {
      unlink_contact_account_link: {
        Args: LinkParameters & { p_account_id: string };
        Returns: string;
      };
      invite_contact_account_link: {
        Args: LinkParameters & { p_account_id: string };
        Returns: string | null;
      };
      preview_contact_account_link: {
        Args: LinkParameters & { p_invitation_id: string };
        Returns: unknown;
      };
      finish_contact_account_link_invitation: {
        Args: LinkParameters & {
          p_invitation_id: string | null;
          p_action: 'decline' | 'revoke';
        };
        Returns: string;
      };
      confirm_contact_account_link: {
        Args: LinkParameters & { p_invitation_id: string };
        Returns: string;
      };
    };
  };
};
