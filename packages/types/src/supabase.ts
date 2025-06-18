export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
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
            referencedRelation: 'users';
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
          invoice_id: string | null;
          name: string | null;
          promo_id: string | null;
          use_ratio: boolean;
          value: number;
        };
        Insert: {
          code?: string;
          created_at?: string;
          description?: string | null;
          invoice_id?: string | null;
          name?: string | null;
          promo_id?: string | null;
          use_ratio: boolean;
          value: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: string | null;
          invoice_id?: string | null;
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
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
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
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
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
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          end_time: string;
          id?: string;
          plan_id: string;
          start_time: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          end_time?: string;
          id?: string;
          plan_id?: string;
          start_time?: string;
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
          created_at: string | null;
          creator_id: string | null;
          dates: string[];
          description: string | null;
          end_time: string;
          id: string;
          is_public: boolean;
          name: string | null;
          start_time: string;
        };
        Insert: {
          created_at?: string | null;
          creator_id?: string | null;
          dates: string[];
          description?: string | null;
          end_time: string;
          id?: string;
          is_public?: boolean;
          name?: string | null;
          start_time: string;
        };
        Update: {
          created_at?: string | null;
          creator_id?: string | null;
          dates?: string[];
          description?: string | null;
          end_time?: string;
          id?: string;
          is_public?: boolean;
          name?: string | null;
          start_time?: string;
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
            referencedRelation: 'users';
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
          user_id: string;
        };
        Insert: {
          created_at?: string;
          date: string;
          end_time: string;
          id?: string;
          plan_id: string;
          start_time: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          date?: string;
          end_time?: string;
          id?: string;
          plan_id?: string;
          start_time?: string;
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
            referencedRelation: 'users';
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
          allow_manage_all_challenges: boolean;
          allow_role_management: boolean;
          created_at: string;
          enabled: boolean;
          user_id: string;
        };
        Insert: {
          allow_challenge_management?: boolean;
          allow_manage_all_challenges?: boolean;
          allow_role_management?: boolean;
          created_at?: string;
          enabled?: boolean;
          user_id: string;
        };
        Update: {
          allow_challenge_management?: boolean;
          allow_manage_all_challenges?: boolean;
          allow_role_management?: boolean;
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
            referencedRelation: 'users';
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
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      support_inquiries: {
        Row: {
          created_at: string;
          email: string;
          id: string;
          is_read: boolean;
          is_resolved: boolean;
          message: string;
          name: string;
          subject: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          id?: string;
          is_read?: boolean;
          is_resolved?: boolean;
          message: string;
          name: string;
          subject: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          id?: string;
          is_read?: boolean;
          is_resolved?: boolean;
          message?: string;
          name?: string;
          subject?: string;
        };
        Relationships: [];
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
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      tasks: {
        Row: {
          archived: boolean | null;
          completed: boolean | null;
          created_at: string | null;
          creator_id: string | null;
          deleted: boolean | null;
          description: string | null;
          end_date: string | null;
          id: string;
          list_id: string;
          name: string;
          priority: number | null;
          start_date: string | null;
        };
        Insert: {
          archived?: boolean | null;
          completed?: boolean | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          list_id: string;
          name: string;
          priority?: number | null;
          start_date?: string | null;
        };
        Update: {
          archived?: boolean | null;
          completed?: boolean | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          list_id?: string;
          name?: string;
          priority?: number | null;
          start_date?: string | null;
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
          was_resumed: boolean | null;
          ws_id: string;
        };
        Insert: {
          category_id?: string | null;
          created_at?: string | null;
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
          was_resumed?: boolean | null;
          ws_id: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string | null;
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
          was_resumed?: boolean | null;
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
      user_group_indicators: {
        Row: {
          created_at: string;
          group_id: string;
          indicator_id: string;
        };
        Insert: {
          created_at?: string;
          group_id: string;
          indicator_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          indicator_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_group_indicators_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_indicators_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_indicators_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_group_indicators_indicator_id_fkey';
            columns: ['indicator_id'];
            isOneToOne: false;
            referencedRelation: 'healthcare_vitals';
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
        };
        Insert: {
          created_at?: string;
          group_id: string;
          product_id: string;
          unit_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          product_id?: string;
          unit_id?: string;
        };
        Relationships: [
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
        ];
      };
      user_indicators: {
        Row: {
          created_at: string;
          creator_id: string | null;
          group_id: string;
          indicator_id: string;
          user_id: string;
          value: number | null;
        };
        Insert: {
          created_at?: string;
          creator_id?: string | null;
          group_id: string;
          indicator_id: string;
          user_id: string;
          value?: number | null;
        };
        Update: {
          created_at?: string;
          creator_id?: string | null;
          group_id?: string;
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
            foreignKeyName: 'user_indicators_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'user_groups_with_tags';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_indicators_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_indicators_group_id_fkey';
            columns: ['group_id'];
            isOneToOne: false;
            referencedRelation: 'workspace_user_groups_with_amount';
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
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_api_keys: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          value: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          value: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          value?: string;
          ws_id?: string;
        };
        Relationships: [
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
          archived: boolean | null;
          created_at: string | null;
          creator_id: string | null;
          deleted: boolean | null;
          id: string;
          name: string | null;
          template_id: string | null;
          ws_id: string;
        };
        Insert: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
          template_id?: string | null;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
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
          priority: string | null;
          start_at: string;
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
          priority?: string | null;
          start_at: string;
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
          priority?: string | null;
          start_at?: string;
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
            referencedRelation: 'workspaces';
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
            referencedRelation: 'users';
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
            referencedRelation: 'users';
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
          use_ratio?: boolean;
          value?: number;
          ws_id?: string;
        };
        Relationships: [
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
          id: string;
          set_id: string;
          started_at: string;
          total_score: number | null;
          user_id: string;
        };
        Insert: {
          attempt_number: number;
          completed_at?: string | null;
          id?: string;
          set_id: string;
          started_at?: string;
          total_score?: number | null;
          user_id: string;
        };
        Update: {
          attempt_number?: number;
          completed_at?: string | null;
          id?: string;
          set_id?: string;
          started_at?: string;
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
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_quiz_sets: {
        Row: {
          allow_view_results: boolean;
          attempt_limit: number | null;
          created_at: string;
          due_date: string;
          id: string;
          name: string;
          release_points_immediately: boolean;
          time_limit_minutes: number | null;
          ws_id: string | null;
        };
        Insert: {
          allow_view_results?: boolean;
          attempt_limit?: number | null;
          created_at?: string;
          due_date?: string;
          id?: string;
          name?: string;
          release_points_immediately?: boolean;
          time_limit_minutes?: number | null;
          ws_id?: string | null;
        };
        Update: {
          allow_view_results?: boolean;
          attempt_limit?: number | null;
          created_at?: string;
          due_date?: string;
          id?: string;
          name?: string;
          release_points_immediately?: boolean;
          time_limit_minutes?: number | null;
          ws_id?: string | null;
        };
        Relationships: [
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
          question: string;
          score: number;
          ws_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          question: string;
          score?: number;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          question?: string;
          score?: number;
          ws_id?: string;
        };
        Relationships: [
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
          status?: Database['public']['Enums']['subscription_status'] | null;
          updated_at?: string | null;
          ws_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_subscription_ws_id_fkey';
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
          updated_at?: string;
          updated_by?: string | null;
          ws_id?: string;
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
          table_name: unknown | null;
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
          table_name?: unknown | null;
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
          table_name?: unknown | null;
          ts?: string | null;
          ws_id?: never;
        };
        Relationships: [
          {
            foreignKeyName: 'record_version_auth_uid_fkey';
            columns: ['auth_uid'];
            isOneToOne: false;
            referencedRelation: 'nova_user_challenge_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'record_version_auth_uid_fkey';
            columns: ['auth_uid'];
            isOneToOne: false;
            referencedRelation: 'nova_user_leaderboard';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'record_version_auth_uid_fkey';
            columns: ['auth_uid'];
            isOneToOne: false;
            referencedRelation: 'users';
            referencedColumns: ['id'];
          },
        ];
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
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Functions: {
      calculate_productivity_score: {
        Args: { duration_seconds: number; category_color: string };
        Returns: number;
      };
      check_ws_creator: {
        Args: { ws_id: string };
        Returns: boolean;
      };
      cleanup_expired_cross_app_tokens: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      cleanup_role_inconsistencies: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      count_search_users: {
        Args:
          | { search_query: string }
          | {
              search_query: string;
              enabled_filter?: boolean;
              role_filter?: string;
            };
        Returns: number;
      };
      create_ai_chat: {
        Args: { model: string; message: string; title: string };
        Returns: string;
      };
      generate_cross_app_token: {
        Args:
          | {
              p_expiry_seconds?: number;
              p_target_app: string;
              p_origin_app: string;
              p_session_data?: Json;
              p_user_id: string;
            }
          | {
              p_target_app: string;
              p_origin_app: string;
              p_user_id: string;
              p_expiry_seconds?: number;
            };
        Returns: string;
      };
      get_challenge_stats: {
        Args: { user_id_param: string; challenge_id_param: string };
        Returns: {
          total_score: number;
          problems_attempted: number;
        }[];
      };
      get_daily_income_expense: {
        Args: { _ws_id: string; past_days?: number };
        Returns: {
          day: string;
          total_income: number;
          total_expense: number;
        }[];
      };
      get_daily_prompt_completion_tokens: {
        Args: { past_days?: number };
        Returns: {
          total_completion_tokens: number;
          day: string;
          total_prompt_tokens: number;
        }[];
      };
      get_finance_invoices_count: {
        Args: { ws_id: string };
        Returns: number;
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
      get_healthcare_vitals_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_hourly_prompt_completion_tokens: {
        Args: { past_hours?: number };
        Returns: {
          total_prompt_tokens: number;
          hour: string;
          total_completion_tokens: number;
        }[];
      };
      get_inventory_batches_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_inventory_product_categories_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_inventory_products: {
        Args: {
          _warehouse_ids?: string[];
          _has_unit?: boolean;
          _ws_id?: string;
          _category_ids?: string[];
        };
        Returns: {
          created_at: string;
          ws_id: string;
          amount: number;
          price: number;
          category: string;
          unit_id: string;
          unit: string;
          manufacturer: string;
          name: string;
          id: string;
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
      get_inventory_units_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_inventory_warehouses_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_monthly_income_expense: {
        Args: { _ws_id: string; past_months?: number };
        Returns: {
          month: string;
          total_income: number;
          total_expense: number;
        }[];
      };
      get_monthly_prompt_completion_tokens: {
        Args: { past_months?: number };
        Returns: {
          month: string;
          total_prompt_tokens: number;
          total_completion_tokens: number;
        }[];
      };
      get_pending_event_participants: {
        Args: { _event_id: string };
        Returns: number;
      };
      get_possible_excluded_groups: {
        Args: { _ws_id: string; included_groups: string[] };
        Returns: {
          id: string;
          amount: number;
          ws_id: string;
          name: string;
        }[];
      };
      get_possible_excluded_tags: {
        Args: { _ws_id: string; included_tags: string[] };
        Returns: {
          ws_id: string;
          id: string;
          name: string;
          amount: number;
        }[];
      };
      get_session_statistics: {
        Args: Record<PropertyKey, never>;
        Returns: {
          unique_users_count: number;
          total_count: number;
          active_count: number;
          completed_count: number;
          latest_session_date: string;
        }[];
      };
      get_session_templates: {
        Args: {
          workspace_id: string;
          limit_count?: number;
          user_id_param: string;
        };
        Returns: {
          description: string;
          title: string;
          category_id: string;
          task_id: string;
          tags: string[];
          category_name: string;
          category_color: string;
          task_name: string;
          usage_count: number;
          avg_duration: number;
          last_used: string;
        }[];
      };
      get_submission_statistics: {
        Args: Record<PropertyKey, never>;
        Returns: {
          latest_submission_date: string;
          total_count: number;
          unique_users_count: number;
        }[];
      };
      get_transaction_categories_with_amount: {
        Args: Record<PropertyKey, never>;
        Returns: {
          created_at: string;
          id: string;
          name: string;
          ws_id: string;
          is_expense: boolean;
          amount: number;
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
          updated_at: string;
          user_agent: string;
          is_current: boolean;
          ip: string;
          session_id: string;
          created_at: string;
        }[];
      };
      get_user_tasks: {
        Args: { _board_id: string };
        Returns: {
          name: string;
          priority: number;
          description: string;
          id: string;
          board_id: string;
          list_id: string;
          end_date: string;
          start_date: string;
          completed: boolean;
        }[];
      };
      get_workspace_drive_size: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_workspace_products_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_workspace_transaction_categories_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_workspace_transactions_count: {
        Args: { ws_id: string; end_date?: string; start_date?: string };
        Returns: number;
      };
      get_workspace_user_groups: {
        Args: {
          _ws_id: string;
          included_tags: string[];
          excluded_tags: string[];
          search_query: string;
        };
        Returns: {
          id: string;
          name: string;
          notes: string;
          ws_id: string;
          tags: string[];
          tag_count: number;
          created_at: string;
        }[];
      };
      get_workspace_user_groups_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_workspace_users: {
        Args: {
          _ws_id: string;
          search_query: string;
          excluded_groups: string[];
          included_groups: string[];
        };
        Returns: {
          national_id: string;
          address: string;
          guardian: string;
          ethnicity: string;
          birthday: string;
          gender: string;
          phone: string;
          email: string;
          display_name: string;
          full_name: string;
          avatar_url: string;
          id: string;
          note: string;
          balance: number;
          ws_id: string;
          groups: string[];
          group_count: number;
          linked_users: Json;
          created_at: string;
          updated_at: string;
        }[];
      };
      get_workspace_users_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_workspace_wallets_count: {
        Args: { ws_id: string };
        Returns: number;
      };
      get_workspace_wallets_expense: {
        Args: { ws_id: string; start_date?: string; end_date?: string };
        Returns: number;
      };
      get_workspace_wallets_income: {
        Args: { ws_id: string; start_date?: string; end_date?: string };
        Returns: number;
      };
      has_other_owner: {
        Args: { _user_id: string; _ws_id: string };
        Returns: boolean;
      };
      insert_ai_chat_message: {
        Args: { source: string; chat_id: string; message: string };
        Returns: undefined;
      };
      is_list_accessible: {
        Args: { _list_id: string };
        Returns: boolean;
      };
      is_member_invited: {
        Args: { _org_id: string; _user_id: string };
        Returns: boolean;
      };
      is_nova_challenge_manager: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_nova_role_manager: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
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
      is_project_member: {
        Args: { _project_id: string };
        Returns: boolean;
      };
      is_task_accessible: {
        Args: { _task_id: string };
        Returns: boolean;
      };
      is_task_board_member: {
        Args: { _board_id: string; _user_id: string };
        Returns: boolean;
      };
      is_user_task_in_board: {
        Args: { _user_id: string; _task_id: string };
        Returns: boolean;
      };
      nova_get_all_challenges_with_user_stats: {
        Args: { user_id: string };
        Returns: Json;
      };
      nova_get_challenge_with_user_stats: {
        Args: { user_id: string; challenge_id: string };
        Returns: Json;
      };
      nova_get_user_daily_sessions: {
        Args: { challenge_id: string; user_id: string };
        Returns: number;
      };
      nova_get_user_total_sessions: {
        Args: { user_id: string; challenge_id: string };
        Returns: number;
      };
      revoke_all_cross_app_tokens: {
        Args: { p_user_id: string };
        Returns: undefined;
      };
      revoke_all_other_sessions: {
        Args: { user_id: string };
        Returns: number;
      };
      revoke_user_session: {
        Args: { target_user_id: string; session_id: string };
        Returns: boolean;
      };
      search_users: {
        Args:
          | { page_number: number; page_size: number; search_query: string }
          | {
              search_query: string;
              page_number: number;
              page_size: number;
              role_filter?: string;
              enabled_filter?: boolean;
            };
        Returns: {
          id: string;
          display_name: string;
          deleted: boolean;
          avatar_url: string;
          handle: string;
          bio: string;
          created_at: string;
          user_id: string;
          enabled: boolean;
          allow_challenge_management: boolean;
          allow_manage_all_challenges: boolean;
          allow_role_management: boolean;
          email: string;
          new_email: string;
          birthday: string;
          team_name: string[];
        }[];
      };
      search_users_by_name: {
        Args: {
          min_similarity?: number;
          search_query: string;
          result_limit?: number;
        };
        Returns: {
          handle: string;
          display_name: string;
          relevance: number;
          avatar_url: string;
          id: string;
        }[];
      };
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
      update_expired_sessions: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      update_session_total_score: {
        Args: { challenge_id_param: string; user_id_param: string };
        Returns: undefined;
      };
      validate_cross_app_token: {
        Args: { p_target_app: string; p_token: string };
        Returns: string;
      };
      validate_cross_app_token_with_session: {
        Args: { p_token: string; p_target_app: string };
        Returns: {
          user_id: string;
          session_data: Json;
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
      calendar_hour_type: 'WORK' | 'PERSONAL' | 'MEETING';
      certificate_templates: 'original' | 'modern' | 'elegant';
      chat_role: 'FUNCTION' | 'USER' | 'SYSTEM' | 'ASSISTANT';
      dataset_type: 'excel' | 'csv' | 'html';
      platform_service: 'TUTURUUU' | 'REWISE' | 'NOVA' | 'UPSKII';
      subscription_status: 'trialing' | 'active' | 'canceled' | 'past_due';
      task_board_status: 'not_started' | 'active' | 'done' | 'closed';
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
        | 'send_user_group_post_emails';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DefaultSchema = Database[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      Database[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database;
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
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
      calendar_hour_type: ['WORK', 'PERSONAL', 'MEETING'],
      certificate_templates: ['original', 'modern', 'elegant'],
      chat_role: ['FUNCTION', 'USER', 'SYSTEM', 'ASSISTANT'],
      dataset_type: ['excel', 'csv', 'html'],
      platform_service: ['TUTURUUU', 'REWISE', 'NOVA', 'UPSKII'],
      subscription_status: ['trialing', 'active', 'canceled', 'past_due'],
      task_board_status: ['not_started', 'active', 'done', 'closed'],
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
      ],
    },
  },
} as const;
