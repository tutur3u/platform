export type Json =
  | {
      [key: string]: Json | undefined;
    }
  | boolean
  | Json[]
  | null
  | number
  | string;
export type Database = {
  public: {
    CompositeTypes: {
      [_ in never]: never;
    };
    Enums: {
      ai_message_type:
        | 'file'
        | 'flashcards'
        | 'message'
        | 'multi_choice_quiz'
        | 'notes'
        | 'paragraph_quiz'
        | 'summary';
      calendar_hour_type: 'MEETING' | 'PERSONAL' | 'WORK';
      chat_role: 'ASSISTANT' | 'FUNCTION' | 'SYSTEM' | 'USER';
      dataset_type: 'csv' | 'excel' | 'html';
      workspace_role_permission:
        | 'ai_chat'
        | 'ai_lab'
        | 'export_finance_data'
        | 'export_users_data'
        | 'manage_calendar'
        | 'manage_documents'
        | 'manage_drive'
        | 'manage_external_migrations'
        | 'manage_finance'
        | 'manage_inventory'
        | 'manage_projects'
        | 'manage_user_report_templates'
        | 'manage_users'
        | 'manage_workspace_audit_logs'
        | 'manage_workspace_billing'
        | 'manage_workspace_integrations'
        | 'manage_workspace_members'
        | 'manage_workspace_roles'
        | 'manage_workspace_secrets'
        | 'manage_workspace_security'
        | 'manage_workspace_settings'
        | 'send_user_group_post_emails'
        | 'view_infrastructure';
    };
    Functions: {
      calculate_productivity_score: {
        Args: {
          category_color: string;
          duration_seconds: number;
        };
        Returns: number;
      };
      cleanup_expired_cross_app_tokens: {
        Args: never;
        Returns: undefined;
      };
      cleanup_role_inconsistencies: {
        Args: never;
        Returns: undefined;
      };
      count_search_users:
        | {
            Args: {
              enabled_filter?: boolean;
              role_filter?: string;
              search_query: string;
            };
            Returns: number;
          }
        | {
            Args: {
              search_query: string;
            };
            Returns: number;
          };
      create_ai_chat: {
        Args: {
          message: string;
          model: string;
          title: string;
        };
        Returns: string;
      };
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
      get_challenge_stats: {
        Args: {
          challenge_id_param: string;
          user_id_param: string;
        };
        Returns: {
          problems_attempted: number;
          total_score: number;
        }[];
      };
      get_daily_income_expense: {
        Args: {
          _ws_id: string;
          past_days?: number;
        };
        Returns: {
          day: string;
          total_expense: number;
          total_income: number;
        }[];
      };
      get_daily_prompt_completion_tokens: {
        Args: {
          past_days?: number;
        };
        Returns: {
          day: string;
          total_completion_tokens: number;
          total_prompt_tokens: number;
        }[];
      };
      get_finance_invoices_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_healthcare_checkups_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_healthcare_diagnoses_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_healthcare_vital_groups_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_healthcare_vitals_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_hourly_prompt_completion_tokens: {
        Args: {
          past_hours?: number;
        };
        Returns: {
          hour: string;
          total_completion_tokens: number;
          total_prompt_tokens: number;
        }[];
      };
      get_inventory_batches_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_inventory_product_categories_count: {
        Args: {
          ws_id: string;
        };
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
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_inventory_suppliers_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_inventory_units_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_inventory_warehouses_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_monthly_income_expense: {
        Args: {
          _ws_id: string;
          past_months?: number;
        };
        Returns: {
          month: string;
          total_expense: number;
          total_income: number;
        }[];
      };
      get_monthly_prompt_completion_tokens: {
        Args: {
          past_months?: number;
        };
        Returns: {
          month: string;
          total_completion_tokens: number;
          total_prompt_tokens: number;
        }[];
      };
      get_pending_event_participants: {
        Args: {
          _event_id: string;
        };
        Returns: number;
      };
      get_possible_excluded_groups: {
        Args: {
          _ws_id: string;
          included_groups: string[];
        };
        Returns: {
          amount: number;
          id: string;
          name: string;
          ws_id: string;
        }[];
      };
      get_possible_excluded_tags: {
        Args: {
          _ws_id: string;
          included_tags: string[];
        };
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
      get_transaction_categories_with_amount: {
        Args: never;
        Returns: {
          amount: number;
          created_at: string;
          id: string;
          is_expense: boolean;
          name: string;
          ws_id: string;
        }[];
      };
      get_user_role: {
        Args: {
          user_id: string;
          ws_id: string;
        };
        Returns: string;
      };
      get_user_tasks: {
        Args: {
          _board_id: string;
        };
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
      get_workspace_drive_size: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_workspace_products_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_workspace_transaction_categories_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_workspace_transactions_count: {
        Args: {
          end_date?: string;
          start_date?: string;
          ws_id: string;
        };
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
        Args: {
          ws_id: string;
        };
        Returns: number;
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
      get_workspace_users_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_workspace_wallets_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
      };
      get_workspace_wallets_expense: {
        Args: {
          end_date?: string;
          start_date?: string;
          ws_id: string;
        };
        Returns: number;
      };
      get_workspace_wallets_income: {
        Args: {
          end_date?: string;
          start_date?: string;
          ws_id: string;
        };
        Returns: number;
      };
      has_other_owner: {
        Args: {
          _user_id: string;
          _ws_id: string;
        };
        Returns: boolean;
      };
      insert_ai_chat_message: {
        Args: {
          chat_id: string;
          message: string;
          source: string;
        };
        Returns: undefined;
      };
      is_list_accessible: {
        Args: {
          _list_id: string;
        };
        Returns: boolean;
      };
      is_member_invited: {
        Args: {
          _org_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_nova_challenge_manager: {
        Args: never;
        Returns: boolean;
      };
      is_nova_role_manager: {
        Args: never;
        Returns: boolean;
      };
      is_nova_user_email_in_team: {
        Args: {
          _team_id: string;
          _user_email: string;
        };
        Returns: boolean;
      };
      is_nova_user_id_in_team: {
        Args: {
          _team_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_org_member: {
        Args: {
          _org_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_project_member: {
        Args: {
          _project_id: string;
        };
        Returns: boolean;
      };
      is_task_accessible: {
        Args: {
          _task_id: string;
        };
        Returns: boolean;
      };
      is_task_board_member: {
        Args: {
          _board_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_user_task_in_board: {
        Args: {
          _task_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      nova_get_all_challenges_with_user_stats: {
        Args: {
          user_id: string;
        };
        Returns: Json;
      };
      nova_get_challenge_with_user_stats: {
        Args: {
          challenge_id: string;
          user_id: string;
        };
        Returns: Json;
      };
      nova_get_user_daily_sessions: {
        Args: {
          challenge_id: string;
          user_id: string;
        };
        Returns: number;
      };
      nova_get_user_total_sessions: {
        Args: {
          challenge_id: string;
          user_id: string;
        };
        Returns: number;
      };
      revoke_all_cross_app_tokens: {
        Args: {
          p_user_id: string;
        };
        Returns: undefined;
      };
      search_users:
        | {
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
          }
        | {
            Args: {
              page_number: number;
              page_size: number;
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
      transactions_have_same_abs_amount: {
        Args: {
          transaction_id_1: string;
          transaction_id_2: string;
        };
        Returns: boolean;
      };
      transactions_have_same_amount: {
        Args: {
          transaction_id_1: string;
          transaction_id_2: string;
        };
        Returns: boolean;
      };
      update_expired_sessions: {
        Args: never;
        Returns: undefined;
      };
      update_session_total_score: {
        Args: {
          challenge_id_param: string;
          user_id_param: string;
        };
        Returns: undefined;
      };
      validate_cross_app_token: {
        Args: {
          p_target_app: string;
          p_token: string;
        };
        Returns: string;
      };
      validate_cross_app_token_with_session: {
        Args: {
          p_target_app: string;
          p_token: string;
        };
        Returns: {
          session_data: Json;
          user_id: string;
        }[];
      };
    };
    Tables: {
      ai_chat_members: {
        Insert: {
          chat_id: string;
          created_at?: string;
          email: string;
        };
        Relationships: [
          {
            columns: ['chat_id'];
            foreignKeyName: 'ai_chat_members_chat_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'ai_chats';
          },
        ];
        Row: {
          chat_id: string;
          created_at: string;
          email: string;
        };
        Update: {
          chat_id?: string;
          created_at?: string;
          email?: string;
        };
      };
      ai_chat_messages: {
        Insert: {
          chat_id: string;
          completion_tokens?: number;
          content?: null | string;
          created_at?: string;
          creator_id?: null | string;
          finish_reason?: null | string;
          id?: string;
          metadata?: Json | null;
          model?: null | string;
          prompt_tokens?: number;
          role: Database['public']['Enums']['chat_role'];
          type?: Database['public']['Enums']['ai_message_type'];
        };
        Relationships: [
          {
            columns: ['chat_id'];
            foreignKeyName: 'ai_chat_messages_chat_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'ai_chats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'ai_chat_messages_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'ai_chat_messages_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'ai_chat_messages_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['model'];
            foreignKeyName: 'public_ai_chat_messages_model_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'ai_models';
          },
        ];
        Row: {
          chat_id: string;
          completion_tokens: number;
          content: null | string;
          created_at: string;
          creator_id: null | string;
          finish_reason: null | string;
          id: string;
          metadata: Json | null;
          model: null | string;
          prompt_tokens: number;
          role: Database['public']['Enums']['chat_role'];
          type: Database['public']['Enums']['ai_message_type'];
        };
        Update: {
          chat_id?: string;
          completion_tokens?: number;
          content?: null | string;
          created_at?: string;
          creator_id?: null | string;
          finish_reason?: null | string;
          id?: string;
          metadata?: Json | null;
          model?: null | string;
          prompt_tokens?: number;
          role?: Database['public']['Enums']['chat_role'];
          type?: Database['public']['Enums']['ai_message_type'];
        };
      };
      ai_chats: {
        Insert: {
          created_at?: string;
          creator_id?: null | string;
          id?: string;
          is_public?: boolean;
          latest_summarized_message_id?: null | string;
          model?: null | string;
          pinned?: boolean;
          summary?: null | string;
          title?: null | string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'ai_chats_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'ai_chats_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'ai_chats_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['latest_summarized_message_id'];
            foreignKeyName: 'public_ai_chats_latest_summarized_message_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'ai_chat_messages';
          },
          {
            columns: ['model'];
            foreignKeyName: 'public_ai_chats_model_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'ai_models';
          },
        ];
        Row: {
          created_at: string;
          creator_id: null | string;
          id: string;
          is_public: boolean;
          latest_summarized_message_id: null | string;
          model: null | string;
          pinned: boolean;
          summary: null | string;
          title: null | string;
        };
        Update: {
          created_at?: string;
          creator_id?: null | string;
          id?: string;
          is_public?: boolean;
          latest_summarized_message_id?: null | string;
          model?: null | string;
          pinned?: boolean;
          summary?: null | string;
          title?: null | string;
        };
      };
      ai_models: {
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id: string;
          name?: null | string;
          provider?: null | string;
        };
        Relationships: [
          {
            columns: ['provider'];
            foreignKeyName: 'public_ai_models_provider_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'ai_providers';
          },
        ];
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          name: null | string;
          provider: null | string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          name?: null | string;
          provider?: null | string;
        };
      };
      ai_providers: {
        Insert: {
          created_at?: string;
          id: string;
          name: string;
        };
        Relationships: [];
        Row: {
          created_at: string;
          id: string;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
        };
      };
      ai_whitelisted_domains: {
        Insert: {
          created_at?: string;
          description?: null | string;
          domain: string;
          enabled?: boolean;
        };
        Relationships: [];
        Row: {
          created_at: string;
          description: null | string;
          domain: string;
          enabled: boolean;
        };
        Update: {
          created_at?: string;
          description?: null | string;
          domain?: string;
          enabled?: boolean;
        };
      };
      ai_whitelisted_emails: {
        Insert: {
          created_at?: string;
          email: string;
          enabled?: boolean;
        };
        Relationships: [];
        Row: {
          created_at: string;
          email: string;
          enabled: boolean;
        };
        Update: {
          created_at?: string;
          email?: string;
          enabled?: boolean;
        };
      };
      aurora_ml_forecast: {
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
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'aurora_ml_forecast_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      aurora_ml_metrics: {
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
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'aurora_ml_metrics_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      aurora_statistical_forecast: {
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
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'aurora_statistical_forecast_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      aurora_statistical_metrics: {
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
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'aurora_statistical_metrics_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      calendar_auth_tokens: {
        Insert: {
          access_token: string;
          created_at?: string;
          id?: string;
          refresh_token: string;
          user_id: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['user_id'];
            foreignKeyName: 'calendar_auth_tokens_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'calendar_auth_tokens_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'calendar_auth_tokens_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'calendar_auth_tokens_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          access_token: string;
          created_at: string;
          id: string;
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
      };
      calendar_event_colors: {
        Insert: {
          value: string;
        };
        Relationships: [];
        Row: {
          value: string;
        };
        Update: {
          value?: string;
        };
      };
      calendar_event_participant_groups: {
        Insert: {
          created_at?: null | string;
          event_id: string;
          group_id: string;
          notes?: null | string;
          role?: null | string;
        };
        Relationships: [
          {
            columns: ['event_id'];
            foreignKeyName: 'calendar_event_participant_groups_event_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_calendar_events';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
        ];
        Row: {
          created_at: null | string;
          event_id: string;
          group_id: string;
          notes: null | string;
          role: null | string;
        };
        Update: {
          created_at?: null | string;
          event_id?: string;
          group_id?: string;
          notes?: null | string;
          role?: null | string;
        };
      };
      calendar_event_platform_participants: {
        Insert: {
          created_at?: null | string;
          event_id: string;
          going?: boolean | null;
          notes?: string;
          role?: null | string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['event_id'];
            foreignKeyName: 'calendar_event_platform_participants_event_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_calendar_events';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'calendar_event_platform_participants_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'calendar_event_platform_participants_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'calendar_event_platform_participants_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: null | string;
          event_id: string;
          going: boolean | null;
          notes: string;
          role: null | string;
          user_id: string;
        };
        Update: {
          created_at?: null | string;
          event_id?: string;
          going?: boolean | null;
          notes?: string;
          role?: null | string;
          user_id?: string;
        };
      };
      calendar_event_virtual_participants: {
        Insert: {
          created_at?: null | string;
          event_id: string;
          going?: boolean | null;
          notes?: string;
          role?: null | string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['event_id'];
            foreignKeyName: 'calendar_event_virtual_participants_event_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_calendar_events';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'calendar_event_virtual_participants_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'calendar_event_virtual_participants_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'calendar_event_virtual_participants_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
        ];
        Row: {
          created_at: null | string;
          event_id: string;
          going: boolean | null;
          notes: string;
          role: null | string;
          user_id: string;
        };
        Update: {
          created_at?: null | string;
          event_id?: string;
          going?: boolean | null;
          notes?: string;
          role?: null | string;
          user_id?: string;
        };
      };
      course_certificates: {
        Insert: {
          completed_date: string;
          course_id: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            columns: ['course_id'];
            foreignKeyName: 'course_certificates_course_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_courses';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'course_certificates_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'course_certificates_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'course_certificates_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          completed_date: string;
          course_id: string;
          created_at: string;
          id: string;
          user_id: string;
        };
        Update: {
          completed_date?: string;
          course_id?: string;
          created_at?: string;
          id?: string;
          user_id?: string;
        };
      };
      course_module_completion_status: {
        Insert: {
          completed_at?: null | string;
          completion_id?: string;
          completion_status?: boolean;
          created_at?: null | string;
          module_id: string;
          user_id?: null | string;
        };
        Relationships: [
          {
            columns: ['module_id'];
            foreignKeyName: 'course_module_completion_status_module_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_course_modules';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'course_module_completion_status_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'course_module_completion_status_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'course_module_completion_status_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          completed_at: null | string;
          completion_id: string;
          completion_status: boolean;
          created_at: null | string;
          module_id: string;
          user_id: null | string;
        };
        Update: {
          completed_at?: null | string;
          completion_id?: string;
          completion_status?: boolean;
          created_at?: null | string;
          module_id?: string;
          user_id?: null | string;
        };
      };
      course_module_flashcards: {
        Insert: {
          created_at?: string;
          flashcard_id: string;
          module_id: string;
        };
        Relationships: [
          {
            columns: ['flashcard_id'];
            foreignKeyName: 'course_module_flashcards_flashcard_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_flashcards';
          },
          {
            columns: ['module_id'];
            foreignKeyName: 'course_module_flashcards_module_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_course_modules';
          },
        ];
        Row: {
          created_at: string;
          flashcard_id: string;
          module_id: string;
        };
        Update: {
          created_at?: string;
          flashcard_id?: string;
          module_id?: string;
        };
      };
      course_module_quiz_sets: {
        Insert: {
          created_at?: string;
          module_id: string;
          set_id: string;
        };
        Relationships: [
          {
            columns: ['module_id'];
            foreignKeyName: 'course_module_quiz_sets_module_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_course_modules';
          },
          {
            columns: ['set_id'];
            foreignKeyName: 'course_module_quiz_sets_set_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_quiz_sets';
          },
        ];
        Row: {
          created_at: string;
          module_id: string;
          set_id: string;
        };
        Update: {
          created_at?: string;
          module_id?: string;
          set_id?: string;
        };
      };
      course_module_quizzes: {
        Insert: {
          created_at?: string;
          module_id: string;
          quiz_id: string;
        };
        Relationships: [
          {
            columns: ['module_id'];
            foreignKeyName: 'course_module_quizzes_module_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_course_modules';
          },
          {
            columns: ['quiz_id'];
            foreignKeyName: 'course_module_quizzes_quiz_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_quizzes';
          },
        ];
        Row: {
          created_at: string;
          module_id: string;
          quiz_id: string;
        };
        Update: {
          created_at?: string;
          module_id?: string;
          quiz_id?: string;
        };
      };
      crawled_url_next_urls: {
        Insert: {
          created_at?: string;
          origin_id?: string;
          skipped: boolean;
          url: string;
        };
        Relationships: [
          {
            columns: ['origin_id'];
            foreignKeyName: 'crawled_url_next_urls_origin_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'crawled_urls';
          },
        ];
        Row: {
          created_at: string;
          origin_id: string;
          skipped: boolean;
          url: string;
        };
        Update: {
          created_at?: string;
          origin_id?: string;
          skipped?: boolean;
          url?: string;
        };
      };
      crawled_urls: {
        Insert: {
          created_at?: string;
          creator_id: string;
          html?: null | string;
          id?: string;
          markdown?: null | string;
          url: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'crawled_urls_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'crawled_urls_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'crawled_urls_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: string;
          creator_id: string;
          html: null | string;
          id: string;
          markdown: null | string;
          url: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          html?: null | string;
          id?: string;
          markdown?: null | string;
          url?: string;
        };
      };
      credit_wallets: {
        Insert: {
          limit: number;
          payment_date: number;
          statement_date: number;
          wallet_id: string;
        };
        Relationships: [
          {
            columns: ['wallet_id'];
            foreignKeyName: 'credit_wallets_wallet_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_wallets';
          },
        ];
        Row: {
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
      };
      cross_app_tokens: {
        Insert: {
          created_at?: string;
          expires_at: string;
          id?: string;
          is_revoked?: boolean;
          origin_app: string;
          session_data?: Json | null;
          target_app: string;
          token: string;
          used_at?: null | string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['user_id'];
            foreignKeyName: 'cross_app_tokens_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'cross_app_tokens_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'cross_app_tokens_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          is_revoked: boolean;
          origin_app: string;
          session_data: Json | null;
          target_app: string;
          token: string;
          used_at: null | string;
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
          used_at?: null | string;
          user_id?: string;
        };
      };
      currencies: {
        Insert: {
          code: string;
          name: string;
        };
        Relationships: [];
        Row: {
          code: string;
          name: string;
        };
        Update: {
          code?: string;
          name?: string;
        };
      };
      external_user_monthly_report_logs: {
        Insert: {
          content?: string;
          created_at?: string;
          creator_id?: null | string;
          feedback?: string;
          group_id: string;
          id?: string;
          report_id: string;
          score?: null | number;
          scores?: null | number[];
          title?: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'external_user_monthly_report_logs_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'external_user_monthly_report_logs_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'external_user_monthly_report_logs_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
          {
            columns: ['report_id'];
            foreignKeyName: 'external_user_monthly_report_logs_report_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'external_user_monthly_reports';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'external_user_monthly_report_logs_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'external_user_monthly_report_logs_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'external_user_monthly_report_logs_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
        ];
        Row: {
          content: string;
          created_at: string;
          creator_id: null | string;
          feedback: string;
          group_id: string;
          id: string;
          report_id: string;
          score: null | number;
          scores: null | number[];
          title: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          creator_id?: null | string;
          feedback?: string;
          group_id?: string;
          id?: string;
          report_id?: string;
          score?: null | number;
          scores?: null | number[];
          title?: string;
          user_id?: string;
        };
      };
      external_user_monthly_reports: {
        Insert: {
          content: string;
          created_at?: string;
          creator_id?: null | string;
          feedback: string;
          group_id: string;
          id?: string;
          score?: null | number;
          scores?: null | number[];
          title: string;
          updated_at: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'external_user_monthly_reports_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'external_user_monthly_reports_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'external_user_monthly_reports_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'public_external_user_monthly_reports_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'public_external_user_monthly_reports_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'public_external_user_monthly_reports_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
        ];
        Row: {
          content: string;
          created_at: string;
          creator_id: null | string;
          feedback: string;
          group_id: string;
          id: string;
          score: null | number;
          scores: null | number[];
          title: string;
          updated_at: string;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          creator_id?: null | string;
          feedback?: string;
          group_id?: string;
          id?: string;
          score?: null | number;
          scores?: null | number[];
          title?: string;
          updated_at?: string;
          user_id?: string;
        };
      };
      field_types: {
        Insert: {
          enabled?: boolean;
          id: string;
        };
        Relationships: [];
        Row: {
          enabled: boolean;
          id: string;
        };
        Update: {
          enabled?: boolean;
          id?: string;
        };
      };
      finance_invoice_products: {
        Insert: {
          amount: number;
          created_at?: null | string;
          invoice_id: string;
          price: number;
          product_id?: null | string;
          product_name?: string;
          product_unit?: string;
          total_diff?: number;
          unit_id: string;
          warehouse?: string;
          warehouse_id: string;
        };
        Relationships: [
          {
            columns: ['invoice_id'];
            foreignKeyName: 'finance_invoice_products_invoice_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'finance_invoices';
          },
          {
            columns: ['product_id'];
            foreignKeyName: 'finance_invoice_products_product_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_products';
          },
          {
            columns: ['unit_id'];
            foreignKeyName: 'finance_invoice_products_unit_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_units';
          },
          {
            columns: ['warehouse_id'];
            foreignKeyName: 'finance_invoice_products_warehouse_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_warehouses';
          },
        ];
        Row: {
          amount: number;
          created_at: null | string;
          invoice_id: string;
          price: number;
          product_id: null | string;
          product_name: string;
          product_unit: string;
          total_diff: number;
          unit_id: string;
          warehouse: string;
          warehouse_id: string;
        };
        Update: {
          amount?: number;
          created_at?: null | string;
          invoice_id?: string;
          price?: number;
          product_id?: null | string;
          product_name?: string;
          product_unit?: string;
          total_diff?: number;
          unit_id?: string;
          warehouse?: string;
          warehouse_id?: string;
        };
      };
      finance_invoice_promotions: {
        Insert: {
          code?: string;
          created_at?: string;
          description?: null | string;
          invoice_id?: null | string;
          name?: null | string;
          promo_id?: null | string;
          use_ratio: boolean;
          value: number;
        };
        Relationships: [
          {
            columns: ['invoice_id'];
            foreignKeyName: 'finance_invoice_promotions_invoice_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'finance_invoices';
          },
          {
            columns: ['promo_id'];
            foreignKeyName: 'finance_invoice_promotions_promo_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_promotions';
          },
        ];
        Row: {
          code: string;
          created_at: string;
          description: null | string;
          invoice_id: null | string;
          name: null | string;
          promo_id: null | string;
          use_ratio: boolean;
          value: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          description?: null | string;
          invoice_id?: null | string;
          name?: null | string;
          promo_id?: null | string;
          use_ratio?: boolean;
          value?: number;
        };
      };
      finance_invoices: {
        Insert: {
          category_id: string;
          completed_at?: null | string;
          created_at?: null | string;
          creator_id?: null | string;
          customer_id?: null | string;
          id?: string;
          note?: null | string;
          notice?: null | string;
          paid_amount?: number;
          price: number;
          total_diff?: number;
          transaction_id?: null | string;
          user_group_id?: null | string;
          valid_until?: null | string;
          wallet_id: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['category_id'];
            foreignKeyName: 'finance_invoices_category_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'transaction_categories';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'finance_invoices_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'finance_invoices_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'finance_invoices_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['customer_id'];
            foreignKeyName: 'finance_invoices_customer_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['customer_id'];
            foreignKeyName: 'finance_invoices_customer_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['customer_id'];
            foreignKeyName: 'finance_invoices_customer_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['transaction_id'];
            foreignKeyName: 'finance_invoices_transaction_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'wallet_transactions';
          },
          {
            columns: ['wallet_id'];
            foreignKeyName: 'finance_invoices_wallet_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_wallets';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'finance_invoices_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
          {
            columns: ['user_group_id'];
            foreignKeyName: 'public_finance_invoices_user_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['user_group_id'];
            foreignKeyName: 'public_finance_invoices_user_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['user_group_id'];
            foreignKeyName: 'public_finance_invoices_user_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
        ];
        Row: {
          category_id: string;
          completed_at: null | string;
          created_at: null | string;
          creator_id: null | string;
          customer_id: null | string;
          id: string;
          note: null | string;
          notice: null | string;
          paid_amount: number;
          price: number;
          total_diff: number;
          transaction_id: null | string;
          user_group_id: null | string;
          valid_until: null | string;
          wallet_id: string;
          ws_id: string;
        };
        Update: {
          category_id?: string;
          completed_at?: null | string;
          created_at?: null | string;
          creator_id?: null | string;
          customer_id?: null | string;
          id?: string;
          note?: null | string;
          notice?: null | string;
          paid_amount?: number;
          price?: number;
          total_diff?: number;
          transaction_id?: null | string;
          user_group_id?: null | string;
          valid_until?: null | string;
          wallet_id?: string;
          ws_id?: string;
        };
      };
      handles: {
        Insert: {
          created_at?: null | string;
          creator_id?: null | string;
          value: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'handles_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'handles_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'handles_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: null | string;
          creator_id: null | string;
          value: string;
        };
        Update: {
          created_at?: null | string;
          creator_id?: null | string;
          value?: string;
        };
      };
      healthcare_checkup_vital_groups: {
        Insert: {
          checkup_id: string;
          created_at?: null | string;
          group_id: string;
        };
        Relationships: [
          {
            columns: ['checkup_id'];
            foreignKeyName: 'healthcare_checkup_vital_groups_checkup_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'healthcare_checkups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'healthcare_checkup_vital_groups_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'healthcare_vital_groups';
          },
        ];
        Row: {
          checkup_id: string;
          created_at: null | string;
          group_id: string;
        };
        Update: {
          checkup_id?: string;
          created_at?: null | string;
          group_id?: string;
        };
      };
      healthcare_checkup_vitals: {
        Insert: {
          checkup_id: string;
          created_at?: null | string;
          value?: null | number;
          vital_id: string;
        };
        Relationships: [
          {
            columns: ['checkup_id'];
            foreignKeyName: 'healthcare_checkup_vitals_checkup_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'healthcare_checkups';
          },
          {
            columns: ['vital_id'];
            foreignKeyName: 'healthcare_checkup_vitals_vital_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'healthcare_vitals';
          },
        ];
        Row: {
          checkup_id: string;
          created_at: null | string;
          value: null | number;
          vital_id: string;
        };
        Update: {
          checkup_id?: string;
          created_at?: null | string;
          value?: null | number;
          vital_id?: string;
        };
      };
      healthcare_checkups: {
        Insert: {
          checked?: boolean;
          checkup_at?: string;
          completed_at?: null | string;
          created_at?: null | string;
          creator_id: string;
          diagnosis_id?: null | string;
          id?: string;
          next_checked?: boolean | null;
          next_checkup_at?: null | string;
          note?: null | string;
          patient_id: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'healthcare_checkups_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'healthcare_checkups_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'healthcare_checkups_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['diagnosis_id'];
            foreignKeyName: 'healthcare_checkups_diagnosis_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'healthcare_diagnoses';
          },
          {
            columns: ['patient_id'];
            foreignKeyName: 'healthcare_checkups_patient_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['patient_id'];
            foreignKeyName: 'healthcare_checkups_patient_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['patient_id'];
            foreignKeyName: 'healthcare_checkups_patient_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'healthcare_checkups_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          checked: boolean;
          checkup_at: string;
          completed_at: null | string;
          created_at: null | string;
          creator_id: string;
          diagnosis_id: null | string;
          id: string;
          next_checked: boolean | null;
          next_checkup_at: null | string;
          note: null | string;
          patient_id: string;
          ws_id: string;
        };
        Update: {
          checked?: boolean;
          checkup_at?: string;
          completed_at?: null | string;
          created_at?: null | string;
          creator_id?: string;
          diagnosis_id?: null | string;
          id?: string;
          next_checked?: boolean | null;
          next_checkup_at?: null | string;
          note?: null | string;
          patient_id?: string;
          ws_id?: string;
        };
      };
      healthcare_diagnoses: {
        Insert: {
          created_at?: null | string;
          description?: null | string;
          id?: string;
          name?: null | string;
          note?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'healthcare_diagnoses_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: null | string;
          description: null | string;
          id: string;
          name: null | string;
          note: null | string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          description?: null | string;
          id?: string;
          name?: null | string;
          note?: null | string;
          ws_id?: string;
        };
      };
      healthcare_vital_groups: {
        Insert: {
          created_at?: null | string;
          description?: null | string;
          id?: string;
          name: string;
          note?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'healthcare_vital_groups_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: null | string;
          description: null | string;
          id: string;
          name: string;
          note: null | string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          description?: null | string;
          id?: string;
          name?: string;
          note?: null | string;
          ws_id?: string;
        };
      };
      healthcare_vitals: {
        Insert: {
          created_at?: null | string;
          factor?: number;
          group_id?: null | string;
          id?: string;
          name: string;
          unit: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'healthcare_vitals_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
        ];
        Row: {
          created_at: null | string;
          factor: number;
          group_id: null | string;
          id: string;
          name: string;
          unit: string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          factor?: number;
          group_id?: null | string;
          id?: string;
          name?: string;
          unit?: string;
          ws_id?: string;
        };
      };
      inventory_batch_products: {
        Insert: {
          amount?: number;
          batch_id: string;
          created_at?: null | string;
          price?: number;
          product_id: string;
          unit_id: string;
        };
        Relationships: [
          {
            columns: ['batch_id'];
            foreignKeyName: 'inventory_batch_products_batch_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_batches';
          },
          {
            columns: ['product_id'];
            foreignKeyName: 'inventory_batch_products_product_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_products';
          },
          {
            columns: ['unit_id'];
            foreignKeyName: 'inventory_batch_products_unit_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_units';
          },
        ];
        Row: {
          amount: number;
          batch_id: string;
          created_at: null | string;
          price: number;
          product_id: string;
          unit_id: string;
        };
        Update: {
          amount?: number;
          batch_id?: string;
          created_at?: null | string;
          price?: number;
          product_id?: string;
          unit_id?: string;
        };
      };
      inventory_batches: {
        Insert: {
          created_at?: null | string;
          id?: string;
          price?: number;
          supplier_id?: null | string;
          total_diff?: number;
          warehouse_id: string;
        };
        Relationships: [
          {
            columns: ['supplier_id'];
            foreignKeyName: 'inventory_batches_supplier_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_suppliers';
          },
          {
            columns: ['warehouse_id'];
            foreignKeyName: 'inventory_batches_warehouse_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_warehouses';
          },
        ];
        Row: {
          created_at: null | string;
          id: string;
          price: number;
          supplier_id: null | string;
          total_diff: number;
          warehouse_id: string;
        };
        Update: {
          created_at?: null | string;
          id?: string;
          price?: number;
          supplier_id?: null | string;
          total_diff?: number;
          warehouse_id?: string;
        };
      };
      inventory_products: {
        Insert: {
          amount?: null | number;
          created_at?: null | string;
          min_amount?: number;
          price?: number;
          product_id: string;
          unit_id: string;
          warehouse_id: string;
        };
        Relationships: [
          {
            columns: ['product_id'];
            foreignKeyName: 'inventory_products_product_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_products';
          },
          {
            columns: ['unit_id'];
            foreignKeyName: 'inventory_products_unit_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_units';
          },
          {
            columns: ['warehouse_id'];
            foreignKeyName: 'inventory_products_warehouse_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_warehouses';
          },
        ];
        Row: {
          amount: null | number;
          created_at: null | string;
          min_amount: number;
          price: number;
          product_id: string;
          unit_id: string;
          warehouse_id: string;
        };
        Update: {
          amount?: null | number;
          created_at?: null | string;
          min_amount?: number;
          price?: number;
          product_id?: string;
          unit_id?: string;
          warehouse_id?: string;
        };
      };
      inventory_suppliers: {
        Insert: {
          created_at?: null | string;
          id?: string;
          name?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'inventory_suppliers_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: null | string;
          id: string;
          name: null | string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          id?: string;
          name?: null | string;
          ws_id?: string;
        };
      };
      inventory_units: {
        Insert: {
          created_at?: null | string;
          id?: string;
          name?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'inventory_units_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: null | string;
          id: string;
          name: null | string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          id?: string;
          name?: null | string;
          ws_id?: string;
        };
      };
      inventory_warehouses: {
        Insert: {
          created_at?: null | string;
          id?: string;
          name?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'inventory_warehouses_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: null | string;
          id: string;
          name: null | string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          id?: string;
          name?: null | string;
          ws_id?: string;
        };
      };
      media_uploads: {
        Insert: {
          created_at?: string;
          duration_seconds?: null | number;
          id?: string;
          status?: string;
          storage_path: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['user_id'];
            foreignKeyName: 'media_uploads_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'media_uploads_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'media_uploads_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: string;
          duration_seconds: null | number;
          id: string;
          status: string;
          storage_path: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          duration_seconds?: null | number;
          id?: string;
          status?: string;
          storage_path?: string;
          user_id?: string;
        };
      };
      meet_together_guest_timeblocks: {
        Insert: {
          created_at?: string;
          date: string;
          end_time: string;
          id?: string;
          plan_id: string;
          start_time: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['plan_id'];
            foreignKeyName: 'meet_together_guest_timeblocks_plan_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'meet_together_plans';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'meet_together_guest_timeblocks_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'meet_together_guests';
          },
        ];
        Row: {
          created_at: string;
          date: string;
          end_time: string;
          id: string;
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
      };
      meet_together_guests: {
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          password_hash: string;
          password_salt: string;
          plan_id: string;
        };
        Relationships: [
          {
            columns: ['plan_id'];
            foreignKeyName: 'meet_together_guests_plan_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'meet_together_plans';
          },
        ];
        Row: {
          created_at: string;
          id: string;
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
      };
      meet_together_plans: {
        Insert: {
          created_at?: null | string;
          creator_id?: null | string;
          dates: string[];
          description?: null | string;
          end_time: string;
          id?: string;
          is_public?: boolean;
          name?: null | string;
          start_time: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'meet_together_plans_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'meet_together_plans_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'meet_together_plans_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: null | string;
          creator_id: null | string;
          dates: string[];
          description: null | string;
          end_time: string;
          id: string;
          is_public: boolean;
          name: null | string;
          start_time: string;
        };
        Update: {
          created_at?: null | string;
          creator_id?: null | string;
          dates?: string[];
          description?: null | string;
          end_time?: string;
          id?: string;
          is_public?: boolean;
          name?: null | string;
          start_time?: string;
        };
      };
      meet_together_user_timeblocks: {
        Insert: {
          created_at?: string;
          date: string;
          end_time: string;
          id?: string;
          plan_id: string;
          start_time: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['plan_id'];
            foreignKeyName: 'meet_together_user_timeblocks_plan_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'meet_together_plans';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'meet_together_user_timeblocks_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'meet_together_user_timeblocks_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'meet_together_user_timeblocks_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: string;
          date: string;
          end_time: string;
          id: string;
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
      };
      meeting_notes: {
        Insert: {
          created_at?: string;
          id?: string;
          media_upload_id: string;
          notes_markdown: string;
          transcript_id?: null | string;
        };
        Relationships: [
          {
            columns: ['media_upload_id'];
            foreignKeyName: 'meeting_notes_media_upload_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'media_uploads';
          },
          {
            columns: ['transcript_id'];
            foreignKeyName: 'meeting_notes_transcript_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'recording_transcripts';
          },
        ];
        Row: {
          created_at: string;
          id: string;
          media_upload_id: string;
          notes_markdown: string;
          transcript_id: null | string;
        };
        Update: {
          created_at?: string;
          id?: string;
          media_upload_id?: string;
          notes_markdown?: string;
          transcript_id?: null | string;
        };
      };
      nova_challenge_criteria: {
        Insert: {
          challenge_id: string;
          created_at?: string;
          description: string;
          id?: string;
          name: string;
        };
        Relationships: [
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_challenge_criteria_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_challenges';
          },
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_challenge_criteria_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['challenge_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
        ];
        Row: {
          challenge_id: string;
          created_at: string;
          description: string;
          id: string;
          name: string;
        };
        Update: {
          challenge_id?: string;
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
        };
      };
      nova_challenge_manager_emails: {
        Insert: {
          challenge_id?: string;
          created_at?: string;
          email: string;
        };
        Relationships: [
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_challenge_manager_emails_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_challenges';
          },
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_challenge_manager_emails_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['challenge_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
        ];
        Row: {
          challenge_id: string;
          created_at: string;
          email: string;
        };
        Update: {
          challenge_id?: string;
          created_at?: string;
          email?: string;
        };
      };
      nova_challenge_whitelisted_emails: {
        Insert: {
          challenge_id: string;
          created_at?: string;
          email: string;
        };
        Relationships: [
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_challenge_whitelisted_emails_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_challenges';
          },
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_challenge_whitelisted_emails_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['challenge_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
        ];
        Row: {
          challenge_id: string;
          created_at: string;
          email: string;
        };
        Update: {
          challenge_id?: string;
          created_at?: string;
          email?: string;
        };
      };
      nova_challenges: {
        Insert: {
          close_at?: null | string;
          created_at?: string;
          description: string;
          duration: number;
          enabled?: boolean;
          id?: string;
          max_attempts?: number;
          max_daily_attempts?: number;
          open_at?: null | string;
          password_hash?: null | string;
          password_salt?: null | string;
          previewable_at?: null | string;
          title: string;
          whitelisted_only?: boolean;
        };
        Relationships: [];
        Row: {
          close_at: null | string;
          created_at: string;
          description: string;
          duration: number;
          enabled: boolean;
          id: string;
          max_attempts: number;
          max_daily_attempts: number;
          open_at: null | string;
          password_hash: null | string;
          password_salt: null | string;
          previewable_at: null | string;
          title: string;
          whitelisted_only: boolean;
        };
        Update: {
          close_at?: null | string;
          created_at?: string;
          description?: string;
          duration?: number;
          enabled?: boolean;
          id?: string;
          max_attempts?: number;
          max_daily_attempts?: number;
          open_at?: null | string;
          password_hash?: null | string;
          password_salt?: null | string;
          previewable_at?: null | string;
          title?: string;
          whitelisted_only?: boolean;
        };
      };
      nova_problem_test_cases: {
        Insert: {
          created_at?: string;
          hidden?: boolean;
          id?: string;
          input: string;
          output: string;
          problem_id: string;
        };
        Relationships: [
          {
            columns: ['problem_id'];
            foreignKeyName: 'nova_problem_testcases_problem_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_problems';
          },
        ];
        Row: {
          created_at: string;
          hidden: boolean;
          id: string;
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
      };
      nova_problems: {
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
        Relationships: [
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_problems_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_challenges';
          },
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_problems_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['challenge_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
        ];
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
      };
      nova_sessions: {
        Insert: {
          challenge_id: string;
          created_at?: string;
          end_time?: null | string;
          id?: string;
          start_time: string;
          status: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_sessions_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_challenges';
          },
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_sessions_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['challenge_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          challenge_id: string;
          created_at: string;
          end_time: null | string;
          id: string;
          start_time: string;
          status: string;
          user_id: string;
        };
        Update: {
          challenge_id?: string;
          created_at?: string;
          end_time?: null | string;
          id?: string;
          start_time?: string;
          status?: string;
          user_id?: string;
        };
      };
      nova_submission_criteria: {
        Insert: {
          created_at?: string;
          criteria_id: string;
          feedback: string;
          improvements?: null | string[];
          score: number;
          strengths?: null | string[];
          submission_id: string;
        };
        Relationships: [
          {
            columns: ['criteria_id'];
            foreignKeyName: 'nova_submission_criteria_criteria_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_challenge_criteria';
          },
          {
            columns: ['submission_id'];
            foreignKeyName: 'nova_submission_criteria_submission_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_submissions';
          },
          {
            columns: ['submission_id'];
            foreignKeyName: 'nova_submission_criteria_submission_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_submissions_with_scores';
          },
        ];
        Row: {
          created_at: string;
          criteria_id: string;
          feedback: string;
          improvements: null | string[];
          score: number;
          strengths: null | string[];
          submission_id: string;
        };
        Update: {
          created_at?: string;
          criteria_id?: string;
          feedback?: string;
          improvements?: null | string[];
          score?: number;
          strengths?: null | string[];
          submission_id?: string;
        };
      };
      nova_submission_test_cases: {
        Insert: {
          confidence?: null | number;
          created_at?: string;
          matched?: boolean;
          output: string;
          reasoning?: null | string;
          submission_id: string;
          test_case_id: string;
        };
        Relationships: [
          {
            columns: ['submission_id'];
            foreignKeyName: 'nova_submission_test_cases_submission_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_submissions';
          },
          {
            columns: ['submission_id'];
            foreignKeyName: 'nova_submission_test_cases_submission_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_submissions_with_scores';
          },
          {
            columns: ['test_case_id'];
            foreignKeyName: 'nova_submission_test_cases_test_case_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_problem_test_cases';
          },
        ];
        Row: {
          confidence: null | number;
          created_at: string;
          matched: boolean;
          output: string;
          reasoning: null | string;
          submission_id: string;
          test_case_id: string;
        };
        Update: {
          confidence?: null | number;
          created_at?: string;
          matched?: boolean;
          output?: string;
          reasoning?: null | string;
          submission_id?: string;
          test_case_id?: string;
        };
      };
      nova_submissions: {
        Insert: {
          created_at?: string;
          id?: string;
          overall_assessment?: null | string;
          problem_id: string;
          prompt: string;
          session_id?: null | string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['problem_id'];
            foreignKeyName: 'nova_submissions_problem_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_problems';
          },
          {
            columns: ['session_id'];
            foreignKeyName: 'nova_submissions_session_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_sessions';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_submissions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_submissions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_submissions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: string;
          id: string;
          overall_assessment: null | string;
          problem_id: string;
          prompt: string;
          session_id: null | string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          overall_assessment?: null | string;
          problem_id?: string;
          prompt?: string;
          session_id?: null | string;
          user_id?: string;
        };
      };
      nova_team_emails: {
        Insert: {
          created_at?: string;
          email: string;
          team_id: string;
        };
        Relationships: [
          {
            columns: ['team_id'];
            foreignKeyName: 'nova_team_emails_team_id_fkey';
            isOneToOne: false;
            referencedColumns: ['team_id'];
            referencedRelation: 'nova_team_challenge_leaderboard';
          },
          {
            columns: ['team_id'];
            foreignKeyName: 'nova_team_emails_team_id_fkey';
            isOneToOne: false;
            referencedColumns: ['team_id'];
            referencedRelation: 'nova_team_leaderboard';
          },
          {
            columns: ['team_id'];
            foreignKeyName: 'nova_team_emails_team_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_teams';
          },
        ];
        Row: {
          created_at: string;
          email: string;
          team_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          team_id?: string;
        };
      };
      nova_team_members: {
        Insert: {
          created_at?: string;
          team_id: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['team_id'];
            foreignKeyName: 'nova_team_members_team_id_fkey';
            isOneToOne: false;
            referencedColumns: ['team_id'];
            referencedRelation: 'nova_team_challenge_leaderboard';
          },
          {
            columns: ['team_id'];
            foreignKeyName: 'nova_team_members_team_id_fkey';
            isOneToOne: false;
            referencedColumns: ['team_id'];
            referencedRelation: 'nova_team_leaderboard';
          },
          {
            columns: ['team_id'];
            foreignKeyName: 'nova_team_members_team_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_teams';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_team_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_team_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_team_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: string;
          team_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          team_id?: string;
          user_id?: string;
        };
      };
      nova_teams: {
        Insert: {
          created_at?: string;
          description?: null | string;
          goals?: null | string;
          id?: string;
          name: string;
        };
        Relationships: [];
        Row: {
          created_at: string;
          description: null | string;
          goals: null | string;
          id: string;
          name: string;
        };
        Update: {
          created_at?: string;
          description?: null | string;
          goals?: null | string;
          id?: string;
          name?: string;
        };
      };
      personal_notes: {
        Insert: {
          content?: null | string;
          created_at?: null | string;
          owner_id: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['owner_id'];
            foreignKeyName: 'personal_notes_owner_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['owner_id'];
            foreignKeyName: 'personal_notes_owner_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['owner_id'];
            foreignKeyName: 'personal_notes_owner_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'personal_notes_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'personal_notes_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'personal_notes_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          content: null | string;
          created_at: null | string;
          owner_id: string;
          user_id: string;
        };
        Update: {
          content?: null | string;
          created_at?: null | string;
          owner_id?: string;
          user_id?: string;
        };
      };
      platform_email_roles: {
        Insert: {
          allow_challenge_management?: boolean;
          allow_manage_all_challenges?: boolean;
          allow_role_management?: boolean;
          created_at?: string;
          email: string;
          enabled: boolean;
        };
        Relationships: [];
        Row: {
          allow_challenge_management: boolean;
          allow_manage_all_challenges: boolean;
          allow_role_management: boolean;
          created_at: string;
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
      };
      platform_user_roles: {
        Insert: {
          allow_challenge_management?: boolean;
          allow_manage_all_challenges?: boolean;
          allow_role_management?: boolean;
          created_at?: string;
          enabled?: boolean;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['user_id'];
            foreignKeyName: 'platform_user_roles_user_id_fkey1';
            isOneToOne: true;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'platform_user_roles_user_id_fkey1';
            isOneToOne: true;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'platform_user_roles_user_id_fkey1';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          allow_challenge_management: boolean;
          allow_manage_all_challenges: boolean;
          allow_role_management: boolean;
          created_at: string;
          enabled: boolean;
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
      };
      product_categories: {
        Insert: {
          created_at?: null | string;
          id?: string;
          name?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'product_categories_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: null | string;
          id: string;
          name: null | string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          id?: string;
          name?: null | string;
          ws_id?: string;
        };
      };
      product_stock_changes: {
        Insert: {
          amount: number;
          beneficiary_id?: null | string;
          created_at?: string;
          creator_id: string;
          id?: string;
          product_id: string;
          unit_id: string;
          warehouse_id: string;
        };
        Relationships: [
          {
            columns: ['beneficiary_id'];
            foreignKeyName: 'product_stock_changes_beneficiary_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['beneficiary_id'];
            foreignKeyName: 'product_stock_changes_beneficiary_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['beneficiary_id'];
            foreignKeyName: 'product_stock_changes_beneficiary_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'product_stock_changes_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'product_stock_changes_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'product_stock_changes_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['product_id'];
            foreignKeyName: 'product_stock_changes_product_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_products';
          },
          {
            columns: ['unit_id'];
            foreignKeyName: 'product_stock_changes_unit_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_units';
          },
          {
            columns: ['warehouse_id'];
            foreignKeyName: 'product_stock_changes_warehouse_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_warehouses';
          },
        ];
        Row: {
          amount: number;
          beneficiary_id: null | string;
          created_at: string;
          creator_id: string;
          id: string;
          product_id: string;
          unit_id: string;
          warehouse_id: string;
        };
        Update: {
          amount?: number;
          beneficiary_id?: null | string;
          created_at?: string;
          creator_id?: string;
          id?: string;
          product_id?: string;
          unit_id?: string;
          warehouse_id?: string;
        };
      };
      quiz_options: {
        Insert: {
          created_at?: string;
          explanation?: null | string;
          id?: string;
          is_correct: boolean;
          points?: null | number;
          quiz_id: string;
          value: string;
        };
        Relationships: [
          {
            columns: ['quiz_id'];
            foreignKeyName: 'quiz_options_quiz_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_quizzes';
          },
        ];
        Row: {
          created_at: string;
          explanation: null | string;
          id: string;
          is_correct: boolean;
          points: null | number;
          quiz_id: string;
          value: string;
        };
        Update: {
          created_at?: string;
          explanation?: null | string;
          id?: string;
          is_correct?: boolean;
          points?: null | number;
          quiz_id?: string;
          value?: string;
        };
      };
      quiz_set_quizzes: {
        Insert: {
          created_at?: string;
          quiz_id: string;
          set_id: string;
        };
        Relationships: [
          {
            columns: ['quiz_id'];
            foreignKeyName: 'quiz_set_quizzes_quiz_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_quizzes';
          },
          {
            columns: ['set_id'];
            foreignKeyName: 'quiz_set_quizzes_set_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_quiz_sets';
          },
        ];
        Row: {
          created_at: string;
          quiz_id: string;
          set_id: string;
        };
        Update: {
          created_at?: string;
          quiz_id?: string;
          set_id?: string;
        };
      };
      recording_transcripts: {
        Insert: {
          created_at?: string;
          duration_in_seconds?: number;
          id?: string;
          language?: string;
          media_upload_id: string;
          segments?: Json | null;
          text: string;
        };
        Relationships: [
          {
            columns: ['media_upload_id'];
            foreignKeyName: 'recording_transcripts_media_upload_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'media_uploads';
          },
        ];
        Row: {
          created_at: string;
          duration_in_seconds: number;
          id: string;
          language: string;
          media_upload_id: string;
          segments: Json | null;
          text: string;
        };
        Update: {
          created_at?: string;
          duration_in_seconds?: number;
          id?: string;
          language?: string;
          media_upload_id?: string;
          segments?: Json | null;
          text?: string;
        };
      };
      sent_emails: {
        Insert: {
          content: string;
          created_at?: string;
          email: string;
          id?: string;
          post_id?: null | string;
          receiver_id: string;
          sender_id: string;
          source_email: string;
          source_name: string;
          subject: string;
        };
        Relationships: [
          {
            columns: ['post_id'];
            foreignKeyName: 'sent_emails_post_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_group_posts';
          },
          {
            columns: ['receiver_id'];
            foreignKeyName: 'sent_emails_receiver_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['receiver_id'];
            foreignKeyName: 'sent_emails_receiver_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['receiver_id'];
            foreignKeyName: 'sent_emails_receiver_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['sender_id'];
            foreignKeyName: 'sent_emails_sender_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['sender_id'];
            foreignKeyName: 'sent_emails_sender_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['sender_id'];
            foreignKeyName: 'sent_emails_sender_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          content: string;
          created_at: string;
          email: string;
          id: string;
          post_id: null | string;
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
          post_id?: null | string;
          receiver_id?: string;
          sender_id?: string;
          source_email?: string;
          source_name?: string;
          subject?: string;
        };
      };
      students: {
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          program?: null | string;
          student_number: string;
        };
        Relationships: [];
        Row: {
          created_at: string;
          id: string;
          name: string;
          program: null | string;
          student_number: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          program?: null | string;
          student_number?: string;
        };
      };
      support_inquiries: {
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
        Relationships: [];
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
      };
      task_assignees: {
        Insert: {
          created_at?: null | string;
          task_id: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['task_id'];
            foreignKeyName: 'task_assignees_task_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'tasks';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'task_assignees_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'task_assignees_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'task_assignees_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: null | string;
          task_id: string;
          user_id: string;
        };
        Update: {
          created_at?: null | string;
          task_id?: string;
          user_id?: string;
        };
      };
      task_lists: {
        Insert: {
          archived?: boolean | null;
          board_id: string;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          id?: string;
          name?: null | string;
        };
        Relationships: [
          {
            columns: ['board_id'];
            foreignKeyName: 'task_lists_board_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_boards';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_lists_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_lists_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_lists_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          archived: boolean | null;
          board_id: string;
          created_at: null | string;
          creator_id: null | string;
          deleted: boolean | null;
          id: string;
          name: null | string;
        };
        Update: {
          archived?: boolean | null;
          board_id?: string;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          id?: string;
          name?: null | string;
        };
      };
      tasks: {
        Insert: {
          archived?: boolean | null;
          completed?: boolean | null;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          description?: null | string;
          end_date?: null | string;
          id?: string;
          list_id: string;
          name: string;
          priority?: null | number;
          start_date?: null | string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'tasks_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'tasks_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'tasks_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['list_id'];
            foreignKeyName: 'tasks_list_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'task_lists';
          },
        ];
        Row: {
          archived: boolean | null;
          completed: boolean | null;
          created_at: null | string;
          creator_id: null | string;
          deleted: boolean | null;
          description: null | string;
          end_date: null | string;
          id: string;
          list_id: string;
          name: string;
          priority: null | number;
          start_date: null | string;
        };
        Update: {
          archived?: boolean | null;
          completed?: boolean | null;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          description?: null | string;
          end_date?: null | string;
          id?: string;
          list_id?: string;
          name?: string;
          priority?: null | number;
          start_date?: null | string;
        };
      };
      team_members: {
        Insert: {
          team_id: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['team_id'];
            foreignKeyName: 'project_members_project_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_teams';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'project_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'project_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'project_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          team_id: string;
          user_id: string;
        };
        Update: {
          team_id?: string;
          user_id?: string;
        };
      };
      time_tracking_categories: {
        Insert: {
          color?: null | string;
          created_at?: null | string;
          description?: null | string;
          id?: string;
          name: string;
          updated_at?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['color'];
            foreignKeyName: 'time_tracking_categories_color_fkey';
            isOneToOne: false;
            referencedColumns: ['value'];
            referencedRelation: 'calendar_event_colors';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'time_tracking_categories_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          color: null | string;
          created_at: null | string;
          description: null | string;
          id: string;
          name: string;
          updated_at: null | string;
          ws_id: string;
        };
        Update: {
          color?: null | string;
          created_at?: null | string;
          description?: null | string;
          id?: string;
          name?: string;
          updated_at?: null | string;
          ws_id?: string;
        };
      };
      time_tracking_goals: {
        Insert: {
          category_id?: null | string;
          created_at?: null | string;
          daily_goal_minutes?: number;
          id?: string;
          is_active?: boolean | null;
          updated_at?: null | string;
          user_id: string;
          weekly_goal_minutes?: null | number;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['category_id'];
            foreignKeyName: 'time_tracking_goals_category_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'time_tracking_categories';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'time_tracking_goals_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          category_id: null | string;
          created_at: null | string;
          daily_goal_minutes: number;
          id: string;
          is_active: boolean | null;
          updated_at: null | string;
          user_id: string;
          weekly_goal_minutes: null | number;
          ws_id: string;
        };
        Update: {
          category_id?: null | string;
          created_at?: null | string;
          daily_goal_minutes?: number;
          id?: string;
          is_active?: boolean | null;
          updated_at?: null | string;
          user_id?: string;
          weekly_goal_minutes?: null | number;
          ws_id?: string;
        };
      };
      time_tracking_sessions: {
        Insert: {
          category_id?: null | string;
          created_at?: null | string;
          description?: null | string;
          duration_seconds?: null | number;
          end_time?: null | string;
          id?: string;
          is_running?: boolean | null;
          productivity_score?: null | number;
          start_time: string;
          tags?: null | string[];
          task_id?: null | string;
          title: string;
          updated_at?: null | string;
          user_id: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['category_id'];
            foreignKeyName: 'time_tracking_sessions_category_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'time_tracking_categories';
          },
          {
            columns: ['task_id'];
            foreignKeyName: 'time_tracking_sessions_task_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'tasks';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'time_tracking_sessions_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          category_id: null | string;
          created_at: null | string;
          description: null | string;
          duration_seconds: null | number;
          end_time: null | string;
          id: string;
          is_running: boolean | null;
          productivity_score: null | number;
          start_time: string;
          tags: null | string[];
          task_id: null | string;
          title: string;
          updated_at: null | string;
          user_id: string;
          ws_id: string;
        };
        Update: {
          category_id?: null | string;
          created_at?: null | string;
          description?: null | string;
          duration_seconds?: null | number;
          end_time?: null | string;
          id?: string;
          is_running?: boolean | null;
          productivity_score?: null | number;
          start_time?: string;
          tags?: null | string[];
          task_id?: null | string;
          title?: string;
          updated_at?: null | string;
          user_id?: string;
          ws_id?: string;
        };
      };
      timezones: {
        Insert: {
          abbr: string;
          created_at?: null | string;
          id?: string;
          isdst: boolean;
          offset: number;
          text: string;
          utc: string[];
          value: string;
        };
        Relationships: [];
        Row: {
          abbr: string;
          created_at: null | string;
          id: string;
          isdst: boolean;
          offset: number;
          text: string;
          utc: string[];
          value: string;
        };
        Update: {
          abbr?: string;
          created_at?: null | string;
          id?: string;
          isdst?: boolean;
          offset?: number;
          text?: string;
          utc?: string[];
          value?: string;
        };
      };
      transaction_categories: {
        Insert: {
          created_at?: null | string;
          id?: string;
          is_expense?: boolean | null;
          name: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'transaction_categories_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: null | string;
          id: string;
          is_expense: boolean | null;
          name: string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          id?: string;
          is_expense?: boolean | null;
          name?: string;
          ws_id?: string;
        };
      };
      user_feedbacks: {
        Insert: {
          content: string;
          created_at?: string;
          creator_id?: null | string;
          group_id?: null | string;
          id?: string;
          require_attention?: boolean;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'user_feedbacks_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'user_feedbacks_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'user_feedbacks_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_feedbacks_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_feedbacks_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_feedbacks_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
        ];
        Row: {
          content: string;
          created_at: string;
          creator_id: null | string;
          group_id: null | string;
          id: string;
          require_attention: boolean;
          user_id: string;
        };
        Update: {
          content?: string;
          created_at?: string;
          creator_id?: null | string;
          group_id?: null | string;
          id?: string;
          require_attention?: boolean;
          user_id?: string;
        };
      };
      user_group_attendance: {
        Insert: {
          created_at?: string;
          date: string;
          group_id: string;
          notes?: string;
          status: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_group_attendance_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_group_attendance_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_group_attendance_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
        ];
        Row: {
          created_at: string;
          date: string;
          group_id: string;
          notes: string;
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
      };
      user_group_indicators: {
        Insert: {
          created_at?: string;
          group_id: string;
          indicator_id: string;
        };
        Relationships: [
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_indicators_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_indicators_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_indicators_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
          {
            columns: ['indicator_id'];
            foreignKeyName: 'user_group_indicators_indicator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'healthcare_vitals';
          },
        ];
        Row: {
          created_at: string;
          group_id: string;
          indicator_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          indicator_id?: string;
        };
      };
      user_group_linked_products: {
        Insert: {
          created_at?: string;
          group_id: string;
          product_id: string;
          unit_id: string;
        };
        Relationships: [
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
          {
            columns: ['product_id'];
            foreignKeyName: 'user_group_linked_products_product_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_products';
          },
          {
            columns: ['unit_id'];
            foreignKeyName: 'user_group_linked_products_unit_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_units';
          },
        ];
        Row: {
          created_at: string;
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
      };
      user_group_post_checks: {
        Insert: {
          created_at?: string;
          email_id?: null | string;
          is_completed: boolean;
          notes?: null | string;
          post_id: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['email_id'];
            foreignKeyName: 'user_group_post_checks_email_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'sent_emails';
          },
          {
            columns: ['post_id'];
            foreignKeyName: 'user_group_post_checks_post_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_group_posts';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_group_post_checks_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
        ];
        Row: {
          created_at: string;
          email_id: null | string;
          is_completed: boolean;
          notes: null | string;
          post_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          email_id?: null | string;
          is_completed?: boolean;
          notes?: null | string;
          post_id?: string;
          user_id?: string;
        };
      };
      user_group_posts: {
        Insert: {
          content?: null | string;
          created_at?: string;
          group_id: string;
          id?: string;
          notes?: null | string;
          title?: null | string;
        };
        Relationships: [
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_posts_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_posts_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_posts_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
        ];
        Row: {
          content: null | string;
          created_at: string;
          group_id: string;
          id: string;
          notes: null | string;
          title: null | string;
        };
        Update: {
          content?: null | string;
          created_at?: string;
          group_id?: string;
          id?: string;
          notes?: null | string;
          title?: null | string;
        };
      };
      user_indicators: {
        Insert: {
          created_at?: string;
          creator_id?: null | string;
          group_id: string;
          indicator_id: string;
          user_id: string;
          value?: null | number;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'user_indicators_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'user_indicators_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'user_indicators_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_indicators_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_indicators_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_indicators_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
          {
            columns: ['indicator_id'];
            foreignKeyName: 'user_indicators_indicator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'healthcare_vitals';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_indicators_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_indicators_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_indicators_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
        ];
        Row: {
          created_at: string;
          creator_id: null | string;
          group_id: string;
          indicator_id: string;
          user_id: string;
          value: null | number;
        };
        Update: {
          created_at?: string;
          creator_id?: null | string;
          group_id?: string;
          indicator_id?: string;
          user_id?: string;
          value?: null | number;
        };
      };
      user_linked_promotions: {
        Insert: {
          created_at?: string;
          promo_id: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['promo_id'];
            foreignKeyName: 'user_linked_promotions_promo_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_promotions';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_linked_promotions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_linked_promotions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_linked_promotions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
        ];
        Row: {
          created_at: string;
          promo_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          promo_id?: string;
          user_id?: string;
        };
      };
      user_private_details: {
        Insert: {
          birthday?: null | string;
          default_workspace_id?: null | string;
          email?: null | string;
          full_name?: null | string;
          new_email?: null | string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['default_workspace_id'];
            foreignKeyName: 'user_private_details_default_workspace_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_private_details_user_id_fkey';
            isOneToOne: true;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_private_details_user_id_fkey';
            isOneToOne: true;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'user_private_details_user_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          birthday: null | string;
          default_workspace_id: null | string;
          email: null | string;
          full_name: null | string;
          new_email: null | string;
          user_id: string;
        };
        Update: {
          birthday?: null | string;
          default_workspace_id?: null | string;
          email?: null | string;
          full_name?: null | string;
          new_email?: null | string;
          user_id?: string;
        };
      };
      users: {
        Insert: {
          avatar_url?: null | string;
          bio?: null | string;
          created_at?: null | string;
          deleted?: boolean | null;
          display_name?: null | string;
          handle?: null | string;
          id?: string;
        };
        Relationships: [
          {
            columns: ['handle'];
            foreignKeyName: 'users_handle_fkey';
            isOneToOne: true;
            referencedColumns: ['value'];
            referencedRelation: 'handles';
          },
        ];
        Row: {
          avatar_url: null | string;
          bio: null | string;
          created_at: null | string;
          deleted: boolean | null;
          display_name: null | string;
          handle: null | string;
          id: string;
        };
        Update: {
          avatar_url?: null | string;
          bio?: null | string;
          created_at?: null | string;
          deleted?: boolean | null;
          display_name?: null | string;
          handle?: null | string;
          id?: string;
        };
      };
      vital_group_vitals: {
        Insert: {
          created_at?: null | string;
          group_id: string;
          vital_id: string;
        };
        Relationships: [
          {
            columns: ['group_id'];
            foreignKeyName: 'vital_group_vitals_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'healthcare_vital_groups';
          },
          {
            columns: ['vital_id'];
            foreignKeyName: 'vital_group_vitals_vital_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'healthcare_vitals';
          },
        ];
        Row: {
          created_at: null | string;
          group_id: string;
          vital_id: string;
        };
        Update: {
          created_at?: null | string;
          group_id?: string;
          vital_id?: string;
        };
      };
      wallet_transactions: {
        Insert: {
          amount?: null | number;
          category_id?: null | string;
          created_at?: null | string;
          creator_id?: null | string;
          description?: null | string;
          id?: string;
          invoice_id?: null | string;
          report_opt_in?: boolean;
          taken_at?: string;
          wallet_id: string;
        };
        Relationships: [
          {
            columns: ['category_id'];
            foreignKeyName: 'wallet_transactions_category_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'transaction_categories';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'wallet_transactions_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['invoice_id'];
            foreignKeyName: 'wallet_transactions_invoice_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'finance_invoices';
          },
          {
            columns: ['wallet_id'];
            foreignKeyName: 'wallet_transactions_wallet_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_wallets';
          },
        ];
        Row: {
          amount: null | number;
          category_id: null | string;
          created_at: null | string;
          creator_id: null | string;
          description: null | string;
          id: string;
          invoice_id: null | string;
          report_opt_in: boolean;
          taken_at: string;
          wallet_id: string;
        };
        Update: {
          amount?: null | number;
          category_id?: null | string;
          created_at?: null | string;
          creator_id?: null | string;
          description?: null | string;
          id?: string;
          invoice_id?: null | string;
          report_opt_in?: boolean;
          taken_at?: string;
          wallet_id?: string;
        };
      };
      wallet_types: {
        Insert: {
          id: string;
        };
        Relationships: [];
        Row: {
          id: string;
        };
        Update: {
          id?: string;
        };
      };
      workspace_ai_models: {
        Insert: {
          created_at?: string;
          description?: null | string;
          id?: string;
          name: string;
          updated_at?: string;
          url: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_ai_models_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          description: null | string;
          id: string;
          name: string;
          updated_at: string;
          url: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          description?: null | string;
          id?: string;
          name?: string;
          updated_at?: string;
          url?: string;
          ws_id?: string;
        };
      };
      workspace_ai_prompts: {
        Insert: {
          created_at?: string;
          creator_id?: null | string;
          id?: string;
          input: string;
          model: string;
          name?: null | string;
          output: string;
          ws_id?: null | string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'public_workspace_ai_prompts_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'public_workspace_ai_prompts_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'public_workspace_ai_prompts_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['model'];
            foreignKeyName: 'public_workspace_ai_prompts_model_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'ai_models';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'public_workspace_ai_prompts_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          creator_id: null | string;
          id: string;
          input: string;
          model: string;
          name: null | string;
          output: string;
          ws_id: null | string;
        };
        Update: {
          created_at?: string;
          creator_id?: null | string;
          id?: string;
          input?: string;
          model?: string;
          name?: null | string;
          output?: string;
          ws_id?: null | string;
        };
      };
      workspace_api_keys: {
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          value: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_api_keys_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          id: string;
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
      };
      workspace_boards: {
        Insert: {
          archived?: boolean | null;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          id?: string;
          name?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'project_boards_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'project_boards_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'project_boards_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_boards_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          archived: boolean | null;
          created_at: null | string;
          creator_id: null | string;
          deleted: boolean | null;
          id: string;
          name: null | string;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          id?: string;
          name?: null | string;
          ws_id?: string;
        };
      };
      workspace_calendar_events: {
        Insert: {
          color?: null | string;
          created_at?: null | string;
          description?: string;
          end_at: string;
          google_event_id?: null | string;
          id?: string;
          location?: null | string;
          locked?: boolean;
          priority?: null | string;
          start_at: string;
          title?: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['color'];
            foreignKeyName: 'workspace_calendar_events_color_fkey';
            isOneToOne: false;
            referencedColumns: ['value'];
            referencedRelation: 'calendar_event_colors';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_calendar_events_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          color: null | string;
          created_at: null | string;
          description: string;
          end_at: string;
          google_event_id: null | string;
          id: string;
          location: null | string;
          locked: boolean;
          priority: null | string;
          start_at: string;
          title: string;
          ws_id: string;
        };
        Update: {
          color?: null | string;
          created_at?: null | string;
          description?: string;
          end_at?: string;
          google_event_id?: null | string;
          id?: string;
          location?: null | string;
          locked?: boolean;
          priority?: null | string;
          start_at?: string;
          title?: string;
          ws_id?: string;
        };
      };
      workspace_calendar_hour_settings: {
        Insert: {
          created_at?: string;
          data: Json;
          type: Database['public']['Enums']['calendar_hour_type'];
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_calendar_hour_settings_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
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
      };
      workspace_configs: {
        Insert: {
          created_at?: string;
          id: string;
          updated_at?: string;
          value: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'public_workspace_configs_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          id: string;
          updated_at: string;
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
      };
      workspace_course_modules: {
        Insert: {
          content?: Json | null;
          course_id: string;
          created_at?: string;
          extra_content?: Json | null;
          id?: string;
          is_public?: boolean;
          is_published?: boolean;
          name?: string;
          youtube_links?: null | string[];
        };
        Relationships: [
          {
            columns: ['course_id'];
            foreignKeyName: 'workspace_course_modules_course_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_courses';
          },
        ];
        Row: {
          content: Json | null;
          course_id: string;
          created_at: string;
          extra_content: Json | null;
          id: string;
          is_public: boolean;
          is_published: boolean;
          name: string;
          youtube_links: null | string[];
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
          youtube_links?: null | string[];
        };
      };
      workspace_courses: {
        Insert: {
          created_at?: string;
          description?: null | string;
          id?: string;
          is_public?: boolean;
          is_published?: boolean;
          name?: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_courses_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          description: null | string;
          id: string;
          is_public: boolean;
          is_published: boolean;
          name: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          description?: null | string;
          id?: string;
          is_public?: boolean;
          is_published?: boolean;
          name?: string;
          ws_id?: string;
        };
      };
      workspace_cron_executions: {
        Insert: {
          created_at?: string;
          cron_run_id?: null | number;
          end_time?: null | string;
          id?: string;
          job_id: string;
          response?: null | string;
          start_time?: null | string;
          status: string;
        };
        Relationships: [
          {
            columns: ['job_id'];
            foreignKeyName: 'workspace_cron_executions_job_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_cron_jobs';
          },
        ];
        Row: {
          created_at: string;
          cron_run_id: null | number;
          end_time: null | string;
          id: string;
          job_id: string;
          response: null | string;
          start_time: null | string;
          status: string;
        };
        Update: {
          created_at?: string;
          cron_run_id?: null | number;
          end_time?: null | string;
          id?: string;
          job_id?: string;
          response?: null | string;
          start_time?: null | string;
          status?: string;
        };
      };
      workspace_cron_jobs: {
        Insert: {
          active?: boolean;
          created_at?: string;
          cron_job_id?: null | number;
          dataset_id: string;
          id?: string;
          name: string;
          schedule: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['dataset_id'];
            foreignKeyName: 'workspace_cron_jobs_dataset_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_datasets';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_cron_jobs_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          active: boolean;
          created_at: string;
          cron_job_id: null | number;
          dataset_id: string;
          id: string;
          name: string;
          schedule: string;
          ws_id: string;
        };
        Update: {
          active?: boolean;
          created_at?: string;
          cron_job_id?: null | number;
          dataset_id?: string;
          id?: string;
          name?: string;
          schedule?: string;
          ws_id?: string;
        };
      };
      workspace_dataset_cells: {
        Insert: {
          column_id: string;
          created_at?: string;
          data?: null | string;
          dataset_id: string;
          id?: string;
          row_id: string;
        };
        Relationships: [
          {
            columns: ['column_id'];
            foreignKeyName: 'workspace_dataset_cell_column_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_dataset_columns';
          },
          {
            columns: ['dataset_id'];
            foreignKeyName: 'workspace_dataset_cell_dataset_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_datasets';
          },
          {
            columns: ['row_id'];
            foreignKeyName: 'workspace_dataset_cell_row_id_fkey';
            isOneToOne: false;
            referencedColumns: ['row_id'];
            referencedRelation: 'workspace_dataset_row_cells';
          },
          {
            columns: ['row_id'];
            foreignKeyName: 'workspace_dataset_cell_row_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_dataset_rows';
          },
        ];
        Row: {
          column_id: string;
          created_at: string;
          data: null | string;
          dataset_id: string;
          id: string;
          row_id: string;
        };
        Update: {
          column_id?: string;
          created_at?: string;
          data?: null | string;
          dataset_id?: string;
          id?: string;
          row_id?: string;
        };
      };
      workspace_dataset_columns: {
        Insert: {
          alias?: null | string;
          created_at?: string;
          dataset_id: string;
          description?: null | string;
          id?: string;
          name: string;
        };
        Relationships: [
          {
            columns: ['dataset_id'];
            foreignKeyName: 'workspace_dataset_columns_dataset_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_datasets';
          },
        ];
        Row: {
          alias: null | string;
          created_at: string;
          dataset_id: string;
          description: null | string;
          id: string;
          name: string;
        };
        Update: {
          alias?: null | string;
          created_at?: string;
          dataset_id?: string;
          description?: null | string;
          id?: string;
          name?: string;
        };
      };
      workspace_dataset_rows: {
        Insert: {
          created_at?: string;
          dataset_id: string;
          id?: string;
        };
        Relationships: [
          {
            columns: ['dataset_id'];
            foreignKeyName: 'workspace_dataset_rows_dataset_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_datasets';
          },
        ];
        Row: {
          created_at: string;
          dataset_id: string;
          id: string;
        };
        Update: {
          created_at?: string;
          dataset_id?: string;
          id?: string;
        };
      };
      workspace_datasets: {
        Insert: {
          created_at?: string;
          description?: null | string;
          id?: string;
          name: string;
          url?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_datasets_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          description: null | string;
          id: string;
          name: string;
          url: null | string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          description?: null | string;
          id?: string;
          name?: string;
          url?: null | string;
          ws_id?: string;
        };
      };
      workspace_default_permissions: {
        Insert: {
          created_at?: string;
          enabled?: boolean;
          permission: Database['public']['Enums']['workspace_role_permission'];
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'public_workspace_default_permissions_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          enabled: boolean;
          permission: Database['public']['Enums']['workspace_role_permission'];
          ws_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          permission?: Database['public']['Enums']['workspace_role_permission'];
          ws_id?: string;
        };
      };
      workspace_default_roles: {
        Insert: {
          id: string;
        };
        Relationships: [];
        Row: {
          id: string;
        };
        Update: {
          id?: string;
        };
      };
      workspace_documents: {
        Insert: {
          content?: Json | null;
          created_at?: string;
          id?: string;
          is_public?: boolean | null;
          legacy_content?: null | string;
          name?: null | string;
          ws_id?: null | string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_documents_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          content: Json | null;
          created_at: string;
          id: string;
          is_public: boolean | null;
          legacy_content: null | string;
          name: null | string;
          ws_id: null | string;
        };
        Update: {
          content?: Json | null;
          created_at?: string;
          id?: string;
          is_public?: boolean | null;
          legacy_content?: null | string;
          name?: null | string;
          ws_id?: null | string;
        };
      };
      workspace_email_credentials: {
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
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_email_credentials_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      workspace_email_invites: {
        Insert: {
          created_at?: string;
          email: string;
          invited_by?: null | string;
          role?: string;
          role_title?: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['invited_by'];
            foreignKeyName: 'workspace_email_invites_invited_by_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['invited_by'];
            foreignKeyName: 'workspace_email_invites_invited_by_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['invited_by'];
            foreignKeyName: 'workspace_email_invites_invited_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['role'];
            foreignKeyName: 'workspace_email_invites_role_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_default_roles';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_email_invites_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          email: string;
          invited_by: null | string;
          role: string;
          role_title: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          invited_by?: null | string;
          role?: string;
          role_title?: string;
          ws_id?: string;
        };
      };
      workspace_flashcards: {
        Insert: {
          back: string;
          created_at?: string;
          front: string;
          id?: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_flashcards_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          back: string;
          created_at: string;
          front: string;
          id: string;
          ws_id: string;
        };
        Update: {
          back?: string;
          created_at?: string;
          front?: string;
          id?: string;
          ws_id?: string;
        };
      };
      workspace_invites: {
        Insert: {
          created_at?: null | string;
          role?: string;
          role_title?: null | string;
          user_id: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['role'];
            foreignKeyName: 'workspace_invites_role_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_default_roles';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_invites_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_invites_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_invites_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_invites_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: null | string;
          role: string;
          role_title: null | string;
          user_id: string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          role?: string;
          role_title?: null | string;
          user_id?: string;
          ws_id?: string;
        };
      };
      workspace_members: {
        Insert: {
          created_at?: null | string;
          role?: string;
          role_title?: string;
          sort_key?: null | number;
          user_id?: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['role'];
            foreignKeyName: 'workspace_members_role_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_default_roles';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_members_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: null | string;
          role: string;
          role_title: string;
          sort_key: null | number;
          user_id: string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          role?: string;
          role_title?: string;
          sort_key?: null | number;
          user_id?: string;
          ws_id?: string;
        };
      };
      workspace_products: {
        Insert: {
          avatar_url?: null | string;
          category_id: string;
          created_at?: null | string;
          creator_id?: null | string;
          description?: null | string;
          id?: string;
          manufacturer?: null | string;
          name?: null | string;
          usage?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'public_workspace_products_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'public_workspace_products_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'public_workspace_products_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['category_id'];
            foreignKeyName: 'workspace_products_category_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'product_categories';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_products_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          avatar_url: null | string;
          category_id: string;
          created_at: null | string;
          creator_id: null | string;
          description: null | string;
          id: string;
          manufacturer: null | string;
          name: null | string;
          usage: null | string;
          ws_id: string;
        };
        Update: {
          avatar_url?: null | string;
          category_id?: string;
          created_at?: null | string;
          creator_id?: null | string;
          description?: null | string;
          id?: string;
          manufacturer?: null | string;
          name?: null | string;
          usage?: null | string;
          ws_id?: string;
        };
      };
      workspace_promotions: {
        Insert: {
          code?: null | string;
          created_at?: string;
          creator_id?: null | string;
          description?: null | string;
          id?: string;
          name?: null | string;
          use_ratio?: boolean;
          value: number;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'public_workspace_promotions_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'public_workspace_promotions_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'public_workspace_promotions_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_promotions_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          code: null | string;
          created_at: string;
          creator_id: null | string;
          description: null | string;
          id: string;
          name: null | string;
          use_ratio: boolean;
          value: number;
          ws_id: string;
        };
        Update: {
          code?: null | string;
          created_at?: string;
          creator_id?: null | string;
          description?: null | string;
          id?: string;
          name?: null | string;
          use_ratio?: boolean;
          value?: number;
          ws_id?: string;
        };
      };
      workspace_quiz_sets: {
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          ws_id?: null | string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_quiz_sets_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          id: string;
          name: string;
          ws_id: null | string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          ws_id?: null | string;
        };
      };
      workspace_quizzes: {
        Insert: {
          created_at?: string;
          id?: string;
          question: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_quizzes_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          id: string;
          question: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          question?: string;
          ws_id?: string;
        };
      };
      workspace_role_members: {
        Insert: {
          created_at?: string;
          role_id: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['role_id'];
            foreignKeyName: 'public_workspace_role_members_role_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_roles';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'public_workspace_role_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'public_workspace_role_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'public_workspace_role_members_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: string;
          role_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          role_id?: string;
          user_id?: string;
        };
      };
      workspace_role_permissions: {
        Insert: {
          created_at?: string;
          enabled?: boolean;
          permission: Database['public']['Enums']['workspace_role_permission'];
          role_id: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['role_id'];
            foreignKeyName: 'public_workspace_role_permissions_role_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_roles';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'public_workspace_role_permissions_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          enabled: boolean;
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
      };
      workspace_roles: {
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'public_workspace_roles_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          id: string;
          name: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          ws_id?: string;
        };
      };
      workspace_secrets: {
        Insert: {
          created_at?: string;
          id?: string;
          name?: string;
          value?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_secrets_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          id: string;
          name: string;
          value: null | string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          value?: null | string;
          ws_id?: string;
        };
      };
      workspace_teams: {
        Insert: {
          created_at?: null | string;
          deleted?: boolean | null;
          id?: string;
          name?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_teams_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: null | string;
          deleted: boolean | null;
          id: string;
          name: null | string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          deleted?: boolean | null;
          id?: string;
          name?: null | string;
          ws_id?: string;
        };
      };
      workspace_user_fields: {
        Insert: {
          created_at?: string;
          default_value?: null | string;
          description?: null | string;
          id?: string;
          name: string;
          notes?: null | string;
          possible_values?: null | string[];
          type: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['type'];
            foreignKeyName: 'public_workspace_user_fields_type_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'field_types';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'public_workspace_user_fields_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          default_value: null | string;
          description: null | string;
          id: string;
          name: string;
          notes: null | string;
          possible_values: null | string[];
          type: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          default_value?: null | string;
          description?: null | string;
          id?: string;
          name?: string;
          notes?: null | string;
          possible_values?: null | string[];
          type?: string;
          ws_id?: string;
        };
      };
      workspace_user_group_tag_groups: {
        Insert: {
          created_at?: string;
          group_id: string;
          tag_id: string;
        };
        Relationships: [
          {
            columns: ['group_id'];
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
          {
            columns: ['tag_id'];
            foreignKeyName: 'public_workspace_user_group_tag_groups_tag_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_group_tags';
          },
        ];
        Row: {
          created_at: string;
          group_id: string;
          tag_id: string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          tag_id?: string;
        };
      };
      workspace_user_group_tags: {
        Insert: {
          color?: null | string;
          created_at?: string;
          id?: string;
          name: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'public_workspace_user_group_tags_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          color: null | string;
          created_at: string;
          id: string;
          name: string;
          ws_id: string;
        };
        Update: {
          color?: null | string;
          created_at?: string;
          id?: string;
          name?: string;
          ws_id?: string;
        };
      };
      workspace_user_groups: {
        Insert: {
          archived?: boolean;
          created_at?: null | string;
          ending_date?: null | string;
          id?: string;
          name: string;
          notes?: null | string;
          sessions?: null | string[];
          starting_date?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          archived: boolean;
          created_at: null | string;
          ending_date: null | string;
          id: string;
          name: string;
          notes: null | string;
          sessions: null | string[];
          starting_date: null | string;
          ws_id: string;
        };
        Update: {
          archived?: boolean;
          created_at?: null | string;
          ending_date?: null | string;
          id?: string;
          name?: string;
          notes?: null | string;
          sessions?: null | string[];
          starting_date?: null | string;
          ws_id?: string;
        };
      };
      workspace_user_groups_users: {
        Insert: {
          created_at?: null | string;
          group_id: string;
          role?: null | string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['group_id'];
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_groups_with_tags';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_amount';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_user_roles_users_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
        ];
        Row: {
          created_at: null | string;
          group_id: string;
          role: null | string;
          user_id: string;
        };
        Update: {
          created_at?: null | string;
          group_id?: string;
          role?: null | string;
          user_id?: string;
        };
      };
      workspace_user_linked_users: {
        Insert: {
          created_at?: string;
          platform_user_id: string;
          virtual_user_id: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['platform_user_id'];
            foreignKeyName: 'workspace_user_linked_users_platform_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['platform_user_id'];
            foreignKeyName: 'workspace_user_linked_users_platform_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['platform_user_id'];
            foreignKeyName: 'workspace_user_linked_users_platform_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['virtual_user_id'];
            foreignKeyName: 'workspace_user_linked_users_virtual_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['virtual_user_id'];
            foreignKeyName: 'workspace_user_linked_users_virtual_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['virtual_user_id'];
            foreignKeyName: 'workspace_user_linked_users_virtual_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_user_linked_users_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
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
      };
      workspace_user_status_changes: {
        Insert: {
          archived: boolean;
          archived_until?: null | string;
          created_at?: string;
          creator_id: string;
          id?: string;
          user_id: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_user_status_changes_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_user_status_changes_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_user_status_changes_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_user_status_changes_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_user_status_changes_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'workspace_user_status_changes_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_user_status_changes_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          archived: boolean;
          archived_until: null | string;
          created_at: string;
          creator_id: string;
          id: string;
          user_id: string;
          ws_id: string;
        };
        Update: {
          archived?: boolean;
          archived_until?: null | string;
          created_at?: string;
          creator_id?: string;
          id?: string;
          user_id?: string;
          ws_id?: string;
        };
      };
      workspace_users: {
        Insert: {
          address?: null | string;
          archived?: boolean;
          archived_until?: null | string;
          avatar_url?: null | string;
          balance?: null | number;
          birthday?: null | string;
          created_at?: null | string;
          created_by?: null | string;
          display_name?: null | string;
          email?: null | string;
          ethnicity?: null | string;
          full_name?: null | string;
          gender?: null | string;
          guardian?: null | string;
          id?: string;
          national_id?: null | string;
          note?: null | string;
          phone?: null | string;
          updated_at?: string;
          updated_by?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['updated_by'];
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['updated_by'];
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['updated_by'];
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['created_by'];
            foreignKeyName: 'workspace_users_created_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['created_by'];
            foreignKeyName: 'workspace_users_created_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['created_by'];
            foreignKeyName: 'workspace_users_created_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_users_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          address: null | string;
          archived: boolean;
          archived_until: null | string;
          avatar_url: null | string;
          balance: null | number;
          birthday: null | string;
          created_at: null | string;
          created_by: null | string;
          display_name: null | string;
          email: null | string;
          ethnicity: null | string;
          full_name: null | string;
          gender: null | string;
          guardian: null | string;
          id: string;
          national_id: null | string;
          note: null | string;
          phone: null | string;
          updated_at: string;
          updated_by: null | string;
          ws_id: string;
        };
        Update: {
          address?: null | string;
          archived?: boolean;
          archived_until?: null | string;
          avatar_url?: null | string;
          balance?: null | number;
          birthday?: null | string;
          created_at?: null | string;
          created_by?: null | string;
          display_name?: null | string;
          email?: null | string;
          ethnicity?: null | string;
          full_name?: null | string;
          gender?: null | string;
          guardian?: null | string;
          id?: string;
          national_id?: null | string;
          note?: null | string;
          phone?: null | string;
          updated_at?: string;
          updated_by?: null | string;
          ws_id?: string;
        };
      };
      workspace_wallet_transfers: {
        Insert: {
          created_at?: null | string;
          from_transaction_id: string;
          to_transaction_id: string;
        };
        Relationships: [
          {
            columns: ['from_transaction_id'];
            foreignKeyName: 'workspace_wallet_transfers_from_transaction_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'wallet_transactions';
          },
          {
            columns: ['to_transaction_id'];
            foreignKeyName: 'workspace_wallet_transfers_to_transaction_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'wallet_transactions';
          },
        ];
        Row: {
          created_at: null | string;
          from_transaction_id: string;
          to_transaction_id: string;
        };
        Update: {
          created_at?: null | string;
          from_transaction_id?: string;
          to_transaction_id?: string;
        };
      };
      workspace_wallets: {
        Insert: {
          balance?: null | number;
          created_at?: null | string;
          currency?: string;
          description?: null | string;
          id?: string;
          name?: null | string;
          report_opt_in?: boolean;
          type?: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['currency'];
            foreignKeyName: 'workspace_wallets_currency_fkey';
            isOneToOne: false;
            referencedColumns: ['code'];
            referencedRelation: 'currencies';
          },
          {
            columns: ['type'];
            foreignKeyName: 'workspace_wallets_type_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'wallet_types';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_wallets_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          balance: null | number;
          created_at: null | string;
          currency: string;
          description: null | string;
          id: string;
          name: null | string;
          report_opt_in: boolean;
          type: string;
          ws_id: string;
        };
        Update: {
          balance?: null | number;
          created_at?: null | string;
          currency?: string;
          description?: null | string;
          id?: string;
          name?: null | string;
          report_opt_in?: boolean;
          type?: string;
          ws_id?: string;
        };
      };
      workspaces: {
        Insert: {
          avatar_url?: null | string;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          handle?: null | string;
          id?: string;
          logo_url?: null | string;
          name?: null | string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspaces_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspaces_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspaces_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          avatar_url: null | string;
          created_at: null | string;
          creator_id: null | string;
          deleted: boolean | null;
          handle: null | string;
          id: string;
          logo_url: null | string;
          name: null | string;
        };
        Update: {
          avatar_url?: null | string;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          handle?: null | string;
          id?: string;
          logo_url?: null | string;
          name?: null | string;
        };
      };
    };
    Views: {
      audit_logs: {
        Insert: {
          auth_role?: null | string;
          auth_uid?: null | string;
          id?: null | number;
          old_record?: Json | null;
          old_record_id?: null | string;
          op?: 'DELETE' | 'INSERT' | 'TRUNCATE' | 'UPDATE' | null;
          record?: Json | null;
          record_id?: null | string;
          table_name?: unknown;
          ts?: null | string;
          ws_id?: never;
        };
        Relationships: [
          {
            columns: ['auth_uid'];
            foreignKeyName: 'record_version_auth_uid_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['auth_uid'];
            foreignKeyName: 'record_version_auth_uid_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['auth_uid'];
            foreignKeyName: 'record_version_auth_uid_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          auth_role: null | string;
          auth_uid: null | string;
          id: null | number;
          old_record: Json | null;
          old_record_id: null | string;
          op: 'DELETE' | 'INSERT' | 'TRUNCATE' | 'UPDATE' | null;
          record: Json | null;
          record_id: null | string;
          table_name: unknown;
          ts: null | string;
          ws_id: null | string;
        };
        Update: {
          auth_role?: null | string;
          auth_uid?: null | string;
          id?: null | number;
          old_record?: Json | null;
          old_record_id?: null | string;
          op?: 'DELETE' | 'INSERT' | 'TRUNCATE' | 'UPDATE' | null;
          record?: Json | null;
          record_id?: null | string;
          table_name?: unknown;
          ts?: null | string;
          ws_id?: never;
        };
      };
      calendar_event_participants: {
        Relationships: [];
        Row: {
          created_at: null | string;
          display_name: null | string;
          event_id: null | string;
          going: boolean | null;
          handle: null | string;
          participant_id: null | string;
          type: null | string;
        };
      };
      distinct_invoice_creators: {
        Relationships: [];
        Row: {
          display_name: null | string;
          id: null | string;
        };
      };
      meet_together_users: {
        Relationships: [];
        Row: {
          display_name: null | string;
          is_guest: boolean | null;
          plan_id: null | string;
          timeblock_count: null | number;
          user_id: null | string;
        };
      };
      nova_submissions_with_scores: {
        Relationships: [
          {
            columns: ['problem_id'];
            foreignKeyName: 'nova_submissions_problem_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_problems';
          },
          {
            columns: ['session_id'];
            foreignKeyName: 'nova_submissions_session_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_sessions';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_submissions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_submissions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'nova_submissions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: null | string;
          criteria_score: null | number;
          id: null | string;
          passed_tests: null | number;
          problem_id: null | string;
          prompt: null | string;
          session_id: null | string;
          sum_criterion_score: null | number;
          test_case_score: null | number;
          total_criteria: null | number;
          total_score: null | number;
          total_tests: null | number;
          user_id: null | string;
        };
      };
      nova_team_challenge_leaderboard: {
        Relationships: [
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_problems_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'nova_challenges';
          },
          {
            columns: ['challenge_id'];
            foreignKeyName: 'nova_problems_challenge_id_fkey';
            isOneToOne: false;
            referencedColumns: ['challenge_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
        ];
        Row: {
          challenge_id: null | string;
          name: null | string;
          problem_scores: Json | null;
          score: null | number;
          team_id: null | string;
        };
      };
      nova_team_leaderboard: {
        Relationships: [];
        Row: {
          challenge_scores: Json | null;
          name: null | string;
          score: null | number;
          team_id: null | string;
        };
      };
      nova_user_challenge_leaderboard: {
        Relationships: [];
        Row: {
          avatar: null | string;
          challenge_id: null | string;
          name: null | string;
          problem_scores: Json | null;
          score: null | number;
          user_id: null | string;
        };
      };
      nova_user_leaderboard: {
        Relationships: [];
        Row: {
          avatar: null | string;
          challenge_scores: Json | null;
          name: null | string;
          score: null | number;
          user_id: null | string;
        };
      };
      time_tracking_session_analytics: {
        Relationships: [
          {
            columns: ['category_color'];
            foreignKeyName: 'time_tracking_categories_color_fkey';
            isOneToOne: false;
            referencedColumns: ['value'];
            referencedRelation: 'calendar_event_colors';
          },
          {
            columns: ['category_id'];
            foreignKeyName: 'time_tracking_sessions_category_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'time_tracking_categories';
          },
          {
            columns: ['task_id'];
            foreignKeyName: 'time_tracking_sessions_task_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'tasks';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'time_tracking_sessions_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          category_color: null | string;
          category_id: null | string;
          category_name: null | string;
          created_at: null | string;
          day_of_week: null | number;
          description: null | string;
          duration_seconds: null | number;
          end_time: null | string;
          id: null | string;
          is_running: boolean | null;
          productivity_score: null | number;
          session_date: null | string;
          session_length_category: null | string;
          session_month: null | string;
          session_week: null | string;
          start_hour: null | number;
          start_time: null | string;
          tags: null | string[];
          task_id: null | string;
          task_name: null | string;
          title: null | string;
          updated_at: null | string;
          user_id: null | string;
          ws_id: null | string;
        };
      };
      user_groups_with_tags: {
        Insert: {
          archived?: boolean | null;
          created_at?: null | string;
          ending_date?: null | string;
          id?: null | string;
          name?: null | string;
          notes?: null | string;
          sessions?: null | string[];
          starting_date?: null | string;
          tag_count?: never;
          tags?: never;
          ws_id?: null | string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          archived: boolean | null;
          created_at: null | string;
          ending_date: null | string;
          id: null | string;
          name: null | string;
          notes: null | string;
          sessions: null | string[];
          starting_date: null | string;
          tag_count: null | number;
          tags: Json | null;
          ws_id: null | string;
        };
        Update: {
          archived?: boolean | null;
          created_at?: null | string;
          ending_date?: null | string;
          id?: null | string;
          name?: null | string;
          notes?: null | string;
          sessions?: null | string[];
          starting_date?: null | string;
          tag_count?: never;
          tags?: never;
          ws_id?: null | string;
        };
      };
      workspace_dataset_row_cells: {
        Relationships: [
          {
            columns: ['dataset_id'];
            foreignKeyName: 'workspace_dataset_rows_dataset_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_datasets';
          },
        ];
        Row: {
          cells: Json | null;
          created_at: null | string;
          dataset_id: null | string;
          row_id: null | string;
        };
      };
      workspace_members_and_invites: {
        Relationships: [];
        Row: {
          avatar_url: null | string;
          created_at: null | string;
          display_name: null | string;
          email: null | string;
          handle: null | string;
          id: null | string;
          pending: boolean | null;
          role: null | string;
          role_title: null | string;
          ws_id: null | string;
        };
      };
      workspace_user_groups_with_amount: {
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          amount: null | number;
          archived: boolean | null;
          created_at: null | string;
          ending_date: null | string;
          id: null | string;
          name: null | string;
          notes: null | string;
          sessions: null | string[];
          starting_date: null | string;
          ws_id: null | string;
        };
      };
      workspace_users_with_groups: {
        Insert: {
          address?: null | string;
          archived?: boolean | null;
          archived_until?: null | string;
          avatar_url?: null | string;
          balance?: null | number;
          birthday?: null | string;
          created_at?: null | string;
          created_by?: null | string;
          display_name?: null | string;
          email?: null | string;
          ethnicity?: null | string;
          full_name?: null | string;
          gender?: null | string;
          group_count?: never;
          groups?: never;
          guardian?: null | string;
          id?: null | string;
          linked_users?: never;
          national_id?: null | string;
          note?: null | string;
          phone?: null | string;
          updated_at?: null | string;
          updated_by?: null | string;
          ws_id?: null | string;
        };
        Relationships: [
          {
            columns: ['updated_by'];
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['updated_by'];
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['updated_by'];
            foreignKeyName: 'public_workspace_users_updated_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['created_by'];
            foreignKeyName: 'workspace_users_created_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['created_by'];
            foreignKeyName: 'workspace_users_created_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['created_by'];
            foreignKeyName: 'workspace_users_created_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_users_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          address: null | string;
          archived: boolean | null;
          archived_until: null | string;
          avatar_url: null | string;
          balance: null | number;
          birthday: null | string;
          created_at: null | string;
          created_by: null | string;
          display_name: null | string;
          email: null | string;
          ethnicity: null | string;
          full_name: null | string;
          gender: null | string;
          group_count: null | number;
          groups: Json | null;
          guardian: null | string;
          id: null | string;
          linked_users: Json | null;
          national_id: null | string;
          note: null | string;
          phone: null | string;
          updated_at: null | string;
          updated_by: null | string;
          ws_id: null | string;
        };
        Update: {
          address?: null | string;
          archived?: boolean | null;
          archived_until?: null | string;
          avatar_url?: null | string;
          balance?: null | number;
          birthday?: null | string;
          created_at?: null | string;
          created_by?: null | string;
          display_name?: null | string;
          email?: null | string;
          ethnicity?: null | string;
          full_name?: null | string;
          gender?: null | string;
          group_count?: never;
          groups?: never;
          guardian?: null | string;
          id?: null | string;
          linked_users?: never;
          national_id?: null | string;
          note?: null | string;
          phone?: null | string;
          updated_at?: null | string;
          updated_by?: null | string;
          ws_id?: null | string;
        };
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
    | {
        schema: keyof DatabaseWithoutInternals;
      }
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views']),
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
    | {
        schema: keyof DatabaseWithoutInternals;
      }
    | keyof DefaultSchema['Tables'],
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
    | {
        schema: keyof DatabaseWithoutInternals;
      }
    | keyof DefaultSchema['Tables'],
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
    | {
        schema: keyof DatabaseWithoutInternals;
      }
    | keyof DefaultSchema['Enums'],
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
    | {
        schema: keyof DatabaseWithoutInternals;
      }
    | keyof DefaultSchema['CompositeTypes'],
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
        'file',
        'flashcards',
        'message',
        'multi_choice_quiz',
        'notes',
        'paragraph_quiz',
        'summary',
      ],
      calendar_hour_type: ['MEETING', 'PERSONAL', 'WORK'],
      chat_role: ['ASSISTANT', 'FUNCTION', 'SYSTEM', 'USER'],
      dataset_type: ['csv', 'excel', 'html'],
      workspace_role_permission: [
        'ai_chat',
        'ai_lab',
        'export_finance_data',
        'export_users_data',
        'manage_calendar',
        'manage_documents',
        'manage_drive',
        'manage_external_migrations',
        'manage_finance',
        'manage_inventory',
        'manage_projects',
        'manage_user_report_templates',
        'manage_users',
        'manage_workspace_audit_logs',
        'manage_workspace_billing',
        'manage_workspace_integrations',
        'manage_workspace_members',
        'manage_workspace_roles',
        'manage_workspace_secrets',
        'manage_workspace_security',
        'manage_workspace_settings',
        'send_user_group_post_emails',
        'view_infrastructure',
      ],
    },
  },
} as const;
