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
      calendar_auth_tokens: {
        Row: {
          access_token: string;
          created_at: string;
          id: string;
          refresh_token: string;
          user_id: string;
          ws_id: string;
        };
        Insert: {
          access_token: string;
          created_at?: string;
          id?: string;
          refresh_token: string;
          user_id: string;
          ws_id: string;
        };
        Update: {
          access_token?: string;
          created_at?: string;
          id?: string;
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
          deleted_events: number | null;
          end_time: string | null;
          id: string;
          inserted_events: number | null;
          source: string | null;
          start_time: string | null;
          status: string | null;
          triggered_by: string;
          type: string | null;
          updated_at: string;
          updated_events: number | null;
          ws_id: string;
        };
        Insert: {
          deleted_events?: number | null;
          end_time?: string | null;
          id?: string;
          inserted_events?: number | null;
          source?: string | null;
          start_time?: string | null;
          status?: string | null;
          triggered_by: string;
          type?: string | null;
          updated_at?: string;
          updated_events?: number | null;
          ws_id: string;
        };
        Update: {
          deleted_events?: number | null;
          end_time?: string | null;
          id?: string;
          inserted_events?: number | null;
          source?: string | null;
          start_time?: string | null;
          status?: string | null;
          triggered_by?: string;
          type?: string | null;
          updated_at?: string;
          updated_events?: number | null;
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
          price: number;
          total_diff: number;
          transaction_id: string | null;
          user_group_id: string | null;
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
          price: number;
          total_diff?: number;
          transaction_id?: string | null;
          user_group_id?: string | null;
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
          price?: number;
          total_diff?: number;
          transaction_id?: string | null;
          user_group_id?: string | null;
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
            foreignKeyName: 'finance_invoices_transaction_id_fkey';
            columns: ['transaction_id'];
            isOneToOne: true;
            referencedRelation: 'wallet_transactions';
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
          {
            foreignKeyName: 'public_finance_invoices_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'group_users_with_post_checks';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'public_finance_invoices_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'group_with_attendance';
            referencedColumns: ['group_id'];
          },
          {
            foreignKeyName: 'public_finance_invoices_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_finance_invoices_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_finance_invoices_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'public_finance_invoices_user_group_id_fkey';
            columns: ['user_group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_guest';
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
          profile_completed: boolean;
          tour_completed: boolean;
          updated_at: string;
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
          profile_completed?: boolean;
          tour_completed?: boolean;
          updated_at?: string;
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
          profile_completed?: boolean;
          tour_completed?: boolean;
          updated_at?: string;
          user_id?: string;
          workspace_avatar_url?: string | null;
          workspace_description?: string | null;
          workspace_name?: string | null;
        };
        Relationships: [
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
          slug: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          creator_id: string;
          domain: string;
          id?: string;
          link: string;
          slug: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          domain?: string;
          id?: string;
          link?: string;
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
            foreignKeyName: 'task_projects_lead_workspace_member_fkey';
            columns: ['ws_id', 'lead_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_members';
            referencedColumns: ['ws_id', 'user_id'];
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
      tasks: {
        Row: {
          calendar_hours: Database['public']['Enums']['calendar_hours'] | null;
          closed_at: string | null;
          completed: boolean | null;
          completed_at: string | null;
          created_at: string | null;
          creator_id: string | null;
          deleted_at: string | null;
          description: string | null;
          description_yjs_state: number[] | null;
          embedding: string | null;
          end_date: string | null;
          estimation_points: number | null;
          fts: unknown;
          id: string;
          is_splittable: boolean | null;
          list_id: string | null;
          max_split_duration_minutes: number | null;
          min_split_duration_minutes: number | null;
          name: string;
          priority: Database['public']['Enums']['task_priority'] | null;
          sort_key: number | null;
          start_date: string | null;
          total_duration: number | null;
        };
        Insert: {
          calendar_hours?: Database['public']['Enums']['calendar_hours'] | null;
          closed_at?: string | null;
          completed?: boolean | null;
          completed_at?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          description_yjs_state?: number[] | null;
          embedding?: string | null;
          end_date?: string | null;
          estimation_points?: number | null;
          fts?: unknown;
          id?: string;
          is_splittable?: boolean | null;
          list_id?: string | null;
          max_split_duration_minutes?: number | null;
          min_split_duration_minutes?: number | null;
          name: string;
          priority?: Database['public']['Enums']['task_priority'] | null;
          sort_key?: number | null;
          start_date?: string | null;
          total_duration?: number | null;
        };
        Update: {
          calendar_hours?: Database['public']['Enums']['calendar_hours'] | null;
          closed_at?: string | null;
          completed?: boolean | null;
          completed_at?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted_at?: string | null;
          description?: string | null;
          description_yjs_state?: number[] | null;
          embedding?: string | null;
          end_date?: string | null;
          estimation_points?: number | null;
          fts?: unknown;
          id?: string;
          is_splittable?: boolean | null;
          list_id?: string | null;
          max_split_duration_minutes?: number | null;
          min_split_duration_minutes?: number | null;
          name?: string;
          priority?: Database['public']['Enums']['task_priority'] | null;
          sort_key?: number | null;
          start_date?: string | null;
          total_duration?: number | null;
        };
        Relationships: [
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
          created_at: string | null;
          id: string;
          is_expense: boolean | null;
          name: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          is_expense?: boolean | null;
          name: string;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
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
          full_name: string | null;
          new_email: string | null;
          user_id: string;
        };
        Insert: {
          birthday?: string | null;
          default_workspace_id?: string | null;
          email?: string | null;
          full_name?: string | null;
          new_email?: string | null;
          user_id: string;
        };
        Update: {
          birthday?: string | null;
          default_workspace_id?: string | null;
          email?: string | null;
          full_name?: string | null;
          new_email?: string | null;
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
          handle: string | null;
          id: string;
          services: Database['public']['Enums']['platform_service'][];
        };
        Insert: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          deleted?: boolean | null;
          display_name?: string | null;
          handle?: string | null;
          id?: string;
          services?: Database['public']['Enums']['platform_service'][];
        };
        Update: {
          avatar_url?: string | null;
          bio?: string | null;
          created_at?: string | null;
          deleted?: boolean | null;
          display_name?: string | null;
          handle?: string | null;
          id?: string;
          services?: Database['public']['Enums']['platform_service'][];
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
          id: string;
          name: string | null;
          template_id: string | null;
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
          id?: string;
          name?: string | null;
          template_id?: string | null;
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
          id?: string;
          name?: string | null;
          template_id?: string | null;
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
      workspace_calendar_events: {
        Row: {
          color: string | null;
          created_at: string | null;
          description: string;
          end_at: string;
          google_event_id: string | null;
          id: string;
          location: string | null;
          locked: boolean;
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
          google_event_id?: string | null;
          id?: string;
          location?: string | null;
          locked?: boolean;
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
          google_event_id?: string | null;
          id?: string;
          location?: string | null;
          locked?: boolean;
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
      workspace_default_roles: {
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
          role: string;
          role_title: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          invited_by?: string | null;
          role?: string;
          role_title?: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          invited_by?: string | null;
          role?: string;
          role_title?: string;
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
            foreignKeyName: 'workspace_email_invites_role_fkey';
            columns: ['role'];
            isOneToOne: false;
            referencedRelation: 'workspace_default_roles';
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
          role: string;
          role_title: string;
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
          role?: string;
          role_title?: string;
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
          role?: string;
          role_title?: string;
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
            foreignKeyName: 'workspace_invite_links_role_fkey';
            columns: ['role'];
            isOneToOne: false;
            referencedRelation: 'workspace_default_roles';
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
          role: string;
          role_title: string | null;
          user_id: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          role?: string;
          role_title?: string | null;
          user_id: string;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          role?: string;
          role_title?: string | null;
          user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_invites_role_fkey';
            columns: ['role'];
            isOneToOne: false;
            referencedRelation: 'workspace_default_roles';
            referencedColumns: ['id'];
          },
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
          role: string;
          role_title: string;
          sort_key: number | null;
          user_id: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          role?: string;
          role_title?: string;
          sort_key?: number | null;
          user_id?: string;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          role?: string;
          role_title?: string;
          sort_key?: number | null;
          user_id?: string;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_members_role_fkey';
            columns: ['role'];
            isOneToOne: false;
            referencedRelation: 'workspace_default_roles';
            referencedColumns: ['id'];
          },
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
          description: string | null;
          id: string;
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
          description?: string | null;
          id?: string;
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
          description?: string | null;
          id?: string;
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
          created_at: string;
          guest_user_checkup_threshold: number | null;
          referral_count_cap: number;
          referral_increment_percent: number;
          referral_promotion_id: string | null;
          updated_at: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          guest_user_checkup_threshold?: number | null;
          referral_count_cap?: number;
          referral_increment_percent?: number;
          referral_promotion_id?: string | null;
          updated_at?: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          guest_user_checkup_threshold?: number | null;
          referral_count_cap?: number;
          referral_increment_percent?: number;
          referral_promotion_id?: string | null;
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
      workspace_subscription: {
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
      workspace_subscription_products: {
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string | null;
          price: number | null;
          recurring_interval: string | null;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          id: string;
          name?: string | null;
          price?: number | null;
          recurring_interval?: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string | null;
          price?: number | null;
          recurring_interval?: string | null;
        };
        Relationships: [];
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
            foreignKeyName: 'workspace_wallet_transfers_to_transaction_id_fkey';
            columns: ['to_transaction_id'];
            isOneToOne: false;
            referencedRelation: 'wallet_transactions';
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
          creator_id: string | null;
          deleted: boolean | null;
          handle: string | null;
          id: string;
          logo_url: string | null;
          name: string | null;
          personal: boolean;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          handle?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string | null;
          personal?: boolean;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          handle?: string | null;
          id?: string;
          logo_url?: string | null;
          name?: string | null;
          personal?: boolean;
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
          display_name: string | null;
          id: string | null;
        };
        Relationships: [];
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
          role: string | null;
          role_title: string | null;
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
            foreignKeyName: 'workspace_invite_links_role_fkey';
            columns: ['role'];
            isOneToOne: false;
            referencedRelation: 'workspace_default_roles';
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
          role: string | null;
          role_title: string | null;
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
      can_create_workspace: { Args: { p_user_id: string }; Returns: boolean };
      can_manage_indicator: {
        Args: { p_indicator_id: string };
        Returns: boolean;
      };
      check_email_blocked: { Args: { p_email: string }; Returns: boolean };
      check_guest_group: { Args: { group_id: string }; Returns: boolean };
      check_guest_lead_eligibility: {
        Args: { p_user_id: string; p_ws_id: string };
        Returns: Json;
      };
      check_ws_creator: { Args: { ws_id: string }; Returns: boolean };
      cleanup_expired_cross_app_tokens: { Args: never; Returns: undefined };
      cleanup_old_api_key_usage_logs: { Args: never; Returns: undefined };
      cleanup_old_typing_indicators: { Args: never; Returns: undefined };
      cleanup_role_inconsistencies: { Args: never; Returns: undefined };
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
      extract_domain: { Args: { url: string }; Returns: string };
      extract_referrer_domain: { Args: { url: string }; Returns: string };
      generate_cross_app_token:
        | {
            Args: {
              p_expiry_seconds?: number;
              p_origin_app: string;
              p_session_data?: Json;
              p_target_app: string;
              p_user_id: string;
            };
            Returns: string;
          }
        | {
            Args: {
              p_expiry_seconds?: number;
              p_origin_app: string;
              p_target_app: string;
              p_user_id: string;
            };
            Returns: string;
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
      get_daily_income_expense: {
        Args: { _ws_id: string; past_days?: number };
        Returns: {
          day: string;
          total_expense: number;
          total_income: number;
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
      get_default_ai_pricing: { Args: never; Returns: Json };
      get_device_types: {
        Args: { p_limit?: number; p_link_id: string };
        Returns: {
          count: number;
          device_type: string;
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
      get_finance_invoices_count: { Args: { ws_id: string }; Returns: number };
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
      get_joined_workspace_count: {
        Args: { user_id: string };
        Returns: number;
      };
      get_monthly_income_expense: {
        Args: { _ws_id: string; past_months?: number };
        Returns: {
          month: string;
          total_expense: number;
          total_income: number;
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
      get_operating_systems: {
        Args: { p_limit?: number; p_link_id: string };
        Returns: {
          count: number;
          os: string;
        }[];
      };
      get_pending_event_participants: {
        Args: { _event_id: string };
        Returns: number;
      };
      get_pending_invoices: {
        Args: { p_limit?: number; p_offset?: number; p_ws_id: string };
        Returns: {
          attendance_days: number;
          group_id: string;
          group_name: string;
          months_owed: string;
          potential_total: number;
          total_sessions: number;
          user_id: string;
          user_name: string;
        }[];
      };
      get_pending_invoices_base: {
        Args: { p_ws_id: string };
        Returns: {
          attendance_days: number;
          group_id: string;
          group_name: string;
          month: string;
          sessions: string[];
          user_id: string;
          user_name: string;
        }[];
      };
      get_pending_invoices_count: {
        Args: { p_ws_id: string };
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
      get_submission_statistics: {
        Args: never;
        Returns: {
          latest_submission_date: string;
          total_count: number;
          unique_users_count: number;
        }[];
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
          created_at: string;
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
          task_calendar_hours: Database['public']['Enums']['calendar_hours'];
          task_closed_at: string;
          task_completed_at: string;
          task_created_at: string;
          task_creator_id: string;
          task_deleted_at: string;
          task_description: string;
          task_end_date: string;
          task_estimation_points: number;
          task_id: string;
          task_is_splittable: boolean;
          task_list_id: string;
          task_max_split_duration_minutes: number;
          task_min_split_duration_minutes: number;
          task_name: string;
          task_priority: Database['public']['Enums']['task_priority'];
          task_start_date: string;
          task_total_duration: number;
        }[];
      };
      get_user_role: {
        Args: { user_id: string; ws_id: string };
        Returns: string;
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
      get_workspace_drive_size: { Args: { ws_id: string }; Returns: number };
      get_workspace_member_count: {
        Args: { p_ws_id: string };
        Returns: number;
      };
      get_workspace_products_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_workspace_storage_limit: { Args: { ws_id: string }; Returns: number };
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
          included_groups: string[];
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
      get_workspace_wallets_expense: {
        Args: { end_date?: string; start_date?: string; ws_id: string };
        Returns: number;
      };
      get_workspace_wallets_income: {
        Args: { end_date?: string; start_date?: string; ws_id: string };
        Returns: number;
      };
      hard_delete_soft_deleted_items: { Args: never; Returns: undefined };
      has_other_owner: {
        Args: { _user_id: string; _ws_id: string };
        Returns: boolean;
      };
      has_workspace_permission: {
        Args: { p_permission: string; p_user_id: string; p_ws_id: string };
        Returns: boolean;
      };
      insert_ai_chat_message: {
        Args: { chat_id: string; message: string; source: string };
        Returns: undefined;
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
          closed_at: string;
          completed_at: string;
          description: string;
          end_date: string;
          id: string;
          list_id: string;
          name: string;
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
      process_recurring_transactions: {
        Args: never;
        Returns: {
          processed_count: number;
          recurring_id: string;
          transaction_id: string;
        }[];
      };
      revoke_all_cross_app_tokens: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      revoke_all_other_sessions: { Args: { user_id: string }; Returns: number };
      revoke_user_session: {
        Args: { session_id: string; target_user_id: string };
        Returns: boolean;
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
      show_limit: { Args: never; Returns: number };
      show_trgm: { Args: { '': string }; Returns: string[] };
      sum_quiz_scores: {
        Args: { p_set_id: string };
        Returns: {
          sum: number;
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
      update_expired_sessions: { Args: never; Returns: undefined };
      update_many_tasks: { Args: { updates: Json }; Returns: number };
      update_session_total_score: {
        Args: { challenge_id_param: string; user_id_param: string };
        Returns: undefined;
      };
      upsert_calendar_events_and_count: {
        Args: { events: Json };
        Returns: Json;
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
      ai_message_type:
        | 'message'
        | 'file'
        | 'summary'
        | 'notes'
        | 'multi_choice_quiz'
        | 'paragraph_quiz'
        | 'flashcards';
      blacklist_entry_type: 'email' | 'domain';
      calendar_hour_type: 'WORK' | 'PERSONAL' | 'MEETING';
      calendar_hours: 'work_hours' | 'personal_hours' | 'meeting_hours';
      certificate_templates: 'original' | 'modern' | 'elegant';
      chat_role: 'FUNCTION' | 'USER' | 'SYSTEM' | 'ASSISTANT';
      dataset_type: 'excel' | 'csv' | 'html';
      estimation_type: 'exponential' | 'fibonacci' | 'linear' | 't-shirt';
      feature_flag:
        | 'ENABLE_AI'
        | 'ENABLE_EDUCATION'
        | 'ENABLE_CHALLENGES'
        | 'ENABLE_QUIZZES';
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
      subscription_status: 'trialing' | 'active' | 'canceled' | 'past_due';
      support_type: 'bug' | 'feature-request' | 'support' | 'job-application';
      task_board_status: 'not_started' | 'active' | 'done' | 'closed';
      task_priority: 'low' | 'normal' | 'high' | 'critical';
      workspace_api_key_scope:
        | 'gemini-2.0-flash'
        | 'gemini-2.5-flash'
        | 'gemini-2.0-pro'
        | 'gemini-2.5-pro'
        | 'gemini-2.0-flash-lite'
        | 'gemini-2.5-flash-lite';
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
        | 'manage_api_keys';
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
      ai_message_type: [
        'message',
        'file',
        'summary',
        'notes',
        'multi_choice_quiz',
        'paragraph_quiz',
        'flashcards',
      ],
      blacklist_entry_type: ['email', 'domain'],
      calendar_hour_type: ['WORK', 'PERSONAL', 'MEETING'],
      calendar_hours: ['work_hours', 'personal_hours', 'meeting_hours'],
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
      subscription_status: ['trialing', 'active', 'canceled', 'past_due'],
      support_type: ['bug', 'feature-request', 'support', 'job-application'],
      task_board_status: ['not_started', 'active', 'done', 'closed'],
      task_priority: ['low', 'normal', 'high', 'critical'],
      workspace_api_key_scope: [
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-2.0-pro',
        'gemini-2.5-pro',
        'gemini-2.0-flash-lite',
        'gemini-2.5-flash-lite',
      ],
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
      ],
    },
  },
} as const;
