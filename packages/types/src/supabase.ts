export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5';
  };
  public: {
    Tables: {
      abuse_events: {
        Row: {
          created_at: string;
          email_hash: string | null;
          endpoint: string | null;
          event_type: Database['public']['Enums']['abuse_event_type'];
          id: string;
          ip_address: string;
          metadata: Json | null;
          success: boolean;
          user_agent: string | null;
        };
        Insert: {
          created_at?: string;
          email_hash?: string | null;
          endpoint?: string | null;
          event_type: Database['public']['Enums']['abuse_event_type'];
          id?: string;
          ip_address: string;
          metadata?: Json | null;
          success?: boolean;
          user_agent?: string | null;
        };
        Update: {
          created_at?: string;
          email_hash?: string | null;
          endpoint?: string | null;
          event_type?: Database['public']['Enums']['abuse_event_type'];
          id?: string;
          ip_address?: string;
          metadata?: Json | null;
          success?: boolean;
          user_agent?: string | null;
        };
        Relationships: [];
      };
      ai_chat_members: {
        Row: {
          chat_id: string;
          created_at: string;
          email: string;
        };
        Insert: {
          chat_id: string;
          created_at?: string;
          email: string;
        };
        Update: {
          chat_id?: string;
          created_at?: string;
          email?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_chat_members_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'ai_chats';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_chat_messages: {
        Row: {
          chat_id: string;
          completion_tokens: number;
          content: string | null;
          created_at: string;
          creator_id: string | null;
          finish_reason: string | null;
          id: string;
          metadata: Json | null;
          model: string | null;
          prompt_tokens: number;
          role: Database['public']['Enums']['chat_role'];
          type: Database['public']['Enums']['ai_message_type'];
        };
        Insert: {
          chat_id: string;
          completion_tokens?: number;
          content?: string | null;
          created_at?: string;
          creator_id?: string | null;
          finish_reason?: string | null;
          id?: string;
          metadata?: Json | null;
          model?: string | null;
          prompt_tokens?: number;
          role: Database['public']['Enums']['chat_role'];
          type?: Database['public']['Enums']['ai_message_type'];
        };
        Update: {
          chat_id?: string;
          completion_tokens?: number;
          content?: string | null;
          created_at?: string;
          creator_id?: string | null;
          finish_reason?: string | null;
          id?: string;
          metadata?: Json | null;
          model?: string | null;
          prompt_tokens?: number;
          role?: Database['public']['Enums']['chat_role'];
          type?: Database['public']['Enums']['ai_message_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'ai_chat_messages_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'ai_chats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_chat_messages_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'ai_chat_messages_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'ai_chat_messages_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_chat_messages_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_ai_chat_messages_model_fkey';
            columns: ['model'];
            isOneToOne: false;
            referencedRelation: 'ai_models';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_chats: {
        Row: {
          created_at: string;
          creator_id: string | null;
          id: string;
          is_public: boolean;
          latest_summarized_message_id: string | null;
          model: string | null;
          pinned: boolean;
          summary: string | null;
          title: string | null;
        };
        Insert: {
          created_at?: string;
          creator_id?: string | null;
          id?: string;
          is_public?: boolean;
          latest_summarized_message_id?: string | null;
          model?: string | null;
          pinned?: boolean;
          summary?: string | null;
          title?: string | null;
        };
        Update: {
          created_at?: string;
          creator_id?: string | null;
          id?: string;
          is_public?: boolean;
          latest_summarized_message_id?: string | null;
          model?: string | null;
          pinned?: boolean;
          summary?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'ai_chats_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'ai_chats_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'ai_chats_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'ai_chats_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_ai_chats_latest_summarized_message_id_fkey';
            columns: ['latest_summarized_message_id'];
            isOneToOne: false;
            referencedRelation: 'ai_chat_messages';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_ai_chats_model_fkey';
            columns: ['model'];
            isOneToOne: false;
            referencedRelation: 'ai_models';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_models: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          name: string | null;
          provider: string | null;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id: string;
          name?: string | null;
          provider?: string | null;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          name?: string | null;
          provider?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'public_ai_models_provider_fkey';
            columns: ['provider'];
            isOneToOne: false;
            referencedRelation: 'ai_providers';
            referencedColumns: ['id'];
          },
        ];
      };
      ai_providers: {
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      ai_whitelisted_domains: {
        Row: {
          created_at: string;
          description: string | null;
          domain: string;
          enabled: boolean;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          domain: string;
          enabled?: boolean;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          domain?: string;
          enabled?: boolean;
        };
        Relationships: [];
      };
      ai_whitelisted_emails: {
        Row: {
          created_at: string;
          email: string;
          enabled: boolean;
        };
        Insert: {
          created_at?: string;
          email: string;
          enabled?: boolean;
        };
        Update: {
          created_at?: string;
          email?: string;
          enabled?: boolean;
        };
        Relationships: [];
      };
      audio_chunks: {
        Row: {
          chunk_order: number;
          created_at: string;
          id: string;
          session_id: string;
          storage_path: string;
        };
        Insert: {
          chunk_order: number;
          created_at?: string;
          id?: string;
          session_id: string;
          storage_path: string;
        };
        Update: {
          chunk_order?: number;
          created_at?: string;
          id?: string;
          session_id?: string;
          storage_path?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audio_chunks_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'recording_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      aurora_ml_forecast: {
        Row: {
          catboost: number;
          created_at: string;
          date: string;
          elasticnet: number;
          id: string;
          lightgbm: number;
          ws_id: string;
          xgboost: number;
        };
        Insert: {
          catboost: number;
          created_at?: string;
          date: string;
          elasticnet: number;
          id?: string;
          lightgbm: number;
          ws_id: string;
          xgboost: number;
        };
        Update: {
          catboost?: number;
          created_at?: string;
          date?: string;
          elasticnet?: number;
          id?: string;
          lightgbm?: number;
          ws_id?: string;
          xgboost?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'aurora_ml_forecast_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'aurora_ml_forecast_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      aurora_ml_metrics: {
        Row: {
          created_at: string;
          directional_accuracy: number;
          id: string;
          model: string;
          rmse: number;
          turning_point_accuracy: number;
          weighted_score: number;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          directional_accuracy: number;
          id?: string;
          model: string;
          rmse: number;
          turning_point_accuracy: number;
          weighted_score: number;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          directional_accuracy?: number;
          id?: string;
          model?: string;
          rmse?: number;
          turning_point_accuracy?: number;
          weighted_score?: number;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'aurora_ml_metrics_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'aurora_ml_metrics_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      aurora_statistical_forecast: {
        Row: {
          auto_arima: number;
          auto_arima_hi_90: number;
          auto_arima_lo_90: number;
          auto_ets: number;
          auto_ets_hi_90: number;
          auto_ets_lo_90: number;
          auto_theta: number;
          auto_theta_hi_90: number;
          auto_theta_lo_90: number;
          ces: number;
          ces_hi_90: number;
          ces_lo_90: number;
          created_at: string;
          date: string;
          id: string;
          ws_id: string;
        };
        Insert: {
          auto_arima: number;
          auto_arima_hi_90: number;
          auto_arima_lo_90: number;
          auto_ets: number;
          auto_ets_hi_90: number;
          auto_ets_lo_90: number;
          auto_theta: number;
          auto_theta_hi_90: number;
          auto_theta_lo_90: number;
          ces: number;
          ces_hi_90: number;
          ces_lo_90: number;
          created_at?: string;
          date: string;
          id?: string;
          ws_id: string;
        };
        Update: {
          auto_arima?: number;
          auto_arima_hi_90?: number;
          auto_arima_lo_90?: number;
          auto_ets?: number;
          auto_ets_hi_90?: number;
          auto_ets_lo_90?: number;
          auto_theta?: number;
          auto_theta_hi_90?: number;
          auto_theta_lo_90?: number;
          ces?: number;
          ces_hi_90?: number;
          ces_lo_90?: number;
          created_at?: string;
          date?: string;
          id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'aurora_statistical_forecast_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'aurora_statistical_forecast_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      aurora_statistical_metrics: {
        Row: {
          created_at: string;
          directional_accuracy: number;
          id: string;
          model: string;
          no_scaling: boolean;
          rmse: number;
          turning_point_accuracy: number;
          weighted_score: number;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          directional_accuracy: number;
          id?: string;
          model: string;
          no_scaling: boolean;
          rmse: number;
          turning_point_accuracy: number;
          weighted_score: number;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          directional_accuracy?: number;
          id?: string;
          model?: string;
          no_scaling?: boolean;
          rmse?: number;
          turning_point_accuracy?: number;
          weighted_score?: number;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'aurora_statistical_metrics_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'aurora_statistical_metrics_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      blocked_ips: {
        Row: {
          block_level: number;
          blocked_at: string;
          created_at: string;
          expires_at: string;
          id: string;
          ip_address: string;
          metadata: Json | null;
          reason: Database['public']['Enums']['abuse_event_type'];
          status: Database['public']['Enums']['ip_block_status'];
          unblock_reason: string | null;
          unblocked_at: string | null;
          unblocked_by: string | null;
          updated_at: string;
        };
        Insert: {
          block_level?: number;
          blocked_at?: string;
          created_at?: string;
          expires_at: string;
          id?: string;
          ip_address: string;
          metadata?: Json | null;
          reason: Database['public']['Enums']['abuse_event_type'];
          status?: Database['public']['Enums']['ip_block_status'];
          unblock_reason?: string | null;
          unblocked_at?: string | null;
          unblocked_by?: string | null;
          updated_at?: string;
        };
        Update: {
          block_level?: number;
          blocked_at?: string;
          created_at?: string;
          expires_at?: string;
          id?: string;
          ip_address?: string;
          metadata?: Json | null;
          reason?: Database['public']['Enums']['abuse_event_type'];
          status?: Database['public']['Enums']['ip_block_status'];
          unblock_reason?: string | null;
          unblocked_at?: string | null;
          unblocked_by?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'blocked_ips_unblocked_by_fkey';
            columns: ['unblocked_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'blocked_ips_unblocked_by_fkey';
            columns: ['unblocked_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'blocked_ips_unblocked_by_fkey';
            columns: ['unblocked_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocked_ips_unblocked_by_fkey';
            columns: ['unblocked_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_auth_tokens: {
        Row: {
          access_token: string;
          account_email: string | null;
          account_name: string | null;
          created_at: string;
          expires_at: string | null;
          id: string;
          is_active: boolean;
          provider: string;
          refresh_token: string;
          user_id: string;
          ws_id: string;
        };
        Insert: {
          access_token: string;
          account_email?: string | null;
          account_name?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          provider?: string;
          refresh_token: string;
          user_id: string;
          ws_id: string;
        };
        Update: {
          access_token?: string;
          account_email?: string | null;
          account_name?: string | null;
          created_at?: string;
          expires_at?: string | null;
          id?: string;
          is_active?: boolean;
          provider?: string;
          refresh_token?: string;
          user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_auth_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'calendar_auth_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'calendar_auth_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_auth_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_auth_tokens_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_auth_tokens_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_connections: {
        Row: {
          auth_token_id: string | null;
          calendar_id: string;
          calendar_name: string;
          color: string | null;
          created_at: string;
          id: string;
          is_enabled: boolean;
          provider: string;
          updated_at: string;
          workspace_calendar_id: string | null;
          ws_id: string;
        };
        Insert: {
          auth_token_id?: string | null;
          calendar_id: string;
          calendar_name: string;
          color?: string | null;
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          provider?: string;
          updated_at?: string;
          workspace_calendar_id?: string | null;
          ws_id: string;
        };
        Update: {
          auth_token_id?: string | null;
          calendar_id?: string;
          calendar_name?: string;
          color?: string | null;
          created_at?: string;
          id?: string;
          is_enabled?: boolean;
          provider?: string;
          updated_at?: string;
          workspace_calendar_id?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_connections_auth_token_id_fkey';
            columns: ['auth_token_id'];
            isOneToOne: false;
            referencedRelation: 'calendar_auth_tokens';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_connections_workspace_calendar_id_fkey';
            columns: ['workspace_calendar_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_calendars';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_connections_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_connections_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_event_colors: {
        Row: {
          value: string;
        };
        Insert: {
          value: string;
        };
        Update: {
          value?: string;
        };
        Relationships: [];
      };
      calendar_event_participant_groups: {
        Row: {
          created_at: string | null;
          event_id: string;
          group_id: string;
          notes: string | null;
          role: string | null;
        };
        Insert: {
          created_at?: string | null;
          event_id: string;
          group_id: string;
          notes?: string | null;
          role?: string | null;
        };
        Update: {
          created_at?: string | null;
          event_id?: string;
          group_id?: string;
          notes?: string | null;
          role?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_event_participant_groups_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_calendar_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_event_platform_participants: {
        Row: {
          created_at: string | null;
          event_id: string;
          going: boolean | null;
          notes: string;
          role: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          event_id: string;
          going?: boolean | null;
          notes?: string;
          role?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          event_id?: string;
          going?: boolean | null;
          notes?: string;
          role?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_event_platform_participants_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_calendar_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_platform_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'calendar_event_platform_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'calendar_event_platform_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_platform_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_event_virtual_participants: {
        Row: {
          created_at: string | null;
          event_id: string;
          going: boolean | null;
          notes: string;
          role: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          event_id: string;
          going?: boolean | null;
          notes?: string;
          role?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          event_id?: string;
          going?: boolean | null;
          notes?: string;
          role?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_event_virtual_participants_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_calendar_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_virtual_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_virtual_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_virtual_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'calendar_event_virtual_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_event_virtual_participants_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_sync_dashboard: {
        Row: {
          batch_count: number | null;
          calendar_connection_count: number | null;
          calendar_ids_synced: string[] | null;
          cooldown_remaining_seconds: number | null;
          date_range_end: string | null;
          date_range_start: string | null;
          deleted_events: number | null;
          end_time: string | null;
          error_message: string | null;
          error_stack_trace: string | null;
          error_type: string | null;
          events_fetched_total: number | null;
          events_filtered_out: number | null;
          failed_event_ids: Json | null;
          google_api_calls_count: number | null;
          google_api_error_code: string | null;
          google_api_pages_fetched: number | null;
          google_api_retry_count: number | null;
          id: string;
          inserted_events: number | null;
          payload_size_bytes: number | null;
          source: string | null;
          start_time: string | null;
          status: string | null;
          sync_token_used: boolean | null;
          timing_database_writes_ms: number | null;
          timing_event_processing_ms: number | null;
          timing_google_api_fetch_ms: number | null;
          timing_token_operations_ms: number | null;
          timing_total_ms: number | null;
          triggered_by: string;
          triggered_from: string | null;
          type: string | null;
          updated_at: string;
          updated_events: number | null;
          was_blocked_by_cooldown: boolean | null;
          ws_id: string;
        };
        Insert: {
          batch_count?: number | null;
          calendar_connection_count?: number | null;
          calendar_ids_synced?: string[] | null;
          cooldown_remaining_seconds?: number | null;
          date_range_end?: string | null;
          date_range_start?: string | null;
          deleted_events?: number | null;
          end_time?: string | null;
          error_message?: string | null;
          error_stack_trace?: string | null;
          error_type?: string | null;
          events_fetched_total?: number | null;
          events_filtered_out?: number | null;
          failed_event_ids?: Json | null;
          google_api_calls_count?: number | null;
          google_api_error_code?: string | null;
          google_api_pages_fetched?: number | null;
          google_api_retry_count?: number | null;
          id?: string;
          inserted_events?: number | null;
          payload_size_bytes?: number | null;
          source?: string | null;
          start_time?: string | null;
          status?: string | null;
          sync_token_used?: boolean | null;
          timing_database_writes_ms?: number | null;
          timing_event_processing_ms?: number | null;
          timing_google_api_fetch_ms?: number | null;
          timing_token_operations_ms?: number | null;
          timing_total_ms?: number | null;
          triggered_by: string;
          triggered_from?: string | null;
          type?: string | null;
          updated_at?: string;
          updated_events?: number | null;
          was_blocked_by_cooldown?: boolean | null;
          ws_id: string;
        };
        Update: {
          batch_count?: number | null;
          calendar_connection_count?: number | null;
          calendar_ids_synced?: string[] | null;
          cooldown_remaining_seconds?: number | null;
          date_range_end?: string | null;
          date_range_start?: string | null;
          deleted_events?: number | null;
          end_time?: string | null;
          error_message?: string | null;
          error_stack_trace?: string | null;
          error_type?: string | null;
          events_fetched_total?: number | null;
          events_filtered_out?: number | null;
          failed_event_ids?: Json | null;
          google_api_calls_count?: number | null;
          google_api_error_code?: string | null;
          google_api_pages_fetched?: number | null;
          google_api_retry_count?: number | null;
          id?: string;
          inserted_events?: number | null;
          payload_size_bytes?: number | null;
          source?: string | null;
          start_time?: string | null;
          status?: string | null;
          sync_token_used?: boolean | null;
          timing_database_writes_ms?: number | null;
          timing_event_processing_ms?: number | null;
          timing_google_api_fetch_ms?: number | null;
          timing_token_operations_ms?: number | null;
          timing_total_ms?: number | null;
          triggered_by?: string;
          triggered_from?: string | null;
          type?: string | null;
          updated_at?: string;
          updated_events?: number | null;
          was_blocked_by_cooldown?: boolean | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_sync_dashboard_triggered_by_fkey';
            columns: ['triggered_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'calendar_sync_dashboard_triggered_by_fkey';
            columns: ['triggered_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'calendar_sync_dashboard_triggered_by_fkey';
            columns: ['triggered_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_sync_dashboard_triggered_by_fkey';
            columns: ['triggered_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_sync_dashboard_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_sync_dashboard_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      calendar_sync_states: {
        Row: {
          calendar_id: string;
          last_synced_at: string | null;
          sync_token: string | null;
          ws_id: string;
        };
        Insert: {
          calendar_id?: string;
          last_synced_at?: string | null;
          sync_token?: string | null;
          ws_id: string;
        };
        Update: {
          calendar_id?: string;
          last_synced_at?: string | null;
          sync_token?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'calendar_sync_states_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'calendar_sync_states_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      changelog_entries: {
        Row: {
          category: string;
          content: Json;
          cover_image_url: string | null;
          created_at: string | null;
          creator_id: string;
          id: string;
          is_published: boolean | null;
          published_at: string | null;
          slug: string;
          summary: string | null;
          title: string;
          updated_at: string | null;
          version: string | null;
        };
        Insert: {
          category: string;
          content: Json;
          cover_image_url?: string | null;
          created_at?: string | null;
          creator_id?: string;
          id?: string;
          is_published?: boolean | null;
          published_at?: string | null;
          slug: string;
          summary?: string | null;
          title: string;
          updated_at?: string | null;
          version?: string | null;
        };
        Update: {
          category?: string;
          content?: Json;
          cover_image_url?: string | null;
          created_at?: string | null;
          creator_id?: string;
          id?: string;
          is_published?: boolean | null;
          published_at?: string | null;
          slug?: string;
          summary?: string | null;
          title?: string;
          updated_at?: string | null;
          version?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'changelog_entries_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'changelog_entries_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'changelog_entries_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'changelog_entries_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      course_certificates: {
        Row: {
          completed_date: string;
          course_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Insert: {
          completed_date: string;
          course_id: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Update: {
          completed_date?: string;
          course_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'course_certificates_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_courses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'course_certificates_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'course_certificates_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'course_certificates_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'course_certificates_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      course_module_completion_status: {
        Row: {
          completed_at: string | null;
          completion_id: string;
          completion_status: boolean;
          created_at: string | null;
          module_id: string;
          user_id: string | null;
        };
        Insert: {
          completed_at?: string | null;
          completion_id?: string;
          completion_status?: boolean;
          created_at?: string | null;
          module_id: string;
          user_id?: string | null;
        };
        Update: {
          completed_at?: string | null;
          completion_id?: string;
          completion_status?: boolean;
          created_at?: string | null;
          module_id?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'course_module_completion_status_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_course_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'course_module_completion_status_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'course_module_completion_status_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'course_module_completion_status_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'course_module_completion_status_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      course_module_flashcards: {
        Row: {
          created_at: string;
          flashcard_id: string;
          module_id: string;
        };
        Insert: {
          created_at?: string;
          flashcard_id: string;
          module_id: string;
        };
        Update: {
          created_at?: string;
          flashcard_id?: string;
          module_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'course_module_flashcards_flashcard_id_fkey';
            columns: ['flashcard_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_flashcards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'course_module_flashcards_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_course_modules';
            referencedColumns: ['id'];
          },
        ];
      };
      course_module_quiz_sets: {
        Row: {
          created_at: string;
          module_id: string;
          set_id: string;
        };
        Insert: {
          created_at?: string;
          module_id: string;
          set_id: string;
        };
        Update: {
          created_at?: string;
          module_id?: string;
          set_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'course_module_quiz_sets_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_course_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'course_module_quiz_sets_set_id_fkey';
            columns: ['set_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_quiz_sets';
            referencedColumns: ['id'];
          },
        ];
      };
      course_module_quizzes: {
        Row: {
          created_at: string;
          module_id: string;
          quiz_id: string;
        };
        Insert: {
          created_at?: string;
          module_id: string;
          quiz_id: string;
        };
        Update: {
          created_at?: string;
          module_id?: string;
          quiz_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'course_module_quizzes_module_id_fkey';
            columns: ['module_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_course_modules';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'course_module_quizzes_quiz_id_fkey';
            columns: ['quiz_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_quizzes';
            referencedColumns: ['id'];
          },
        ];
      };
      crawled_url_next_urls: {
        Row: {
          created_at: string;
          origin_id: string;
          skipped: boolean;
          url: string;
        };
        Insert: {
          created_at?: string;
          origin_id?: string;
          skipped: boolean;
          url: string;
        };
        Update: {
          created_at?: string;
          origin_id?: string;
          skipped?: boolean;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'crawled_url_next_urls_origin_id_fkey';
            columns: ['origin_id'];
            isOneToOne: false;
            referencedRelation: 'crawled_urls';
            referencedColumns: ['id'];
          },
        ];
      };
      crawled_urls: {
        Row: {
          created_at: string;
          creator_id: string;
          html: string | null;
          id: string;
          markdown: string | null;
          url: string;
        };
        Insert: {
          created_at?: string;
          creator_id: string;
          html?: string | null;
          id?: string;
          markdown?: string | null;
          url: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          html?: string | null;
          id?: string;
          markdown?: string | null;
          url?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'crawled_urls_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'crawled_urls_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'crawled_urls_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'crawled_urls_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_wallets: {
        Row: {
          limit: number;
          payment_date: number;
          statement_date: number;
          wallet_id: string;
        };
        Insert: {
          limit: number;
          payment_date: number;
          statement_date: number;
          wallet_id: string;
        };
        Update: {
          limit?: number;
          payment_date?: number;
          statement_date?: number;
          wallet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_wallets_wallet_id_fkey';
            columns: ['wallet_id'];
            isOneToOne: true;
            referencedRelation: 'workspace_wallets';
            referencedColumns: ['id'];
          },
        ];
      };
      cross_app_tokens: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          is_revoked: boolean;
          origin_app: string;
          session_data: Json | null;
          target_app: string;
          token: string;
          used_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          is_revoked?: boolean;
          origin_app: string;
          session_data?: Json | null;
          target_app: string;
          token: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          is_revoked?: boolean;
          origin_app?: string;
          session_data?: Json | null;
          target_app?: string;
          token?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'cross_app_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'cross_app_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'cross_app_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'cross_app_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      currencies: {
        Row: {
          code: string;
          name: string;
        };
        Insert: {
          code: string;
          name: string;
        };
        Update: {
          code?: string;
          name?: string;
        };
        Relationships: [];
      };
      discord_guild_members: {
        Row: {
          created_at: string;
          discord_guild_id: string;
          discord_user_id: string;
          id: string;
          platform_user_id: string;
        };
        Insert: {
          created_at?: string;
          discord_guild_id: string;
          discord_user_id: string;
          id?: string;
          platform_user_id: string;
        };
        Update: {
          created_at?: string;
          discord_guild_id?: string;
          discord_user_id?: string;
          id?: string;
          platform_user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'discord_guild_members_platform_user_id_fkey';
            columns: ['platform_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'discord_guild_members_platform_user_id_fkey';
            columns: ['platform_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'discord_guild_members_platform_user_id_fkey';
            columns: ['platform_user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'discord_guild_members_platform_user_id_fkey';
            columns: ['platform_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      discord_integrations: {
        Row: {
          created_at: string;
          creator_id: string;
          discord_guild_id: string;
          id: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          creator_id?: string;
          discord_guild_id: string;
          id?: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          discord_guild_id?: string;
          id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'discord_integrations_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'discord_integrations_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'discord_integrations_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'discord_integrations_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'discord_integrations_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'discord_integrations_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      email_audit: {
        Row: {
          bcc_addresses: string[];
          cc_addresses: string[];
          content_hash: string | null;
          created_at: string;
          entity_id: string | null;
          entity_type: string | null;
          error_message: string | null;
          html_content: string | null;
          id: string;
          ip_address: string | null;
          message_id: string | null;
          metadata: Json | null;
          provider: string;
          reply_to_addresses: string[];
          sent_at: string | null;
          source_email: string;
          source_name: string;
          status: string;
          subject: string;
          template_type: string | null;
          text_content: string | null;
          to_addresses: string[];
          updated_at: string;
          user_agent: string | null;
          user_id: string | null;
          ws_id: string;
        };
        Insert: {
          bcc_addresses?: string[];
          cc_addresses?: string[];
          content_hash?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          error_message?: string | null;
          html_content?: string | null;
          id?: string;
          ip_address?: string | null;
          message_id?: string | null;
          metadata?: Json | null;
          provider?: string;
          reply_to_addresses?: string[];
          sent_at?: string | null;
          source_email: string;
          source_name: string;
          status?: string;
          subject: string;
          template_type?: string | null;
          text_content?: string | null;
          to_addresses: string[];
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string | null;
          ws_id: string;
        };
        Update: {
          bcc_addresses?: string[];
          cc_addresses?: string[];
          content_hash?: string | null;
          created_at?: string;
          entity_id?: string | null;
          entity_type?: string | null;
          error_message?: string | null;
          html_content?: string | null;
          id?: string;
          ip_address?: string | null;
          message_id?: string | null;
          metadata?: Json | null;
          provider?: string;
          reply_to_addresses?: string[];
          sent_at?: string | null;
          source_email?: string;
          source_name?: string;
          status?: string;
          subject?: string;
          template_type?: string | null;
          text_content?: string | null;
          to_addresses?: string[];
          updated_at?: string;
          user_agent?: string | null;
          user_id?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'email_audit_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'email_audit_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'email_audit_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'email_audit_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'email_audit_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'email_audit_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      email_blacklist: {
        Row: {
          added_by_user_id: string | null;
          created_at: string;
          entry_type: Database['public']['Enums']['blacklist_entry_type'];
          id: string;
          reason: string | null;
          updated_at: string;
          value: string;
        };
        Insert: {
          added_by_user_id?: string | null;
          created_at?: string;
          entry_type: Database['public']['Enums']['blacklist_entry_type'];
          id?: string;
          reason?: string | null;
          updated_at?: string;
          value: string;
        };
        Update: {
          added_by_user_id?: string | null;
          created_at?: string;
          entry_type?: Database['public']['Enums']['blacklist_entry_type'];
          id?: string;
          reason?: string | null;
          updated_at?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'email_blacklist_added_by_user_id_fkey';
            columns: ['added_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'email_blacklist_added_by_user_id_fkey';
            columns: ['added_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'email_blacklist_added_by_user_id_fkey';
            columns: ['added_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'email_blacklist_added_by_user_id_fkey';
            columns: ['added_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      email_bounce_complaints: {
        Row: {
          bounce_subtype: string | null;
          bounce_type: string | null;
          complaint_feedback_id: string | null;
          complaint_type: string | null;
          created_at: string;
          email_hash: string;
          event_type: string;
          id: string;
          original_email_id: string | null;
          raw_notification: Json | null;
        };
        Insert: {
          bounce_subtype?: string | null;
          bounce_type?: string | null;
          complaint_feedback_id?: string | null;
          complaint_type?: string | null;
          created_at?: string;
          email_hash: string;
          event_type: string;
          id?: string;
          original_email_id?: string | null;
          raw_notification?: Json | null;
        };
        Update: {
          bounce_subtype?: string | null;
          bounce_type?: string | null;
          complaint_feedback_id?: string | null;
          complaint_type?: string | null;
          created_at?: string;
          email_hash?: string;
          event_type?: string;
          id?: string;
          original_email_id?: string | null;
          raw_notification?: Json | null;
        };
        Relationships: [
          {
            foreignKeyName: 'email_bounce_complaints_original_email_id_fkey';
            columns: ['original_email_id'];
            isOneToOne: false;
            referencedRelation: 'email_audit';
            referencedColumns: ['id'];
          },
        ];
      };
      external_user_monthly_report_logs: {
        Row: {
          content: string;
          created_at: string;
          creator_id: string | null;
          feedback: string;
          group_id: string;
          id: string;
          report_id: string;
          score: number | null;
          scores: number[] | null;
          title: string;
          user_id: string;
        };
        Insert: {
          content?: string;
          created_at?: string;
          creator_id?: string | null;
          feedback?: string;
          group_id: string;
          id?: string;
          report_id: string;
          score?: number | null;
          scores?: number[] | null;
          title?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          creator_id?: string | null;
          feedback?: string;
          group_id?: string;
          id?: string;
          report_id?: string;
          score?: number | null;
          scores?: number[] | null;
          title?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'external_user_monthly_report_logs_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_report_id_fkey';
            columns: ['report_id'];
            isOneToOne: false;
            referencedRelation: 'external_user_monthly_reports';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_report_logs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      external_user_monthly_reports: {
        Row: {
          content: string;
          created_at: string;
          creator_id: string | null;
          feedback: string;
          group_id: string;
          id: string;
          score: number | null;
          scores: number[] | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          creator_id?: string | null;
          feedback: string;
          group_id: string;
          id?: string;
          score?: number | null;
          scores?: number[] | null;
          title: string;
          updated_at: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          creator_id?: string | null;
          feedback?: string;
          group_id?: string;
          id?: string;
          score?: number | null;
          scores?: number[] | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'external_user_monthly_reports_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_reports_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_reports_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'external_user_monthly_reports_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_reports_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_external_user_monthly_reports_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_external_user_monthly_reports_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_external_user_monthly_reports_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'public_external_user_monthly_reports_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_external_user_monthly_reports_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      field_types: {
        Row: {
          enabled: boolean;
          id: string;
        };
        Insert: {
          enabled?: boolean;
          id: string;
        };
        Update: {
          enabled?: boolean;
          id?: string;
        };
        Relationships: [];
      };
      finance_budgets: {
        Row: {
          alert_threshold: number | null;
          amount: number;
          category_id: string | null;
          created_at: string | null;
          description: string | null;
          end_date: string | null;
          id: string;
          is_active: boolean;
          name: string;
          period: string;
          spent: number;
          start_date: string;
          updated_at: string | null;
          wallet_id: string | null;
          ws_id: string;
        };
        Insert: {
          alert_threshold?: number | null;
          amount?: number;
          category_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          is_active?: boolean;
          name: string;
          period?: string;
          spent?: number;
          start_date: string;
          updated_at?: string | null;
          wallet_id?: string | null;
          ws_id: string;
        };
        Update: {
          alert_threshold?: number | null;
          amount?: number;
          category_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          is_active?: boolean;
          name?: string;
          period?: string;
          spent?: number;
          start_date?: string;
          updated_at?: string | null;
          wallet_id?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_budgets_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'transaction_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_budgets_wallet_id_fkey';
            columns: ['wallet_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_wallets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_budgets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_budgets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      finance_invoice_products: {
        Row: {
          amount: number;
          created_at: string | null;
          invoice_id: string;
          price: number;
          product_id: string | null;
          product_name: string;
          product_unit: string;
          total_diff: number;
          unit_id: string;
          warehouse: string;
          warehouse_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string | null;
          invoice_id: string;
          price: number;
          product_id?: string | null;
          product_name?: string;
          product_unit?: string;
          total_diff?: number;
          unit_id: string;
          warehouse?: string;
          warehouse_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string | null;
          invoice_id?: string;
          price?: number;
          product_id?: string | null;
          product_name?: string;
          product_unit?: string;
          total_diff?: number;
          unit_id?: string;
          warehouse?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_invoice_products_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'finance_invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoice_products_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoice_products_unit_id_fkey';
            columns: ['unit_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_units';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoice_products_warehouse_id_fkey';
            columns: ['warehouse_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_warehouses';
            referencedColumns: ['id'];
          },
        ];
      };
      finance_invoice_promotions: {
        Row: {
          code: string;
          created_at: string;
          description: string | null;
          invoice_id: string;
          name: string | null;
          promo_id: string | null;
          use_ratio: boolean;
          value: number;
        };
        Insert: {
          code?: string;
          created_at?: string;
          description?: string | null;
          invoice_id: string;
          name?: string | null;
          promo_id?: string | null;
          use_ratio: boolean;
          value: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          invoice_id?: string;
          name?: string | null;
          promo_id?: string | null;
          use_ratio?: boolean;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_invoice_promotions_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'finance_invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoice_promotions_promo_id_fkey';
            columns: ['promo_id'];
            isOneToOne: false;
            referencedRelation: 'v_user_referral_discounts';
            referencedColumns: ['promo_id'];
          },
          {
            foreignKeyName: 'finance_invoice_promotions_promo_id_fkey';
            columns: ['promo_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_promotions';
            referencedColumns: ['id'];
          },
        ];
      };
      finance_invoice_user_groups: {
        Row: {
          created_at: string;
          invoice_id: string;
          user_group_id: string;
        };
        Insert: {
          created_at?: string;
          invoice_id: string;
          user_group_id: string;
        };
        Update: {
          created_at?: string;
          invoice_id?: string;
          user_group_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_invoice_user_groups_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: false;
            referencedRelation: 'finance_invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoice_user_groups_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'finance_invoice_user_groups_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'finance_invoice_user_groups_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'finance_invoice_user_groups_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoice_user_groups_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoice_user_groups_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoice_user_groups_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
        ];
      };
      finance_invoices: {
        Row: {
          category_id: string;
          completed_at: string | null;
          created_at: string | null;
          creator_id: string | null;
          customer_id: string | null;
          id: string;
          note: string | null;
          notice: string | null;
          paid_amount: number;
          platform_creator_id: string | null;
          price: number;
          total_diff: number;
          transaction_id: string | null;
          valid_until: string | null;
          wallet_id: string;
          ws_id: string;
        };
        Insert: {
          category_id: string;
          completed_at?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          customer_id?: string | null;
          id?: string;
          note?: string | null;
          notice?: string | null;
          paid_amount?: number;
          platform_creator_id?: string | null;
          price: number;
          total_diff?: number;
          transaction_id?: string | null;
          valid_until?: string | null;
          wallet_id: string;
          ws_id: string;
        };
        Update: {
          category_id?: string;
          completed_at?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          customer_id?: string | null;
          id?: string;
          note?: string | null;
          notice?: string | null;
          paid_amount?: number;
          platform_creator_id?: string | null;
          price?: number;
          total_diff?: number;
          transaction_id?: string | null;
          valid_until?: string | null;
          wallet_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_invoices_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'transaction_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'finance_invoices_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'finance_invoices_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_customer_id_fkey';
            columns: ['customer_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_platform_creator_id_fkey';
            columns: ['platform_creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'finance_invoices_platform_creator_id_fkey';
            columns: ['platform_creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'finance_invoices_platform_creator_id_fkey';
            columns: ['platform_creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_platform_creator_id_fkey';
            columns: ['platform_creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: true;
            referencedRelation: 'wallet_transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: true;
            referencedRelation: 'wallet_transactions_secure';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_wallet_id_fkey';
            columns: ['wallet_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_wallets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      guest_users_lead_generation: {
        Row: {
          created_at: string;
          id: number;
          mail_id: string;
          user_id: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          mail_id: string;
          user_id: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          mail_id?: string;
          user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_users_lead_generation_mail_id_fkey';
            columns: ['mail_id'];
            isOneToOne: false;
            referencedRelation: 'sent_emails';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_users_lead_generation_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_users_lead_generation_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_users_lead_generation_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'guest_users_lead_generation_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_users_lead_generation_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_users_lead_generation_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_users_lead_generation_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      habit_calendar_events: {
        Row: {
          completed: boolean | null;
          created_at: string | null;
          event_id: string;
          habit_id: string;
          id: string;
          occurrence_date: string;
          scheduling_reason: string | null;
          updated_at: string | null;
        };
        Insert: {
          completed?: boolean | null;
          created_at?: string | null;
          event_id: string;
          habit_id: string;
          id?: string;
          occurrence_date: string;
          scheduling_reason?: string | null;
          updated_at?: string | null;
        };
        Update: {
          completed?: boolean | null;
          created_at?: string | null;
          event_id?: string;
          habit_id?: string;
          id?: string;
          occurrence_date?: string;
          scheduling_reason?: string | null;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'habit_calendar_events_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_calendar_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'habit_calendar_events_habit_id_fkey';
            columns: ['habit_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_habits';
            referencedColumns: ['id'];
          },
        ];
      };
      habit_completions: {
        Row: {
          completed_at: string;
          created_at: string | null;
          event_id: string | null;
          habit_id: string;
          id: string;
          occurrence_date: string;
        };
        Insert: {
          completed_at?: string;
          created_at?: string | null;
          event_id?: string | null;
          habit_id: string;
          id?: string;
          occurrence_date: string;
        };
        Update: {
          completed_at?: string;
          created_at?: string | null;
          event_id?: string | null;
          habit_id?: string;
          id?: string;
          occurrence_date?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'habit_completions_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_calendar_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'habit_completions_habit_id_fkey';
            columns: ['habit_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_habits';
            referencedColumns: ['id'];
          },
        ];
      };
      handles: {
        Row: {
          created_at: string | null;
          creator_id: string | null;
          value: string;
        };
        Insert: {
          created_at?: string | null;
          creator_id?: string | null;
          value: string;
        };
        Update: {
          created_at?: string | null;
          creator_id?: string | null;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'handles_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'handles_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'handles_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'handles_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      healthcare_checkup_vital_groups: {
        Row: {
          checkup_id: string;
          created_at: string | null;
          group_id: string;
        };
        Insert: {
          checkup_id: string;
          created_at?: string | null;
          group_id: string;
        };
        Update: {
          checkup_id?: string;
          created_at?: string | null;
          group_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'healthcare_checkup_vital_groups_checkup_id_fkey';
            columns: ['checkup_id'];
            isOneToOne: false;
            referencedRelation: 'healthcare_checkups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_checkup_vital_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'healthcare_vital_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      healthcare_checkup_vitals: {
        Row: {
          checkup_id: string;
          created_at: string | null;
          value: number | null;
          vital_id: string;
        };
        Insert: {
          checkup_id: string;
          created_at?: string | null;
          value?: number | null;
          vital_id: string;
        };
        Update: {
          checkup_id?: string;
          created_at?: string | null;
          value?: number | null;
          vital_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'healthcare_checkup_vitals_checkup_id_fkey';
            columns: ['checkup_id'];
            isOneToOne: false;
            referencedRelation: 'healthcare_checkups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_checkup_vitals_vital_id_fkey';
            columns: ['vital_id'];
            isOneToOne: false;
            referencedRelation: 'healthcare_vitals';
            referencedColumns: ['id'];
          },
        ];
      };
      healthcare_checkups: {
        Row: {
          checked: boolean;
          checkup_at: string;
          completed_at: string | null;
          created_at: string | null;
          creator_id: string;
          diagnosis_id: string | null;
          id: string;
          next_checked: boolean | null;
          next_checkup_at: string | null;
          note: string | null;
          patient_id: string;
          ws_id: string;
        };
        Insert: {
          checked?: boolean;
          checkup_at?: string;
          completed_at?: string | null;
          created_at?: string | null;
          creator_id: string;
          diagnosis_id?: string | null;
          id?: string;
          next_checked?: boolean | null;
          next_checkup_at?: string | null;
          note?: string | null;
          patient_id: string;
          ws_id: string;
        };
        Update: {
          checked?: boolean;
          checkup_at?: string;
          completed_at?: string | null;
          created_at?: string | null;
          creator_id?: string;
          diagnosis_id?: string | null;
          id?: string;
          next_checked?: boolean | null;
          next_checkup_at?: string | null;
          note?: string | null;
          patient_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'healthcare_checkups_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'healthcare_checkups_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'healthcare_checkups_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_checkups_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_checkups_diagnosis_id_fkey';
            columns: ['diagnosis_id'];
            isOneToOne: false;
            referencedRelation: 'healthcare_diagnoses';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_checkups_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_checkups_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_checkups_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'healthcare_checkups_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_checkups_patient_id_fkey';
            columns: ['patient_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_checkups_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_checkups_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      healthcare_diagnoses: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          name: string | null;
          note: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string | null;
          note?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string | null;
          note?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'healthcare_diagnoses_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_diagnoses_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      healthcare_vital_groups: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          note: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          note?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          note?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'healthcare_vital_groups_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_vital_groups_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      healthcare_vitals: {
        Row: {
          created_at: string | null;
          factor: number;
          group_id: string | null;
          id: string;
          name: string;
          unit: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          factor?: number;
          group_id?: string | null;
          id?: string;
          name: string;
          unit: string;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          factor?: number;
          group_id?: string | null;
          id?: string;
          name?: string;
          unit?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'healthcare_vitals_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'healthcare_vitals_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
        ];
      };
      internal_email_api_keys: {
        Row: {
          allowed_emails: string[] | null;
          created_at: string;
          creator_id: string;
          id: string;
          user_id: string;
          value: string;
        };
        Insert: {
          allowed_emails?: string[] | null;
          created_at?: string;
          creator_id: string;
          id?: string;
          user_id: string;
          value: string;
        };
        Update: {
          allowed_emails?: string[] | null;
          created_at?: string;
          creator_id?: string;
          id?: string;
          user_id?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'internal_email_api_keys_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'internal_email_api_keys_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'internal_email_api_keys_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'internal_email_api_keys_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'internal_email_api_keys_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'internal_email_api_keys_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'internal_email_api_keys_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'internal_email_api_keys_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      internal_emails: {
        Row: {
          bcc_addresses: string[];
          cc_addresses: string[];
          created_at: string;
          html_payload: boolean;
          id: string;
          payload: string;
          reply_to_addresses: string[];
          source_email: string;
          subject: string;
          to_addresses: string[];
          user_id: string;
          ws_id: string;
        };
        Insert: {
          bcc_addresses: string[];
          cc_addresses: string[];
          created_at?: string;
          html_payload?: boolean;
          id?: string;
          payload: string;
          reply_to_addresses: string[];
          source_email: string;
          subject: string;
          to_addresses: string[];
          user_id: string;
          ws_id: string;
        };
        Update: {
          bcc_addresses?: string[];
          cc_addresses?: string[];
          created_at?: string;
          html_payload?: boolean;
          id?: string;
          payload?: string;
          reply_to_addresses?: string[];
          source_email?: string;
          subject?: string;
          to_addresses?: string[];
          user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'internal_emails_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'internal_emails_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'internal_emails_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'internal_emails_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'internal_emails_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'internal_emails_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_batch_products: {
        Row: {
          amount: number;
          batch_id: string;
          created_at: string | null;
          price: number;
          product_id: string;
          unit_id: string;
        };
        Insert: {
          amount?: number;
          batch_id: string;
          created_at?: string | null;
          price?: number;
          product_id: string;
          unit_id: string;
        };
        Update: {
          amount?: number;
          batch_id?: string;
          created_at?: string | null;
          price?: number;
          product_id?: string;
          unit_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_batch_products_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_batch_products_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_batch_products_unit_id_fkey';
            columns: ['unit_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_units';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_batches: {
        Row: {
          created_at: string | null;
          id: string;
          price: number;
          supplier_id: string | null;
          total_diff: number;
          warehouse_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          price?: number;
          supplier_id?: string | null;
          total_diff?: number;
          warehouse_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          price?: number;
          supplier_id?: string | null;
          total_diff?: number;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_batches_supplier_id_fkey';
            columns: ['supplier_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_suppliers';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_batches_warehouse_id_fkey';
            columns: ['warehouse_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_warehouses';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_products: {
        Row: {
          amount: number | null;
          created_at: string | null;
          min_amount: number;
          price: number;
          product_id: string;
          unit_id: string;
          warehouse_id: string;
        };
        Insert: {
          amount?: number | null;
          created_at?: string | null;
          min_amount?: number;
          price?: number;
          product_id: string;
          unit_id: string;
          warehouse_id: string;
        };
        Update: {
          amount?: number | null;
          created_at?: string | null;
          min_amount?: number;
          price?: number;
          product_id?: string;
          unit_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_products_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_products_unit_id_fkey';
            columns: ['unit_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_units';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_products_warehouse_id_fkey';
            columns: ['warehouse_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_warehouses';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_suppliers: {
        Row: {
          created_at: string | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_suppliers_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_suppliers_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_units: {
        Row: {
          created_at: string | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_units_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_units_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      inventory_warehouses: {
        Row: {
          created_at: string | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'inventory_warehouses_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'inventory_warehouses_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      link_analytics: {
        Row: {
          browser: string | null;
          city: string | null;
          clicked_at: string;
          country: string | null;
          country_region: string | null;
          created_at: string;
          device_type: string | null;
          id: string;
          ip_address: unknown;
          latitude: number | null;
          link_id: string;
          longitude: number | null;
          os: string | null;
          postal_code: string | null;
          referrer: string | null;
          referrer_domain: string | null;
          timezone: string | null;
          user_agent: string | null;
          vercel_id: string | null;
          vercel_region: string | null;
        };
        Insert: {
          browser?: string | null;
          city?: string | null;
          clicked_at?: string;
          country?: string | null;
          country_region?: string | null;
          created_at?: string;
          device_type?: string | null;
          id?: string;
          ip_address?: unknown;
          latitude?: number | null;
          link_id: string;
          longitude?: number | null;
          os?: string | null;
          postal_code?: string | null;
          referrer?: string | null;
          referrer_domain?: string | null;
          timezone?: string | null;
          user_agent?: string | null;
          vercel_id?: string | null;
          vercel_region?: string | null;
        };
        Update: {
          browser?: string | null;
          city?: string | null;
          clicked_at?: string;
          country?: string | null;
          country_region?: string | null;
          created_at?: string;
          device_type?: string | null;
          id?: string;
          ip_address?: unknown;
          latitude?: number | null;
          link_id?: string;
          longitude?: number | null;
          os?: string | null;
          postal_code?: string | null;
          referrer?: string | null;
          referrer_domain?: string | null;
          timezone?: string | null;
          user_agent?: string | null;
          vercel_id?: string | null;
          vercel_region?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'link_analytics_link_id_fkey';
            columns: ['link_id'];
            isOneToOne: false;
            referencedRelation: 'link_analytics_device_insights';
            referencedColumns: ['link_id'];
          },
          {
            foreignKeyName: 'link_analytics_link_id_fkey';
            columns: ['link_id'];
            isOneToOne: false;
            referencedRelation: 'link_analytics_geo_insights';
            referencedColumns: ['link_id'];
          },
          {
            foreignKeyName: 'link_analytics_link_id_fkey';
            columns: ['link_id'];
            isOneToOne: false;
            referencedRelation: 'link_analytics_summary';
            referencedColumns: ['link_id'];
          },
          {
            foreignKeyName: 'link_analytics_link_id_fkey';
            columns: ['link_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links';
            referencedColumns: ['id'];
          },
        ];
      };
      live_api_sessions: {
        Row: {
          created_at: string | null;
          expires_at: string;
          id: string;
          session_handle: string;
          updated_at: string | null;
          user_id: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          expires_at: string;
          id?: string;
          session_handle: string;
          updated_at?: string | null;
          user_id: string;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          expires_at?: string;
          id?: string;
          session_handle?: string;
          updated_at?: string | null;
          user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'live_api_sessions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'live_api_sessions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      meet_together_guest_timeblocks: {
        Row: {
          created_at: string;
          date: string;
          end_time: string;
          id: string;
          plan_id: string;
          start_time: string;
          tentative: boolean;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          end_time: string;
          id?: string;
          plan_id: string;
          start_time: string;
          tentative?: boolean;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          end_time?: string;
          id?: string;
          plan_id?: string;
          start_time?: string;
          tentative?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meet_together_guest_timeblocks_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'meet_together_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meet_together_guest_timeblocks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'meet_together_guests';
            referencedColumns: ['id'];
          },
        ];
      };
      meet_together_guests: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          password_hash: string;
          password_salt: string;
          plan_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          password_hash: string;
          password_salt: string;
          plan_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          password_hash?: string;
          password_salt?: string;
          plan_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meet_together_guests_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'meet_together_plans';
            referencedColumns: ['id'];
          },
        ];
      };
      meet_together_plans: {
        Row: {
          agenda_content: Json | null;
          created_at: string | null;
          creator_id: string | null;
          dates: string[];
          description: string | null;
          end_time: string;
          id: string;
          is_confirmed: boolean;
          is_public: boolean;
          name: string | null;
          start_time: string;
          where_to_meet: boolean;
          ws_id: string | null;
        };
        Insert: {
          agenda_content?: Json | null;
          created_at?: string | null;
          creator_id?: string | null;
          dates: string[];
          description?: string | null;
          end_time: string;
          id?: string;
          is_confirmed?: boolean;
          is_public?: boolean;
          name?: string | null;
          start_time: string;
          where_to_meet?: boolean;
          ws_id?: string | null;
        };
        Update: {
          agenda_content?: Json | null;
          created_at?: string | null;
          creator_id?: string | null;
          dates?: string[];
          description?: string | null;
          end_time?: string;
          id?: string;
          is_confirmed?: boolean;
          is_public?: boolean;
          name?: string | null;
          start_time?: string;
          where_to_meet?: boolean;
          ws_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'meet_together_plans_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'meet_together_plans_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'meet_together_plans_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meet_together_plans_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meet_together_plans_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meet_together_plans_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      meet_together_user_timeblocks: {
        Row: {
          created_at: string;
          date: string;
          end_time: string;
          id: string;
          plan_id: string;
          start_time: string;
          tentative: boolean;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          end_time: string;
          id?: string;
          plan_id: string;
          start_time: string;
          tentative?: boolean;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          end_time?: string;
          id?: string;
          plan_id?: string;
          start_time?: string;
          tentative?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'meet_together_user_timeblocks_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'meet_together_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meet_together_user_timeblocks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'meet_together_user_timeblocks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'meet_together_user_timeblocks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'meet_together_user_timeblocks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      notes: {
        Row: {
          archived: boolean | null;
          content: Json;
          created_at: string | null;
          creator_id: string;
          deleted: boolean | null;
          id: string;
          title: string | null;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          archived?: boolean | null;
          content: Json;
          created_at?: string | null;
          creator_id?: string;
          deleted?: boolean | null;
          id?: string;
          title?: string | null;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          content?: Json;
          created_at?: string | null;
          creator_id?: string;
          deleted?: boolean | null;
          id?: string;
          title?: string | null;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'notes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'notes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notes_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notes_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_batches: {
        Row: {
          channel: string;
          created_at: string;
          delivery_mode: Database['public']['Enums']['notification_delivery_mode'];
          email: string | null;
          error_message: string | null;
          id: string;
          notification_count: number;
          sent_at: string | null;
          status: string;
          updated_at: string;
          user_id: string | null;
          window_end: string;
          window_start: string;
          ws_id: string | null;
        };
        Insert: {
          channel: string;
          created_at?: string;
          delivery_mode?: Database['public']['Enums']['notification_delivery_mode'];
          email?: string | null;
          error_message?: string | null;
          id?: string;
          notification_count?: number;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
          window_end: string;
          window_start: string;
          ws_id?: string | null;
        };
        Update: {
          channel?: string;
          created_at?: string;
          delivery_mode?: Database['public']['Enums']['notification_delivery_mode'];
          email?: string | null;
          error_message?: string | null;
          id?: string;
          notification_count?: number;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
          window_end?: string;
          window_start?: string;
          ws_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_batches_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_batches_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_delivery_log: {
        Row: {
          batch_id: string | null;
          channel: string;
          created_at: string;
          error_message: string | null;
          id: string;
          notification_id: string;
          retry_count: number;
          sent_at: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          batch_id?: string | null;
          channel: string;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          notification_id: string;
          retry_count?: number;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          batch_id?: string | null;
          channel?: string;
          created_at?: string;
          error_message?: string | null;
          id?: string;
          notification_id?: string;
          retry_count?: number;
          sent_at?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_delivery_log_batch_id_fkey';
            columns: ['batch_id'];
            isOneToOne: false;
            referencedRelation: 'notification_batches';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_delivery_log_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'notifications';
            referencedColumns: ['id'];
          },
        ];
      };
      notification_email_config: {
        Row: {
          batch_window_minutes: number | null;
          created_at: string;
          delivery_mode: Database['public']['Enums']['notification_delivery_mode'];
          email_subject_template: string | null;
          email_template: string | null;
          enabled: boolean;
          id: string;
          notification_type: string;
          priority_override:
            | Database['public']['Enums']['notification_priority']
            | null;
          updated_at: string;
        };
        Insert: {
          batch_window_minutes?: number | null;
          created_at?: string;
          delivery_mode?: Database['public']['Enums']['notification_delivery_mode'];
          email_subject_template?: string | null;
          email_template?: string | null;
          enabled?: boolean;
          id?: string;
          notification_type: string;
          priority_override?:
            | Database['public']['Enums']['notification_priority']
            | null;
          updated_at?: string;
        };
        Update: {
          batch_window_minutes?: number | null;
          created_at?: string;
          delivery_mode?: Database['public']['Enums']['notification_delivery_mode'];
          email_subject_template?: string | null;
          email_template?: string | null;
          enabled?: boolean;
          id?: string;
          notification_type?: string;
          priority_override?:
            | Database['public']['Enums']['notification_priority']
            | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      notification_preferences: {
        Row: {
          channel: string;
          created_at: string;
          enabled: boolean;
          event_type: string;
          id: string;
          scope: Database['public']['Enums']['notification_scope'];
          updated_at: string;
          user_id: string;
          ws_id: string | null;
        };
        Insert: {
          channel: string;
          created_at?: string;
          enabled?: boolean;
          event_type: string;
          id?: string;
          scope?: Database['public']['Enums']['notification_scope'];
          updated_at?: string;
          user_id: string;
          ws_id?: string | null;
        };
        Update: {
          channel?: string;
          created_at?: string;
          enabled?: boolean;
          event_type?: string;
          id?: string;
          scope?: Database['public']['Enums']['notification_scope'];
          updated_at?: string;
          user_id?: string;
          ws_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notification_preferences_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notification_preferences_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      notifications: {
        Row: {
          action_url: string | null;
          archived_at: string | null;
          code: string | null;
          created_at: string;
          created_by: string | null;
          data: Json | null;
          description: string | null;
          email: string | null;
          entity_id: string | null;
          entity_type: string | null;
          expires_at: string | null;
          id: string;
          metadata: Json | null;
          parent_id: string | null;
          priority: Database['public']['Enums']['notification_priority'];
          read_at: string | null;
          scope: Database['public']['Enums']['notification_scope'];
          title: string;
          type: string;
          user_id: string | null;
          ws_id: string | null;
        };
        Insert: {
          action_url?: string | null;
          archived_at?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          data?: Json | null;
          description?: string | null;
          email?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          expires_at?: string | null;
          id?: string;
          metadata?: Json | null;
          parent_id?: string | null;
          priority?: Database['public']['Enums']['notification_priority'];
          read_at?: string | null;
          scope?: Database['public']['Enums']['notification_scope'];
          title: string;
          type: string;
          user_id?: string | null;
          ws_id?: string | null;
        };
        Update: {
          action_url?: string | null;
          archived_at?: string | null;
          code?: string | null;
          created_at?: string;
          created_by?: string | null;
          data?: Json | null;
          description?: string | null;
          email?: string | null;
          entity_id?: string | null;
          entity_type?: string | null;
          expires_at?: string | null;
          id?: string;
          metadata?: Json | null;
          parent_id?: string | null;
          priority?: Database['public']['Enums']['notification_priority'];
          read_at?: string | null;
          scope?: Database['public']['Enums']['notification_scope'];
          title?: string;
          type?: string;
          user_id?: string | null;
          ws_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'notifications_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'notifications_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'notifications_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'notifications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'notifications_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      nova_challenge_criteria: {
        Row: {
          challenge_id: string;
          created_at: string;
          description: string;
          id: string;
          name: string;
        };
        Insert: {
          challenge_id: string;
          created_at?: string;
          description: string;
          id?: string;
          name: string;
        };
        Update: {
          challenge_id?: string;
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_challenge_criteria_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_challenges';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_challenge_criteria_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['challenge_id'];
          },
        ];
      };
      nova_challenge_manager_emails: {
        Row: {
          challenge_id: string;
          created_at: string;
          email: string;
        };
        Insert: {
          challenge_id?: string;
          created_at?: string;
          email: string;
        };
        Update: {
          challenge_id?: string;
          created_at?: string;
          email?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_challenge_manager_emails_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_challenges';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_challenge_manager_emails_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['challenge_id'];
          },
        ];
      };
      nova_challenge_whitelisted_emails: {
        Row: {
          challenge_id: string;
          created_at: string;
          email: string;
        };
        Insert: {
          challenge_id: string;
          created_at?: string;
          email: string;
        };
        Update: {
          challenge_id?: string;
          created_at?: string;
          email?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_challenge_whitelisted_emails_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_challenges';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_challenge_whitelisted_emails_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['challenge_id'];
          },
        ];
      };
      nova_challenges: {
        Row: {
          close_at: string | null;
          created_at: string;
          description: string;
          duration: number;
          enabled: boolean;
          id: string;
          max_attempts: number;
          max_daily_attempts: number;
          open_at: string | null;
          password_hash: string | null;
          password_salt: string | null;
          previewable_at: string | null;
          title: string;
          whitelisted_only: boolean;
        };
        Insert: {
          close_at?: string | null;
          created_at?: string;
          description: string;
          duration: number;
          enabled?: boolean;
          id?: string;
          max_attempts?: number;
          max_daily_attempts?: number;
          open_at?: string | null;
          password_hash?: string | null;
          password_salt?: string | null;
          previewable_at?: string | null;
          title: string;
          whitelisted_only?: boolean;
        };
        Update: {
          close_at?: string | null;
          created_at?: string;
          description?: string;
          duration?: number;
          enabled?: boolean;
          id?: string;
          max_attempts?: number;
          max_daily_attempts?: number;
          open_at?: string | null;
          password_hash?: string | null;
          password_salt?: string | null;
          previewable_at?: string | null;
          title?: string;
          whitelisted_only?: boolean;
        };
        Relationships: [];
      };
      nova_problem_test_cases: {
        Row: {
          created_at: string;
          hidden: boolean;
          id: string;
          input: string;
          output: string;
          problem_id: string;
        };
        Insert: {
          created_at?: string;
          hidden?: boolean;
          id?: string;
          input: string;
          output: string;
          problem_id: string;
        };
        Update: {
          created_at?: string;
          hidden?: boolean;
          id?: string;
          input?: string;
          output?: string;
          problem_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_problem_testcases_problem_id_fkey';
            columns: ['problem_id'];
            isOneToOne: false;
            referencedRelation: 'nova_problems';
            referencedColumns: ['id'];
          },
        ];
      };
      nova_problems: {
        Row: {
          challenge_id: string;
          created_at: string;
          description: string;
          example_input: string;
          example_output: string;
          id: string;
          max_prompt_length: number;
          title: string;
        };
        Insert: {
          challenge_id: string;
          created_at?: string;
          description: string;
          example_input: string;
          example_output: string;
          id?: string;
          max_prompt_length: number;
          title: string;
        };
        Update: {
          challenge_id?: string;
          created_at?: string;
          description?: string;
          example_input?: string;
          example_output?: string;
          id?: string;
          max_prompt_length?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_problems_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_challenges';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_problems_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['challenge_id'];
          },
        ];
      };
      nova_sessions: {
        Row: {
          challenge_id: string;
          created_at: string;
          end_time: string | null;
          id: string;
          start_time: string;
          status: string;
          user_id: string;
        };
        Insert: {
          challenge_id: string;
          created_at?: string;
          end_time?: string | null;
          id?: string;
          start_time: string;
          status: string;
          user_id: string;
        };
        Update: {
          challenge_id?: string;
          created_at?: string;
          end_time?: string | null;
          id?: string;
          start_time?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_sessions_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_challenges';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_sessions_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['challenge_id'];
          },
          {
            foreignKeyName: 'nova_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'nova_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'nova_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      nova_submission_criteria: {
        Row: {
          created_at: string;
          criteria_id: string;
          feedback: string;
          improvements: string[] | null;
          score: number;
          strengths: string[] | null;
          submission_id: string;
        };
        Insert: {
          created_at?: string;
          criteria_id: string;
          feedback: string;
          improvements?: string[] | null;
          score: number;
          strengths?: string[] | null;
          submission_id: string;
        };
        Update: {
          created_at?: string;
          criteria_id?: string;
          feedback?: string;
          improvements?: string[] | null;
          score?: number;
          strengths?: string[] | null;
          submission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_submission_criteria_criteria_id_fkey';
            columns: ['criteria_id'];
            isOneToOne: false;
            referencedRelation: 'nova_challenge_criteria';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_submission_criteria_submission_id_fkey';
            columns: ['submission_id'];
            isOneToOne: false;
            referencedRelation: 'nova_submissions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_submission_criteria_submission_id_fkey';
            columns: ['submission_id'];
            isOneToOne: false;
            referencedRelation: 'nova_submissions_with_scores';
            referencedColumns: ['id'];
          },
        ];
      };
      nova_submission_test_cases: {
        Row: {
          confidence: number | null;
          created_at: string;
          matched: boolean;
          output: string;
          reasoning: string | null;
          submission_id: string;
          test_case_id: string;
        };
        Insert: {
          confidence?: number | null;
          created_at?: string;
          matched?: boolean;
          output: string;
          reasoning?: string | null;
          submission_id: string;
          test_case_id: string;
        };
        Update: {
          confidence?: number | null;
          created_at?: string;
          matched?: boolean;
          output?: string;
          reasoning?: string | null;
          submission_id?: string;
          test_case_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_submission_test_cases_submission_id_fkey';
            columns: ['submission_id'];
            isOneToOne: false;
            referencedRelation: 'nova_submissions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_submission_test_cases_submission_id_fkey';
            columns: ['submission_id'];
            isOneToOne: false;
            referencedRelation: 'nova_submissions_with_scores';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_submission_test_cases_test_case_id_fkey';
            columns: ['test_case_id'];
            isOneToOne: false;
            referencedRelation: 'nova_problem_test_cases';
            referencedColumns: ['id'];
          },
        ];
      };
      nova_submissions: {
        Row: {
          created_at: string;
          id: string;
          overall_assessment: string | null;
          problem_id: string;
          prompt: string;
          session_id: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          overall_assessment?: string | null;
          problem_id: string;
          prompt: string;
          session_id?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          overall_assessment?: string | null;
          problem_id?: string;
          prompt?: string;
          session_id?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_submissions_problem_id_fkey';
            columns: ['problem_id'];
            isOneToOne: false;
            referencedRelation: 'nova_problems';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_submissions_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'nova_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_submissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'nova_submissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'nova_submissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_submissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      nova_team_emails: {
        Row: {
          created_at: string;
          email: string;
          team_id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          team_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_team_emails_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'nova_team_challenge_leaderboard';
            referencedColumns: ['team_id'];
          },
          {
            foreignKeyName: 'nova_team_emails_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'nova_team_leaderboard';
            referencedColumns: ['team_id'];
          },
          {
            foreignKeyName: 'nova_team_emails_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'nova_teams';
            referencedColumns: ['id'];
          },
        ];
      };
      nova_team_members: {
        Row: {
          created_at: string;
          team_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          team_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          team_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_team_members_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'nova_team_challenge_leaderboard';
            referencedColumns: ['team_id'];
          },
          {
            foreignKeyName: 'nova_team_members_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'nova_team_leaderboard';
            referencedColumns: ['team_id'];
          },
          {
            foreignKeyName: 'nova_team_members_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'nova_teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_team_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'nova_team_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'nova_team_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_team_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      nova_teams: {
        Row: {
          created_at: string;
          description: string | null;
          goals: string | null;
          id: string;
          name: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          goals?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          goals?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [];
      };
      onboarding_progress: {
        Row: {
          completed_at: string | null;
          completed_steps: string[];
          created_at: string;
          current_step: string;
          flow_type: string | null;
          invited_emails: string[] | null;
          language_preference: string | null;
          notifications_enabled: boolean | null;
          profile_completed: boolean;
          team_workspace_id: string | null;
          theme_preference: string | null;
          tour_completed: boolean;
          updated_at: string;
          use_case: string | null;
          user_id: string;
          workspace_avatar_url: string | null;
          workspace_description: string | null;
          workspace_name: string | null;
        };
        Insert: {
          completed_at?: string | null;
          completed_steps?: string[];
          created_at?: string;
          current_step?: string;
          flow_type?: string | null;
          invited_emails?: string[] | null;
          language_preference?: string | null;
          notifications_enabled?: boolean | null;
          profile_completed?: boolean;
          team_workspace_id?: string | null;
          theme_preference?: string | null;
          tour_completed?: boolean;
          updated_at?: string;
          use_case?: string | null;
          user_id: string;
          workspace_avatar_url?: string | null;
          workspace_description?: string | null;
          workspace_name?: string | null;
        };
        Update: {
          completed_at?: string | null;
          completed_steps?: string[];
          created_at?: string;
          current_step?: string;
          flow_type?: string | null;
          invited_emails?: string[] | null;
          language_preference?: string | null;
          notifications_enabled?: boolean | null;
          profile_completed?: boolean;
          team_workspace_id?: string | null;
          theme_preference?: string | null;
          tour_completed?: boolean;
          updated_at?: string;
          use_case?: string | null;
          user_id?: string;
          workspace_avatar_url?: string | null;
          workspace_description?: string | null;
          workspace_name?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'onboarding_progress_team_workspace_id_fkey';
            columns: ['team_workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'onboarding_progress_team_workspace_id_fkey';
            columns: ['team_workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'onboarding_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'onboarding_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'onboarding_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'onboarding_progress_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      payroll_run_items: {
        Row: {
          adjustments: Json | null;
          base_pay: number | null;
          benefits_total: number | null;
          bonuses_total: number | null;
          company_deductions: Json | null;
          contract_id: string | null;
          created_at: string | null;
          deductions_total: number | null;
          employee_deductions: Json | null;
          gross_pay: number | null;
          hourly_pay: number | null;
          hourly_rate: number | null;
          id: string;
          insurance_salary: number | null;
          net_pay: number | null;
          notes: string | null;
          overtime_hours: number | null;
          overtime_pay: number | null;
          regular_hours: number | null;
          run_id: string;
          updated_at: string | null;
          user_id: string;
          ws_id: string;
        };
        Insert: {
          adjustments?: Json | null;
          base_pay?: number | null;
          benefits_total?: number | null;
          bonuses_total?: number | null;
          company_deductions?: Json | null;
          contract_id?: string | null;
          created_at?: string | null;
          deductions_total?: number | null;
          employee_deductions?: Json | null;
          gross_pay?: number | null;
          hourly_pay?: number | null;
          hourly_rate?: number | null;
          id?: string;
          insurance_salary?: number | null;
          net_pay?: number | null;
          notes?: string | null;
          overtime_hours?: number | null;
          overtime_pay?: number | null;
          regular_hours?: number | null;
          run_id: string;
          updated_at?: string | null;
          user_id: string;
          ws_id: string;
        };
        Update: {
          adjustments?: Json | null;
          base_pay?: number | null;
          benefits_total?: number | null;
          bonuses_total?: number | null;
          company_deductions?: Json | null;
          contract_id?: string | null;
          created_at?: string | null;
          deductions_total?: number | null;
          employee_deductions?: Json | null;
          gross_pay?: number | null;
          hourly_pay?: number | null;
          hourly_rate?: number | null;
          id?: string;
          insurance_salary?: number | null;
          net_pay?: number | null;
          notes?: string | null;
          overtime_hours?: number | null;
          overtime_pay?: number | null;
          regular_hours?: number | null;
          run_id?: string;
          updated_at?: string | null;
          user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payroll_run_items_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'workforce_contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_run_items_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'payroll_runs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_run_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_run_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_run_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'payroll_run_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_run_items_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_run_items_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_run_items_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      payroll_runs: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string | null;
          created_by: string | null;
          currency: string;
          finalized_at: string | null;
          finalized_by: string | null;
          id: string;
          name: string;
          notes: string | null;
          period_end: string;
          period_start: string;
          status: Database['public']['Enums']['payroll_run_status'];
          total_deductions: number | null;
          total_gross_amount: number | null;
          total_net_amount: number | null;
          ws_id: string;
        };
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          currency?: string;
          finalized_at?: string | null;
          finalized_by?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          period_end: string;
          period_start: string;
          status?: Database['public']['Enums']['payroll_run_status'];
          total_deductions?: number | null;
          total_gross_amount?: number | null;
          total_net_amount?: number | null;
          ws_id: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          currency?: string;
          finalized_at?: string | null;
          finalized_by?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          period_end?: string;
          period_start?: string;
          status?: Database['public']['Enums']['payroll_run_status'];
          total_deductions?: number | null;
          total_gross_amount?: number | null;
          total_net_amount?: number | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'payroll_runs_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'payroll_runs_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'payroll_runs_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_runs_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_runs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'payroll_runs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'payroll_runs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_runs_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_runs_finalized_by_fkey';
            columns: ['finalized_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'payroll_runs_finalized_by_fkey';
            columns: ['finalized_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'payroll_runs_finalized_by_fkey';
            columns: ['finalized_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_runs_finalized_by_fkey';
            columns: ['finalized_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_runs_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'payroll_runs_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      personal_notes: {
        Row: {
          content: string | null;
          created_at: string | null;
          owner_id: string;
          user_id: string;
        };
        Insert: {
          content?: string | null;
          created_at?: string | null;
          owner_id: string;
          user_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string | null;
          owner_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'personal_notes_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'personal_notes_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'personal_notes_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_notes_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_notes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'personal_notes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'personal_notes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'personal_notes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      platform_email_roles: {
        Row: {
          allow_challenge_management: boolean;
          allow_manage_all_challenges: boolean;
          allow_role_management: boolean;
          created_at: string;
          email: string;
          enabled: boolean;
        };
        Insert: {
          allow_challenge_management?: boolean;
          allow_manage_all_challenges?: boolean;
          allow_role_management?: boolean;
          created_at?: string;
          email: string;
          enabled: boolean;
        };
        Update: {
          allow_challenge_management?: boolean;
          allow_manage_all_challenges?: boolean;
          allow_role_management?: boolean;
          created_at?: string;
          email?: string;
          enabled?: boolean;
        };
        Relationships: [];
      };
      platform_user_roles: {
        Row: {
          allow_challenge_management: boolean;
          allow_discord_integrations: boolean;
          allow_manage_all_challenges: boolean;
          allow_role_management: boolean;
          allow_workspace_creation: boolean;
          created_at: string;
          enabled: boolean;
          user_id: string;
        };
        Insert: {
          allow_challenge_management?: boolean;
          allow_discord_integrations?: boolean;
          allow_manage_all_challenges?: boolean;
          allow_role_management?: boolean;
          allow_workspace_creation?: boolean;
          created_at?: string;
          enabled?: boolean;
          user_id: string;
        };
        Update: {
          allow_challenge_management?: boolean;
          allow_discord_integrations?: boolean;
          allow_manage_all_challenges?: boolean;
          allow_role_management?: boolean;
          allow_workspace_creation?: boolean;
          created_at?: string;
          enabled?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'platform_user_roles_user_id_fkey1';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'platform_user_roles_user_id_fkey1';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'platform_user_roles_user_id_fkey1';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'platform_user_roles_user_id_fkey1';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      poll_guest_permissions: {
        Row: {
          can_vote: boolean;
          created_at: string;
          delete_poll: boolean;
          poll_id: string;
          read_poll: boolean;
          update_poll: boolean;
        };
        Insert: {
          can_vote?: boolean;
          created_at?: string;
          delete_poll?: boolean;
          poll_id: string;
          read_poll?: boolean;
          update_poll?: boolean;
        };
        Update: {
          can_vote?: boolean;
          created_at?: string;
          delete_poll?: boolean;
          poll_id?: string;
          read_poll?: boolean;
          update_poll?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'poll_guest_permissions_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: true;
            referencedRelation: 'polls';
            referencedColumns: ['id'];
          },
        ];
      };
      poll_guest_votes: {
        Row: {
          created_at: string;
          guest_id: string;
          id: string;
          option_id: string;
        };
        Insert: {
          created_at?: string;
          guest_id: string;
          id?: string;
          option_id: string;
        };
        Update: {
          created_at?: string;
          guest_id?: string;
          id?: string;
          option_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'guest_poll_votes_guest_id_fkey';
            columns: ['guest_id'];
            isOneToOne: false;
            referencedRelation: 'meet_together_guests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'guest_poll_votes_option_id_fkey';
            columns: ['option_id'];
            isOneToOne: false;
            referencedRelation: 'poll_options';
            referencedColumns: ['id'];
          },
        ];
      };
      poll_options: {
        Row: {
          created_at: string;
          id: string;
          poll_id: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          poll_id: string;
          value?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          poll_id?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'poll_option_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'polls';
            referencedColumns: ['id'];
          },
        ];
      };
      poll_user_permissions: {
        Row: {
          can_vote: boolean;
          created_at: string;
          delete_poll: boolean;
          poll_id: string;
          read_poll: boolean;
          update_poll: boolean;
          user_id: string;
        };
        Insert: {
          can_vote?: boolean;
          created_at?: string;
          delete_poll?: boolean;
          poll_id: string;
          read_poll?: boolean;
          update_poll?: boolean;
          user_id: string;
        };
        Update: {
          can_vote?: boolean;
          created_at?: string;
          delete_poll?: boolean;
          poll_id?: string;
          read_poll?: boolean;
          update_poll?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'poll_user_permissions_poll_id_fkey';
            columns: ['poll_id'];
            isOneToOne: false;
            referencedRelation: 'polls';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'poll_user_permissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'poll_user_permissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'poll_user_permissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'poll_user_permissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      poll_user_votes: {
        Row: {
          created_at: string;
          id: string;
          option_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          option_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          option_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'users_poll_votes_option_id_fkey';
            columns: ['option_id'];
            isOneToOne: false;
            referencedRelation: 'poll_options';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'users_poll_votes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'users_poll_votes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'users_poll_votes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'users_poll_votes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      polls: {
        Row: {
          allow_anonymous_updates: boolean;
          created_at: string;
          creator_id: string;
          id: string;
          name: string;
          plan_id: string | null;
          ws_id: string | null;
        };
        Insert: {
          allow_anonymous_updates?: boolean;
          created_at?: string;
          creator_id: string;
          id?: string;
          name?: string;
          plan_id?: string | null;
          ws_id?: string | null;
        };
        Update: {
          allow_anonymous_updates?: boolean;
          created_at?: string;
          creator_id?: string;
          id?: string;
          name?: string;
          plan_id?: string | null;
          ws_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'polls_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'polls_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'polls_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'polls_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'polls_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'meet_together_plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'polls_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'polls_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      product_categories: {
        Row: {
          created_at: string | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_categories_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_categories_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      product_stock_changes: {
        Row: {
          amount: number;
          beneficiary_id: string | null;
          created_at: string;
          creator_id: string;
          id: string;
          product_id: string;
          unit_id: string;
          warehouse_id: string;
        };
        Insert: {
          amount: number;
          beneficiary_id?: string | null;
          created_at?: string;
          creator_id: string;
          id?: string;
          product_id: string;
          unit_id: string;
          warehouse_id: string;
        };
        Update: {
          amount?: number;
          beneficiary_id?: string | null;
          created_at?: string;
          creator_id?: string;
          id?: string;
          product_id?: string;
          unit_id?: string;
          warehouse_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'product_stock_changes_beneficiary_id_fkey';
            columns: ['beneficiary_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_stock_changes_beneficiary_id_fkey';
            columns: ['beneficiary_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_stock_changes_beneficiary_id_fkey';
            columns: ['beneficiary_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'product_stock_changes_beneficiary_id_fkey';
            columns: ['beneficiary_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_stock_changes_beneficiary_id_fkey';
            columns: ['beneficiary_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_stock_changes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_stock_changes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_stock_changes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'product_stock_changes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_stock_changes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_stock_changes_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_stock_changes_unit_id_fkey';
            columns: ['unit_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_units';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'product_stock_changes_warehouse_id_fkey';
            columns: ['warehouse_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_warehouses';
            referencedColumns: ['id'];
          },
        ];
      };
      quiz_options: {
        Row: {
          created_at: string;
          explanation: string | null;
          id: string;
          is_correct: boolean;
          points: number | null;
          quiz_id: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          explanation?: string | null;
          id?: string;
          is_correct: boolean;
          points?: number | null;
          quiz_id: string;
          value: string;
        };
        Update: {
          created_at?: string;
          explanation?: string | null;
          id?: string;
          is_correct?: boolean;
          points?: number | null;
          quiz_id?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quiz_options_quiz_id_fkey';
            columns: ['quiz_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_quizzes';
            referencedColumns: ['id'];
          },
        ];
      };
      quiz_set_quizzes: {
        Row: {
          created_at: string;
          quiz_id: string;
          set_id: string;
        };
        Insert: {
          created_at?: string;
          quiz_id: string;
          set_id: string;
        };
        Update: {
          created_at?: string;
          quiz_id?: string;
          set_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'quiz_set_quizzes_quiz_id_fkey';
            columns: ['quiz_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_quizzes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'quiz_set_quizzes_set_id_fkey';
            columns: ['set_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_quiz_sets';
            referencedColumns: ['id'];
          },
        ];
      };
      realtime_log_aggregations: {
        Row: {
          channel_id: string | null;
          created_at: string;
          error_count: number;
          id: string;
          kind: string;
          sample_messages: string[] | null;
          time_bucket: string;
          total_count: number;
          user_id: string | null;
          ws_id: string;
        };
        Insert: {
          channel_id?: string | null;
          created_at?: string;
          error_count?: number;
          id?: string;
          kind: string;
          sample_messages?: string[] | null;
          time_bucket: string;
          total_count?: number;
          user_id?: string | null;
          ws_id: string;
        };
        Update: {
          channel_id?: string | null;
          created_at?: string;
          error_count?: number;
          id?: string;
          kind?: string;
          sample_messages?: string[] | null;
          time_bucket?: string;
          total_count?: number;
          user_id?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'realtime_log_aggregations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'realtime_log_aggregations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'realtime_log_aggregations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'realtime_log_aggregations_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'realtime_log_aggregations_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'realtime_log_aggregations_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      recording_sessions: {
        Row: {
          created_at: string;
          id: string;
          meeting_id: string;
          status: Database['public']['Enums']['recording_status'];
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          meeting_id: string;
          status?: Database['public']['Enums']['recording_status'];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          meeting_id?: string;
          status?: Database['public']['Enums']['recording_status'];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recording_sessions_meeting_id_fkey';
            columns: ['meeting_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_meetings';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recording_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'recording_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'recording_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recording_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      recording_transcripts: {
        Row: {
          created_at: string;
          duration_in_seconds: number;
          id: string;
          language: string;
          segments: Json | null;
          session_id: string;
          text: string;
        };
        Insert: {
          created_at?: string;
          duration_in_seconds?: number;
          id?: string;
          language?: string;
          segments?: Json | null;
          session_id: string;
          text: string;
        };
        Update: {
          created_at?: string;
          duration_in_seconds?: number;
          id?: string;
          language?: string;
          segments?: Json | null;
          session_id?: string;
          text?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recording_transcripts_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: true;
            referencedRelation: 'recording_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      recurring_transactions: {
        Row: {
          amount: number;
          category_id: string | null;
          created_at: string | null;
          description: string | null;
          end_date: string | null;
          frequency: Database['public']['Enums']['recurring_frequency'];
          id: string;
          is_active: boolean;
          last_occurrence: string | null;
          name: string;
          next_occurrence: string;
          start_date: string;
          updated_at: string | null;
          wallet_id: string;
          ws_id: string;
        };
        Insert: {
          amount: number;
          category_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          frequency?: Database['public']['Enums']['recurring_frequency'];
          id?: string;
          is_active?: boolean;
          last_occurrence?: string | null;
          name: string;
          next_occurrence: string;
          start_date: string;
          updated_at?: string | null;
          wallet_id: string;
          ws_id: string;
        };
        Update: {
          amount?: number;
          category_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          end_date?: string | null;
          frequency?: Database['public']['Enums']['recurring_frequency'];
          id?: string;
          is_active?: boolean;
          last_occurrence?: string | null;
          name?: string;
          next_occurrence?: string;
          start_date?: string;
          updated_at?: string | null;
          wallet_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'recurring_transactions_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'transaction_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recurring_transactions_wallet_id_fkey';
            columns: ['wallet_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_wallets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recurring_transactions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'recurring_transactions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      sent_emails: {
        Row: {
          content: string;
          created_at: string;
          email: string;
          id: string;
          post_id: string | null;
          receiver_id: string;
          sender_id: string;
          source_email: string;
          source_name: string;
          subject: string;
          ws_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          email: string;
          id?: string;
          post_id?: string | null;
          receiver_id: string;
          sender_id: string;
          source_email: string;
          source_name: string;
          subject: string;
          ws_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          email?: string;
          id?: string;
          post_id?: string | null;
          receiver_id?: string;
          sender_id?: string;
          source_email?: string;
          source_name?: string;
          subject?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'sent_emails_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['post_id_full'];
          },
          {
            foreignKeyName: 'sent_emails_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'user_group_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sent_emails_receiver_id_fkey';
            columns: ['receiver_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sent_emails_receiver_id_fkey';
            columns: ['receiver_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sent_emails_receiver_id_fkey';
            columns: ['receiver_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'sent_emails_receiver_id_fkey';
            columns: ['receiver_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sent_emails_receiver_id_fkey';
            columns: ['receiver_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sent_emails_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'sent_emails_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'sent_emails_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sent_emails_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sent_emails_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'sent_emails_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      shortened_links: {
        Row: {
          created_at: string;
          creator_id: string;
          domain: string;
          id: string;
          link: string;
          password_hash: string | null;
          password_hint: string | null;
          slug: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          creator_id: string;
          domain: string;
          id?: string;
          link: string;
          password_hash?: string | null;
          password_hint?: string | null;
          slug: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          domain?: string;
          id?: string;
          link?: string;
          password_hash?: string | null;
          password_hint?: string | null;
          slug?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shortened_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'shortened_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'shortened_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shortened_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shortened_links_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shortened_links_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      support_inquiries: {
        Row: {
          created_at: string;
          creator_id: string | null;
          email: string;
          id: string;
          images: string[] | null;
          is_read: boolean;
          is_resolved: boolean;
          message: string;
          name: string;
          product: Database['public']['Enums']['product'];
          subject: string;
          type: Database['public']['Enums']['support_type'];
        };
        Insert: {
          created_at?: string;
          creator_id?: string | null;
          email: string;
          id?: string;
          images?: string[] | null;
          is_read?: boolean;
          is_resolved?: boolean;
          message: string;
          name: string;
          product?: Database['public']['Enums']['product'];
          subject: string;
          type?: Database['public']['Enums']['support_type'];
        };
        Update: {
          created_at?: string;
          creator_id?: string | null;
          email?: string;
          id?: string;
          images?: string[] | null;
          is_read?: boolean;
          is_resolved?: boolean;
          message?: string;
          name?: string;
          product?: Database['public']['Enums']['product'];
          subject?: string;
          type?: Database['public']['Enums']['support_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'fk_support_inquiries_creator_id';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'fk_support_inquiries_creator_id';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'fk_support_inquiries_creator_id';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_support_inquiries_creator_id';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_assignees: {
        Row: {
          created_at: string | null;
          task_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          task_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_assignees_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_assignees_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_assignees_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_assignees_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_assignees_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_board_status_templates: {
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          is_default: boolean | null;
          name: string;
          statuses: Json;
          updated_at: string | null;
        };
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_default?: boolean | null;
          name: string;
          statuses: Json;
          updated_at?: string | null;
        };
        Update: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_default?: boolean | null;
          name?: string;
          statuses?: Json;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      task_calendar_events: {
        Row: {
          completed: boolean;
          created_at: string | null;
          event_id: string;
          id: string;
          scheduled_minutes: number;
          scheduling_reason: string | null;
          task_id: string;
          updated_at: string | null;
        };
        Insert: {
          completed?: boolean;
          created_at?: string | null;
          event_id: string;
          id?: string;
          scheduled_minutes?: number;
          scheduling_reason?: string | null;
          task_id: string;
          updated_at?: string | null;
        };
        Update: {
          completed?: boolean;
          created_at?: string | null;
          event_id?: string;
          id?: string;
          scheduled_minutes?: number;
          scheduling_reason?: string | null;
          task_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'task_calendar_events_event_id_fkey';
            columns: ['event_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_calendar_events';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_calendar_events_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      task_cycle_tasks: {
        Row: {
          created_at: string | null;
          cycle_id: string;
          task_id: string;
        };
        Insert: {
          created_at?: string | null;
          cycle_id: string;
          task_id: string;
        };
        Update: {
          created_at?: string | null;
          cycle_id?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_cycle_tasks_cycle_id_fkey';
            columns: ['cycle_id'];
            isOneToOne: false;
            referencedRelation: 'task_cycles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_cycle_tasks_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      task_cycles: {
        Row: {
          archived: boolean | null;
          created_at: string | null;
          creator_id: string;
          deleted: boolean | null;
          description: string | null;
          end_date: string | null;
          id: string;
          name: string;
          start_date: string | null;
          status: string | null;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string;
          deleted?: boolean | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          name: string;
          start_date?: string | null;
          status?: string | null;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string;
          deleted?: boolean | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          name?: string;
          start_date?: string | null;
          status?: string | null;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_cycles_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_cycles_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_cycles_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_cycles_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_cycles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_cycles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      task_history: {
        Row: {
          change_type: string;
          changed_at: string;
          changed_by: string | null;
          deleted_at: string | null;
          field_name: string | null;
          id: string;
          metadata: Json | null;
          new_value: Json | null;
          old_value: Json | null;
          task_id: string | null;
        };
        Insert: {
          change_type: string;
          changed_at?: string;
          changed_by?: string | null;
          deleted_at?: string | null;
          field_name?: string | null;
          id?: string;
          metadata?: Json | null;
          new_value?: Json | null;
          old_value?: Json | null;
          task_id?: string | null;
        };
        Update: {
          change_type?: string;
          changed_at?: string;
          changed_by?: string | null;
          deleted_at?: string | null;
          field_name?: string | null;
          id?: string;
          metadata?: Json | null;
          new_value?: Json | null;
          old_value?: Json | null;
          task_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'task_history_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_history_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_history_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_history_changed_by_fkey';
            columns: ['changed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_history_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      task_initiatives: {
        Row: {
          archived: boolean | null;
          created_at: string | null;
          creator_id: string;
          deleted: boolean | null;
          description: string | null;
          id: string;
          name: string;
          status: string | null;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string;
          deleted?: boolean | null;
          description?: string | null;
          id?: string;
          name: string;
          status?: string | null;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string;
          deleted?: boolean | null;
          description?: string | null;
          id?: string;
          name?: string;
          status?: string | null;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_initiatives_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_initiatives_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_initiatives_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_initiatives_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_initiatives_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_initiatives_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      task_labels: {
        Row: {
          label_id: string;
          task_id: string;
        };
        Insert: {
          label_id: string;
          task_id: string;
        };
        Update: {
          label_id?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_labels_label_id_fkey';
            columns: ['label_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_task_labels';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_labels_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      task_lists: {
        Row: {
          archived: boolean | null;
          board_id: string;
          color: string | null;
          created_at: string | null;
          creator_id: string | null;
          deleted: boolean | null;
          id: string;
          name: string | null;
          position: number | null;
          status: Database['public']['Enums']['task_board_status'] | null;
        };
        Insert: {
          archived?: boolean | null;
          board_id: string;
          color?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
          position?: number | null;
          status?: Database['public']['Enums']['task_board_status'] | null;
        };
        Update: {
          archived?: boolean | null;
          board_id?: string;
          color?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
          position?: number | null;
          status?: Database['public']['Enums']['task_board_status'] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'task_lists_board_id_fkey';
            columns: ['board_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_boards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_lists_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_lists_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_lists_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_lists_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_project_initiatives: {
        Row: {
          created_at: string | null;
          initiative_id: string;
          project_id: string;
        };
        Insert: {
          created_at?: string | null;
          initiative_id: string;
          project_id: string;
        };
        Update: {
          created_at?: string | null;
          initiative_id?: string;
          project_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_project_initiatives_initiative_id_fkey';
            columns: ['initiative_id'];
            isOneToOne: false;
            referencedRelation: 'task_initiatives';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_project_initiatives_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'task_projects';
            referencedColumns: ['id'];
          },
        ];
      };
      task_project_tasks: {
        Row: {
          created_at: string | null;
          project_id: string;
          task_id: string;
        };
        Insert: {
          created_at?: string | null;
          project_id: string;
          task_id: string;
        };
        Update: {
          created_at?: string | null;
          project_id?: string;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_project_tasks_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'task_projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_project_tasks_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      task_project_update_attachments: {
        Row: {
          created_at: string;
          deleted_at: string | null;
          file_name: string;
          file_path: string;
          file_size: number;
          id: string;
          mime_type: string;
          update_id: string;
          uploaded_by: string;
        };
        Insert: {
          created_at?: string;
          deleted_at?: string | null;
          file_name: string;
          file_path: string;
          file_size: number;
          id?: string;
          mime_type: string;
          update_id: string;
          uploaded_by: string;
        };
        Update: {
          created_at?: string;
          deleted_at?: string | null;
          file_name?: string;
          file_path?: string;
          file_size?: number;
          id?: string;
          mime_type?: string;
          update_id?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_project_update_attachments_update_id_fkey';
            columns: ['update_id'];
            isOneToOne: false;
            referencedRelation: 'task_project_updates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_project_update_attachments_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_project_update_attachments_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_project_update_attachments_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_project_update_attachments_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_project_update_comments: {
        Row: {
          content: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          parent_id: string | null;
          update_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          parent_id?: string | null;
          update_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          parent_id?: string | null;
          update_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_project_update_comments_parent_id_fkey';
            columns: ['parent_id'];
            isOneToOne: false;
            referencedRelation: 'task_project_update_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_project_update_comments_update_id_fkey';
            columns: ['update_id'];
            isOneToOne: false;
            referencedRelation: 'task_project_updates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_project_update_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_project_update_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_project_update_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_project_update_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_project_update_reactions: {
        Row: {
          created_at: string;
          emoji: string;
          id: string;
          update_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          emoji: string;
          id?: string;
          update_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          emoji?: string;
          id?: string;
          update_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_project_update_reactions_update_id_fkey';
            columns: ['update_id'];
            isOneToOne: false;
            referencedRelation: 'task_project_updates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_project_update_reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_project_update_reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_project_update_reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_project_update_reactions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_project_updates: {
        Row: {
          content: string;
          created_at: string;
          creator_id: string;
          deleted_at: string | null;
          id: string;
          project_id: string;
          updated_at: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          creator_id: string;
          deleted_at?: string | null;
          id?: string;
          project_id: string;
          updated_at?: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          creator_id?: string;
          deleted_at?: string | null;
          id?: string;
          project_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_project_updates_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_project_updates_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_project_updates_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_project_updates_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_project_updates_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'task_projects';
            referencedColumns: ['id'];
          },
        ];
      };
      task_projects: {
        Row: {
          archived: boolean | null;
          created_at: string | null;
          creator_id: string;
          deleted: boolean | null;
          description: string | null;
          description_yjs_state: string | null;
          end_date: string | null;
          health_status: string | null;
          id: string;
          lead_id: string | null;
          name: string;
          priority: Database['public']['Enums']['task_priority'] | null;
          start_date: string | null;
          status: string | null;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string;
          deleted?: boolean | null;
          description?: string | null;
          description_yjs_state?: string | null;
          end_date?: string | null;
          health_status?: string | null;
          id?: string;
          lead_id?: string | null;
          name: string;
          priority?: Database['public']['Enums']['task_priority'] | null;
          start_date?: string | null;
          status?: string | null;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string;
          deleted?: boolean | null;
          description?: string | null;
          description_yjs_state?: string | null;
          end_date?: string | null;
          health_status?: string | null;
          id?: string;
          lead_id?: string | null;
          name?: string;
          priority?: Database['public']['Enums']['task_priority'] | null;
          start_date?: string | null;
          status?: string | null;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_projects_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_projects_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_projects_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_projects_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_projects_lead_id_fkey';
            columns: ['lead_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_projects_lead_id_fkey';
            columns: ['lead_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_projects_lead_id_fkey';
            columns: ['lead_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_projects_lead_id_fkey';
            columns: ['lead_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_projects_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_projects_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      task_relationships: {
        Row: {
          created_at: string;
          created_by: string | null;
          id: string;
          source_task_id: string;
          target_task_id: string;
          type: Database['public']['Enums']['task_relationship_type'];
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          source_task_id: string;
          target_task_id: string;
          type: Database['public']['Enums']['task_relationship_type'];
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          id?: string;
          source_task_id?: string;
          target_task_id?: string;
          type?: Database['public']['Enums']['task_relationship_type'];
        };
        Relationships: [
          {
            foreignKeyName: 'task_relationships_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_relationships_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_relationships_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_relationships_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_relationships_source_task_id_fkey';
            columns: ['source_task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_relationships_target_task_id_fkey';
            columns: ['target_task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      task_reminder_sent: {
        Row: {
          id: string;
          notification_id: string | null;
          reminder_interval: string;
          sent_at: string;
          task_id: string;
          user_id: string;
        };
        Insert: {
          id?: string;
          notification_id?: string | null;
          reminder_interval: string;
          sent_at?: string;
          task_id: string;
          user_id: string;
        };
        Update: {
          id?: string;
          notification_id?: string | null;
          reminder_interval?: string;
          sent_at?: string;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_reminder_sent_notification_id_fkey';
            columns: ['notification_id'];
            isOneToOne: false;
            referencedRelation: 'notifications';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_reminder_sent_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_reminder_sent_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_reminder_sent_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_reminder_sent_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_reminder_sent_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_share_link_uses: {
        Row: {
          accessed_at: string;
          id: string;
          share_link_id: string;
          user_id: string;
        };
        Insert: {
          accessed_at?: string;
          id?: string;
          share_link_id: string;
          user_id: string;
        };
        Update: {
          accessed_at?: string;
          id?: string;
          share_link_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_share_link_uses_share_link_id_fkey';
            columns: ['share_link_id'];
            isOneToOne: false;
            referencedRelation: 'task_share_links';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_share_link_uses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_share_link_uses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_share_link_uses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_share_link_uses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_share_links: {
        Row: {
          code: string;
          created_at: string;
          created_by_user_id: string;
          id: string;
          permission: Database['public']['Enums']['task_share_permission'];
          public_access: Database['public']['Enums']['task_share_public_access'];
          requires_invite: boolean;
          task_id: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          created_by_user_id: string;
          id?: string;
          permission?: Database['public']['Enums']['task_share_permission'];
          public_access?: Database['public']['Enums']['task_share_public_access'];
          requires_invite?: boolean;
          task_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          created_by_user_id?: string;
          id?: string;
          permission?: Database['public']['Enums']['task_share_permission'];
          public_access?: Database['public']['Enums']['task_share_public_access'];
          requires_invite?: boolean;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_share_links_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_share_links_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_share_links_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_share_links_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_share_links_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: true;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      task_shares: {
        Row: {
          created_at: string;
          id: string;
          permission: Database['public']['Enums']['task_share_permission'];
          shared_by_user_id: string;
          shared_with_email: string | null;
          shared_with_user_id: string | null;
          task_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          permission?: Database['public']['Enums']['task_share_permission'];
          shared_by_user_id: string;
          shared_with_email?: string | null;
          shared_with_user_id?: string | null;
          task_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          permission?: Database['public']['Enums']['task_share_permission'];
          shared_by_user_id?: string;
          shared_with_email?: string | null;
          shared_with_user_id?: string | null;
          task_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_shares_shared_by_user_id_fkey';
            columns: ['shared_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_shares_shared_by_user_id_fkey';
            columns: ['shared_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_shares_shared_by_user_id_fkey';
            columns: ['shared_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_shares_shared_by_user_id_fkey';
            columns: ['shared_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_shares_shared_with_user_id_fkey';
            columns: ['shared_with_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_shares_shared_with_user_id_fkey';
            columns: ['shared_with_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_shares_shared_with_user_id_fkey';
            columns: ['shared_with_user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_shares_shared_with_user_id_fkey';
            columns: ['shared_with_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_shares_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
        ];
      };
      task_user_scheduling_settings: {
        Row: {
          auto_schedule: boolean;
          calendar_hours: Database['public']['Enums']['calendar_hours'] | null;
          created_at: string;
          is_splittable: boolean;
          max_split_duration_minutes: number | null;
          min_split_duration_minutes: number | null;
          task_id: string;
          total_duration: number | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          auto_schedule?: boolean;
          calendar_hours?: Database['public']['Enums']['calendar_hours'] | null;
          created_at?: string;
          is_splittable?: boolean;
          max_split_duration_minutes?: number | null;
          min_split_duration_minutes?: number | null;
          task_id: string;
          total_duration?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          auto_schedule?: boolean;
          calendar_hours?: Database['public']['Enums']['calendar_hours'] | null;
          created_at?: string;
          is_splittable?: boolean;
          max_split_duration_minutes?: number | null;
          min_split_duration_minutes?: number | null;
          task_id?: string;
          total_duration?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_user_scheduling_settings_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_user_scheduling_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_user_scheduling_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_user_scheduling_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_user_scheduling_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      task_watchers: {
        Row: {
          created_at: string;
          id: string;
          task_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          task_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          task_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'task_watchers_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_watchers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_watchers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'task_watchers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'task_watchers_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      tasks: {
        Row: {
          board_id: string | null;
          closed_at: string | null;
          completed: boolean | null;
          completed_at: string | null;
          created_at: string | null;
          creator_id: string | null;
          deleted_at: string | null;
          description: string | null;
          description_yjs_state: number[] | null;
          display_number: number | null;
          embedding: string | null;
          end_date: string | null;
          estimation_points: number | null;
          fts: unknown;
          id: string;
          list_id: string | null;
          name: string;
          priority: Database['public']['Enums']['task_priority'] | null;
          sort_key: number | null;
          start_date: string | null;
        };
        Insert: {
          board_id?: string | null;
          closed_at?: string | null;
          completed?: boolean | null;
          completed_at?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          description_yjs_state?: number[] | null;
          display_number?: number | null;
          embedding?: string | null;
          end_date?: string | null;
          estimation_points?: number | null;
          fts?: unknown;
          id?: string;
          list_id?: string | null;
          name: string;
          priority?: Database['public']['Enums']['task_priority'] | null;
          sort_key?: number | null;
          start_date?: string | null;
        };
        Update: {
          board_id?: string | null;
          closed_at?: string | null;
          completed?: boolean | null;
          completed_at?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          description_yjs_state?: number[] | null;
          display_number?: number | null;
          embedding?: string | null;
          end_date?: string | null;
          estimation_points?: number | null;
          fts?: unknown;
          id?: string;
          list_id?: string | null;
          name?: string;
          priority?: Database['public']['Enums']['task_priority'] | null;
          sort_key?: number | null;
          start_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_tasks_board_id';
            columns: ['board_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_boards';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tasks_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tasks_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tasks_list_id_fkey';
            columns: ['list_id'];
            isOneToOne: false;
            referencedRelation: 'task_lists';
            referencedColumns: ['id'];
          },
        ];
      };
      team_members: {
        Row: {
          team_id: string;
          user_id: string;
        };
        Insert: {
          team_id: string;
          user_id: string;
        };
        Update: {
          team_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_members_project_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_teams';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'project_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'project_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      time_tracking_breaks: {
        Row: {
          break_duration_seconds: number | null;
          break_end: string | null;
          break_start: string;
          break_type_id: string | null;
          break_type_name: string | null;
          created_at: string | null;
          created_by: string;
          id: string;
          notes: string | null;
          session_id: string;
          updated_at: string | null;
        };
        Insert: {
          break_duration_seconds?: number | null;
          break_end?: string | null;
          break_start: string;
          break_type_id?: string | null;
          break_type_name?: string | null;
          created_at?: string | null;
          created_by: string;
          id?: string;
          notes?: string | null;
          session_id: string;
          updated_at?: string | null;
        };
        Update: {
          break_duration_seconds?: number | null;
          break_end?: string | null;
          break_start?: string;
          break_type_id?: string | null;
          break_type_name?: string | null;
          created_at?: string | null;
          created_by?: string;
          id?: string;
          notes?: string | null;
          session_id?: string;
          updated_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'time_tracking_breaks_break_type_id_fkey';
            columns: ['break_type_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_break_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_breaks_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_session_analytics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_breaks_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_sessions';
            referencedColumns: ['id'];
          },
        ];
      };
      time_tracking_categories: {
        Row: {
          color: string | null;
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'time_tracking_categories_color_fkey';
            columns: ['color'];
            isOneToOne: false;
            referencedRelation: 'calendar_event_colors';
            referencedColumns: ['value'];
          },
          {
            foreignKeyName: 'time_tracking_categories_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_categories_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      time_tracking_goals: {
        Row: {
          category_id: string | null;
          created_at: string | null;
          daily_goal_minutes: number;
          id: string;
          is_active: boolean | null;
          updated_at: string | null;
          user_id: string;
          weekly_goal_minutes: number | null;
          ws_id: string;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string | null;
          daily_goal_minutes?: number;
          id?: string;
          is_active?: boolean | null;
          updated_at?: string | null;
          user_id: string;
          weekly_goal_minutes?: number | null;
          ws_id: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string | null;
          daily_goal_minutes?: number;
          id?: string;
          is_active?: boolean | null;
          updated_at?: string | null;
          user_id?: string;
          weekly_goal_minutes?: number | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'time_tracking_goals_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_goals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_goals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_goals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_goals_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_goals_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_goals_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      time_tracking_request_activity: {
        Row: {
          action_type: Database['public']['Enums']['time_tracking_request_activity_action'];
          actor_id: string;
          changed_fields: Json | null;
          comment_content: string | null;
          comment_id: string | null;
          created_at: string;
          feedback_reason: string | null;
          id: string;
          metadata: Json | null;
          new_status: string | null;
          previous_status: string | null;
          request_id: string;
        };
        Insert: {
          action_type: Database['public']['Enums']['time_tracking_request_activity_action'];
          actor_id: string;
          changed_fields?: Json | null;
          comment_content?: string | null;
          comment_id?: string | null;
          created_at?: string;
          feedback_reason?: string | null;
          id?: string;
          metadata?: Json | null;
          new_status?: string | null;
          previous_status?: string | null;
          request_id: string;
        };
        Update: {
          action_type?: Database['public']['Enums']['time_tracking_request_activity_action'];
          actor_id?: string;
          changed_fields?: Json | null;
          comment_content?: string | null;
          comment_id?: string | null;
          created_at?: string;
          feedback_reason?: string | null;
          id?: string;
          metadata?: Json | null;
          new_status?: string | null;
          previous_status?: string | null;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'time_tracking_request_activity_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_request_activity_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_request_activity_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_request_activity_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_request_activity_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_request_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_request_activity_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_requests';
            referencedColumns: ['id'];
          },
        ];
      };
      time_tracking_request_comments: {
        Row: {
          content: string;
          created_at: string;
          id: string;
          request_id: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          id?: string;
          request_id: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          id?: string;
          request_id?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'time_tracking_request_comments_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_request_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_request_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_request_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_request_comments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      time_tracking_requests: {
        Row: {
          approval_status: Database['public']['Enums']['time_tracking_request_status'];
          approved_at: string | null;
          approved_by: string | null;
          break_type_id: string | null;
          break_type_name: string | null;
          category_id: string | null;
          created_at: string;
          description: string | null;
          end_time: string;
          id: string;
          images: string[] | null;
          linked_session_id: string | null;
          needs_info_reason: string | null;
          needs_info_requested_at: string | null;
          needs_info_requested_by: string | null;
          rejected_at: string | null;
          rejected_by: string | null;
          rejection_reason: string | null;
          start_time: string;
          task_id: string | null;
          title: string;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          approval_status?: Database['public']['Enums']['time_tracking_request_status'];
          approved_at?: string | null;
          approved_by?: string | null;
          break_type_id?: string | null;
          break_type_name?: string | null;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          end_time: string;
          id: string;
          images?: string[] | null;
          linked_session_id?: string | null;
          needs_info_reason?: string | null;
          needs_info_requested_at?: string | null;
          needs_info_requested_by?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_reason?: string | null;
          start_time: string;
          task_id?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          approval_status?: Database['public']['Enums']['time_tracking_request_status'];
          approved_at?: string | null;
          approved_by?: string | null;
          break_type_id?: string | null;
          break_type_name?: string | null;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
          end_time?: string;
          id?: string;
          images?: string[] | null;
          linked_session_id?: string | null;
          needs_info_reason?: string | null;
          needs_info_requested_at?: string | null;
          needs_info_requested_by?: string | null;
          rejected_at?: string | null;
          rejected_by?: string | null;
          rejection_reason?: string | null;
          start_time?: string;
          task_id?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'time_tracking_requests_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_break_type_id_fkey';
            columns: ['break_type_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_break_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_linked_session_id_fkey';
            columns: ['linked_session_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_session_analytics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_linked_session_id_fkey';
            columns: ['linked_session_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_needs_info_requested_by_fkey';
            columns: ['needs_info_requested_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_needs_info_requested_by_fkey';
            columns: ['needs_info_requested_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_needs_info_requested_by_fkey';
            columns: ['needs_info_requested_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_needs_info_requested_by_fkey';
            columns: ['needs_info_requested_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_rejected_by_fkey';
            columns: ['rejected_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_rejected_by_fkey';
            columns: ['rejected_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_rejected_by_fkey';
            columns: ['rejected_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_rejected_by_fkey';
            columns: ['rejected_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_requests_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      time_tracking_sessions: {
        Row: {
          category_id: string | null;
          created_at: string | null;
          date: string | null;
          description: string | null;
          duration_seconds: number | null;
          end_time: string | null;
          id: string;
          is_running: boolean | null;
          parent_session_id: string | null;
          pending_approval: boolean;
          productivity_score: number | null;
          start_time: string;
          tags: string[] | null;
          task_id: string | null;
          title: string;
          updated_at: string | null;
          user_id: string;
          was_resumed: boolean;
          ws_id: string;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string | null;
          date?: string | null;
          description?: string | null;
          duration_seconds?: number | null;
          end_time?: string | null;
          id?: string;
          is_running?: boolean | null;
          parent_session_id?: string | null;
          pending_approval?: boolean;
          productivity_score?: number | null;
          start_time: string;
          tags?: string[] | null;
          task_id?: string | null;
          title: string;
          updated_at?: string | null;
          user_id: string;
          was_resumed?: boolean;
          ws_id: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string | null;
          date?: string | null;
          description?: string | null;
          duration_seconds?: number | null;
          end_time?: string | null;
          id?: string;
          is_running?: boolean | null;
          parent_session_id?: string | null;
          pending_approval?: boolean;
          productivity_score?: number | null;
          start_time?: string;
          tags?: string[] | null;
          task_id?: string | null;
          title?: string;
          updated_at?: string | null;
          user_id?: string;
          was_resumed?: boolean;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'time_tracking_sessions_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_parent_session_id_fkey';
            columns: ['parent_session_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_session_analytics';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_parent_session_id_fkey';
            columns: ['parent_session_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      timezones: {
        Row: {
          abbr: string;
          created_at: string | null;
          id: string;
          isdst: boolean;
          offset: number;
          text: string;
          utc: string[];
          value: string;
        };
        Insert: {
          abbr: string;
          created_at?: string | null;
          id?: string;
          isdst: boolean;
          offset: number;
          text: string;
          utc: string[];
          value: string;
        };
        Update: {
          abbr?: string;
          created_at?: string | null;
          id?: string;
          isdst?: boolean;
          offset?: number;
          text?: string;
          utc?: string[];
          value?: string;
        };
        Relationships: [];
      };
      transaction_categories: {
        Row: {
          color: string | null;
          created_at: string | null;
          icon: string | null;
          id: string;
          is_expense: boolean | null;
          name: string;
          ws_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string | null;
          icon?: string | null;
          id?: string;
          is_expense?: boolean | null;
          name: string;
          ws_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string | null;
          icon?: string | null;
          id?: string;
          is_expense?: boolean | null;
          name?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'transaction_categories_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transaction_categories_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      transaction_tags: {
        Row: {
          color: string;
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          color?: string;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'transaction_tags_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'transaction_tags_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      tuna_accessories: {
        Row: {
          category: Database['public']['Enums']['tuna_accessory_category'];
          code: string;
          created_at: string;
          description: string | null;
          id: string;
          is_premium: boolean;
          name: string;
          sort_order: number;
          unlock_condition: Json | null;
        };
        Insert: {
          category: Database['public']['Enums']['tuna_accessory_category'];
          code: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_premium?: boolean;
          name: string;
          sort_order?: number;
          unlock_condition?: Json | null;
        };
        Update: {
          category?: Database['public']['Enums']['tuna_accessory_category'];
          code?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          is_premium?: boolean;
          name?: string;
          sort_order?: number;
          unlock_condition?: Json | null;
        };
        Relationships: [];
      };
      tuna_achievements: {
        Row: {
          category: Database['public']['Enums']['tuna_achievement_category'];
          code: string;
          created_at: string;
          description: string;
          icon: string;
          id: string;
          name: string;
          sort_order: number;
          unlock_condition: Json | null;
          xp_reward: number;
        };
        Insert: {
          category: Database['public']['Enums']['tuna_achievement_category'];
          code: string;
          created_at?: string;
          description: string;
          icon: string;
          id?: string;
          name: string;
          sort_order?: number;
          unlock_condition?: Json | null;
          xp_reward?: number;
        };
        Update: {
          category?: Database['public']['Enums']['tuna_achievement_category'];
          code?: string;
          created_at?: string;
          description?: string;
          icon?: string;
          id?: string;
          name?: string;
          sort_order?: number;
          unlock_condition?: Json | null;
          xp_reward?: number;
        };
        Relationships: [];
      };
      tuna_daily_stats: {
        Row: {
          created_at: string;
          date: string;
          focus_minutes: number;
          focus_sessions_completed: number;
          id: string;
          interactions: number;
          streak_day: number;
          tasks_completed: number;
          updated_at: string;
          user_id: string;
          xp_earned: number;
        };
        Insert: {
          created_at?: string;
          date?: string;
          focus_minutes?: number;
          focus_sessions_completed?: number;
          id?: string;
          interactions?: number;
          streak_day?: number;
          tasks_completed?: number;
          updated_at?: string;
          user_id: string;
          xp_earned?: number;
        };
        Update: {
          created_at?: string;
          date?: string;
          focus_minutes?: number;
          focus_sessions_completed?: number;
          id?: string;
          interactions?: number;
          streak_day?: number;
          tasks_completed?: number;
          updated_at?: string;
          user_id?: string;
          xp_earned?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tuna_daily_stats_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_daily_stats_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_daily_stats_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tuna_daily_stats_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      tuna_focus_sessions: {
        Row: {
          actual_duration: number | null;
          completed: boolean;
          created_at: string;
          ended_at: string | null;
          goal: string | null;
          id: string;
          notes: string | null;
          planned_duration: number;
          started_at: string;
          user_id: string;
          xp_earned: number;
        };
        Insert: {
          actual_duration?: number | null;
          completed?: boolean;
          created_at?: string;
          ended_at?: string | null;
          goal?: string | null;
          id?: string;
          notes?: string | null;
          planned_duration: number;
          started_at?: string;
          user_id: string;
          xp_earned?: number;
        };
        Update: {
          actual_duration?: number | null;
          completed?: boolean;
          created_at?: string;
          ended_at?: string | null;
          goal?: string | null;
          id?: string;
          notes?: string | null;
          planned_duration?: number;
          started_at?: string;
          user_id?: string;
          xp_earned?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tuna_focus_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_focus_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_focus_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tuna_focus_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      tuna_memories: {
        Row: {
          category: Database['public']['Enums']['tuna_memory_category'];
          confidence: number;
          created_at: string;
          id: string;
          key: string;
          last_referenced_at: string | null;
          source: string | null;
          updated_at: string;
          user_id: string;
          value: string;
        };
        Insert: {
          category: Database['public']['Enums']['tuna_memory_category'];
          confidence?: number;
          created_at?: string;
          id?: string;
          key: string;
          last_referenced_at?: string | null;
          source?: string | null;
          updated_at?: string;
          user_id: string;
          value: string;
        };
        Update: {
          category?: Database['public']['Enums']['tuna_memory_category'];
          confidence?: number;
          created_at?: string;
          id?: string;
          key?: string;
          last_referenced_at?: string | null;
          source?: string | null;
          updated_at?: string;
          user_id?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tuna_memories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_memories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_memories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tuna_memories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      tuna_pets: {
        Row: {
          created_at: string;
          health: number;
          hunger: number;
          id: string;
          last_fed_at: string;
          last_interaction_at: string;
          level: number;
          mood: Database['public']['Enums']['tuna_mood'];
          name: string;
          streak_days: number;
          total_conversations: number;
          total_focus_minutes: number;
          updated_at: string;
          user_id: string;
          xp: number;
          xp_to_next_level: number;
        };
        Insert: {
          created_at?: string;
          health?: number;
          hunger?: number;
          id?: string;
          last_fed_at?: string;
          last_interaction_at?: string;
          level?: number;
          mood?: Database['public']['Enums']['tuna_mood'];
          name?: string;
          streak_days?: number;
          total_conversations?: number;
          total_focus_minutes?: number;
          updated_at?: string;
          user_id: string;
          xp?: number;
          xp_to_next_level?: number;
        };
        Update: {
          created_at?: string;
          health?: number;
          hunger?: number;
          id?: string;
          last_fed_at?: string;
          last_interaction_at?: string;
          level?: number;
          mood?: Database['public']['Enums']['tuna_mood'];
          name?: string;
          streak_days?: number;
          total_conversations?: number;
          total_focus_minutes?: number;
          updated_at?: string;
          user_id?: string;
          xp?: number;
          xp_to_next_level?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'tuna_pets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_pets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_pets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tuna_pets_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      tuna_user_accessories: {
        Row: {
          accessory_id: string;
          id: string;
          is_equipped: boolean;
          unlocked_at: string;
          user_id: string;
        };
        Insert: {
          accessory_id: string;
          id?: string;
          is_equipped?: boolean;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          accessory_id?: string;
          id?: string;
          is_equipped?: boolean;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tuna_user_accessories_accessory_id_fkey';
            columns: ['accessory_id'];
            isOneToOne: false;
            referencedRelation: 'tuna_accessories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tuna_user_accessories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_user_accessories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_user_accessories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tuna_user_accessories_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      tuna_user_achievements: {
        Row: {
          achievement_id: string;
          id: string;
          unlocked_at: string;
          user_id: string;
        };
        Insert: {
          achievement_id: string;
          id?: string;
          unlocked_at?: string;
          user_id: string;
        };
        Update: {
          achievement_id?: string;
          id?: string;
          unlocked_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'tuna_user_achievements_achievement_id_fkey';
            columns: ['achievement_id'];
            isOneToOne: false;
            referencedRelation: 'tuna_achievements';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tuna_user_achievements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_user_achievements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'tuna_user_achievements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'tuna_user_achievements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_configs: {
        Row: {
          created_at: string;
          id: string;
          updated_at: string;
          user_id: string;
          value: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          updated_at?: string;
          user_id: string;
          value: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          user_id?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_configs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_configs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_configs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_configs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      user_feedbacks: {
        Row: {
          content: string;
          created_at: string;
          creator_id: string | null;
          group_id: string | null;
          id: string;
          require_attention: boolean;
          user_id: string;
        };
        Insert: {
          content: string;
          created_at?: string;
          creator_id?: string | null;
          group_id?: string | null;
          id?: string;
          require_attention?: boolean;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          creator_id?: string | null;
          group_id?: string | null;
          id?: string;
          require_attention?: boolean;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_feedbacks_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_feedbacks_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_feedbacks_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_feedbacks_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_feedbacks_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_feedbacks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_feedbacks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_feedbacks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_feedbacks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_feedbacks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      user_group_attendance: {
        Row: {
          created_at: string;
          date: string;
          group_id: string;
          notes: string;
          status: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          group_id: string;
          notes?: string;
          status: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          group_id?: string;
          notes?: string;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_attendance_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_attendance_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_attendance_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_group_attendance_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_attendance_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      user_group_linked_products: {
        Row: {
          created_at: string;
          group_id: string;
          product_id: string;
          unit_id: string;
          warehouse_id: string | null;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          product_id: string;
          unit_id: string;
          warehouse_id?: string | null;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          product_id?: string;
          unit_id?: string;
          warehouse_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_linked_products_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_linked_products_unit_id_fkey';
            columns: ['unit_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_units';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_linked_products_warehouse_id_fkey';
            columns: ['warehouse_id'];
            isOneToOne: false;
            referencedRelation: 'inventory_warehouses';
            referencedColumns: ['id'];
          },
        ];
      };
      user_group_post_checks: {
        Row: {
          created_at: string;
          email_id: string | null;
          is_completed: boolean;
          notes: string | null;
          post_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          email_id?: string | null;
          is_completed: boolean;
          notes?: string | null;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email_id?: string | null;
          is_completed?: boolean;
          notes?: string | null;
          post_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_group_post_checks_email_id_fkey';
            columns: ['email_id'];
            isOneToOne: true;
            referencedRelation: 'sent_emails';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['post_id_full'];
          },
          {
            foreignKeyName: 'user_group_post_checks_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'user_group_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      user_group_posts: {
        Row: {
          content: string | null;
          created_at: string;
          group_id: string;
          id: string;
          notes: string | null;
          title: string | null;
        };
        Insert: {
          content?: string | null;
          created_at?: string;
          group_id: string;
          id?: string;
          notes?: string | null;
          title?: string | null;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          group_id?: string;
          id?: string;
          notes?: string | null;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_group_posts_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_group_posts_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_group_posts_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'user_group_posts_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_posts_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_posts_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_posts_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
        ];
      };
      user_indicators: {
        Row: {
          created_at: string;
          creator_id: string | null;
          indicator_id: string;
          user_id: string;
          value: number | null;
        };
        Insert: {
          created_at?: string;
          creator_id?: string | null;
          indicator_id: string;
          user_id: string;
          value?: number | null;
        };
        Update: {
          created_at?: string;
          creator_id?: string | null;
          indicator_id?: string;
          user_id?: string;
          value?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_indicators_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_indicators_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_indicators_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_indicators_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_indicators_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_indicators_indicator_id_fkey';
            columns: ['indicator_id'];
            isOneToOne: false;
            referencedRelation: 'healthcare_vitals';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_indicators_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_indicators_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_indicators_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_indicators_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_indicators_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      user_linked_promotions: {
        Row: {
          created_at: string;
          promo_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          promo_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          promo_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_linked_promotions_promo_id_fkey';
            columns: ['promo_id'];
            isOneToOne: false;
            referencedRelation: 'v_user_referral_discounts';
            referencedColumns: ['promo_id'];
          },
          {
            foreignKeyName: 'user_linked_promotions_promo_id_fkey';
            columns: ['promo_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_promotions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_linked_promotions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_linked_promotions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_linked_promotions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_linked_promotions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_linked_promotions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      user_private_details: {
        Row: {
          birthday: string | null;
          default_workspace_id: string | null;
          email: string | null;
          fade_completed_tasks: boolean | null;
          full_name: string | null;
          new_email: string | null;
          task_auto_assign_to_self: boolean | null;
          user_id: string;
        };
        Insert: {
          birthday?: string | null;
          default_workspace_id?: string | null;
          email?: string | null;
          fade_completed_tasks?: boolean | null;
          full_name?: string | null;
          new_email?: string | null;
          task_auto_assign_to_self?: boolean | null;
          user_id: string;
        };
        Update: {
          birthday?: string | null;
          default_workspace_id?: string | null;
          email?: string | null;
          fade_completed_tasks?: boolean | null;
          full_name?: string | null;
          new_email?: string | null;
          task_auto_assign_to_self?: boolean | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_private_details_default_workspace_id_fkey';
            columns: ['default_workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_private_details_default_workspace_id_fkey';
            columns: ['default_workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_private_details_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_private_details_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_private_details_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_private_details_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      users: {
        Row: {
          avatar_url: string | null;
          bio: string | null;
          created_at: string | null;
          deleted: boolean | null;
          display_name: string | null;
          first_day_of_week: string | null;
          handle: string | null;
          id: string;
          services: Database['public']['Enums']['platform_service'][];
          time_format: string | null;
          timezone: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          deleted?: boolean | null;
          display_name?: string | null;
          first_day_of_week?: string | null;
          handle?: string | null;
          id?: string;
          services?: Database['public']['Enums']['platform_service'][];
          time_format?: string | null;
          timezone?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          deleted?: boolean | null;
          display_name?: string | null;
          first_day_of_week?: string | null;
          handle?: string | null;
          id?: string;
          services?: Database['public']['Enums']['platform_service'][];
          time_format?: string | null;
          timezone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'users_handle_fkey';
            columns: ['handle'];
            isOneToOne: true;
            referencedRelation: 'handles';
            referencedColumns: ['value'];
          },
        ];
      };
      vital_group_vitals: {
        Row: {
          created_at: string | null;
          group_id: string;
          vital_id: string;
        };
        Insert: {
          created_at?: string | null;
          group_id: string;
          vital_id: string;
        };
        Update: {
          created_at?: string | null;
          group_id?: string;
          vital_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'vital_group_vitals_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'healthcare_vital_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'vital_group_vitals_vital_id_fkey';
            columns: ['vital_id'];
            isOneToOne: false;
            referencedRelation: 'healthcare_vitals';
            referencedColumns: ['id'];
          },
        ];
      };
      wallet_transaction_tags: {
        Row: {
          created_at: string | null;
          tag_id: string;
          transaction_id: string;
        };
        Insert: {
          created_at?: string | null;
          tag_id: string;
          transaction_id: string;
        };
        Update: {
          created_at?: string | null;
          tag_id?: string;
          transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'wallet_transaction_tags_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'transaction_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transaction_tags_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transaction_tags_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_transactions_secure';
            referencedColumns: ['id'];
          },
        ];
      };
      wallet_transactions: {
        Row: {
          amount: number | null;
          category_id: string | null;
          created_at: string | null;
          creator_id: string | null;
          description: string | null;
          id: string;
          invoice_id: string | null;
          is_amount_confidential: boolean;
          is_category_confidential: boolean;
          is_description_confidential: boolean;
          platform_creator_id: string | null;
          report_opt_in: boolean;
          taken_at: string;
          wallet_id: string;
        };
        Insert: {
          amount?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          description?: string | null;
          id?: string;
          invoice_id?: string | null;
          is_amount_confidential?: boolean;
          is_category_confidential?: boolean;
          is_description_confidential?: boolean;
          platform_creator_id?: string | null;
          report_opt_in?: boolean;
          taken_at?: string;
          wallet_id: string;
        };
        Update: {
          amount?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          description?: string | null;
          id?: string;
          invoice_id?: string | null;
          is_amount_confidential?: boolean;
          is_category_confidential?: boolean;
          is_description_confidential?: boolean;
          platform_creator_id?: string | null;
          report_opt_in?: boolean;
          taken_at?: string;
          wallet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'wallet_transactions_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'transaction_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: true;
            referencedRelation: 'finance_invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_platform_creator_id_fkey';
            columns: ['platform_creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'wallet_transactions_platform_creator_id_fkey';
            columns: ['platform_creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'wallet_transactions_platform_creator_id_fkey';
            columns: ['platform_creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_platform_creator_id_fkey';
            columns: ['platform_creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_wallet_id_fkey';
            columns: ['wallet_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_wallets';
            referencedColumns: ['id'];
          },
        ];
      };
      wallet_types: {
        Row: {
          id: string;
        };
        Insert: {
          id: string;
        };
        Update: {
          id?: string;
        };
        Relationships: [];
      };
      workforce_benefits: {
        Row: {
          amount: number;
          benefit_type: Database['public']['Enums']['workforce_benefit_type'];
          contract_id: string;
          created_at: string | null;
          currency: string;
          effective_from: string;
          effective_until: string | null;
          id: string;
          is_recurring: boolean;
          name: string;
          notes: string | null;
          recurrence_period:
            | Database['public']['Enums']['workforce_payment_frequency']
            | null;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          amount: number;
          benefit_type: Database['public']['Enums']['workforce_benefit_type'];
          contract_id: string;
          created_at?: string | null;
          currency?: string;
          effective_from: string;
          effective_until?: string | null;
          id?: string;
          is_recurring?: boolean;
          name: string;
          notes?: string | null;
          recurrence_period?:
            | Database['public']['Enums']['workforce_payment_frequency']
            | null;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          amount?: number;
          benefit_type?: Database['public']['Enums']['workforce_benefit_type'];
          contract_id?: string;
          created_at?: string | null;
          currency?: string;
          effective_from?: string;
          effective_until?: string | null;
          id?: string;
          is_recurring?: boolean;
          name?: string;
          notes?: string | null;
          recurrence_period?:
            | Database['public']['Enums']['workforce_payment_frequency']
            | null;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workforce_benefits_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'workforce_contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workforce_benefits_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workforce_benefits_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workforce_compensation: {
        Row: {
          base_hourly_rate: number | null;
          base_salary_annual: number | null;
          base_salary_monthly: number | null;
          contract_id: string;
          created_at: string | null;
          currency: string;
          effective_from: string;
          effective_until: string | null;
          id: string;
          insurance_salary: number | null;
          overtime_multiplier_daily: number | null;
          overtime_multiplier_holiday: number | null;
          overtime_multiplier_weekend: number | null;
          overtime_threshold_daily_hours: number | null;
          payment_frequency: Database['public']['Enums']['workforce_payment_frequency'];
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          base_hourly_rate?: number | null;
          base_salary_annual?: number | null;
          base_salary_monthly?: number | null;
          contract_id: string;
          created_at?: string | null;
          currency?: string;
          effective_from: string;
          effective_until?: string | null;
          id?: string;
          insurance_salary?: number | null;
          overtime_multiplier_daily?: number | null;
          overtime_multiplier_holiday?: number | null;
          overtime_multiplier_weekend?: number | null;
          overtime_threshold_daily_hours?: number | null;
          payment_frequency?: Database['public']['Enums']['workforce_payment_frequency'];
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          base_hourly_rate?: number | null;
          base_salary_annual?: number | null;
          base_salary_monthly?: number | null;
          contract_id?: string;
          created_at?: string | null;
          currency?: string;
          effective_from?: string;
          effective_until?: string | null;
          id?: string;
          insurance_salary?: number | null;
          overtime_multiplier_daily?: number | null;
          overtime_multiplier_holiday?: number | null;
          overtime_multiplier_weekend?: number | null;
          overtime_threshold_daily_hours?: number | null;
          payment_frequency?: Database['public']['Enums']['workforce_payment_frequency'];
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workforce_compensation_contract_id_fkey';
            columns: ['contract_id'];
            isOneToOne: false;
            referencedRelation: 'workforce_contracts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workforce_compensation_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workforce_compensation_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workforce_contracts: {
        Row: {
          contract_type: Database['public']['Enums']['workforce_contract_type'];
          created_at: string | null;
          created_by: string | null;
          department: string | null;
          employment_status: Database['public']['Enums']['workforce_employment_status'];
          end_date: string | null;
          file_url: string | null;
          id: string;
          job_title: string | null;
          notes: string | null;
          start_date: string;
          updated_at: string | null;
          user_id: string;
          working_location: string | null;
          ws_id: string;
        };
        Insert: {
          contract_type?: Database['public']['Enums']['workforce_contract_type'];
          created_at?: string | null;
          created_by?: string | null;
          department?: string | null;
          employment_status?: Database['public']['Enums']['workforce_employment_status'];
          end_date?: string | null;
          file_url?: string | null;
          id?: string;
          job_title?: string | null;
          notes?: string | null;
          start_date: string;
          updated_at?: string | null;
          user_id: string;
          working_location?: string | null;
          ws_id: string;
        };
        Update: {
          contract_type?: Database['public']['Enums']['workforce_contract_type'];
          created_at?: string | null;
          created_by?: string | null;
          department?: string | null;
          employment_status?: Database['public']['Enums']['workforce_employment_status'];
          end_date?: string | null;
          file_url?: string | null;
          id?: string;
          job_title?: string | null;
          notes?: string | null;
          start_date?: string;
          updated_at?: string | null;
          user_id?: string;
          working_location?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workforce_contracts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workforce_contracts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workforce_contracts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workforce_contracts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workforce_contracts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workforce_contracts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workforce_contracts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workforce_contracts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workforce_contracts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workforce_contracts_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workforce_contracts_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_ai_executions: {
        Row: {
          api_key_id: string;
          created_at: string;
          finish_reason: string;
          id: string;
          input: string;
          input_tokens: number;
          model_id: string;
          output: string;
          output_tokens: number;
          reasoning_tokens: number;
          system_prompt: string;
          total_tokens: number;
          ws_id: string;
        };
        Insert: {
          api_key_id: string;
          created_at?: string;
          finish_reason: string;
          id?: string;
          input: string;
          input_tokens: number;
          model_id: string;
          output: string;
          output_tokens: number;
          reasoning_tokens: number;
          system_prompt: string;
          total_tokens: number;
          ws_id: string;
        };
        Update: {
          api_key_id?: string;
          created_at?: string;
          finish_reason?: string;
          id?: string;
          input?: string;
          input_tokens?: number;
          model_id?: string;
          output?: string;
          output_tokens?: number;
          reasoning_tokens?: number;
          system_prompt?: string;
          total_tokens?: number;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_ai_executions_api_key_fkey';
            columns: ['api_key_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_api_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_ai_executions_model_id_fkey';
            columns: ['model_id'];
            isOneToOne: false;
            referencedRelation: 'ai_models';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_ai_executions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_ai_executions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_ai_models: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
          url: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string;
          url: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          updated_at?: string;
          url?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_ai_models_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_ai_models_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_ai_prompts: {
        Row: {
          created_at: string;
          creator_id: string | null;
          id: string;
          input: string;
          model: string;
          name: string | null;
          output: string;
          ws_id: string | null;
        };
        Insert: {
          created_at?: string;
          creator_id?: string | null;
          id?: string;
          input: string;
          model: string;
          name?: string | null;
          output: string;
          ws_id?: string | null;
        };
        Update: {
          created_at?: string;
          creator_id?: string | null;
          id?: string;
          input?: string;
          model?: string;
          name?: string | null;
          output?: string;
          ws_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'public_workspace_ai_prompts_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'public_workspace_ai_prompts_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'public_workspace_ai_prompts_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_ai_prompts_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_ai_prompts_model_fkey';
            columns: ['model'];
            isOneToOne: false;
            referencedRelation: 'ai_models';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_ai_prompts_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_ai_prompts_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_api_key_usage_logs: {
        Row: {
          api_key_id: string;
          created_at: string;
          endpoint: string;
          error_message: string | null;
          id: string;
          ip_address: string | null;
          method: string;
          request_params: Json | null;
          response_time_ms: number | null;
          status_code: number;
          user_agent: string | null;
          ws_id: string;
        };
        Insert: {
          api_key_id: string;
          created_at?: string;
          endpoint: string;
          error_message?: string | null;
          id?: string;
          ip_address?: string | null;
          method: string;
          request_params?: Json | null;
          response_time_ms?: number | null;
          status_code: number;
          user_agent?: string | null;
          ws_id: string;
        };
        Update: {
          api_key_id?: string;
          created_at?: string;
          endpoint?: string;
          error_message?: string | null;
          id?: string;
          ip_address?: string | null;
          method?: string;
          request_params?: Json | null;
          response_time_ms?: number | null;
          status_code?: number;
          user_agent?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_api_key_usage_logs_api_key_id_fkey';
            columns: ['api_key_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_api_keys';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_api_key_usage_logs_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_api_key_usage_logs_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_api_keys: {
        Row: {
          created_at: string;
          created_by: string | null;
          description: string | null;
          expires_at: string | null;
          id: string;
          key_hash: string | null;
          key_prefix: string | null;
          last_used_at: string | null;
          name: string;
          role_id: string | null;
          scopes: Database['public']['Enums']['workspace_api_key_scope'][];
          updated_at: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expires_at?: string | null;
          id?: string;
          key_hash?: string | null;
          key_prefix?: string | null;
          last_used_at?: string | null;
          name: string;
          role_id?: string | null;
          scopes?: Database['public']['Enums']['workspace_api_key_scope'][];
          updated_at?: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          description?: string | null;
          expires_at?: string | null;
          id?: string;
          key_hash?: string | null;
          key_prefix?: string | null;
          last_used_at?: string | null;
          name?: string;
          role_id?: string | null;
          scopes?: Database['public']['Enums']['workspace_api_key_scope'][];
          updated_at?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_api_keys_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_api_keys_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_api_keys_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_boards: {
        Row: {
          allow_zero_estimates: boolean;
          archived_at: string | null;
          count_unestimated_issues: boolean;
          created_at: string | null;
          creator_id: string | null;
          deleted_at: string | null;
          estimation_type:
            | Database['public']['Enums']['estimation_type']
            | null;
          extended_estimation: boolean;
          icon: Database['public']['Enums']['workspace_board_icon'] | null;
          id: string;
          name: string | null;
          next_task_number: number;
          template_id: string | null;
          ticket_prefix: string | null;
          ws_id: string;
        };
        Insert: {
          allow_zero_estimates?: boolean;
          archived_at?: string | null;
          count_unestimated_issues?: boolean;
          created_at?: string | null;
          creator_id?: string | null;
          deleted_at?: string | null;
          estimation_type?:
            | Database['public']['Enums']['estimation_type']
            | null;
          extended_estimation?: boolean;
          icon?: Database['public']['Enums']['workspace_board_icon'] | null;
          id?: string;
          name?: string | null;
          next_task_number?: number;
          template_id?: string | null;
          ticket_prefix?: string | null;
          ws_id: string;
        };
        Update: {
          allow_zero_estimates?: boolean;
          archived_at?: string | null;
          count_unestimated_issues?: boolean;
          created_at?: string | null;
          creator_id?: string | null;
          deleted_at?: string | null;
          estimation_type?:
            | Database['public']['Enums']['estimation_type']
            | null;
          extended_estimation?: boolean;
          icon?: Database['public']['Enums']['workspace_board_icon'] | null;
          id?: string;
          name?: string | null;
          next_task_number?: number;
          template_id?: string | null;
          ticket_prefix?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'project_boards_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'project_boards_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'project_boards_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'project_boards_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_boards_template_id_fkey';
            columns: ['template_id'];
            isOneToOne: false;
            referencedRelation: 'task_board_status_templates';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_boards_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_boards_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_break_types: {
        Row: {
          color: string | null;
          created_at: string | null;
          description: string | null;
          icon: string | null;
          id: string;
          is_default: boolean | null;
          name: string;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_default?: boolean | null;
          name: string;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string | null;
          description?: string | null;
          icon?: string | null;
          id?: string;
          is_default?: boolean | null;
          name?: string;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_break_types_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_break_types_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_calendar_categories: {
        Row: {
          color: string;
          created_at: string | null;
          id: string;
          name: string;
          position: number;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string | null;
          id?: string;
          name: string;
          position?: number;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          color?: string;
          created_at?: string | null;
          id?: string;
          name?: string;
          position?: number;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_calendar_categories_color_fkey';
            columns: ['color'];
            isOneToOne: false;
            referencedRelation: 'calendar_event_colors';
            referencedColumns: ['value'];
          },
          {
            foreignKeyName: 'workspace_calendar_categories_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_calendar_categories_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_calendar_events: {
        Row: {
          color: string | null;
          created_at: string | null;
          description: string;
          end_at: string;
          external_calendar_id: string | null;
          external_event_id: string | null;
          google_calendar_id: string | null;
          google_event_id: string | null;
          id: string;
          is_encrypted: boolean;
          location: string | null;
          locked: boolean;
          provider: Database['public']['Enums']['calendar_provider'] | null;
          scheduling_metadata: Json | null;
          scheduling_source:
            | Database['public']['Enums']['calendar_scheduling_source']
            | null;
          source_calendar_id: string | null;
          start_at: string;
          task_id: string | null;
          title: string;
          ws_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string | null;
          description?: string;
          end_at: string;
          external_calendar_id?: string | null;
          external_event_id?: string | null;
          google_calendar_id?: string | null;
          google_event_id?: string | null;
          id?: string;
          is_encrypted?: boolean;
          location?: string | null;
          locked?: boolean;
          provider?: Database['public']['Enums']['calendar_provider'] | null;
          scheduling_metadata?: Json | null;
          scheduling_source?:
            | Database['public']['Enums']['calendar_scheduling_source']
            | null;
          source_calendar_id?: string | null;
          start_at: string;
          task_id?: string | null;
          title?: string;
          ws_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string | null;
          description?: string;
          end_at?: string;
          external_calendar_id?: string | null;
          external_event_id?: string | null;
          google_calendar_id?: string | null;
          google_event_id?: string | null;
          id?: string;
          is_encrypted?: boolean;
          location?: string | null;
          locked?: boolean;
          provider?: Database['public']['Enums']['calendar_provider'] | null;
          scheduling_metadata?: Json | null;
          scheduling_source?:
            | Database['public']['Enums']['calendar_scheduling_source']
            | null;
          source_calendar_id?: string | null;
          start_at?: string;
          task_id?: string | null;
          title?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_calendar_events_color_fkey';
            columns: ['color'];
            isOneToOne: false;
            referencedRelation: 'calendar_event_colors';
            referencedColumns: ['value'];
          },
          {
            foreignKeyName: 'workspace_calendar_events_source_calendar_id_fkey';
            columns: ['source_calendar_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_calendars';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_calendar_events_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_calendar_events_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_calendar_hour_settings: {
        Row: {
          created_at: string;
          data: Json;
          type: Database['public']['Enums']['calendar_hour_type'];
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          data: Json;
          type: Database['public']['Enums']['calendar_hour_type'];
          ws_id: string;
        };
        Update: {
          created_at?: string;
          data?: Json;
          type?: Database['public']['Enums']['calendar_hour_type'];
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_calendar_hour_settings_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_calendar_hour_settings_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_calendar_sync_coordination: {
        Row: {
          created_at: string | null;
          last_upsert: string;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          last_upsert?: string;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          last_upsert?: string;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_calendar_sync_coordination_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_calendar_sync_coordination_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_calendar_sync_log: {
        Row: {
          created_at: string;
          deleted_events: Json | null;
          error_message: string | null;
          event_snapshot_before: Json;
          google_account_email: string | null;
          id: string;
          status: string;
          sync_ended_at: string | null;
          sync_started_at: string;
          triggered_by: string;
          upserted_events: Json | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          deleted_events?: Json | null;
          error_message?: string | null;
          event_snapshot_before: Json;
          google_account_email?: string | null;
          id?: string;
          status: string;
          sync_ended_at?: string | null;
          sync_started_at: string;
          triggered_by: string;
          upserted_events?: Json | null;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          deleted_events?: Json | null;
          error_message?: string | null;
          event_snapshot_before?: Json;
          google_account_email?: string | null;
          id?: string;
          status?: string;
          sync_ended_at?: string | null;
          sync_started_at?: string;
          triggered_by?: string;
          upserted_events?: Json | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_calendar_sync_log_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_calendar_sync_log_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_calendars: {
        Row: {
          calendar_type: Database['public']['Enums']['workspace_calendar_type'];
          color: string | null;
          created_at: string | null;
          description: string | null;
          id: string;
          is_enabled: boolean;
          is_system: boolean;
          name: string;
          position: number;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          calendar_type?: Database['public']['Enums']['workspace_calendar_type'];
          color?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_enabled?: boolean;
          is_system?: boolean;
          name: string;
          position?: number;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          calendar_type?: Database['public']['Enums']['workspace_calendar_type'];
          color?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_enabled?: boolean;
          is_system?: boolean;
          name?: string;
          position?: number;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_calendars_color_fkey';
            columns: ['color'];
            isOneToOne: false;
            referencedRelation: 'calendar_event_colors';
            referencedColumns: ['value'];
          },
          {
            foreignKeyName: 'workspace_calendars_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_calendars_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_chat_channels: {
        Row: {
          created_at: string | null;
          created_by: string | null;
          description: string | null;
          id: string;
          is_private: boolean | null;
          name: string;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_private?: boolean | null;
          name: string;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          created_by?: string | null;
          description?: string | null;
          id?: string;
          is_private?: boolean | null;
          name?: string;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_chat_channels_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_chat_channels_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_chat_messages: {
        Row: {
          channel_id: string;
          content: string;
          created_at: string | null;
          deleted_at: string | null;
          id: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          channel_id: string;
          content: string;
          created_at?: string | null;
          deleted_at?: string | null;
          id?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          channel_id?: string;
          content?: string;
          created_at?: string | null;
          deleted_at?: string | null;
          id?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_chat_messages_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_chat_channels';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_chat_participants: {
        Row: {
          channel_id: string;
          id: string;
          joined_at: string | null;
          last_read_at: string | null;
          user_id: string;
        };
        Insert: {
          channel_id: string;
          id?: string;
          joined_at?: string | null;
          last_read_at?: string | null;
          user_id: string;
        };
        Update: {
          channel_id?: string;
          id?: string;
          joined_at?: string | null;
          last_read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_chat_participants_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_chat_channels';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_chat_typing_indicators: {
        Row: {
          channel_id: string;
          id: string;
          updated_at: string | null;
          user_id: string;
        };
        Insert: {
          channel_id: string;
          id?: string;
          updated_at?: string | null;
          user_id: string;
        };
        Update: {
          channel_id?: string;
          id?: string;
          updated_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_chat_typing_indicators_channel_id_fkey';
            columns: ['channel_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_chat_channels';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_configs: {
        Row: {
          created_at: string;
          id: string;
          updated_at: string;
          value: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          id: string;
          updated_at?: string;
          value: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          updated_at?: string;
          value?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_workspace_configs_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_configs_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_course_modules: {
        Row: {
          content: Json | null;
          course_id: string;
          created_at: string;
          extra_content: Json | null;
          id: string;
          is_public: boolean;
          is_published: boolean;
          name: string;
          youtube_links: string[] | null;
        };
        Insert: {
          content?: Json | null;
          course_id: string;
          created_at?: string;
          extra_content?: Json | null;
          id?: string;
          is_public?: boolean;
          is_published?: boolean;
          name?: string;
          youtube_links?: string[] | null;
        };
        Update: {
          content?: Json | null;
          course_id?: string;
          created_at?: string;
          extra_content?: Json | null;
          id?: string;
          is_public?: boolean;
          is_published?: boolean;
          name?: string;
          youtube_links?: string[] | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_course_modules_course_id_fkey';
            columns: ['course_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_courses';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_courses: {
        Row: {
          cert_template: Database['public']['Enums']['certificate_templates'];
          created_at: string;
          description: string | null;
          id: string;
          is_public: boolean;
          is_published: boolean;
          name: string;
          ws_id: string;
        };
        Insert: {
          cert_template?: Database['public']['Enums']['certificate_templates'];
          created_at?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          is_published?: boolean;
          name?: string;
          ws_id: string;
        };
        Update: {
          cert_template?: Database['public']['Enums']['certificate_templates'];
          created_at?: string;
          description?: string | null;
          id?: string;
          is_public?: boolean;
          is_published?: boolean;
          name?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_courses_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_courses_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_cron_executions: {
        Row: {
          created_at: string;
          cron_run_id: number | null;
          end_time: string | null;
          id: string;
          job_id: string;
          response: string | null;
          start_time: string | null;
          status: string;
        };
        Insert: {
          created_at?: string;
          cron_run_id?: number | null;
          end_time?: string | null;
          id?: string;
          job_id: string;
          response?: string | null;
          start_time?: string | null;
          status: string;
        };
        Update: {
          created_at?: string;
          cron_run_id?: number | null;
          end_time?: string | null;
          id?: string;
          job_id?: string;
          response?: string | null;
          start_time?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_cron_executions_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_cron_jobs';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_cron_jobs: {
        Row: {
          active: boolean;
          created_at: string;
          cron_job_id: number | null;
          dataset_id: string;
          id: string;
          name: string;
          schedule: string;
          ws_id: string;
        };
        Insert: {
          active?: boolean;
          created_at?: string;
          cron_job_id?: number | null;
          dataset_id: string;
          id?: string;
          name: string;
          schedule: string;
          ws_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          cron_job_id?: number | null;
          dataset_id?: string;
          id?: string;
          name?: string;
          schedule?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_cron_jobs_dataset_id_fkey';
            columns: ['dataset_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_datasets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_cron_jobs_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_cron_jobs_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_dataset_cells: {
        Row: {
          column_id: string;
          created_at: string;
          data: string | null;
          dataset_id: string;
          id: string;
          row_id: string;
        };
        Insert: {
          column_id: string;
          created_at?: string;
          data?: string | null;
          dataset_id: string;
          id?: string;
          row_id: string;
        };
        Update: {
          column_id?: string;
          created_at?: string;
          data?: string | null;
          dataset_id?: string;
          id?: string;
          row_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_dataset_cell_column_id_fkey';
            columns: ['column_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_dataset_columns';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_dataset_cell_dataset_id_fkey';
            columns: ['dataset_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_datasets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_dataset_cell_row_id_fkey';
            columns: ['row_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_dataset_row_cells';
            referencedColumns: ['row_id'];
          },
          {
            foreignKeyName: 'workspace_dataset_cell_row_id_fkey';
            columns: ['row_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_dataset_rows';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_dataset_columns: {
        Row: {
          alias: string | null;
          created_at: string;
          dataset_id: string;
          description: string | null;
          id: string;
          name: string;
        };
        Insert: {
          alias?: string | null;
          created_at?: string;
          dataset_id: string;
          description?: string | null;
          id?: string;
          name: string;
        };
        Update: {
          alias?: string | null;
          created_at?: string;
          dataset_id?: string;
          description?: string | null;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_dataset_columns_dataset_id_fkey';
            columns: ['dataset_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_datasets';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_dataset_rows: {
        Row: {
          created_at: string;
          dataset_id: string;
          id: string;
        };
        Insert: {
          created_at?: string;
          dataset_id: string;
          id?: string;
        };
        Update: {
          created_at?: string;
          dataset_id?: string;
          id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_dataset_rows_dataset_id_fkey';
            columns: ['dataset_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_datasets';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_datasets: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string;
          url: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name: string;
          url?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string;
          url?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_datasets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_datasets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_default_permissions: {
        Row: {
          created_at: string;
          enabled: boolean;
          permission: Database['public']['Enums']['workspace_role_permission'];
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          permission: Database['public']['Enums']['workspace_role_permission'];
          ws_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          permission?: Database['public']['Enums']['workspace_role_permission'];
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_workspace_default_permissions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_default_permissions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_documents: {
        Row: {
          content: Json | null;
          created_at: string;
          id: string;
          is_public: boolean | null;
          legacy_content: string | null;
          name: string | null;
          ws_id: string | null;
        };
        Insert: {
          content?: Json | null;
          created_at?: string;
          id?: string;
          is_public?: boolean | null;
          legacy_content?: string | null;
          name?: string | null;
          ws_id?: string | null;
        };
        Update: {
          content?: Json | null;
          created_at?: string;
          id?: string;
          is_public?: boolean | null;
          legacy_content?: string | null;
          name?: string | null;
          ws_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_documents_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_documents_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_education_access_requests: {
        Row: {
          admin_notes: string | null;
          created_at: string;
          creator_id: string;
          feature: Database['public']['Enums']['feature_flag'];
          id: string;
          message: string;
          reviewed_at: string | null;
          reviewed_by: string | null;
          status: string;
          updated_at: string;
          workspace_name: string;
          ws_id: string;
        };
        Insert: {
          admin_notes?: string | null;
          created_at?: string;
          creator_id: string;
          feature?: Database['public']['Enums']['feature_flag'];
          id?: string;
          message: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
          workspace_name: string;
          ws_id: string;
        };
        Update: {
          admin_notes?: string | null;
          created_at?: string;
          creator_id?: string;
          feature?: Database['public']['Enums']['feature_flag'];
          id?: string;
          message?: string;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          status?: string;
          updated_at?: string;
          workspace_name?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_education_access_requests_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_education_access_requests_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_education_access_requests_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_education_access_requests_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_education_access_requests_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_education_access_requests_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_education_access_requests_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_education_access_requests_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_education_access_requests_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_education_access_requests_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_email_credentials: {
        Row: {
          access_id: string;
          access_key: string;
          created_at: string;
          id: string;
          region: string;
          source_email: string;
          source_name: string;
          ws_id: string;
        };
        Insert: {
          access_id: string;
          access_key: string;
          created_at?: string;
          id?: string;
          region?: string;
          source_email?: string;
          source_name?: string;
          ws_id: string;
        };
        Update: {
          access_id?: string;
          access_key?: string;
          created_at?: string;
          id?: string;
          region?: string;
          source_email?: string;
          source_name?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_email_credentials_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_email_credentials_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_email_invites: {
        Row: {
          created_at: string;
          email: string;
          invited_by: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          invited_by?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          invited_by?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_email_invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_email_invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_email_invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_email_invites_invited_by_fkey';
            columns: ['invited_by'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_email_invites_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_email_invites_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_encryption_keys: {
        Row: {
          created_at: string;
          encrypted_key: string;
          id: string;
          key_version: number;
          updated_at: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          encrypted_key: string;
          id?: string;
          key_version?: number;
          updated_at?: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          encrypted_key?: string;
          id?: string;
          key_version?: number;
          updated_at?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_encryption_keys_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_encryption_keys_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_flashcards: {
        Row: {
          back: string;
          created_at: string;
          front: string;
          id: string;
          ws_id: string;
        };
        Insert: {
          back: string;
          created_at?: string;
          front: string;
          id?: string;
          ws_id: string;
        };
        Update: {
          back?: string;
          created_at?: string;
          front?: string;
          id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_flashcards_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_flashcards_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_habits: {
        Row: {
          auto_schedule: boolean | null;
          calendar_hours: Database['public']['Enums']['calendar_hours'] | null;
          color: string | null;
          created_at: string | null;
          creator_id: string | null;
          day_of_month: number | null;
          day_of_week_monthly: number | null;
          days_of_week: number[] | null;
          deleted_at: string | null;
          description: string | null;
          duration_minutes: number;
          end_date: string | null;
          frequency: Database['public']['Enums']['habit_frequency'];
          id: string;
          ideal_time: string | null;
          is_active: boolean | null;
          is_visible_in_calendar: boolean | null;
          max_duration_minutes: number | null;
          min_duration_minutes: number | null;
          monthly_type:
            | Database['public']['Enums']['monthly_recurrence_type']
            | null;
          name: string;
          priority: Database['public']['Enums']['task_priority'] | null;
          recurrence_interval: number | null;
          start_date: string;
          time_preference:
            | Database['public']['Enums']['time_of_day_preference']
            | null;
          updated_at: string | null;
          week_of_month: number | null;
          ws_id: string;
        };
        Insert: {
          auto_schedule?: boolean | null;
          calendar_hours?: Database['public']['Enums']['calendar_hours'] | null;
          color?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          day_of_month?: number | null;
          day_of_week_monthly?: number | null;
          days_of_week?: number[] | null;
          deleted_at?: string | null;
          description?: string | null;
          duration_minutes?: number;
          end_date?: string | null;
          frequency?: Database['public']['Enums']['habit_frequency'];
          id?: string;
          ideal_time?: string | null;
          is_active?: boolean | null;
          is_visible_in_calendar?: boolean | null;
          max_duration_minutes?: number | null;
          min_duration_minutes?: number | null;
          monthly_type?:
            | Database['public']['Enums']['monthly_recurrence_type']
            | null;
          name: string;
          priority?: Database['public']['Enums']['task_priority'] | null;
          recurrence_interval?: number | null;
          start_date?: string;
          time_preference?:
            | Database['public']['Enums']['time_of_day_preference']
            | null;
          updated_at?: string | null;
          week_of_month?: number | null;
          ws_id: string;
        };
        Update: {
          auto_schedule?: boolean | null;
          calendar_hours?: Database['public']['Enums']['calendar_hours'] | null;
          color?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          day_of_month?: number | null;
          day_of_week_monthly?: number | null;
          days_of_week?: number[] | null;
          deleted_at?: string | null;
          description?: string | null;
          duration_minutes?: number;
          end_date?: string | null;
          frequency?: Database['public']['Enums']['habit_frequency'];
          id?: string;
          ideal_time?: string | null;
          is_active?: boolean | null;
          is_visible_in_calendar?: boolean | null;
          max_duration_minutes?: number | null;
          min_duration_minutes?: number | null;
          monthly_type?:
            | Database['public']['Enums']['monthly_recurrence_type']
            | null;
          name?: string;
          priority?: Database['public']['Enums']['task_priority'] | null;
          recurrence_interval?: number | null;
          start_date?: string;
          time_preference?:
            | Database['public']['Enums']['time_of_day_preference']
            | null;
          updated_at?: string | null;
          week_of_month?: number | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_habits_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_habits_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_habits_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_habits_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_habits_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_habits_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_invite_link_uses: {
        Row: {
          id: string;
          invite_link_id: string;
          joined_at: string;
          user_id: string;
          ws_id: string;
        };
        Insert: {
          id?: string;
          invite_link_id: string;
          joined_at?: string;
          user_id: string;
          ws_id: string;
        };
        Update: {
          id?: string;
          invite_link_id?: string;
          joined_at?: string;
          user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_invite_link_uses_invite_link_id_fkey';
            columns: ['invite_link_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_invite_links';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invite_link_uses_invite_link_id_fkey';
            columns: ['invite_link_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_invite_links_with_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invite_link_uses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_invite_link_uses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_invite_link_uses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invite_link_uses_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invite_link_uses_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invite_link_uses_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_invite_links: {
        Row: {
          code: string;
          created_at: string;
          creator_id: string;
          expires_at: string | null;
          id: string;
          max_uses: number | null;
          updated_at: string;
          ws_id: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          creator_id: string;
          expires_at?: string | null;
          id?: string;
          max_uses?: number | null;
          updated_at?: string;
          ws_id: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          creator_id?: string;
          expires_at?: string | null;
          id?: string;
          max_uses?: number | null;
          updated_at?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_invite_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_invite_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_invite_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invite_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invite_links_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invite_links_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_invites: {
        Row: {
          created_at: string | null;
          user_id: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          user_id: string;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_invites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_invites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_invites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invites_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invites_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_meetings: {
        Row: {
          created_at: string;
          creator_id: string;
          id: string;
          name: string;
          time: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          creator_id: string;
          id?: string;
          name: string;
          time?: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          id?: string;
          name?: string;
          time?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_meetings_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_meetings_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_meetings_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_meetings_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_meetings_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_meetings_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string | null;
          sort_key: number | null;
          user_id: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          sort_key?: number | null;
          user_id?: string;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          sort_key?: number | null;
          user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_members_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_members_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_orders: {
        Row: {
          billing_reason: Database['public']['Enums']['billing_reason'] | null;
          created_at: string;
          currency: string | null;
          id: string;
          polar_order_id: string;
          polar_subscription_id: string | null;
          product_id: string | null;
          status: Database['public']['Enums']['order_status'];
          total_amount: number | null;
          updated_at: string | null;
          user_id: string | null;
          ws_id: string;
        };
        Insert: {
          billing_reason?: Database['public']['Enums']['billing_reason'] | null;
          created_at?: string;
          currency?: string | null;
          id?: string;
          polar_order_id: string;
          polar_subscription_id?: string | null;
          product_id?: string | null;
          status?: Database['public']['Enums']['order_status'];
          total_amount?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
          ws_id: string;
        };
        Update: {
          billing_reason?: Database['public']['Enums']['billing_reason'] | null;
          created_at?: string;
          currency?: string | null;
          id?: string;
          polar_order_id?: string;
          polar_subscription_id?: string | null;
          product_id?: string | null;
          status?: Database['public']['Enums']['order_status'];
          total_amount?: number | null;
          updated_at?: string | null;
          user_id?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_orders_polar_subscription_id_fkey';
            columns: ['polar_subscription_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_subscriptions';
            referencedColumns: ['polar_subscription_id'];
          },
          {
            foreignKeyName: 'workspace_orders_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_subscription_products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_orders_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_orders_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_products: {
        Row: {
          avatar_url: string | null;
          category_id: string;
          created_at: string | null;
          creator_id: string | null;
          description: string | null;
          id: string;
          manufacturer: string | null;
          name: string | null;
          usage: string | null;
          ws_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          category_id: string;
          created_at?: string | null;
          creator_id?: string | null;
          description?: string | null;
          id?: string;
          manufacturer?: string | null;
          name?: string | null;
          usage?: string | null;
          ws_id: string;
        };
        Update: {
          avatar_url?: string | null;
          category_id?: string;
          created_at?: string | null;
          creator_id?: string | null;
          description?: string | null;
          id?: string;
          manufacturer?: string | null;
          name?: string | null;
          usage?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_workspace_products_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_products_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_products_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'public_workspace_products_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_products_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_products_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'product_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_products_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_products_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_promotions: {
        Row: {
          code: string | null;
          created_at: string;
          creator_id: string | null;
          current_uses: number;
          description: string | null;
          id: string;
          max_uses: number | null;
          name: string | null;
          owner_id: string | null;
          promo_type: Database['public']['Enums']['promotion_type'];
          use_ratio: boolean;
          value: number;
          ws_id: string;
        };
        Insert: {
          code?: string | null;
          created_at?: string;
          creator_id?: string | null;
          current_uses?: number;
          description?: string | null;
          id?: string;
          max_uses?: number | null;
          name?: string | null;
          owner_id?: string | null;
          promo_type?: Database['public']['Enums']['promotion_type'];
          use_ratio?: boolean;
          value: number;
          ws_id: string;
        };
        Update: {
          code?: string | null;
          created_at?: string;
          creator_id?: string | null;
          current_uses?: number;
          description?: string | null;
          id?: string;
          max_uses?: number | null;
          name?: string | null;
          owner_id?: string | null;
          promo_type?: Database['public']['Enums']['promotion_type'];
          use_ratio?: boolean;
          value?: number;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_workspace_promotions_owner';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_workspace_promotions_owner';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_workspace_promotions_owner';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'fk_workspace_promotions_owner';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_workspace_promotions_owner';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_promotions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_promotions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_promotions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'public_workspace_promotions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_promotions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_promotions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_promotions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_quiz_attempt_answers: {
        Row: {
          attempt_id: string;
          id: string;
          is_correct: boolean;
          quiz_id: string;
          score_awarded: number;
          selected_option_id: string;
        };
        Insert: {
          attempt_id: string;
          id?: string;
          is_correct: boolean;
          quiz_id: string;
          score_awarded: number;
          selected_option_id: string;
        };
        Update: {
          attempt_id?: string;
          id?: string;
          is_correct?: boolean;
          quiz_id?: string;
          score_awarded?: number;
          selected_option_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'wq_answer_attempt_fkey';
            columns: ['attempt_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_quiz_attempts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wq_answer_option_fkey';
            columns: ['selected_option_id'];
            isOneToOne: false;
            referencedRelation: 'quiz_options';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wq_answer_quiz_fkey';
            columns: ['quiz_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_quizzes';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_quiz_attempts: {
        Row: {
          attempt_number: number;
          completed_at: string | null;
          duration_seconds: number | null;
          id: string;
          set_id: string;
          started_at: string;
          submitted_at: string;
          total_score: number | null;
          user_id: string;
        };
        Insert: {
          attempt_number: number;
          completed_at?: string | null;
          duration_seconds?: number | null;
          id?: string;
          set_id: string;
          started_at?: string;
          submitted_at?: string;
          total_score?: number | null;
          user_id: string;
        };
        Update: {
          attempt_number?: number;
          completed_at?: string | null;
          duration_seconds?: number | null;
          id?: string;
          set_id?: string;
          started_at?: string;
          submitted_at?: string;
          total_score?: number | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'wq_attempts_set_fkey';
            columns: ['set_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_quiz_sets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wq_attempts_user_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'wq_attempts_user_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'wq_attempts_user_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wq_attempts_user_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_quiz_sets: {
        Row: {
          allow_view_old_attempts: boolean;
          allow_view_results: boolean;
          attempt_limit: number | null;
          available_date: string;
          created_at: string;
          due_date: string;
          explanation_mode: number;
          id: string;
          instruction: Json | null;
          name: string;
          results_released: boolean;
          time_limit_minutes: number | null;
          ws_id: string | null;
        };
        Insert: {
          allow_view_old_attempts?: boolean;
          allow_view_results?: boolean;
          attempt_limit?: number | null;
          available_date?: string;
          created_at?: string;
          due_date?: string;
          explanation_mode?: number;
          id?: string;
          instruction?: Json | null;
          name?: string;
          results_released?: boolean;
          time_limit_minutes?: number | null;
          ws_id?: string | null;
        };
        Update: {
          allow_view_old_attempts?: boolean;
          allow_view_results?: boolean;
          attempt_limit?: number | null;
          available_date?: string;
          created_at?: string;
          due_date?: string;
          explanation_mode?: number;
          id?: string;
          instruction?: Json | null;
          name?: string;
          results_released?: boolean;
          time_limit_minutes?: number | null;
          ws_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_quiz_sets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_quiz_sets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_quizzes: {
        Row: {
          created_at: string;
          id: string;
          instruction: Json | null;
          question: string;
          score: number;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          instruction?: Json | null;
          question: string;
          score?: number;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          instruction?: Json | null;
          question?: string;
          score?: number;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_quizzes_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_quizzes_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_role_members: {
        Row: {
          created_at: string;
          role_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          role_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          role_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_workspace_role_members_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_role_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'public_workspace_role_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'public_workspace_role_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_role_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_role_permissions: {
        Row: {
          created_at: string;
          enabled: boolean;
          permission: Database['public']['Enums']['workspace_role_permission'];
          role_id: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          permission: Database['public']['Enums']['workspace_role_permission'];
          role_id: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          permission?: Database['public']['Enums']['workspace_role_permission'];
          role_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_workspace_role_permissions_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_role_permissions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_role_permissions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_role_wallet_whitelist: {
        Row: {
          created_at: string;
          custom_days: number | null;
          id: string;
          role_id: string;
          viewing_window: string;
          wallet_id: string;
        };
        Insert: {
          created_at?: string;
          custom_days?: number | null;
          id?: string;
          role_id: string;
          viewing_window?: string;
          wallet_id: string;
        };
        Update: {
          created_at?: string;
          custom_days?: number | null;
          id?: string;
          role_id?: string;
          viewing_window?: string;
          wallet_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_role_wallet_whitelist_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_roles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_role_wallet_whitelist_wallet_id_fkey';
            columns: ['wallet_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_wallets';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_roles: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_workspace_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_scheduling_metadata: {
        Row: {
          bumped_habits: number | null;
          created_at: string | null;
          events_created: number | null;
          habits_scheduled: number | null;
          id: string;
          last_message: string | null;
          last_scheduled_at: string | null;
          last_status: string | null;
          tasks_scheduled: number | null;
          updated_at: string | null;
          window_days: number | null;
          ws_id: string;
        };
        Insert: {
          bumped_habits?: number | null;
          created_at?: string | null;
          events_created?: number | null;
          habits_scheduled?: number | null;
          id?: string;
          last_message?: string | null;
          last_scheduled_at?: string | null;
          last_status?: string | null;
          tasks_scheduled?: number | null;
          updated_at?: string | null;
          window_days?: number | null;
          ws_id: string;
        };
        Update: {
          bumped_habits?: number | null;
          created_at?: string | null;
          events_created?: number | null;
          habits_scheduled?: number | null;
          id?: string;
          last_message?: string | null;
          last_scheduled_at?: string | null;
          last_status?: string | null;
          tasks_scheduled?: number | null;
          updated_at?: string | null;
          window_days?: number | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_scheduling_metadata_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_scheduling_metadata_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_secrets: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          value: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          value?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          value?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_secrets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_secrets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_settings: {
        Row: {
          break_duration_minutes: number | null;
          break_enabled: boolean | null;
          break_interval_minutes: number | null;
          created_at: string;
          guest_user_checkup_threshold: number | null;
          missed_entry_date_threshold: number | null;
          referral_count_cap: number;
          referral_increment_percent: number;
          referral_promotion_id: string | null;
          referral_reward_type: Database['public']['Enums']['referral_reward_type'];
          updated_at: string;
          ws_id: string;
        };
        Insert: {
          break_duration_minutes?: number | null;
          break_enabled?: boolean | null;
          break_interval_minutes?: number | null;
          created_at?: string;
          guest_user_checkup_threshold?: number | null;
          missed_entry_date_threshold?: number | null;
          referral_count_cap?: number;
          referral_increment_percent?: number;
          referral_promotion_id?: string | null;
          referral_reward_type?: Database['public']['Enums']['referral_reward_type'];
          updated_at?: string;
          ws_id: string;
        };
        Update: {
          break_duration_minutes?: number | null;
          break_enabled?: boolean | null;
          break_interval_minutes?: number | null;
          created_at?: string;
          guest_user_checkup_threshold?: number | null;
          missed_entry_date_threshold?: number | null;
          referral_count_cap?: number;
          referral_increment_percent?: number;
          referral_promotion_id?: string | null;
          referral_reward_type?: Database['public']['Enums']['referral_reward_type'];
          updated_at?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_settings_referral_promo_fkey';
            columns: ['ws_id', 'referral_promotion_id'];
            isOneToOne: false;
            referencedRelation: 'v_user_referral_discounts';
            referencedColumns: ['ws_id', 'promo_id'];
          },
          {
            foreignKeyName: 'workspace_settings_referral_promo_fkey';
            columns: ['ws_id', 'referral_promotion_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_promotions';
            referencedColumns: ['ws_id', 'id'];
          },
          {
            foreignKeyName: 'workspace_settings_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_settings_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_subscription_products: {
        Row: {
          archived: boolean;
          created_at: string;
          description: string | null;
          id: string;
          name: string | null;
          price: number | null;
          recurring_interval: string | null;
          tier: Database['public']['Enums']['workspace_product_tier'] | null;
        };
        Insert: {
          archived?: boolean;
          created_at?: string;
          description?: string | null;
          id: string;
          name?: string | null;
          price?: number | null;
          recurring_interval?: string | null;
          tier?: Database['public']['Enums']['workspace_product_tier'] | null;
        };
        Update: {
          archived?: boolean;
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string | null;
          price?: number | null;
          recurring_interval?: string | null;
          tier?: Database['public']['Enums']['workspace_product_tier'] | null;
        };
        Relationships: [];
      };
      workspace_subscriptions: {
        Row: {
          cancel_at_period_end: boolean | null;
          created_at: string;
          current_period_end: string | null;
          current_period_start: string | null;
          id: string;
          polar_subscription_id: string;
          product_id: string | null;
          status: Database['public']['Enums']['subscription_status'] | null;
          updated_at: string | null;
          ws_id: string;
        };
        Insert: {
          cancel_at_period_end?: boolean | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          polar_subscription_id: string;
          product_id?: string | null;
          status?: Database['public']['Enums']['subscription_status'] | null;
          updated_at?: string | null;
          ws_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean | null;
          created_at?: string;
          current_period_end?: string | null;
          current_period_start?: string | null;
          id?: string;
          polar_subscription_id?: string;
          product_id?: string | null;
          status?: Database['public']['Enums']['subscription_status'] | null;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_subscription_product_id_fkey';
            columns: ['product_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_subscription_products';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_subscription_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_subscription_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_task_labels: {
        Row: {
          color: string;
          created_at: string;
          creator_id: string | null;
          id: string;
          name: string;
          ws_id: string;
        };
        Insert: {
          color: string;
          created_at?: string;
          creator_id?: string | null;
          id?: string;
          name: string;
          ws_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          creator_id?: string | null;
          id?: string;
          name?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_task_labels_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_task_labels_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_task_labels_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_task_labels_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_task_labels_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_task_labels_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_task_reminder_settings: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          reminder_intervals: Json;
          updated_at: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          reminder_intervals?: Json;
          updated_at?: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          reminder_intervals?: Json;
          updated_at?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_task_reminder_settings_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_task_reminder_settings_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: true;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_teams: {
        Row: {
          created_at: string | null;
          deleted: boolean | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_teams_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_teams_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_user_fields: {
        Row: {
          created_at: string;
          default_value: string | null;
          description: string | null;
          id: string;
          name: string;
          notes: string | null;
          possible_values: string[] | null;
          type: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          default_value?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          notes?: string | null;
          possible_values?: string[] | null;
          type: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          default_value?: string | null;
          description?: string | null;
          id?: string;
          name?: string;
          notes?: string | null;
          possible_values?: string[] | null;
          type?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_workspace_user_fields_type_fkey';
            columns: ['type'];
            isOneToOne: false;
            referencedRelation: 'field_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_user_fields_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_user_fields_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_user_group_tag_groups: {
        Row: {
          created_at: string;
          group_id: string;
          tag_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          tag_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_user_group_tag_groups_tag_id_fkey';
            columns: ['tag_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_group_tags';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_user_group_tags: {
        Row: {
          color: string | null;
          created_at: string;
          id: string;
          name: string;
          ws_id: string;
        };
        Insert: {
          color?: string | null;
          created_at?: string;
          id?: string;
          name: string;
          ws_id: string;
        };
        Update: {
          color?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'public_workspace_user_group_tags_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_user_group_tags_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_user_groups: {
        Row: {
          archived: boolean;
          created_at: string | null;
          creator_id: string | null;
          ending_date: string | null;
          id: string;
          is_guest: boolean | null;
          name: string;
          notes: string | null;
          sessions: string[] | null;
          starting_date: string | null;
          ws_id: string;
        };
        Insert: {
          archived?: boolean;
          created_at?: string | null;
          creator_id?: string | null;
          ending_date?: string | null;
          id?: string;
          is_guest?: boolean | null;
          name: string;
          notes?: string | null;
          sessions?: string[] | null;
          starting_date?: string | null;
          ws_id: string;
        };
        Update: {
          archived?: boolean;
          created_at?: string | null;
          creator_id?: string | null;
          ending_date?: string | null;
          id?: string;
          is_guest?: boolean | null;
          name?: string;
          notes?: string | null;
          sessions?: string[] | null;
          starting_date?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_user_groups_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_user_groups_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_user_groups_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_groups_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_user_groups_users: {
        Row: {
          created_at: string | null;
          group_id: string;
          role: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          group_id: string;
          role?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          group_id?: string;
          role?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_user_linked_users: {
        Row: {
          created_at: string;
          platform_user_id: string;
          virtual_user_id: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          platform_user_id: string;
          virtual_user_id: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          platform_user_id?: string;
          virtual_user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_user_linked_users_platform_user_id_fkey';
            columns: ['platform_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_user_linked_users_platform_user_id_fkey';
            columns: ['platform_user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_user_linked_users_platform_user_id_fkey';
            columns: ['platform_user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_linked_users_platform_user_id_fkey';
            columns: ['platform_user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_linked_users_virtual_user_id_fkey';
            columns: ['virtual_user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_linked_users_virtual_user_id_fkey';
            columns: ['virtual_user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_linked_users_virtual_user_id_fkey';
            columns: ['virtual_user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_user_linked_users_virtual_user_id_fkey';
            columns: ['virtual_user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_linked_users_virtual_user_id_fkey';
            columns: ['virtual_user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_linked_users_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_linked_users_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_user_status_changes: {
        Row: {
          archived: boolean;
          archived_until: string | null;
          created_at: string;
          creator_id: string;
          id: string;
          user_id: string;
          ws_id: string;
        };
        Insert: {
          archived: boolean;
          archived_until?: string | null;
          created_at?: string;
          creator_id: string;
          id?: string;
          user_id: string;
          ws_id: string;
        };
        Update: {
          archived?: boolean;
          archived_until?: string | null;
          created_at?: string;
          creator_id?: string;
          id?: string;
          user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_user_status_changes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_status_changes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_status_changes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_user_status_changes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_status_changes_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_status_changes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_status_changes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_status_changes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_user_status_changes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_status_changes_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_status_changes_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_status_changes_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_users: {
        Row: {
          address: string | null;
          archived: boolean;
          archived_until: string | null;
          avatar_url: string | null;
          balance: number | null;
          birthday: string | null;
          created_at: string | null;
          created_by: string | null;
          display_name: string | null;
          email: string | null;
          ethnicity: string | null;
          full_name: string | null;
          gender: string | null;
          guardian: string | null;
          id: string;
          national_id: string | null;
          note: string | null;
          phone: string | null;
          referred_by: string | null;
          updated_at: string;
          updated_by: string | null;
          ws_id: string;
        };
        Insert: {
          address?: string | null;
          archived?: boolean;
          archived_until?: string | null;
          avatar_url?: string | null;
          balance?: number | null;
          birthday?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          display_name?: string | null;
          email?: string | null;
          ethnicity?: string | null;
          full_name?: string | null;
          gender?: string | null;
          guardian?: string | null;
          id?: string;
          national_id?: string | null;
          note?: string | null;
          phone?: string | null;
          referred_by?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          ws_id: string;
        };
        Update: {
          address?: string | null;
          archived?: boolean;
          archived_until?: string | null;
          avatar_url?: string | null;
          balance?: number | null;
          birthday?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          display_name?: string | null;
          email?: string | null;
          ethnicity?: string | null;
          full_name?: string | null;
          gender?: string | null;
          guardian?: string | null;
          id?: string;
          national_id?: string | null;
          note?: string | null;
          phone?: string | null;
          referred_by?: string | null;
          updated_at?: string;
          updated_by?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_workspace_users_referred_by';
            columns: ['referred_by'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_workspace_users_referred_by';
            columns: ['referred_by'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_workspace_users_referred_by';
            columns: ['referred_by'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'fk_workspace_users_referred_by';
            columns: ['referred_by'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_workspace_users_referred_by';
            columns: ['referred_by'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_users_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_wallet_transfers: {
        Row: {
          created_at: string | null;
          from_transaction_id: string;
          to_transaction_id: string;
        };
        Insert: {
          created_at?: string | null;
          from_transaction_id: string;
          to_transaction_id: string;
        };
        Update: {
          created_at?: string | null;
          from_transaction_id?: string;
          to_transaction_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_wallet_transfers_from_transaction_id_fkey';
            columns: ['from_transaction_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_wallet_transfers_from_transaction_id_fkey';
            columns: ['from_transaction_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_transactions_secure';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_wallet_transfers_to_transaction_id_fkey';
            columns: ['to_transaction_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_transactions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_wallet_transfers_to_transaction_id_fkey';
            columns: ['to_transaction_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_transactions_secure';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_wallets: {
        Row: {
          balance: number | null;
          created_at: string | null;
          currency: string;
          description: string | null;
          id: string;
          name: string | null;
          report_opt_in: boolean;
          type: string;
          ws_id: string;
        };
        Insert: {
          balance?: number | null;
          created_at?: string | null;
          currency?: string;
          description?: string | null;
          id?: string;
          name?: string | null;
          report_opt_in?: boolean;
          type?: string;
          ws_id: string;
        };
        Update: {
          balance?: number | null;
          created_at?: string | null;
          currency?: string;
          description?: string | null;
          id?: string;
          name?: string | null;
          report_opt_in?: boolean;
          type?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_wallets_currency_fkey';
            columns: ['currency'];
            isOneToOne: false;
            referencedRelation: 'currencies';
            referencedColumns: ['code'];
          },
          {
            foreignKeyName: 'workspace_wallets_type_fkey';
            columns: ['type'];
            isOneToOne: false;
            referencedRelation: 'wallet_types';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_wallets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_wallets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_whiteboards: {
        Row: {
          created_at: string;
          creator_id: string;
          description: string | null;
          id: string;
          snapshot: Json | null;
          thumbnail_url: string | null;
          title: string;
          updated_at: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          creator_id: string;
          description?: string | null;
          id?: string;
          snapshot?: Json | null;
          thumbnail_url?: string | null;
          title: string;
          updated_at?: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          description?: string | null;
          id?: string;
          snapshot?: Json | null;
          thumbnail_url?: string | null;
          title?: string;
          updated_at?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_whiteboards_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_whiteboards_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_whiteboards_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_whiteboards_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_whiteboards_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_whiteboards_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspaces: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          creator_id: string;
          deleted: boolean | null;
          energy_profile: string | null;
          first_day_of_week: string | null;
          handle: string | null;
          id: string;
          logo_url: string | null;
          name: string | null;
          personal: boolean;
          scheduling_settings: Json | null;
          timezone: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          creator_id?: string;
          deleted?: boolean | null;
          energy_profile?: string | null;
          first_day_of_week?: string | null;
          handle?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string | null;
          personal?: boolean;
          scheduling_settings?: Json | null;
          timezone?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          creator_id?: string;
          deleted?: boolean | null;
          energy_profile?: string | null;
          first_day_of_week?: string | null;
          handle?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string | null;
          personal?: boolean;
          scheduling_settings?: Json | null;
          timezone?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspaces_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspaces_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspaces_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspaces_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      audit_logs: {
        Row: {
          auth_role: string | null;
          auth_uid: string | null;
          id: number | null;
          old_record: Json | null;
          old_record_id: string | null;
          op: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' | null;
          record: Json | null;
          record_id: string | null;
          table_name: unknown;
          ts: string | null;
          ws_id: string | null;
        };
        Insert: {
          auth_role?: string | null;
          auth_uid?: string | null;
          id?: number | null;
          old_record?: Json | null;
          old_record_id?: string | null;
          op?: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' | null;
          record?: Json | null;
          record_id?: string | null;
          table_name?: unknown;
          ts?: string | null;
          ws_id?: never;
        };
        Update: {
          auth_role?: string | null;
          auth_uid?: string | null;
          id?: number | null;
          old_record?: Json | null;
          old_record_id?: string | null;
          op?: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE' | null;
          record?: Json | null;
          record_id?: string | null;
          table_name?: unknown;
          ts?: string | null;
          ws_id?: never;
        };
        Relationships: [];
      };
      calendar_event_participants: {
        Row: {
          created_at: string | null;
          display_name: string | null;
          event_id: string | null;
          going: boolean | null;
          handle: string | null;
          participant_id: string | null;
          type: string | null;
        };
        Relationships: [];
      };
      distinct_invoice_creators: {
        Row: {
          avatar_url: string | null;
          display_name: string | null;
          email: string | null;
          full_name: string | null;
          id: string | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'finance_invoices_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'finance_invoices_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      distinct_transaction_creators: {
        Row: {
          avatar_url: string | null;
          display_name: string | null;
          email: string | null;
          full_name: string | null;
          id: string | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_wallets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_wallets_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      group_user_with_attendance: {
        Row: {
          attendance_count: number | null;
          full_name: string | null;
          group_id: string | null;
          is_completed: boolean | null;
          post_id: string | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_group_post_checks_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['post_id_full'];
          },
          {
            foreignKeyName: 'user_group_post_checks_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'user_group_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
            referencedColumns: ['id'];
          },
        ];
      };
      group_users_with_post_checks: {
        Row: {
          attendance_count: number | null;
          email: string | null;
          full_name: string | null;
          gender: string | null;
          group_id: string | null;
          is_completed: boolean | null;
          phone: string | null;
          post_id: string | null;
          user_id: string | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_group_post_checks_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['post_id_full'];
          },
          {
            foreignKeyName: 'user_group_post_checks_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'user_group_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      group_with_attendance: {
        Row: {
          attendance_count: number | null;
          email: string | null;
          full_name: string | null;
          gender: string | null;
          group_id: string | null;
          phone: string | null;
          user_id: string | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      link_analytics_device_insights: {
        Row: {
          browser: string | null;
          click_count: number | null;
          device_type: string | null;
          domain: string | null;
          first_click_at: string | null;
          last_click_at: string | null;
          link_id: string | null;
          os: string | null;
          slug: string | null;
          unique_visitors: number | null;
        };
        Relationships: [];
      };
      link_analytics_geo_insights: {
        Row: {
          city: string | null;
          click_count: number | null;
          country: string | null;
          country_region: string | null;
          domain: string | null;
          first_click_at: string | null;
          last_click_at: string | null;
          latitude: number | null;
          link_id: string | null;
          longitude: number | null;
          postal_code: string | null;
          slug: string | null;
          timezone: string | null;
          unique_visitors: number | null;
          vercel_region: string | null;
        };
        Relationships: [];
      };
      link_analytics_summary: {
        Row: {
          creator_id: string | null;
          domain: string | null;
          first_click_at: string | null;
          last_click_at: string | null;
          link_created_at: string | null;
          link_id: string | null;
          original_url: string | null;
          slug: string | null;
          top_browser: string | null;
          top_city: string | null;
          top_country: string | null;
          top_device_type: string | null;
          top_os: string | null;
          top_referrer_domain: string | null;
          top_vercel_region: string | null;
          total_clicks: number | null;
          unique_browsers: number | null;
          unique_cities: number | null;
          unique_countries: number | null;
          unique_device_types: number | null;
          unique_operating_systems: number | null;
          unique_referrers: number | null;
          unique_visitors: number | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'shortened_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'shortened_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'shortened_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shortened_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shortened_links_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'shortened_links_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      meet_together_users: {
        Row: {
          display_name: string | null;
          is_guest: boolean | null;
          plan_id: string | null;
          timeblock_count: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      nova_submissions_with_scores: {
        Row: {
          created_at: string | null;
          criteria_score: number | null;
          id: string | null;
          passed_tests: number | null;
          problem_id: string | null;
          prompt: string | null;
          session_id: string | null;
          sum_criterion_score: number | null;
          test_case_score: number | null;
          total_criteria: number | null;
          total_score: number | null;
          total_tests: number | null;
          user_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_submissions_problem_id_fkey';
            columns: ['problem_id'];
            isOneToOne: false;
            referencedRelation: 'nova_problems';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_submissions_session_id_fkey';
            columns: ['session_id'];
            isOneToOne: false;
            referencedRelation: 'nova_sessions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_submissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'nova_submissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'nova_submissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_submissions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      nova_team_challenge_leaderboard: {
        Row: {
          challenge_id: string | null;
          name: string | null;
          problem_scores: Json | null;
          score: number | null;
          team_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'nova_problems_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_challenges';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'nova_problems_challenge_id_fkey';
            columns: ['challenge_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['challenge_id'];
          },
        ];
      };
      nova_team_leaderboard: {
        Row: {
          challenge_scores: Json | null;
          name: string | null;
          score: number | null;
          team_id: string | null;
        };
        Relationships: [];
      };
      nova_user_challenge_leaderboard: {
        Row: {
          avatar: string | null;
          challenge_id: string | null;
          name: string | null;
          problem_scores: Json | null;
          score: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      nova_user_leaderboard: {
        Row: {
          avatar: string | null;
          challenge_scores: Json | null;
          name: string | null;
          score: number | null;
          user_id: string | null;
        };
        Relationships: [];
      };
      posts_dashboard_view: {
        Row: {
          created_at: string | null;
          display_name: string | null;
          email_id: string | null;
          email_sent_at: string | null;
          email_subject: string | null;
          full_name: string | null;
          group_id: string | null;
          group_name: string | null;
          is_completed: boolean | null;
          notes: string | null;
          post_content: string | null;
          post_created_at: string | null;
          post_id: string | null;
          post_id_full: string | null;
          post_title: string | null;
          recipient: string | null;
          user_email: string | null;
          user_id: string | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'user_group_post_checks_email_id_fkey';
            columns: ['email_id'];
            isOneToOne: true;
            referencedRelation: 'sent_emails';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'posts_dashboard_view';
            referencedColumns: ['post_id_full'];
          },
          {
            foreignKeyName: 'user_group_post_checks_post_id_fkey';
            columns: ['post_id'];
            isOneToOne: false;
            referencedRelation: 'user_group_posts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      shortened_links_creator_stats: {
        Row: {
          avatar_url: string | null;
          display_name: string | null;
          domain_count: number | null;
          email: string | null;
          first_link_created: string | null;
          id: string | null;
          last_link_created: string | null;
          link_count: number | null;
        };
        Relationships: [];
      };
      shortened_links_domain_stats: {
        Row: {
          creator_count: number | null;
          domain: string | null;
          first_created: string | null;
          last_created: string | null;
          link_count: number | null;
        };
        Relationships: [];
      };
      time_tracker_daily_activity: {
        Row: {
          activity_date: string | null;
          session_count: number | null;
          total_duration: number | null;
          user_id: string | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      time_tracking_request_activity_with_users: {
        Row: {
          action_type:
            | Database['public']['Enums']['time_tracking_request_activity_action']
            | null;
          actor_avatar_url: string | null;
          actor_display_name: string | null;
          actor_handle: string | null;
          actor_id: string | null;
          changed_fields: Json | null;
          comment_content: string | null;
          comment_id: string | null;
          created_at: string | null;
          feedback_reason: string | null;
          id: string | null;
          metadata: Json | null;
          new_status: string | null;
          previous_status: string | null;
          request_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'time_tracking_request_activity_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_request_activity_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_request_activity_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_request_activity_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_request_activity_comment_id_fkey';
            columns: ['comment_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_request_comments';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_request_activity_request_id_fkey';
            columns: ['request_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_requests';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'users_handle_fkey';
            columns: ['actor_handle'];
            isOneToOne: true;
            referencedRelation: 'handles';
            referencedColumns: ['value'];
          },
        ];
      };
      time_tracking_session_analytics: {
        Row: {
          category_color: string | null;
          category_id: string | null;
          category_name: string | null;
          created_at: string | null;
          day_of_week: number | null;
          description: string | null;
          duration_seconds: number | null;
          end_time: string | null;
          id: string | null;
          is_running: boolean | null;
          productivity_score: number | null;
          session_date: string | null;
          session_length_category: string | null;
          session_month: string | null;
          session_week: string | null;
          start_hour: number | null;
          start_time: string | null;
          tags: string[] | null;
          task_id: string | null;
          task_name: string | null;
          title: string | null;
          updated_at: string | null;
          user_id: string | null;
          was_resumed: boolean | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'time_tracking_categories_color_fkey';
            columns: ['category_color'];
            isOneToOne: false;
            referencedRelation: 'calendar_event_colors';
            referencedColumns: ['value'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_category_id_fkey';
            columns: ['category_id'];
            isOneToOne: false;
            referencedRelation: 'time_tracking_categories';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_task_id_fkey';
            columns: ['task_id'];
            isOneToOne: false;
            referencedRelation: 'tasks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'time_tracking_sessions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      user_groups_with_tags: {
        Row: {
          archived: boolean | null;
          created_at: string | null;
          ending_date: string | null;
          id: string | null;
          name: string | null;
          notes: string | null;
          sessions: string[] | null;
          starting_date: string | null;
          tag_count: number | null;
          tags: Json | null;
          ws_id: string | null;
        };
        Insert: {
          archived?: boolean | null;
          created_at?: string | null;
          ending_date?: string | null;
          id?: string | null;
          name?: string | null;
          notes?: string | null;
          sessions?: string[] | null;
          starting_date?: string | null;
          tag_count?: never;
          tags?: never;
          ws_id?: string | null;
        };
        Update: {
          archived?: boolean | null;
          created_at?: string | null;
          ending_date?: string | null;
          id?: string | null;
          name?: string | null;
          notes?: string | null;
          sessions?: string[] | null;
          starting_date?: string | null;
          tag_count?: never;
          tags?: never;
          ws_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      v_user_referral_discounts: {
        Row: {
          calculated_discount_value: number | null;
          promo_code: string | null;
          promo_id: string | null;
          user_id: string | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'fk_workspace_promotions_owner';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_workspace_promotions_owner';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_workspace_promotions_owner';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'fk_workspace_promotions_owner';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'fk_workspace_promotions_owner';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_promotions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_promotions_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      wallet_transactions_secure: {
        Row: {
          amount: number | null;
          category_id: string | null;
          created_at: string | null;
          creator_id: string | null;
          description: string | null;
          id: string | null;
          invoice_id: string | null;
          is_amount_confidential: boolean | null;
          is_category_confidential: boolean | null;
          is_description_confidential: boolean | null;
          report_opt_in: boolean | null;
          taken_at: string | null;
          wallet_id: string | null;
        };
        Insert: {
          amount?: never;
          category_id?: never;
          created_at?: string | null;
          creator_id?: string | null;
          description?: never;
          id?: string | null;
          invoice_id?: string | null;
          is_amount_confidential?: boolean | null;
          is_category_confidential?: boolean | null;
          is_description_confidential?: boolean | null;
          report_opt_in?: boolean | null;
          taken_at?: string | null;
          wallet_id?: string | null;
        };
        Update: {
          amount?: never;
          category_id?: never;
          created_at?: string | null;
          creator_id?: string | null;
          description?: never;
          id?: string | null;
          invoice_id?: string | null;
          is_amount_confidential?: boolean | null;
          is_category_confidential?: boolean | null;
          is_description_confidential?: boolean | null;
          report_opt_in?: boolean | null;
          taken_at?: string | null;
          wallet_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_invoice_id_fkey';
            columns: ['invoice_id'];
            isOneToOne: true;
            referencedRelation: 'finance_invoices';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'wallet_transactions_wallet_id_fkey';
            columns: ['wallet_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_wallets';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_dataset_row_cells: {
        Row: {
          cells: Json | null;
          created_at: string | null;
          dataset_id: string | null;
          row_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_dataset_rows_dataset_id_fkey';
            columns: ['dataset_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_datasets';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_invite_links_with_stats: {
        Row: {
          code: string | null;
          created_at: string | null;
          creator_id: string | null;
          current_uses: number | null;
          expires_at: string | null;
          id: string | null;
          is_expired: boolean | null;
          is_full: boolean | null;
          max_uses: number | null;
          updated_at: string | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_invite_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_invite_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_invite_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'shortened_links_creator_stats';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invite_links_creator_id_fkey';
            columns: ['creator_id'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invite_links_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_invite_links_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_link_counts: {
        Row: {
          id: string | null;
          link_count: number | null;
          logo_url: string | null;
          name: string | null;
        };
        Relationships: [];
      };
      workspace_members_and_invites: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          display_name: string | null;
          email: string | null;
          handle: string | null;
          id: string | null;
          pending: boolean | null;
          ws_id: string | null;
        };
        Relationships: [];
      };
      workspace_user_groups_with_amount: {
        Row: {
          amount: number | null;
          archived: boolean | null;
          created_at: string | null;
          ending_date: string | null;
          id: string | null;
          name: string | null;
          notes: string | null;
          sessions: string[] | null;
          starting_date: string | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_user_groups_with_guest: {
        Row: {
          amount: number | null;
          archived: boolean | null;
          created_at: string | null;
          ending_date: string | null;
          id: string | null;
          is_guest: boolean | null;
          name: string | null;
          notes: string | null;
          sessions: string[] | null;
          starting_date: string | null;
          ws_id: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_users_with_groups: {
        Row: {
          address: string | null;
          archived: boolean | null;
          archived_until: string | null;
          avatar_url: string | null;
          balance: number | null;
          birthday: string | null;
          created_at: string | null;
          created_by: string | null;
          display_name: string | null;
          email: string | null;
          ethnicity: string | null;
          full_name: string | null;
          gender: string | null;
          group_count: number | null;
          groups: Json | null;
          guardian: string | null;
          id: string | null;
          linked_users: Json | null;
          national_id: string | null;
          note: string | null;
          phone: string | null;
          updated_at: string | null;
          updated_by: string | null;
          ws_id: string | null;
        };
        Insert: {
          address?: string | null;
          archived?: boolean | null;
          archived_until?: string | null;
          avatar_url?: string | null;
          balance?: number | null;
          birthday?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          display_name?: string | null;
          email?: string | null;
          ethnicity?: string | null;
          full_name?: string | null;
          gender?: string | null;
          group_count?: never;
          groups?: never;
          guardian?: string | null;
          id?: string | null;
          linked_users?: never;
          national_id?: string | null;
          note?: string | null;
          phone?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          ws_id?: string | null;
        };
        Update: {
          address?: string | null;
          archived?: boolean | null;
          archived_until?: string | null;
          avatar_url?: string | null;
          balance?: number | null;
          birthday?: string | null;
          created_at?: string | null;
          created_by?: string | null;
          display_name?: string | null;
          email?: string | null;
          ethnicity?: string | null;
          full_name?: string | null;
          gender?: string | null;
          group_count?: never;
          groups?: never;
          guardian?: string | null;
          id?: string | null;
          linked_users?: never;
          national_id?: string | null;
          note?: string | null;
          phone?: string | null;
          updated_at?: string | null;
          updated_by?: string | null;
          ws_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'distinct_invoice_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'distinct_transaction_creators';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'group_user_with_attendance';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'workspace_users_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'workspace_users';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'workspace_users_with_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_link_counts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_users_ws_id_fkey';
            columns: ['ws_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      archive_old_notifications: {
        Args: { p_days_threshold?: number };
        Returns: number;
      };
      atomic_sync_token_operation: {
        Args: {
          p_calendar_id?: string;
          p_operation?: string;
          p_sync_token?: string;
          p_ws_id: string;
        };
        Returns: {
          last_synced_at: string;
          message: string;
          success: boolean;
          sync_token: string;
        }[];
      };
      award_tuna_xp: {
        Args: { p_source?: string; p_user_id: string; p_xp: number };
        Returns: {
          created_at: string;
          health: number;
          hunger: number;
          id: string;
          last_fed_at: string;
          last_interaction_at: string;
          level: number;
          mood: Database['public']['Enums']['tuna_mood'];
          name: string;
          streak_days: number;
          total_conversations: number;
          total_focus_minutes: number;
          updated_at: string;
          user_id: string;
          xp: number;
          xp_to_next_level: number;
        };
        SetofOptions: {
          from: '*';
          to: 'tuna_pets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      calculate_next_occurrence: {
        Args: {
          frequency: Database['public']['Enums']['recurring_frequency'];
          from_date: string;
        };
        Returns: string;
      };
      calculate_productivity_score: {
        Args: { category_color: string; duration_seconds: number };
        Returns: number;
      };
      calculate_time_tracker_streak: {
        Args: { p_is_personal: boolean; p_user_id: string; p_ws_id: string };
        Returns: number;
      };
      can_create_workspace: { Args: { p_user_id: string }; Returns: boolean };
      can_manage_indicator: {
        Args: { p_indicator_id: string };
        Returns: boolean;
      };
      can_view_request_comments: {
        Args: { p_request_id: string; p_user_id: string };
        Returns: boolean;
      };
      check_email_blocked: { Args: { p_email: string }; Returns: boolean };
      check_email_bounce_status: {
        Args: { p_email_hash: string; p_window_days?: number };
        Returns: {
          block_reason: string;
          complaint_count: number;
          hard_bounce_count: number;
          is_blocked: boolean;
          soft_bounce_count: number;
        }[];
      };
      check_guest_group: { Args: { group_id: string }; Returns: boolean };
      check_guest_lead_eligibility: {
        Args: { p_user_id: string; p_ws_id: string };
        Returns: Json;
      };
      check_ws_creator:
        | { Args: { ws_id: string }; Returns: boolean }
        | { Args: { user_id: string; ws_id: string }; Returns: boolean };
      cleanup_expired_cross_app_tokens: { Args: never; Returns: undefined };
      cleanup_expired_live_sessions: { Args: never; Returns: undefined };
      cleanup_expired_notifications: { Args: never; Returns: number };
      cleanup_old_api_key_usage_logs: { Args: never; Returns: undefined };
      cleanup_old_typing_indicators: { Args: never; Returns: undefined };
      cleanup_role_inconsistencies: { Args: never; Returns: undefined };
      complete_tuna_focus_session: {
        Args: { p_notes?: string; p_session_id: string };
        Returns: {
          actual_duration: number | null;
          completed: boolean;
          created_at: string;
          ended_at: string | null;
          goal: string | null;
          id: string;
          notes: string | null;
          planned_duration: number;
          started_at: string;
          user_id: string;
          xp_earned: number;
        };
        SetofOptions: {
          from: '*';
          to: 'tuna_focus_sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      compute_ai_cost_usd: {
        Args: {
          p_input_tokens: number;
          p_model_id: string;
          p_output_tokens: number;
          p_pricing: Json;
          p_reasoning_tokens: number;
        };
        Returns: number;
      };
      consolidate_workspace_user_links: {
        Args: { target_ws_id?: string };
        Returns: {
          action: string;
          platform_user_id: string;
          ws_id: string;
        }[];
      };
      count_search_users: {
        Args: {
          enabled_filter?: boolean;
          role_filter?: string;
          search_query: string;
        };
        Returns: number;
      };
      count_user_workspaces: { Args: { user_id: string }; Returns: number };
      create_ai_chat: {
        Args: { message: string; model: string; title: string };
        Returns: string;
      };
      create_guest_lead_email: {
        Args: {
          p_content: string;
          p_email: string;
          p_post_id?: string;
          p_receiver_id: string;
          p_sender_id: string;
          p_source_email: string;
          p_source_name: string;
          p_subject: string;
          p_ws_id: string;
        };
        Returns: Json;
      };
      create_missing_personal_workspaces: {
        Args: never;
        Returns: {
          error_message: string;
          success: boolean;
          user_id: string;
          workspace_id: string;
        }[];
      };
      create_notification: {
        Args: {
          p_code?: string;
          p_created_by?: string;
          p_data?: Json;
          p_description?: string;
          p_email?: string;
          p_entity_id?: string;
          p_entity_type?: string;
          p_priority?: Database['public']['Enums']['notification_priority'];
          p_scope?: Database['public']['Enums']['notification_scope'];
          p_title?: string;
          p_type?: string;
          p_user_id?: string;
          p_ws_id?: string;
        };
        Returns: string;
      };
      create_system_announcement: {
        Args: {
          p_action_url?: string;
          p_data?: Json;
          p_description: string;
          p_expires_at?: string;
          p_priority?: Database['public']['Enums']['notification_priority'];
          p_title: string;
        };
        Returns: string;
      };
      create_task_with_relationship: {
        Args: {
          p_current_task_id: string;
          p_current_task_is_source: boolean;
          p_description?: string;
          p_end_date?: string;
          p_estimation_points?: number;
          p_list_id: string;
          p_name: string;
          p_priority?: number;
          p_relationship_type: Database['public']['Enums']['task_relationship_type'];
          p_start_date?: string;
        };
        Returns: Json;
      };
      create_user_notification: {
        Args: {
          p_action_url?: string;
          p_data?: Json;
          p_description?: string;
          p_priority?: Database['public']['Enums']['notification_priority'];
          p_title: string;
          p_type: string;
          p_user_id: string;
        };
        Returns: string;
      };
      ensure_workspace_user_link: {
        Args: { target_user_id: string; target_ws_id: string };
        Returns: string;
      };
      extract_domain: { Args: { url: string }; Returns: string };
      extract_referrer_domain: { Args: { url: string }; Returns: string };
      fetch_workspace_invoice_configs: {
        Args: { p_ws_id: string };
        Returns: {
          blocked_pending_group_ids: string[];
          use_attendance_based: boolean;
        }[];
      };
      generate_cross_app_token:
        | {
            Args: {
              p_expiry_seconds?: number;
              p_origin_app: string;
              p_target_app: string;
              p_user_id: string;
            };
            Returns: string;
          }
        | {
            Args: {
              p_expiry_seconds?: number;
              p_origin_app: string;
              p_session_data?: Json;
              p_target_app: string;
              p_user_id: string;
            };
            Returns: string;
          };
      get_action_frequency_by_hour: {
        Args: never;
        Returns: {
          action_count: number;
          hour_of_day: number;
        }[];
      };
      get_active_ip_block: {
        Args: { p_ip_address: string };
        Returns: {
          block_level: number;
          blocked_at: string;
          expires_at: string;
          id: string;
          reason: Database['public']['Enums']['abuse_event_type'];
        }[];
      };
      get_active_sessions_count: { Args: never; Returns: number };
      get_activity_heatmap: {
        Args: never;
        Returns: {
          activity_count: number;
          day_of_week: number;
          hour_of_day: number;
        }[];
      };
      get_ai_execution_daily_stats_v2: {
        Args: {
          p_end_date?: string;
          p_pricing?: Json;
          p_start_date?: string;
          p_ws_id: string;
        };
        Returns: {
          date: string;
          executions: number;
          input_tokens: number;
          output_tokens: number;
          reasoning_tokens: number;
          total_cost_usd: number;
          total_tokens: number;
        }[];
      };
      get_ai_execution_model_stats_v2: {
        Args: {
          p_end_date?: string;
          p_pricing?: Json;
          p_start_date?: string;
          p_ws_id: string;
        };
        Returns: {
          avg_cost_per_execution: number;
          avg_tokens_per_execution: number;
          executions: number;
          model_id: string;
          percentage_of_total: number;
          total_cost_usd: number;
          total_tokens: number;
        }[];
      };
      get_ai_execution_monthly_cost_v2: {
        Args: {
          p_exchange_rate?: number;
          p_month?: number;
          p_pricing?: Json;
          p_ws_id: string;
          p_year?: number;
        };
        Returns: {
          avg_daily_cost: number;
          executions: number;
          total_cost_usd: number;
          total_cost_vnd: number;
        }[];
      };
      get_ai_execution_summary_v2: {
        Args: {
          p_end_date?: string;
          p_exchange_rate?: number;
          p_pricing?: Json;
          p_start_date?: string;
          p_ws_id: string;
        };
        Returns: {
          avg_cost_per_execution: number;
          avg_tokens_per_execution: number;
          total_cost_usd: number;
          total_cost_vnd: number;
          total_executions: number;
          total_input_tokens: number;
          total_output_tokens: number;
          total_reasoning_tokens: number;
          total_tokens: number;
        }[];
      };
      get_auth_provider_stats: {
        Args: never;
        Returns: {
          last_sign_in_avg: unknown;
          percentage: number;
          provider: string;
          user_count: number;
        }[];
      };
      get_auth_session_statistics: {
        Args: never;
        Returns: {
          active_sessions: number;
          avg_session_duration_hours: number;
          median_session_duration_minutes: number;
          sessions_this_month: number;
          sessions_this_week: number;
          sessions_today: number;
          total_sessions: number;
        }[];
      };
      get_available_referral_users: {
        Args: { p_user_id: string; p_ws_id: string };
        Returns: {
          display_name: string;
          email: string;
          full_name: string;
          id: string;
          phone: string;
        }[];
      };
      get_blocked_tasks: {
        Args: { p_task_id: string };
        Returns: {
          task_id: string;
        }[];
      };
      get_blocking_tasks: {
        Args: { p_task_id: string };
        Returns: {
          task_id: string;
        }[];
      };
      get_bounce_complaint_stats: {
        Args: { p_since?: string };
        Returns: {
          complaints: number;
          hard_bounces: number;
          soft_bounces: number;
          total_events: number;
          unique_emails_affected: number;
        }[];
      };
      get_browsers: {
        Args: { p_limit?: number; p_link_id: string };
        Returns: {
          browser: string;
          count: number;
        }[];
      };
      get_budget_status: {
        Args: { _ws_id: string };
        Returns: {
          amount: number;
          budget_id: string;
          budget_name: string;
          is_near_threshold: boolean;
          is_over_budget: boolean;
          percentage_used: number;
          remaining: number;
          spent: number;
        }[];
      };
      get_category_breakdown:
        | {
            Args: {
              _end_date?: string;
              _interval?: string;
              _start_date?: string;
              _transaction_type?: string;
              _ws_id: string;
              include_confidential?: boolean;
            };
            Returns: {
              category_color: string;
              category_icon: string;
              category_id: string;
              category_name: string;
              period: string;
              total: number;
            }[];
          }
        | {
            Args: {
              _anchor_to_latest?: boolean;
              _end_date?: string;
              _interval?: string;
              _start_date?: string;
              _transaction_type?: string;
              _ws_id: string;
              include_confidential?: boolean;
            };
            Returns: {
              category_color: string;
              category_icon: string;
              category_id: string;
              category_name: string;
              period: string;
              total: number;
            }[];
          };
      get_challenge_stats: {
        Args: { challenge_id_param: string; user_id_param: string };
        Returns: {
          problems_attempted: number;
          total_score: number;
        }[];
      };
      get_clicks_by_day: {
        Args: { p_days?: number; p_link_id: string };
        Returns: {
          click_date: string;
          clicks: number;
        }[];
      };
      get_clicks_by_day_of_week: {
        Args: { p_link_id: string };
        Returns: {
          clicks: number;
          day_name: string;
          day_of_week: number;
        }[];
      };
      get_clicks_by_hour: {
        Args: { p_link_id: string };
        Returns: {
          clicks: number;
          hour: number;
        }[];
      };
      get_created_workspace_count: {
        Args: { user_id: string };
        Returns: number;
      };
      get_daily_activity_heatmap: {
        Args: { p_days_back?: number; p_user_id?: string; p_ws_id: string };
        Returns: Json;
      };
      get_daily_income_expense:
        | {
            Args: { _ws_id: string; past_days?: number };
            Returns: {
              day: string;
              total_expense: number;
              total_income: number;
            }[];
          }
        | {
            Args: {
              _ws_id: string;
              include_confidential?: boolean;
              past_days?: number;
            };
            Returns: {
              day: string;
              total_expense: number;
              total_income: number;
            }[];
          };
      get_daily_income_expense_range: {
        Args: {
          _end_date?: string;
          _start_date?: string;
          _ws_id: string;
          include_confidential?: boolean;
        };
        Returns: {
          day: string;
          total_expense: number;
          total_income: number;
        }[];
      };
      get_daily_invoice_totals: {
        Args: {
          _ws_id: string;
          end_date?: string;
          past_days?: number;
          start_date?: string;
          user_ids?: string[];
          wallet_ids?: string[];
        };
        Returns: {
          invoice_count: number;
          period: string;
          total_amount: number;
          wallet_id: string;
          wallet_name: string;
        }[];
      };
      get_daily_prompt_completion_tokens: {
        Args: { past_days?: number };
        Returns: {
          day: string;
          total_completion_tokens: number;
          total_prompt_tokens: number;
        }[];
      };
      get_dau_count: { Args: never; Returns: number };
      get_default_ai_pricing: { Args: never; Returns: Json };
      get_default_calendar_for_event: {
        Args: {
          p_scheduling_source?: Database['public']['Enums']['calendar_scheduling_source'];
          p_ws_id: string;
        };
        Returns: string;
      };
      get_device_types: {
        Args: { p_limit?: number; p_link_id: string };
        Returns: {
          count: number;
          device_type: string;
        }[];
      };
      get_email_audit_stats: {
        Args: { p_since?: string; p_ws_id: string };
        Returns: {
          bounced: number;
          complained: number;
          failed: number;
          sent: number;
          total: number;
        }[];
      };
      get_email_audit_stats_global: {
        Args: { p_since?: string };
        Returns: {
          bounced: number;
          complained: number;
          failed: number;
          sent: number;
          total: number;
        }[];
      };
      get_email_block_statuses: {
        Args: { p_emails: string[] };
        Returns: Database['public']['CompositeTypes']['email_block_status'][];
        SetofOptions: {
          from: '*';
          to: 'email_block_status';
          isOneToOne: false;
          isSetofReturn: true;
        };
      };
      get_email_stats: {
        Args: { end_date?: string; filter_ws_id: string; start_date?: string };
        Returns: {
          failed_count: number;
          rate_limited_count: number;
          sent_count: number;
          total_count: number;
        }[];
      };
      get_engagement_metrics_over_time: {
        Args: { days?: number };
        Returns: {
          date: string;
          dau: number;
          mau: number;
          wau: number;
        }[];
      };
      get_feature_adoption: {
        Args: { feature_action_prefix: string };
        Returns: {
          adoption_count: number;
          adoption_percentage: number;
          feature_name: string;
        }[];
      };
      get_finance_invoices_count: { Args: { ws_id: string }; Returns: number };
      get_grouped_sessions_paginated: {
        Args: {
          p_end_date?: string;
          p_limit?: number;
          p_page?: number;
          p_period?: string;
          p_search?: string;
          p_start_date?: string;
          p_timezone?: string;
          p_ws_id: string;
        };
        Returns: Json;
      };
      get_guest_user_leads: {
        Args: {
          p_page?: number;
          p_page_size?: number;
          p_search?: string;
          p_threshold?: number;
          p_ws_id: string;
        };
        Returns: {
          attendance_count: number;
          created_at: string;
          email: string;
          full_name: string;
          gender: string;
          group_id: string;
          group_name: string;
          has_lead_generation: boolean;
          id: string;
          phone: string;
          total_count: number;
        }[];
      };
      get_healthcare_checkups_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_healthcare_diagnoses_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_healthcare_vital_groups_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_healthcare_vitals_count: { Args: { ws_id: string }; Returns: number };
      get_hourly_prompt_completion_tokens: {
        Args: { past_hours?: number };
        Returns: {
          hour: string;
          total_completion_tokens: number;
          total_prompt_tokens: number;
        }[];
      };
      get_inventory_batches_count: { Args: { ws_id: string }; Returns: number };
      get_inventory_product_categories_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_inventory_products: {
        Args: {
          _category_ids?: string[];
          _has_unit?: boolean;
          _warehouse_ids?: string[];
          _ws_id?: string;
        };
        Returns: {
          amount: number;
          category: string;
          created_at: string;
          id: string;
          manufacturer: string;
          name: string;
          price: number;
          unit: string;
          unit_id: string;
          ws_id: string;
        }[];
      };
      get_inventory_products_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_inventory_suppliers_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_inventory_units_count: { Args: { ws_id: string }; Returns: number };
      get_inventory_warehouses_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_invoice_creators: {
        Args: { p_ws_id: string };
        Returns: {
          avatar_url: string;
          email: string;
          full_name: string;
          id: string;
        }[];
      };
      get_invoice_totals_by_date_range: {
        Args: {
          _ws_id: string;
          end_date?: string;
          group_by_creator?: boolean;
          interval_type?: string;
          start_date?: string;
          user_ids?: string[];
          wallet_ids?: string[];
          week_start_day?: number;
        };
        Returns: {
          group_avatar_url: string;
          group_id: string;
          group_name: string;
          invoice_count: number;
          period: string;
          total_amount: number;
        }[];
      };
      get_ip_block_level: { Args: { p_ip_address: string }; Returns: number };
      get_joined_workspace_count: {
        Args: { user_id: string };
        Returns: number;
      };
      get_mau_count: { Args: never; Returns: number };
      get_monthly_category_breakdown:
        | {
            Args: {
              _end_date?: string;
              _start_date?: string;
              _ws_id: string;
              include_confidential?: boolean;
            };
            Returns: {
              category_color: string;
              category_icon: string;
              category_id: string;
              category_name: string;
              month: string;
              total: number;
            }[];
          }
        | {
            Args: {
              _end_date?: string;
              _start_date?: string;
              _transaction_type?: string;
              _ws_id: string;
              include_confidential?: boolean;
            };
            Returns: {
              category_color: string;
              category_icon: string;
              category_id: string;
              category_name: string;
              month: string;
              total: number;
            }[];
          };
      get_monthly_income_expense:
        | {
            Args: { _ws_id: string; past_months?: number };
            Returns: {
              month: string;
              total_expense: number;
              total_income: number;
            }[];
          }
        | {
            Args: {
              _ws_id: string;
              include_confidential?: boolean;
              past_months?: number;
            };
            Returns: {
              month: string;
              total_expense: number;
              total_income: number;
            }[];
          };
      get_monthly_income_expense_range: {
        Args: {
          _end_date?: string;
          _start_date?: string;
          _ws_id: string;
          include_confidential?: boolean;
        };
        Returns: {
          month: string;
          total_expense: number;
          total_income: number;
        }[];
      };
      get_monthly_invoice_totals: {
        Args: {
          _ws_id: string;
          end_date?: string;
          past_months?: number;
          start_date?: string;
          user_ids?: string[];
          wallet_ids?: string[];
        };
        Returns: {
          invoice_count: number;
          period: string;
          total_amount: number;
          wallet_id: string;
          wallet_name: string;
        }[];
      };
      get_monthly_prompt_completion_tokens: {
        Args: { past_months?: number };
        Returns: {
          month: string;
          total_completion_tokens: number;
          total_prompt_tokens: number;
        }[];
      };
      get_next_task_display_number: {
        Args: { p_board_id: string };
        Returns: number;
      };
      get_notification_email_config: {
        Args: { p_notification_type: string };
        Returns: {
          batch_window_minutes: number;
          delivery_mode: Database['public']['Enums']['notification_delivery_mode'];
          email_subject_template: string;
          email_template: string;
          enabled: boolean;
          priority_override: Database['public']['Enums']['notification_priority'];
        }[];
      };
      get_operating_systems: {
        Args: { p_limit?: number; p_link_id: string };
        Returns: {
          count: number;
          os: string;
        }[];
      };
      get_or_create_external_calendar: {
        Args: {
          p_calendar_id: string;
          p_calendar_name: string;
          p_color: string;
          p_provider: Database['public']['Enums']['calendar_provider'];
          p_ws_id: string;
        };
        Returns: string;
      };
      get_or_create_notification_batch:
        | {
            Args: {
              p_channel: string;
              p_user_id: string;
              p_window_minutes?: number;
              p_ws_id: string;
            };
            Returns: string;
          }
        | {
            Args: {
              p_channel: string;
              p_email?: string;
              p_user_id: string;
              p_window_minutes?: number;
              p_ws_id: string;
            };
            Returns: string;
          }
        | {
            Args: {
              p_channel: string;
              p_delivery_mode?: Database['public']['Enums']['notification_delivery_mode'];
              p_email?: string;
              p_user_id: string;
              p_window_minutes?: number;
              p_ws_id: string;
            };
            Returns: string;
          };
      get_or_create_tuna_pet: {
        Args: { p_user_id: string };
        Returns: {
          created_at: string;
          health: number;
          hunger: number;
          id: string;
          last_fed_at: string;
          last_interaction_at: string;
          level: number;
          mood: Database['public']['Enums']['tuna_mood'];
          name: string;
          streak_days: number;
          total_conversations: number;
          total_focus_minutes: number;
          updated_at: string;
          user_id: string;
          xp: number;
          xp_to_next_level: number;
        };
        SetofOptions: {
          from: '*';
          to: 'tuna_pets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      get_pending_event_participants: {
        Args: { _event_id: string };
        Returns: number;
      };
      get_pending_invoices: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_query?: string;
          p_user_ids?: string[];
          p_ws_id: string;
        };
        Returns: {
          attendance_days: number;
          group_id: string;
          group_name: string;
          months_owed: string;
          potential_total: number;
          total_sessions: number;
          user_avatar_url: string;
          user_id: string;
          user_name: string;
        }[];
      };
      get_pending_invoices_base: {
        Args: { p_use_attendance_based?: boolean; p_ws_id: string };
        Returns: {
          attendance_days: number;
          billable_days: number;
          group_id: string;
          group_name: string;
          month: string;
          sessions: string[];
          user_avatar_url: string;
          user_id: string;
          user_name: string;
        }[];
      };
      get_pending_invoices_count: {
        Args: { p_query?: string; p_user_ids?: string[]; p_ws_id: string };
        Returns: number;
      };
      get_pending_invoices_grouped_by_user: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_query?: string;
          p_user_ids?: string[];
          p_ws_id: string;
        };
        Returns: {
          attendance_days: number;
          group_ids: string[];
          group_names: string[];
          months_owed: string[];
          potential_total: number;
          total_sessions: number;
          user_avatar_url: string;
          user_id: string;
          user_name: string;
        }[];
      };
      get_pending_invoices_grouped_by_user_count: {
        Args: { p_query?: string; p_user_ids?: string[]; p_ws_id: string };
        Returns: number;
      };
      get_period_summary_stats: {
        Args: { p_period?: string; p_ws_id: string };
        Returns: Json;
      };
      get_possible_excluded_groups: {
        Args: { _ws_id: string; included_groups: string[] };
        Returns: {
          amount: number;
          id: string;
          name: string;
          ws_id: string;
        }[];
      };
      get_possible_excluded_tags: {
        Args: { _ws_id: string; included_tags: string[] };
        Returns: {
          amount: number;
          id: string;
          name: string;
          ws_id: string;
        }[];
      };
      get_power_users: {
        Args: { limit_count?: number };
        Returns: {
          action_count: number;
          last_seen: string;
          user_id: string;
          username: string;
        }[];
      };
      get_recent_actions_summary: {
        Args: { limit_count?: number };
        Returns: {
          action: string;
          action_count: number;
          last_occurrence: string;
          unique_users: number;
        }[];
      };
      get_recent_audit_logs: {
        Args: { limit_count?: number };
        Returns: {
          action: string;
          actor_id: string;
          actor_username: string;
          created_at: string;
          id: string;
          ip_address: string;
          log_type: string;
        }[];
      };
      get_related_tasks: {
        Args: { p_task_id: string };
        Returns: {
          task_id: string;
        }[];
      };
      get_retention_rate: {
        Args: { period?: string };
        Returns: {
          cohort_period: string;
          cohort_size: number;
          retained_users: number;
          retention_rate: number;
        }[];
      };
      get_session_chain_root: {
        Args: { session_id_input: string };
        Returns: string;
      };
      get_session_chain_summary: {
        Args: { session_id_input: string };
        Returns: Json;
      };
      get_session_statistics: {
        Args: never;
        Returns: {
          active_count: number;
          completed_count: number;
          latest_session_date: string;
          total_count: number;
          unique_users_count: number;
        }[];
      };
      get_session_templates: {
        Args: {
          limit_count?: number;
          user_id_param: string;
          workspace_id: string;
        };
        Returns: {
          avg_duration: number;
          category_color: string;
          category_id: string;
          category_name: string;
          description: string;
          last_used: string;
          tags: string[];
          task_id: string;
          task_name: string;
          title: string;
          usage_count: number;
        }[];
      };
      get_sessions_by_device: {
        Args: never;
        Returns: {
          device_type: string;
          percentage: number;
          session_count: number;
        }[];
      };
      get_sign_ins_by_provider: {
        Args: { days?: number };
        Returns: {
          date: string;
          provider: string;
          sign_in_count: number;
        }[];
      };
      get_submission_statistics: {
        Args: never;
        Returns: {
          latest_submission_date: string;
          total_count: number;
          unique_users_count: number;
        }[];
      };
      get_task_children: {
        Args: { p_task_id: string };
        Returns: {
          depth: number;
          task_id: string;
        }[];
      };
      get_task_details: {
        Args: { p_task_id: string };
        Returns: {
          board_id: string;
          board_name: string;
          creator_id: string;
          list_id: string;
          list_name: string;
          task_id: string;
          task_name: string;
          ws_id: string;
        }[];
      };
      get_task_history: {
        Args: {
          p_change_type?: string;
          p_field_name?: string;
          p_limit?: number;
          p_offset?: number;
          p_task_id: string;
          p_ws_id: string;
        };
        Returns: {
          change_type: string;
          changed_at: string;
          changed_by: string;
          field_name: string;
          id: string;
          metadata: Json;
          new_value: Json;
          old_value: Json;
          task_id: string;
          task_name: string;
          total_count: number;
          user_avatar_url: string;
          user_display_name: string;
          user_id: string;
        }[];
      };
      get_task_parents: {
        Args: { p_task_id: string };
        Returns: {
          depth: number;
          task_id: string;
        }[];
      };
      get_task_relationships_at_snapshot: {
        Args: { p_history_id: string; p_task_id: string; p_ws_id: string };
        Returns: Json;
      };
      get_task_share_permission_from_link: {
        Args: { p_share_code: string };
        Returns: Database['public']['Enums']['task_share_permission'];
      };
      get_task_snapshot_at_history: {
        Args: { p_history_id: string; p_task_id: string; p_ws_id: string };
        Returns: Json;
      };
      get_task_workspace_id: { Args: { p_task_id: string }; Returns: string };
      get_time_tracker_stats: {
        Args: {
          p_is_personal?: boolean;
          p_timezone?: string;
          p_user_id: string;
          p_ws_id: string;
        };
        Returns: {
          daily_activity: Json;
          month_time: number;
          streak: number;
          today_time: number;
          week_time: number;
        }[];
      };
      get_time_tracking_daily_activity: {
        Args: { p_days_back?: number; p_user_id?: string; p_ws_id: string };
        Returns: Json;
      };
      get_time_tracking_sessions_paginated: {
        Args: {
          p_limit?: number;
          p_page?: number;
          p_period?: string;
          p_search?: string;
          p_ws_id: string;
        };
        Returns: Json;
      };
      get_time_tracking_stats: {
        Args: { p_user_id?: string; p_ws_id: string };
        Returns: Json;
      };
      get_top_cities: {
        Args: { p_limit?: number; p_link_id: string };
        Returns: {
          city: string;
          count: number;
          country: string;
        }[];
      };
      get_top_countries: {
        Args: { p_limit?: number; p_link_id: string };
        Returns: {
          count: number;
          country: string;
        }[];
      };
      get_top_referrers: {
        Args: { p_limit?: number; p_link_id: string };
        Returns: {
          count: number;
          domain: string;
        }[];
      };
      get_transaction_categories_with_amount_by_workspace: {
        Args: { p_ws_id: string };
        Returns: {
          amount: number;
          color: string;
          created_at: string;
          icon: string;
          id: string;
          is_expense: boolean;
          name: string;
          transaction_count: number;
          ws_id: string;
        }[];
      };
      get_transaction_count_by_tag: {
        Args: { _ws_id: string };
        Returns: {
          tag_color: string;
          tag_id: string;
          tag_name: string;
          transaction_count: number;
        }[];
      };
      get_transaction_creators: {
        Args: { p_ws_id: string };
        Returns: {
          avatar_url: string;
          email: string;
          full_name: string;
          id: string;
        }[];
      };
      get_transaction_stats: {
        Args: {
          p_category_ids?: string[];
          p_creator_ids?: string[];
          p_end_date?: string;
          p_search_query?: string;
          p_start_date?: string;
          p_tag_ids?: string[];
          p_user_id?: string;
          p_wallet_ids?: string[];
          p_ws_id: string;
        };
        Returns: {
          has_redacted_amounts: boolean;
          net_total: number;
          total_expense: number;
          total_income: number;
          total_transactions: number;
        }[];
      };
      get_upcoming_recurring_transactions: {
        Args: { _ws_id: string; days_ahead?: number };
        Returns: {
          amount: number;
          category_name: string;
          frequency: Database['public']['Enums']['recurring_frequency'];
          id: string;
          name: string;
          next_occurrence: string;
          wallet_name: string;
        }[];
      };
      get_user_accessible_tasks: {
        Args: {
          p_include_deleted?: boolean;
          p_list_statuses?: Database['public']['Enums']['task_board_status'][];
          p_user_id: string;
          p_ws_id?: string;
        };
        Returns: {
          task_closed_at: string;
          task_completed_at: string;
          task_created_at: string;
          task_creator_id: string;
          task_deleted_at: string;
          task_description: string;
          task_end_date: string;
          task_estimation_points: number;
          task_id: string;
          task_list_id: string;
          task_name: string;
          task_priority: Database['public']['Enums']['task_priority'];
          task_start_date: string;
        }[];
      };
      get_user_activity_cohorts: {
        Args: never;
        Returns: {
          cohort_name: string;
          percentage: number;
          user_count: number;
        }[];
      };
      get_user_email: { Args: { p_user_id: string }; Returns: string };
      get_user_growth_comparison: {
        Args: never;
        Returns: {
          growth_rate_monthly: number;
          growth_rate_weekly: number;
          total_users: number;
          users_this_month: number;
          users_this_week: number;
          users_today: number;
        }[];
      };
      get_user_growth_stats: {
        Args: { time_period?: string };
        Returns: {
          cumulative_users: number;
          new_users: number;
          period: string;
        }[];
      };
      get_user_session_stats: {
        Args: { user_id: string };
        Returns: {
          active_sessions: number;
          current_session_age: unknown;
          total_sessions: number;
        }[];
      };
      get_user_sessions: {
        Args: { user_id: string };
        Returns: {
          created_at: string;
          ip: string;
          is_current: boolean;
          session_id: string;
          updated_at: string;
          user_agent: string;
        }[];
      };
      get_user_tasks: {
        Args: { _board_id: string };
        Returns: {
          board_id: string;
          completed: boolean;
          description: string;
          end_date: string;
          id: string;
          list_id: string;
          name: string;
          priority: number;
          start_date: string;
        }[];
      };
      get_user_whitelist_status: {
        Args: { user_id_param: string };
        Returns: {
          allow_challenge_management: boolean;
          allow_manage_all_challenges: boolean;
          allow_role_management: boolean;
          enabled: boolean;
          is_whitelisted: boolean;
        }[];
      };
      get_wallet_balance_at_date: {
        Args: {
          _target_date: string;
          _ws_id: string;
          include_confidential?: boolean;
        };
        Returns: number;
      };
      get_wallet_expense_count:
        | { Args: { p_user_id?: string; p_ws_id: string }; Returns: number }
        | {
            Args: {
              p_include_confidential?: boolean;
              p_user_id?: string;
              p_ws_id: string;
            };
            Returns: number;
          };
      get_wallet_expense_sum:
        | { Args: { p_user_id?: string; p_ws_id: string }; Returns: number }
        | {
            Args: {
              p_include_confidential?: boolean;
              p_user_id?: string;
              p_ws_id: string;
            };
            Returns: number;
          };
      get_wallet_income_count:
        | { Args: { p_user_id?: string; p_ws_id: string }; Returns: number }
        | {
            Args: {
              p_include_confidential?: boolean;
              p_user_id?: string;
              p_ws_id: string;
            };
            Returns: number;
          };
      get_wallet_income_sum:
        | { Args: { p_user_id?: string; p_ws_id: string }; Returns: number }
        | {
            Args: {
              p_include_confidential?: boolean;
              p_user_id?: string;
              p_ws_id: string;
            };
            Returns: number;
          };
      get_wallet_permission_context: {
        Args: { p_user_id: string; p_ws_id: string };
        Returns: {
          allowed_wallet_ids: string[];
          can_view_amount: boolean;
          can_view_expenses: boolean;
          can_view_incomes: boolean;
          can_view_transactions: boolean;
          has_granular: boolean;
          has_manage_finance: boolean;
        }[];
      };
      get_wallet_transactions_with_permissions: {
        Args: {
          p_category_ids?: string[];
          p_creator_ids?: string[];
          p_cursor_created_at?: string;
          p_cursor_taken_at?: string;
          p_end_date?: string;
          p_include_count?: boolean;
          p_limit?: number;
          p_offset?: number;
          p_order_by?: string;
          p_order_direction?: string;
          p_search_query?: string;
          p_start_date?: string;
          p_tag_ids?: string[];
          p_transaction_ids?: string[];
          p_user_id?: string;
          p_wallet_ids?: string[];
          p_ws_id: string;
        };
        Returns: {
          amount: number;
          category_color: string;
          category_icon: string;
          category_id: string;
          category_name: string;
          created_at: string;
          creator_avatar_url: string;
          creator_email: string;
          creator_full_name: string;
          creator_id: string;
          description: string;
          id: string;
          invoice_id: string;
          is_amount_confidential: boolean;
          is_category_confidential: boolean;
          is_description_confidential: boolean;
          platform_creator_id: string;
          report_opt_in: boolean;
          taken_at: string;
          total_count: number;
          wallet_id: string;
          wallet_name: string;
        }[];
      };
      get_wallet_viewing_window_days: {
        Args: { p_custom_days?: number; p_viewing_window: string };
        Returns: number;
      };
      get_wau_count: { Args: never; Returns: number };
      get_weekly_invoice_totals:
        | {
            Args: {
              _ws_id: string;
              end_date?: string;
              past_weeks?: number;
              start_date?: string;
              user_ids?: string[];
              wallet_ids?: string[];
            };
            Returns: {
              invoice_count: number;
              period: string;
              total_amount: number;
              wallet_id: string;
              wallet_name: string;
            }[];
          }
        | {
            Args: {
              _ws_id: string;
              end_date?: string;
              past_weeks?: number;
              start_date?: string;
              user_ids?: string[];
              wallet_ids?: string[];
              week_start_day?: number;
            };
            Returns: {
              invoice_count: number;
              period: string;
              total_amount: number;
              wallet_id: string;
              wallet_name: string;
            }[];
          };
      get_workspace_drive_size: { Args: { ws_id: string }; Returns: number };
      get_workspace_member_count: {
        Args: { p_ws_id: string };
        Returns: number;
      };
      get_workspace_member_distribution: {
        Args: never;
        Returns: {
          member_range: string;
          percentage: number;
          workspace_count: number;
        }[];
      };
      get_workspace_products_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_workspace_statistics: {
        Args: never;
        Returns: {
          active_workspaces: number;
          avg_members_per_workspace: number;
          empty_workspace_count: number;
          median_members_per_workspace: number;
          total_workspaces: number;
          workspaces_created_this_month: number;
          workspaces_created_this_week: number;
          workspaces_created_today: number;
        }[];
      };
      get_workspace_storage_limit: { Args: { ws_id: string }; Returns: number };
      get_workspace_task_history: {
        Args: {
          p_board_id?: string;
          p_change_type?: string;
          p_field_name?: string;
          p_from?: string;
          p_page?: number;
          p_page_size?: number;
          p_search?: string;
          p_to?: string;
          p_ws_id: string;
        };
        Returns: {
          board_id: string;
          board_name: string;
          change_type: string;
          changed_at: string;
          changed_by: string;
          field_name: string;
          id: string;
          metadata: Json;
          new_value: Json;
          old_value: Json;
          task_deleted_at: string;
          task_id: string;
          task_name: string;
          task_permanently_deleted: boolean;
          total_count: number;
          user_avatar_url: string;
          user_display_name: string;
          user_id: string;
        }[];
      };
      get_workspace_time_tracking_stats: {
        Args: { p_target_date?: string; p_workspace_id: string };
        Returns: Json;
      };
      get_workspace_transaction_categories_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_workspace_transactions_count: {
        Args: { end_date?: string; start_date?: string; ws_id: string };
        Returns: number;
      };
      get_workspace_user_groups: {
        Args: {
          _ws_id: string;
          excluded_tags: string[];
          included_tags: string[];
          search_query: string;
        };
        Returns: {
          created_at: string;
          id: string;
          name: string;
          notes: string;
          tag_count: number;
          tags: string[];
          ws_id: string;
        }[];
      };
      get_workspace_user_groups_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_workspace_user_with_details: {
        Args: { p_user_id: string; p_ws_id: string };
        Returns: Json;
      };
      get_workspace_users: {
        Args: {
          _ws_id: string;
          excluded_groups: string[];
          include_archived?: boolean;
          included_groups: string[];
          link_status?: string;
          search_query: string;
        };
        Returns: {
          address: string;
          archived: boolean;
          archived_until: string;
          avatar_url: string;
          balance: number;
          birthday: string;
          created_at: string;
          display_name: string;
          email: string;
          ethnicity: string;
          full_name: string;
          gender: string;
          group_count: number;
          groups: string[];
          guardian: string;
          id: string;
          linked_users: Json;
          national_id: string;
          note: string;
          phone: string;
          updated_at: string;
          ws_id: string;
        }[];
      };
      get_workspace_users_count: { Args: { ws_id: string }; Returns: number };
      get_workspace_wallets_count: { Args: { ws_id: string }; Returns: number };
      get_workspace_wallets_expense:
        | {
            Args: {
              end_date?: string;
              include_confidential?: boolean;
              p_user_id?: string;
              start_date?: string;
              ws_id: string;
            };
            Returns: number;
          }
        | {
            Args: { end_date?: string; start_date?: string; ws_id: string };
            Returns: number;
          }
        | {
            Args: {
              end_date?: string;
              include_confidential?: boolean;
              start_date?: string;
              ws_id: string;
            };
            Returns: number;
          };
      get_workspace_wallets_income:
        | {
            Args: {
              end_date?: string;
              include_confidential?: boolean;
              p_user_id?: string;
              start_date?: string;
              ws_id: string;
            };
            Returns: number;
          }
        | {
            Args: { end_date?: string; start_date?: string; ws_id: string };
            Returns: number;
          }
        | {
            Args: {
              end_date?: string;
              include_confidential?: boolean;
              start_date?: string;
              ws_id: string;
            };
            Returns: number;
          };
      hard_delete_soft_deleted_items: { Args: never; Returns: undefined };
      has_task_permission: {
        Args: { p_permission: string; p_task_id: string };
        Returns: boolean;
      };
      has_workspace_permission: {
        Args: { p_permission: string; p_user_id: string; p_ws_id: string };
        Returns: boolean;
      };
      has_workspace_secret: {
        Args: { secret_name: string; ws_id: string };
        Returns: boolean;
      };
      insert_ai_chat_message: {
        Args: { chat_id: string; message: string; source: string };
        Returns: undefined;
      };
      insert_task_history: {
        Args: {
          p_change_type: string;
          p_field_name?: string;
          p_metadata?: Json;
          p_new_value?: Json;
          p_old_value?: Json;
          p_task_id: string;
        };
        Returns: string;
      };
      insert_time_tracking_session_bypassed: {
        Args: {
          p_category_id?: string;
          p_description: string;
          p_duration_seconds: number;
          p_end_time: string;
          p_start_time: string;
          p_task_id?: string;
          p_title: string;
          p_user_id: string;
          p_ws_id: string;
        };
        Returns: {
          category_id: string | null;
          created_at: string | null;
          date: string | null;
          description: string | null;
          duration_seconds: number | null;
          end_time: string | null;
          id: string;
          is_running: boolean | null;
          parent_session_id: string | null;
          pending_approval: boolean;
          productivity_score: number | null;
          start_time: string;
          tags: string[] | null;
          task_id: string | null;
          title: string;
          updated_at: string | null;
          user_id: string;
          was_resumed: boolean;
          ws_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'time_tracking_sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      is_list_accessible: { Args: { _list_id: string }; Returns: boolean };
      is_member_invited: {
        Args: { _org_id: string; _user_id: string };
        Returns: boolean;
      };
      is_nova_challenge_manager: { Args: never; Returns: boolean };
      is_nova_role_manager: { Args: never; Returns: boolean };
      is_nova_user_email_in_team: {
        Args: { _team_id: string; _user_email: string };
        Returns: boolean;
      };
      is_nova_user_id_in_team: {
        Args: { _team_id: string; _user_id: string };
        Returns: boolean;
      };
      is_org_member: {
        Args: { _org_id: string; _user_id: string };
        Returns: boolean;
      };
      is_personal_workspace: { Args: { p_ws_id: string }; Returns: boolean };
      is_project_member: { Args: { _project_id: string }; Returns: boolean };
      is_task_accessible: { Args: { _task_id: string }; Returns: boolean };
      is_task_board_member: {
        Args: { _board_id: string; _user_id: string };
        Returns: boolean;
      };
      is_task_sharing_enabled: {
        Args: { p_task_id: string };
        Returns: boolean;
      };
      is_task_workspace_member: {
        Args: { p_task_id: string };
        Returns: boolean;
      };
      is_tuturuuu_email: { Args: { user_email: string }; Returns: boolean };
      is_user_guest: { Args: { user_uuid: string }; Returns: boolean };
      is_user_task_in_board: {
        Args: { _task_id: string; _user_id: string };
        Returns: boolean;
      };
      is_user_whitelisted: {
        Args: { user_id_param: string };
        Returns: boolean;
      };
      is_workspace_owner: {
        Args: { p_user_id: string; p_ws_id: string };
        Returns: boolean;
      };
      match_tasks: {
        Args: {
          filter_deleted?: boolean;
          filter_ws_id?: string;
          match_count?: number;
          match_threshold?: number;
          query_embedding: string;
          query_text: string;
        };
        Returns: {
          board_id: string;
          board_name: string;
          closed_at: string;
          completed_at: string;
          created_at: string;
          description: string;
          end_date: string;
          id: string;
          list_id: string;
          list_name: string;
          list_status: Database['public']['Enums']['task_board_status'];
          name: string;
          priority: Database['public']['Enums']['task_priority'];
          similarity: number;
          start_date: string;
        }[];
      };
      normalize_task_sort_keys: { Args: never; Returns: undefined };
      nova_get_all_challenges_with_user_stats: {
        Args: { user_id: string };
        Returns: Json;
      };
      nova_get_challenge_with_user_stats: {
        Args: { challenge_id: string; user_id: string };
        Returns: Json;
      };
      nova_get_user_daily_sessions: {
        Args: { challenge_id: string; user_id: string };
        Returns: number;
      };
      nova_get_user_total_sessions: {
        Args: { challenge_id: string; user_id: string };
        Returns: number;
      };
      parse_user_agent: {
        Args: { user_agent: string };
        Returns: {
          browser: string;
          device_type: string;
          os: string;
        }[];
      };
      pause_session_for_break:
        | {
            Args: {
              p_duration_seconds: number;
              p_end_time: string;
              p_session_id: string;
            };
            Returns: Json;
          }
        | {
            Args: {
              p_duration_seconds: number;
              p_end_time: string;
              p_pending_approval?: boolean;
              p_session_id: string;
            };
            Returns: Json;
          };
      process_notification_batches: { Args: never; Returns: undefined };
      process_recurring_transactions: {
        Args: never;
        Returns: {
          processed_count: number;
          recurring_id: string;
          transaction_id: string;
        }[];
      };
      record_email_bounce: {
        Args: {
          p_bounce_subtype?: string;
          p_bounce_type: string;
          p_email_hash: string;
          p_original_email_id?: string;
          p_raw_notification?: Json;
        };
        Returns: string;
      };
      record_email_complaint: {
        Args: {
          p_complaint_feedback_id?: string;
          p_complaint_type?: string;
          p_email_hash: string;
          p_original_email_id?: string;
          p_raw_notification?: Json;
        };
        Returns: string;
      };
      record_tuna_interaction: {
        Args: { p_user_id: string };
        Returns: {
          created_at: string;
          health: number;
          hunger: number;
          id: string;
          last_fed_at: string;
          last_interaction_at: string;
          level: number;
          mood: Database['public']['Enums']['tuna_mood'];
          name: string;
          streak_days: number;
          total_conversations: number;
          total_focus_minutes: number;
          updated_at: string;
          user_id: string;
          xp: number;
          xp_to_next_level: number;
        };
        SetofOptions: {
          from: '*';
          to: 'tuna_pets';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      refresh_posts_dashboard_view: { Args: never; Returns: undefined };
      revoke_all_cross_app_tokens: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      revoke_all_other_sessions: { Args: { user_id: string }; Returns: number };
      revoke_user_session: {
        Args: { session_id: string; target_user_id: string };
        Returns: boolean;
      };
      search_finance_invoices: {
        Args: {
          p_end_date?: string;
          p_limit?: number;
          p_offset?: number;
          p_search_query: string;
          p_start_date?: string;
          p_user_ids?: string[];
          p_wallet_ids?: string[];
          p_ws_id: string;
        };
        Returns: {
          created_at: string;
          creator_id: string;
          customer_avatar_url: string;
          customer_full_name: string;
          customer_id: string;
          id: string;
          note: string;
          notice: string;
          platform_creator_id: string;
          price: number;
          total_count: number;
          total_diff: number;
          transaction_id: string;
          ws_id: string;
        }[];
      };
      search_users: {
        Args: {
          enabled_filter?: boolean;
          page_number: number;
          page_size: number;
          role_filter?: string;
          search_query: string;
        };
        Returns: {
          allow_challenge_management: boolean;
          allow_manage_all_challenges: boolean;
          allow_role_management: boolean;
          avatar_url: string;
          bio: string;
          birthday: string;
          created_at: string;
          deleted: boolean;
          display_name: string;
          email: string;
          enabled: boolean;
          full_name: string;
          handle: string;
          id: string;
          new_email: string;
          team_name: string[];
          user_id: string;
        }[];
      };
      search_users_by_name: {
        Args: {
          min_similarity?: number;
          result_limit?: number;
          search_query: string;
        };
        Returns: {
          avatar_url: string;
          display_name: string;
          handle: string;
          id: string;
          relevance: number;
        }[];
      };
      set_default_break_type: {
        Args: { p_target_id: string; p_ws_id: string };
        Returns: {
          color: string;
          created_at: string;
          description: string;
          icon: string;
          id: string;
          is_default: boolean;
          name: string;
          ws_id: string;
        }[];
      };
      should_send_notification: {
        Args: {
          p_channel: string;
          p_event_type: string;
          p_scope?: Database['public']['Enums']['notification_scope'];
          p_user_id: string;
          p_ws_id?: string;
        };
        Returns: boolean;
      };
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
      sum_quiz_scores: {
        Args: { p_set_id: string };
        Returns: {
          sum: number;
        }[];
      };
      sync_my_notifications: {
        Args: never;
        Returns: {
          updated_count: number;
        }[];
      };
      transactions_have_same_abs_amount: {
        Args: { transaction_id_1: string; transaction_id_2: string };
        Returns: boolean;
      };
      transactions_have_same_amount: {
        Args: { transaction_id_1: string; transaction_id_2: string };
        Returns: boolean;
      };
      trunc_to_week_start:
        | {
            Args: { input_date: string; week_start_day?: number };
            Returns: string;
          }
        | {
            Args: { input_date: string; week_start_day?: number };
            Returns: string;
          };
      update_expired_sessions: { Args: never; Returns: undefined };
      update_many_tasks: { Args: { updates: Json }; Returns: number };
      update_session_total_score: {
        Args: { challenge_id_param: string; user_id_param: string };
        Returns: undefined;
      };
      update_time_tracking_request: {
        Args: {
          p_action: string;
          p_bypass_rules?: boolean;
          p_needs_info_reason?: string;
          p_rejection_reason?: string;
          p_request_id: string;
          p_workspace_id: string;
        };
        Returns: Json;
      };
      update_time_tracking_session_bypassed: {
        Args: {
          new_end_time: string;
          new_notes: string;
          new_start_time: string;
          session_id: string;
        };
        Returns: {
          category_id: string | null;
          created_at: string | null;
          date: string | null;
          description: string | null;
          duration_seconds: number | null;
          end_time: string | null;
          id: string;
          is_running: boolean | null;
          parent_session_id: string | null;
          pending_approval: boolean;
          productivity_score: number | null;
          start_time: string;
          tags: string[] | null;
          task_id: string | null;
          title: string;
          updated_at: string | null;
          user_id: string;
          was_resumed: boolean;
          ws_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'time_tracking_sessions';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      upsert_calendar_events_and_count: {
        Args: { events: Json };
        Returns: Json;
      };
      upsert_realtime_log_aggregations: {
        Args: { p_logs: Json };
        Returns: undefined;
      };
      upsert_scheduling_metadata: {
        Args: {
          p_bumped_habits: number;
          p_events_created: number;
          p_habits_scheduled: number;
          p_message: string;
          p_status: string;
          p_tasks_scheduled: number;
          p_window_days?: number;
          p_ws_id: string;
        };
        Returns: {
          bumped_habits: number | null;
          created_at: string | null;
          events_created: number | null;
          habits_scheduled: number | null;
          id: string;
          last_message: string | null;
          last_scheduled_at: string | null;
          last_status: string | null;
          tasks_scheduled: number | null;
          updated_at: string | null;
          window_days: number | null;
          ws_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'workspace_scheduling_metadata';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      user_has_wallet_access_via_role: {
        Args: { p_user_id: string; p_wallet_id: string; p_ws_id: string };
        Returns: {
          custom_days: number;
          has_access: boolean;
          viewing_window: string;
          window_start_date: string;
        }[];
      };
      user_is_in_channel: {
        Args: { p_channel_id: string; p_user_id: string };
        Returns: boolean;
      };
      validate_cross_app_token: {
        Args: { p_target_app: string; p_token: string };
        Returns: string;
      };
      validate_cross_app_token_with_session: {
        Args: { p_target_app: string; p_token: string };
        Returns: {
          session_data: Json;
          user_id: string;
        }[];
      };
    };
    Enums: {
      abuse_event_type:
        | 'otp_send'
        | 'otp_verify_failed'
        | 'mfa_challenge'
        | 'mfa_verify_failed'
        | 'reauth_send'
        | 'reauth_verify_failed'
        | 'password_login_failed'
        | 'manual';
      ai_message_type:
        | 'message'
        | 'file'
        | 'summary'
        | 'notes'
        | 'multi_choice_quiz'
        | 'paragraph_quiz'
        | 'flashcards';
      billing_reason:
        | 'purchase'
        | 'subscription_create'
        | 'subscription_cycle'
        | 'subscription_update';
      blacklist_entry_type: 'email' | 'domain';
      calendar_hour_type: 'WORK' | 'PERSONAL' | 'MEETING';
      calendar_hours: 'work_hours' | 'personal_hours' | 'meeting_hours';
      calendar_provider: 'tuturuuu' | 'google' | 'microsoft';
      calendar_scheduling_source: 'manual' | 'task' | 'habit';
      certificate_templates: 'original' | 'modern' | 'elegant';
      chat_role: 'FUNCTION' | 'USER' | 'SYSTEM' | 'ASSISTANT';
      dataset_type: 'excel' | 'csv' | 'html';
      estimation_type: 'exponential' | 'fibonacci' | 'linear' | 't-shirt';
      feature_flag:
        | 'ENABLE_AI'
        | 'ENABLE_EDUCATION'
        | 'ENABLE_CHALLENGES'
        | 'ENABLE_QUIZZES';
      habit_frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
      ip_block_status: 'active' | 'expired' | 'manually_unblocked';
      monthly_recurrence_type: 'day_of_month' | 'day_of_week';
      notification_delivery_mode: 'immediate' | 'batched';
      notification_priority: 'low' | 'medium' | 'high' | 'urgent';
      notification_scope: 'user' | 'workspace' | 'system';
      order_status: 'pending' | 'paid' | 'refunded' | 'partially_refunded';
      payroll_run_status:
        | 'draft'
        | 'pending_approval'
        | 'approved'
        | 'finalized'
        | 'cancelled';
      platform_service: 'TUTURUUU' | 'REWISE' | 'NOVA' | 'UPSKII';
      product:
        | 'web'
        | 'nova'
        | 'rewise'
        | 'calendar'
        | 'finance'
        | 'tudo'
        | 'tumeet'
        | 'shortener'
        | 'qr'
        | 'drive'
        | 'mail'
        | 'other';
      promotion_type: 'REGULAR' | 'REFERRAL';
      recording_status:
        | 'recording'
        | 'interrupted'
        | 'pending_transcription'
        | 'transcribing'
        | 'completed'
        | 'failed';
      recurring_frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
      referral_reward_type: 'REFERRER' | 'RECEIVER' | 'BOTH';
      subscription_status:
        | 'incomplete'
        | 'incomplete_expired'
        | 'trialing'
        | 'active'
        | 'past_due'
        | 'canceled'
        | 'unpaid';
      support_type: 'bug' | 'feature-request' | 'support' | 'job-application';
      task_board_status:
        | 'not_started'
        | 'active'
        | 'done'
        | 'closed'
        | 'documents';
      task_priority: 'low' | 'normal' | 'high' | 'critical';
      task_relationship_type: 'parent_child' | 'blocks' | 'related';
      task_share_permission: 'view' | 'edit';
      task_share_public_access: 'none' | 'view';
      time_of_day_preference: 'morning' | 'afternoon' | 'evening' | 'night';
      time_tracking_request_activity_action:
        | 'CREATED'
        | 'CONTENT_UPDATED'
        | 'STATUS_CHANGED'
        | 'COMMENT_ADDED'
        | 'COMMENT_UPDATED'
        | 'COMMENT_DELETED';
      time_tracking_request_status:
        | 'PENDING'
        | 'APPROVED'
        | 'REJECTED'
        | 'NEEDS_INFO';
      tuna_accessory_category: 'hat' | 'glasses' | 'background' | 'decoration';
      tuna_achievement_category:
        | 'productivity'
        | 'social'
        | 'milestones'
        | 'special';
      tuna_memory_category:
        | 'preference'
        | 'fact'
        | 'conversation_topic'
        | 'event'
        | 'person';
      tuna_mood: 'happy' | 'neutral' | 'tired' | 'sad' | 'excited' | 'focused';
      workforce_benefit_type:
        | 'health_insurance'
        | 'dental_insurance'
        | 'vision_insurance'
        | 'life_insurance'
        | 'retirement_401k'
        | 'stipend_transport'
        | 'stipend_meal'
        | 'stipend_phone'
        | 'stipend_remote'
        | 'bonus_performance'
        | 'bonus_signing'
        | 'bonus_holiday'
        | 'leave_vacation'
        | 'leave_sick'
        | 'other'
        | 'social_insurance'
        | 'grab_for_business'
        | 'google_workspace'
        | 'software_license'
        | 'training_education'
        | 'gym_membership'
        | 'allowance_responsibility'
        | 'allowance_attendance'
        | 'allowance_hazardous'
        | 'allowance_housing'
        | 'allowance_petrol';
      workforce_contract_type:
        | 'full_time'
        | 'part_time'
        | 'contractor'
        | 'intern'
        | 'temporary';
      workforce_employment_status:
        | 'active'
        | 'on_leave'
        | 'terminated'
        | 'rehired';
      workforce_payment_frequency:
        | 'weekly'
        | 'bi_weekly'
        | 'monthly'
        | 'annual';
      workspace_api_key_scope:
        | 'gemini-2.0-flash'
        | 'gemini-2.5-flash'
        | 'gemini-2.0-pro'
        | 'gemini-2.5-pro'
        | 'gemini-2.0-flash-lite'
        | 'gemini-2.5-flash-lite';
      workspace_board_icon:
        | 'Users'
        | 'User'
        | 'Briefcase'
        | 'Target'
        | 'Rocket'
        | 'TrendingUp'
        | 'ClipboardList'
        | 'ListChecks'
        | 'CheckSquare'
        | 'Calendar'
        | 'CalendarDays'
        | 'CalendarCheck'
        | 'Clock'
        | 'AlarmClock'
        | 'Bell'
        | 'Star'
        | 'Settings'
        | 'Shield'
        | 'Tag'
        | 'Folder'
        | 'FolderOpen'
        | 'FileText'
        | 'Database'
        | 'Server'
        | 'Inbox'
        | 'Mail'
        | 'MessageSquare'
        | 'Phone'
        | 'Video'
        | 'Mic'
        | 'Image'
        | 'Paperclip'
        | 'Link'
        | 'ExternalLink'
        | 'Download'
        | 'Upload'
        | 'Search'
        | 'Eye'
        | 'EyeOff'
        | 'Lock'
        | 'Key'
        | 'Wrench'
        | 'Paintbrush'
        | 'Wand2'
        | 'Lightbulb'
        | 'Bug'
        | 'GraduationCap'
        | 'BookOpen'
        | 'Bookmark'
        | 'Newspaper'
        | 'PieChart'
        | 'Play'
        | 'PlusSquare'
        | 'Puzzle'
        | 'Package'
        | 'Truck'
        | 'Monitor'
        | 'Laptop'
        | 'Music'
        | 'Timer'
        | 'Trash2'
        | 'Heart'
        | 'HelpCircle'
        | 'Moon'
        | 'Zap'
        | 'Flame'
        | 'Gift'
        | 'Globe'
        | 'MapPin'
        | 'Home'
        | 'Building2'
        | 'ShoppingCart'
        | 'CreditCard'
        | 'Wallet'
        | 'ThumbsUp'
        | 'Trophy'
        | 'Smartphone'
        | 'Tablet'
        | 'Cpu'
        | 'HardDrive'
        | 'Wifi'
        | 'Bluetooth'
        | 'Camera'
        | 'Headphones'
        | 'Speaker'
        | 'Tv'
        | 'Printer'
        | 'Keyboard'
        | 'Mouse'
        | 'DollarSign'
        | 'Banknote'
        | 'Receipt'
        | 'Calculator'
        | 'TrendingDown'
        | 'BarChart'
        | 'BarChart2'
        | 'LineChart'
        | 'Activity'
        | 'Coins'
        | 'PiggyBank'
        | 'Send'
        | 'AtSign'
        | 'Hash'
        | 'MessageCircle'
        | 'MessagesSquare'
        | 'Share'
        | 'Share2'
        | 'Megaphone'
        | 'Radio'
        | 'Rss'
        | 'File'
        | 'FileCode'
        | 'FileImage'
        | 'FileAudio'
        | 'FileVideo'
        | 'FileSpreadsheet'
        | 'FileCheck'
        | 'FilePlus'
        | 'FolderPlus'
        | 'FolderCheck'
        | 'Archive'
        | 'ClipboardCheck'
        | 'UserPlus'
        | 'UserCheck'
        | 'UserX'
        | 'UserMinus'
        | 'UsersRound'
        | 'UserRound'
        | 'Crown'
        | 'Contact'
        | 'Handshake'
        | 'Map'
        | 'Navigation'
        | 'Compass'
        | 'Locate'
        | 'Milestone'
        | 'Signpost'
        | 'Route'
        | 'Sun'
        | 'Cloud'
        | 'CloudRain'
        | 'Snowflake'
        | 'Wind'
        | 'Thermometer'
        | 'Umbrella'
        | 'Rainbow'
        | 'Leaf'
        | 'Trees'
        | 'Flower2'
        | 'Mountain'
        | 'HeartPulse'
        | 'Stethoscope'
        | 'Pill'
        | 'Syringe'
        | 'Dumbbell'
        | 'Bike'
        | 'Footprints'
        | 'Brain'
        | 'Salad'
        | 'UtensilsCrossed'
        | 'Coffee'
        | 'Wine'
        | 'Beer'
        | 'Pizza'
        | 'Cake'
        | 'Cookie'
        | 'IceCream2'
        | 'Apple'
        | 'Plane'
        | 'Car'
        | 'Bus'
        | 'Train'
        | 'Ship'
        | 'Anchor'
        | 'Luggage'
        | 'Ticket'
        | 'Hotel'
        | 'Gamepad2'
        | 'Dice1'
        | 'Clapperboard'
        | 'Popcorn'
        | 'Drama'
        | 'PartyPopper'
        | 'Sparkles'
        | 'Film'
        | 'Tv2'
        | 'Book'
        | 'Library'
        | 'PenTool'
        | 'Highlighter'
        | 'Ruler'
        | 'School'
        | 'Presentation'
        | 'Languages'
        | 'FlaskConical'
        | 'Microscope'
        | 'Atom'
        | 'Dna'
        | 'Telescope'
        | 'Orbit'
        | 'Satellite'
        | 'Code'
        | 'Code2'
        | 'Terminal'
        | 'GitBranch'
        | 'GitMerge'
        | 'GitPullRequest'
        | 'Hammer'
        | 'Axe'
        | 'Scissors'
        | 'Brush'
        | 'Palette'
        | 'Pipette'
        | 'Eraser'
        | 'CircleDot'
        | 'Square'
        | 'Triangle'
        | 'Pentagon'
        | 'Hexagon'
        | 'Octagon'
        | 'Diamond'
        | 'Shapes'
        | 'ShieldCheck'
        | 'ShieldAlert'
        | 'Fingerprint'
        | 'ScanFace'
        | 'KeyRound'
        | 'LockKeyhole'
        | 'UnlockKeyhole'
        | 'Armchair'
        | 'Bed'
        | 'Bath'
        | 'Lamp'
        | 'Sofa'
        | 'Shirt'
        | 'Watch'
        | 'Glasses'
        | 'Gem'
        | 'Award'
        | 'Medal'
        | 'BadgeCheck'
        | 'Flag'
        | 'Bookmark2'
        | 'Pin'
        | 'Magnet'
        | 'Battery'
        | 'Power'
        | 'Plug'
        | 'Infinity'
        | 'QrCode'
        | 'Barcode'
        | 'Scan'
        | 'Bot'
        | 'BrainCircuit'
        | 'Sparkle'
        | 'Blocks'
        | 'Layers'
        | 'LayoutGrid'
        | 'LayoutList'
        | 'LayoutDashboard'
        | 'ArrowRight'
        | 'ArrowUp'
        | 'ArrowDown'
        | 'ArrowLeft'
        | 'RefreshCw'
        | 'RotateCcw'
        | 'Repeat'
        | 'Shuffle'
        | 'Move'
        | 'Maximize2'
        | 'Minimize2'
        | 'AlertCircle'
        | 'AlertTriangle'
        | 'Info'
        | 'CircleCheck'
        | 'CircleX'
        | 'CircleAlert'
        | 'BellRing'
        | 'BellOff'
        | 'Fuel'
        | 'WashingMachine';
      workspace_calendar_type: 'primary' | 'tasks' | 'habits' | 'custom';
      workspace_product_tier: 'FREE' | 'PLUS' | 'PRO' | 'ENTERPRISE';
      workspace_role_permission:
        | 'view_infrastructure'
        | 'manage_workspace_secrets'
        | 'manage_external_migrations'
        | 'manage_workspace_roles'
        | 'manage_workspace_members'
        | 'manage_workspace_settings'
        | 'manage_workspace_integrations'
        | 'manage_workspace_billing'
        | 'manage_workspace_security'
        | 'manage_workspace_audit_logs'
        | 'manage_user_report_templates'
        | 'manage_calendar'
        | 'manage_projects'
        | 'manage_documents'
        | 'manage_drive'
        | 'manage_users'
        | 'export_users_data'
        | 'manage_inventory'
        | 'manage_finance'
        | 'export_finance_data'
        | 'ai_chat'
        | 'ai_lab'
        | 'send_user_group_post_emails'
        | 'view_users_private_info'
        | 'view_users_public_info'
        | 'view_finance_stats'
        | 'create_users'
        | 'update_users'
        | 'delete_users'
        | 'check_user_attendance'
        | 'create_inventory'
        | 'update_inventory'
        | 'delete_inventory'
        | 'view_inventory'
        | 'view_transactions'
        | 'create_transactions'
        | 'update_transactions'
        | 'delete_transactions'
        | 'view_invoices'
        | 'create_invoices'
        | 'update_invoices'
        | 'delete_invoices'
        | 'view_user_groups'
        | 'create_user_groups'
        | 'update_user_groups'
        | 'delete_user_groups'
        | 'view_user_groups_scores'
        | 'create_user_groups_scores'
        | 'update_user_groups_scores'
        | 'delete_user_groups_scores'
        | 'view_user_groups_posts'
        | 'create_user_groups_posts'
        | 'update_user_groups_posts'
        | 'delete_user_groups_posts'
        | 'create_lead_generations'
        | 'manage_api_keys'
        | 'view_confidential_amount'
        | 'view_confidential_description'
        | 'view_confidential_category'
        | 'create_confidential_transactions'
        | 'update_confidential_transactions'
        | 'delete_confidential_transactions'
        | 'manage_time_tracking_requests'
        | 'bypass_time_tracking_request_approval'
        | 'manage_changelog'
        | 'manage_subscription'
        | 'manage_e2ee'
        | 'manage_workforce'
        | 'manage_payroll'
        | 'view_workforce'
        | 'view_payroll'
        | 'admin'
        | 'update_user_attendance'
        | 'create_user_groups_reports'
        | 'view_user_groups_reports'
        | 'update_user_groups_reports'
        | 'delete_user_groups_reports'
        | 'view_expenses'
        | 'view_incomes'
        | 'create_wallets'
        | 'update_wallets'
        | 'delete_wallets'
        | 'view_stock_quantity'
        | 'update_stock_quantity';
    };
    CompositeTypes: {
      email_block_status: {
        email: string | null;
        is_blocked: boolean | null;
        reason: string | null;
      };
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      abuse_event_type: [
        'otp_send',
        'otp_verify_failed',
        'mfa_challenge',
        'mfa_verify_failed',
        'reauth_send',
        'reauth_verify_failed',
        'password_login_failed',
        'manual',
      ],
      ai_message_type: [
        'message',
        'file',
        'summary',
        'notes',
        'multi_choice_quiz',
        'paragraph_quiz',
        'flashcards',
      ],
      billing_reason: [
        'purchase',
        'subscription_create',
        'subscription_cycle',
        'subscription_update',
      ],
      blacklist_entry_type: ['email', 'domain'],
      calendar_hour_type: ['WORK', 'PERSONAL', 'MEETING'],
      calendar_hours: ['work_hours', 'personal_hours', 'meeting_hours'],
      calendar_provider: ['tuturuuu', 'google', 'microsoft'],
      calendar_scheduling_source: ['manual', 'task', 'habit'],
      certificate_templates: ['original', 'modern', 'elegant'],
      chat_role: ['FUNCTION', 'USER', 'SYSTEM', 'ASSISTANT'],
      dataset_type: ['excel', 'csv', 'html'],
      estimation_type: ['exponential', 'fibonacci', 'linear', 't-shirt'],
      feature_flag: [
        'ENABLE_AI',
        'ENABLE_EDUCATION',
        'ENABLE_CHALLENGES',
        'ENABLE_QUIZZES',
      ],
      habit_frequency: ['daily', 'weekly', 'monthly', 'yearly', 'custom'],
      ip_block_status: ['active', 'expired', 'manually_unblocked'],
      monthly_recurrence_type: ['day_of_month', 'day_of_week'],
      notification_delivery_mode: ['immediate', 'batched'],
      notification_priority: ['low', 'medium', 'high', 'urgent'],
      notification_scope: ['user', 'workspace', 'system'],
      order_status: ['pending', 'paid', 'refunded', 'partially_refunded'],
      payroll_run_status: [
        'draft',
        'pending_approval',
        'approved',
        'finalized',
        'cancelled',
      ],
      platform_service: ['TUTURUUU', 'REWISE', 'NOVA', 'UPSKII'],
      product: [
        'web',
        'nova',
        'rewise',
        'calendar',
        'finance',
        'tudo',
        'tumeet',
        'shortener',
        'qr',
        'drive',
        'mail',
        'other',
      ],
      promotion_type: ['REGULAR', 'REFERRAL'],
      recording_status: [
        'recording',
        'interrupted',
        'pending_transcription',
        'transcribing',
        'completed',
        'failed',
      ],
      recurring_frequency: ['daily', 'weekly', 'monthly', 'yearly'],
      referral_reward_type: ['REFERRER', 'RECEIVER', 'BOTH'],
      subscription_status: [
        'incomplete',
        'incomplete_expired',
        'trialing',
        'active',
        'past_due',
        'canceled',
        'unpaid',
      ],
      support_type: ['bug', 'feature-request', 'support', 'job-application'],
      task_board_status: [
        'not_started',
        'active',
        'done',
        'closed',
        'documents',
      ],
      task_priority: ['low', 'normal', 'high', 'critical'],
      task_relationship_type: ['parent_child', 'blocks', 'related'],
      task_share_permission: ['view', 'edit'],
      task_share_public_access: ['none', 'view'],
      time_of_day_preference: ['morning', 'afternoon', 'evening', 'night'],
      time_tracking_request_activity_action: [
        'CREATED',
        'CONTENT_UPDATED',
        'STATUS_CHANGED',
        'COMMENT_ADDED',
        'COMMENT_UPDATED',
        'COMMENT_DELETED',
      ],
      time_tracking_request_status: [
        'PENDING',
        'APPROVED',
        'REJECTED',
        'NEEDS_INFO',
      ],
      tuna_accessory_category: ['hat', 'glasses', 'background', 'decoration'],
      tuna_achievement_category: [
        'productivity',
        'social',
        'milestones',
        'special',
      ],
      tuna_memory_category: [
        'preference',
        'fact',
        'conversation_topic',
        'event',
        'person',
      ],
      tuna_mood: ['happy', 'neutral', 'tired', 'sad', 'excited', 'focused'],
      workforce_benefit_type: [
        'health_insurance',
        'dental_insurance',
        'vision_insurance',
        'life_insurance',
        'retirement_401k',
        'stipend_transport',
        'stipend_meal',
        'stipend_phone',
        'stipend_remote',
        'bonus_performance',
        'bonus_signing',
        'bonus_holiday',
        'leave_vacation',
        'leave_sick',
        'other',
        'social_insurance',
        'grab_for_business',
        'google_workspace',
        'software_license',
        'training_education',
        'gym_membership',
        'allowance_responsibility',
        'allowance_attendance',
        'allowance_hazardous',
        'allowance_housing',
        'allowance_petrol',
      ],
      workforce_contract_type: [
        'full_time',
        'part_time',
        'contractor',
        'intern',
        'temporary',
      ],
      workforce_employment_status: [
        'active',
        'on_leave',
        'terminated',
        'rehired',
      ],
      workforce_payment_frequency: ['weekly', 'bi_weekly', 'monthly', 'annual'],
      workspace_api_key_scope: [
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-2.0-pro',
        'gemini-2.5-pro',
        'gemini-2.0-flash-lite',
        'gemini-2.5-flash-lite',
      ],
      workspace_board_icon: [
        'Users',
        'User',
        'Briefcase',
        'Target',
        'Rocket',
        'TrendingUp',
        'ClipboardList',
        'ListChecks',
        'CheckSquare',
        'Calendar',
        'CalendarDays',
        'CalendarCheck',
        'Clock',
        'AlarmClock',
        'Bell',
        'Star',
        'Settings',
        'Shield',
        'Tag',
        'Folder',
        'FolderOpen',
        'FileText',
        'Database',
        'Server',
        'Inbox',
        'Mail',
        'MessageSquare',
        'Phone',
        'Video',
        'Mic',
        'Image',
        'Paperclip',
        'Link',
        'ExternalLink',
        'Download',
        'Upload',
        'Search',
        'Eye',
        'EyeOff',
        'Lock',
        'Key',
        'Wrench',
        'Paintbrush',
        'Wand2',
        'Lightbulb',
        'Bug',
        'GraduationCap',
        'BookOpen',
        'Bookmark',
        'Newspaper',
        'PieChart',
        'Play',
        'PlusSquare',
        'Puzzle',
        'Package',
        'Truck',
        'Monitor',
        'Laptop',
        'Music',
        'Timer',
        'Trash2',
        'Heart',
        'HelpCircle',
        'Moon',
        'Zap',
        'Flame',
        'Gift',
        'Globe',
        'MapPin',
        'Home',
        'Building2',
        'ShoppingCart',
        'CreditCard',
        'Wallet',
        'ThumbsUp',
        'Trophy',
        'Smartphone',
        'Tablet',
        'Cpu',
        'HardDrive',
        'Wifi',
        'Bluetooth',
        'Camera',
        'Headphones',
        'Speaker',
        'Tv',
        'Printer',
        'Keyboard',
        'Mouse',
        'DollarSign',
        'Banknote',
        'Receipt',
        'Calculator',
        'TrendingDown',
        'BarChart',
        'BarChart2',
        'LineChart',
        'Activity',
        'Coins',
        'PiggyBank',
        'Send',
        'AtSign',
        'Hash',
        'MessageCircle',
        'MessagesSquare',
        'Share',
        'Share2',
        'Megaphone',
        'Radio',
        'Rss',
        'File',
        'FileCode',
        'FileImage',
        'FileAudio',
        'FileVideo',
        'FileSpreadsheet',
        'FileCheck',
        'FilePlus',
        'FolderPlus',
        'FolderCheck',
        'Archive',
        'ClipboardCheck',
        'UserPlus',
        'UserCheck',
        'UserX',
        'UserMinus',
        'UsersRound',
        'UserRound',
        'Crown',
        'Contact',
        'Handshake',
        'Map',
        'Navigation',
        'Compass',
        'Locate',
        'Milestone',
        'Signpost',
        'Route',
        'Sun',
        'Cloud',
        'CloudRain',
        'Snowflake',
        'Wind',
        'Thermometer',
        'Umbrella',
        'Rainbow',
        'Leaf',
        'Trees',
        'Flower2',
        'Mountain',
        'HeartPulse',
        'Stethoscope',
        'Pill',
        'Syringe',
        'Dumbbell',
        'Bike',
        'Footprints',
        'Brain',
        'Salad',
        'UtensilsCrossed',
        'Coffee',
        'Wine',
        'Beer',
        'Pizza',
        'Cake',
        'Cookie',
        'IceCream2',
        'Apple',
        'Plane',
        'Car',
        'Bus',
        'Train',
        'Ship',
        'Anchor',
        'Luggage',
        'Ticket',
        'Hotel',
        'Gamepad2',
        'Dice1',
        'Clapperboard',
        'Popcorn',
        'Drama',
        'PartyPopper',
        'Sparkles',
        'Film',
        'Tv2',
        'Book',
        'Library',
        'PenTool',
        'Highlighter',
        'Ruler',
        'School',
        'Presentation',
        'Languages',
        'FlaskConical',
        'Microscope',
        'Atom',
        'Dna',
        'Telescope',
        'Orbit',
        'Satellite',
        'Code',
        'Code2',
        'Terminal',
        'GitBranch',
        'GitMerge',
        'GitPullRequest',
        'Hammer',
        'Axe',
        'Scissors',
        'Brush',
        'Palette',
        'Pipette',
        'Eraser',
        'CircleDot',
        'Square',
        'Triangle',
        'Pentagon',
        'Hexagon',
        'Octagon',
        'Diamond',
        'Shapes',
        'ShieldCheck',
        'ShieldAlert',
        'Fingerprint',
        'ScanFace',
        'KeyRound',
        'LockKeyhole',
        'UnlockKeyhole',
        'Armchair',
        'Bed',
        'Bath',
        'Lamp',
        'Sofa',
        'Shirt',
        'Watch',
        'Glasses',
        'Gem',
        'Award',
        'Medal',
        'BadgeCheck',
        'Flag',
        'Bookmark2',
        'Pin',
        'Magnet',
        'Battery',
        'Power',
        'Plug',
        'Infinity',
        'QrCode',
        'Barcode',
        'Scan',
        'Bot',
        'BrainCircuit',
        'Sparkle',
        'Blocks',
        'Layers',
        'LayoutGrid',
        'LayoutList',
        'LayoutDashboard',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'RefreshCw',
        'RotateCcw',
        'Repeat',
        'Shuffle',
        'Move',
        'Maximize2',
        'Minimize2',
        'AlertCircle',
        'AlertTriangle',
        'Info',
        'CircleCheck',
        'CircleX',
        'CircleAlert',
        'BellRing',
        'BellOff',
        'Fuel',
        'WashingMachine',
      ],
      workspace_calendar_type: ['primary', 'tasks', 'habits', 'custom'],
      workspace_product_tier: ['FREE', 'PLUS', 'PRO', 'ENTERPRISE'],
      workspace_role_permission: [
        'view_infrastructure',
        'manage_workspace_secrets',
        'manage_external_migrations',
        'manage_workspace_roles',
        'manage_workspace_members',
        'manage_workspace_settings',
        'manage_workspace_integrations',
        'manage_workspace_billing',
        'manage_workspace_security',
        'manage_workspace_audit_logs',
        'manage_user_report_templates',
        'manage_calendar',
        'manage_projects',
        'manage_documents',
        'manage_drive',
        'manage_users',
        'export_users_data',
        'manage_inventory',
        'manage_finance',
        'export_finance_data',
        'ai_chat',
        'ai_lab',
        'send_user_group_post_emails',
        'view_users_private_info',
        'view_users_public_info',
        'view_finance_stats',
        'create_users',
        'update_users',
        'delete_users',
        'check_user_attendance',
        'create_inventory',
        'update_inventory',
        'delete_inventory',
        'view_inventory',
        'view_transactions',
        'create_transactions',
        'update_transactions',
        'delete_transactions',
        'view_invoices',
        'create_invoices',
        'update_invoices',
        'delete_invoices',
        'view_user_groups',
        'create_user_groups',
        'update_user_groups',
        'delete_user_groups',
        'view_user_groups_scores',
        'create_user_groups_scores',
        'update_user_groups_scores',
        'delete_user_groups_scores',
        'view_user_groups_posts',
        'create_user_groups_posts',
        'update_user_groups_posts',
        'delete_user_groups_posts',
        'create_lead_generations',
        'manage_api_keys',
        'view_confidential_amount',
        'view_confidential_description',
        'view_confidential_category',
        'create_confidential_transactions',
        'update_confidential_transactions',
        'delete_confidential_transactions',
        'manage_time_tracking_requests',
        'bypass_time_tracking_request_approval',
        'manage_changelog',
        'manage_subscription',
        'manage_e2ee',
        'manage_workforce',
        'manage_payroll',
        'view_workforce',
        'view_payroll',
        'admin',
        'update_user_attendance',
        'create_user_groups_reports',
        'view_user_groups_reports',
        'update_user_groups_reports',
        'delete_user_groups_reports',
        'view_expenses',
        'view_incomes',
        'create_wallets',
        'update_wallets',
        'delete_wallets',
        'view_stock_quantity',
        'update_stock_quantity',
      ],
    },
  },
} as const;
