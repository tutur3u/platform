export type Json =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: Json | undefined;
    }
  | Json[];
export type Database = {
  public: {
    CompositeTypes: {
      [_ in never]: never;
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
      calendar_hours: 'work_hours' | 'personal_hours' | 'meeting_hours';
      certificate_templates: 'original' | 'modern' | 'elegant';
      chat_role: 'FUNCTION' | 'USER' | 'SYSTEM' | 'ASSISTANT';
      dataset_type: 'excel' | 'csv' | 'html';
      feature_flag:
        | 'ENABLE_AI'
        | 'ENABLE_EDUCATION'
        | 'ENABLE_CHALLENGES'
        | 'ENABLE_QUIZZES';
      platform_service: 'TUTURUUU' | 'REWISE' | 'NOVA' | 'UPSKII';
      subscription_status: 'trialing' | 'active' | 'canceled' | 'past_due';
      task_board_status: 'not_started' | 'active' | 'done' | 'closed';
      task_priority: 'low' | 'normal' | 'high' | 'critical';
      workspace_api_key_scope:
        | 'gemini-2.0-flash'
        | 'gemini-2.5-flash'
        | 'gemini-2.0-pro'
        | 'gemini-2.5-pro';
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
    Functions: {
      add_board_tags: {
        Args: {
          board_id: string;
          new_tags: string[];
        };
        Returns: Json;
      };
      calculate_productivity_score: {
        Args: {
          category_color: string;
          duration_seconds: number;
        };
        Returns: number;
      };
      check_ws_creator: {
        Args: {
          ws_id: string;
        };
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
        Args: {
          enabled_filter?: boolean;
          role_filter?: string;
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
      extract_domain: {
        Args: {
          url: string;
        };
        Returns: string;
      };
      extract_referrer_domain: {
        Args: {
          url: string;
        };
        Returns: string;
      };
      generate_cross_app_token: {
        Args:
          | {
              p_expiry_seconds?: number;
              p_origin_app: string;
              p_session_data?: Json;
              p_target_app: string;
              p_user_id: string;
            }
          | {
              p_expiry_seconds?: number;
              p_origin_app: string;
              p_target_app: string;
              p_user_id: string;
            };
        Returns: string;
      };
      get_ai_execution_daily_stats: {
        Args: {
          p_end_date?: string;
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
      get_ai_execution_model_stats: {
        Args: {
          p_end_date?: string;
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
      get_ai_execution_monthly_cost: {
        Args: {
          p_month?: number;
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
      get_ai_execution_summary: {
        Args: {
          p_end_date?: string;
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
      get_board_task_tags: {
        Args: {
          board_id: string;
        };
        Returns: string[];
      };
      get_browsers: {
        Args: {
          p_limit?: number;
          p_link_id: string;
        };
        Returns: {
          browser: string;
          count: number;
        }[];
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
      get_clicks_by_day: {
        Args: {
          p_days?: number;
          p_link_id: string;
        };
        Returns: {
          click_date: string;
          clicks: number;
        }[];
      };
      get_clicks_by_day_of_week: {
        Args: {
          p_link_id: string;
        };
        Returns: {
          clicks: number;
          day_name: string;
          day_of_week: number;
        }[];
      };
      get_clicks_by_hour: {
        Args: {
          p_link_id: string;
        };
        Returns: {
          clicks: number;
          hour: number;
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
      get_device_types: {
        Args: {
          p_limit?: number;
          p_link_id: string;
        };
        Returns: {
          count: number;
          device_type: string;
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
      get_operating_systems: {
        Args: {
          p_limit?: number;
          p_link_id: string;
        };
        Returns: {
          count: number;
          os: string;
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
        Args: Record<PropertyKey, never>;
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
        Args: Record<PropertyKey, never>;
        Returns: {
          latest_submission_date: string;
          total_count: number;
          unique_users_count: number;
        }[];
      };
      get_top_cities: {
        Args: {
          p_limit?: number;
          p_link_id: string;
        };
        Returns: {
          city: string;
          count: number;
          country: string;
        }[];
      };
      get_top_countries: {
        Args: {
          p_limit?: number;
          p_link_id: string;
        };
        Returns: {
          count: number;
          country: string;
        }[];
      };
      get_top_referrers: {
        Args: {
          p_limit?: number;
          p_link_id: string;
        };
        Returns: {
          count: number;
          domain: string;
        }[];
      };
      get_transaction_categories_with_amount: {
        Args: Record<PropertyKey, never>;
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
      get_user_session_stats: {
        Args: {
          user_id: string;
        };
        Returns: {
          active_sessions: number;
          current_session_age: unknown;
          total_sessions: number;
        }[];
      };
      get_user_sessions: {
        Args: {
          user_id: string;
        };
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
      get_user_whitelist_status: {
        Args: {
          user_id_param: string;
        };
        Returns: {
          allow_challenge_management: boolean;
          allow_manage_all_challenges: boolean;
          allow_role_management: boolean;
          enabled: boolean;
          is_whitelisted: boolean;
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
      get_workspace_storage_limit: {
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
      gtrgm_compress: {
        Args: {
          '': unknown;
        };
        Returns: unknown;
      };
      gtrgm_decompress: {
        Args: {
          '': unknown;
        };
        Returns: unknown;
      };
      gtrgm_in: {
        Args: {
          '': unknown;
        };
        Returns: unknown;
      };
      gtrgm_options: {
        Args: {
          '': unknown;
        };
        Returns: undefined;
      };
      gtrgm_out: {
        Args: {
          '': unknown;
        };
        Returns: unknown;
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
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      is_nova_role_manager: {
        Args: Record<PropertyKey, never>;
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
      is_user_whitelisted: {
        Args: {
          user_id_param: string;
        };
        Returns: boolean;
      };
      normalize_task_tags: {
        Args: {
          tags: string[];
        };
        Returns: string[];
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
      parse_user_agent: {
        Args: {
          user_agent: string;
        };
        Returns: {
          browser: string;
          device_type: string;
          os: string;
        }[];
      };
      remove_board_tags: {
        Args: {
          board_id: string;
          tags_to_remove: string[];
        };
        Returns: Json;
      };
      revoke_all_cross_app_tokens: {
        Args: {
          p_user_id: string;
        };
        Returns: undefined;
      };
      revoke_all_other_sessions: {
        Args: {
          user_id: string;
        };
        Returns: number;
      };
      revoke_user_session: {
        Args: {
          session_id: string;
          target_user_id: string;
        };
        Returns: boolean;
      };
      search_boards_by_tags: {
        Args: {
          match_all?: boolean;
          search_tags: string[];
          workspace_id: string;
        };
        Returns: {
          board_id: string;
          board_name: string;
          board_tags: Json;
        }[];
      };
      search_tasks_by_tags: {
        Args: {
          search_tags: string[];
        };
        Returns: {
          created_at: string;
          description: string;
          end_date: string;
          id: string;
          list_id: string;
          name: string;
          priority: number;
          start_date: string;
          tags: string[];
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
      set_limit: {
        Args: {
          '': number;
        };
        Returns: number;
      };
      show_limit: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      show_trgm: {
        Args: {
          '': string;
        };
        Returns: string[];
      };
      sum_quiz_scores: {
        Args: {
          p_set_id: string;
        };
        Returns: {
          sum: number;
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
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      update_many_tasks: {
        Args: {
          updates: Json;
        };
        Returns: number;
      };
      update_session_total_score: {
        Args: {
          challenge_id_param: string;
          user_id_param: string;
        };
        Returns: undefined;
      };
      validate_and_normalize_board_tags: {
        Args: {
          tags: Json;
        };
        Returns: Json;
      };
      validate_board_tags: {
        Args: {
          tags: Json;
        };
        Returns: boolean;
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
            referencedRelation: 'shortened_links_creator_stats';
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
      };
      ai_chats: {
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
            referencedRelation: 'shortened_links_creator_stats';
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
          creator_id: string | null;
          id: string;
          is_public: boolean;
          latest_summarized_message_id: string | null;
          model: string | null;
          pinned: boolean;
          summary: string | null;
          title: string | null;
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
      };
      ai_models: {
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id: string;
          name?: string | null;
          provider?: string | null;
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
          name: string | null;
          provider: string | null;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          name?: string | null;
          provider?: string | null;
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
          description?: string | null;
          domain: string;
          enabled?: boolean;
        };
        Relationships: [];
        Row: {
          created_at: string;
          description: string | null;
          domain: string;
          enabled: boolean;
        };
        Update: {
          created_at?: string;
          description?: string | null;
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
            referencedRelation: 'workspace_link_counts';
          },
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
            referencedRelation: 'workspace_link_counts';
          },
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
            referencedRelation: 'workspace_link_counts';
          },
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
            referencedRelation: 'workspace_link_counts';
          },
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
            referencedRelation: 'shortened_links_creator_stats';
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
            referencedRelation: 'workspace_link_counts';
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
          created_at?: string | null;
          event_id: string;
          group_id: string;
          notes?: string | null;
          role?: string | null;
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
          created_at: string | null;
          event_id: string;
          group_id: string;
          notes: string | null;
          role: string | null;
        };
        Update: {
          created_at?: string | null;
          event_id?: string;
          group_id?: string;
          notes?: string | null;
          role?: string | null;
        };
      };
      calendar_event_platform_participants: {
        Insert: {
          created_at?: string | null;
          event_id: string;
          going?: boolean | null;
          notes?: string;
          role?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          created_at: string | null;
          event_id: string;
          going: boolean | null;
          notes: string;
          role: string | null;
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
      };
      calendar_event_virtual_participants: {
        Insert: {
          created_at?: string | null;
          event_id: string;
          going?: boolean | null;
          notes?: string;
          role?: string | null;
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
          created_at: string | null;
          event_id: string;
          going: boolean | null;
          notes: string;
          role: string | null;
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
      };
      calendar_sync_states: {
        Insert: {
          calendar_id?: string;
          last_synced_at?: string | null;
          sync_token?: string | null;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'calendar_sync_states_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'calendar_sync_states_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          calendar_id: string;
          last_synced_at: string | null;
          sync_token: string | null;
          ws_id: string;
        };
        Update: {
          calendar_id?: string;
          last_synced_at?: string | null;
          sync_token?: string | null;
          ws_id?: string;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          completed_at?: string | null;
          completion_id?: string;
          completion_status?: boolean;
          created_at?: string | null;
          module_id: string;
          user_id?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          completed_at: string | null;
          completion_id: string;
          completion_status: boolean;
          created_at: string | null;
          module_id: string;
          user_id: string | null;
        };
        Update: {
          completed_at?: string | null;
          completion_id?: string;
          completion_status?: boolean;
          created_at?: string | null;
          module_id?: string;
          user_id?: string | null;
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
          html?: string | null;
          id?: string;
          markdown?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          html: string | null;
          id: string;
          markdown: string | null;
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
          used_at?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          used_at: string | null;
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
      };
      external_user_monthly_reports: {
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
      };
      finance_invoice_promotions: {
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
          description: string | null;
          invoice_id: string | null;
          name: string | null;
          promo_id: string | null;
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
      };
      finance_invoices: {
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
            referencedRelation: 'workspace_link_counts';
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
      };
      handles: {
        Insert: {
          created_at?: string | null;
          creator_id?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          created_at: string | null;
          creator_id: string | null;
          value: string;
        };
        Update: {
          created_at?: string | null;
          creator_id?: string | null;
          value?: string;
        };
      };
      healthcare_checkup_vital_groups: {
        Insert: {
          checkup_id: string;
          created_at?: string | null;
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
          created_at: string | null;
          group_id: string;
        };
        Update: {
          checkup_id?: string;
          created_at?: string | null;
          group_id?: string;
        };
      };
      healthcare_checkup_vitals: {
        Insert: {
          checkup_id: string;
          created_at?: string | null;
          value?: number | null;
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
          created_at: string | null;
          value: number | null;
          vital_id: string;
        };
        Update: {
          checkup_id?: string;
          created_at?: string | null;
          value?: number | null;
          vital_id?: string;
        };
      };
      healthcare_checkups: {
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
            referencedRelation: 'shortened_links_creator_stats';
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
            referencedRelation: 'workspace_link_counts';
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
      };
      healthcare_diagnoses: {
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name?: string | null;
          note?: string | null;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'healthcare_diagnoses_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'healthcare_diagnoses_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          name: string | null;
          note: string | null;
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
      };
      healthcare_vital_groups: {
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          note?: string | null;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'healthcare_vital_groups_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'healthcare_vital_groups_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          note: string | null;
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
      };
      healthcare_vitals: {
        Insert: {
          created_at?: string | null;
          factor?: number;
          group_id?: string | null;
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
            referencedRelation: 'workspace_link_counts';
          },
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
          created_at: string | null;
          factor: number;
          group_id: string | null;
          id: string;
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
      };
      internal_email_api_keys: {
        Insert: {
          allowed_emails?: string[] | null;
          created_at?: string;
          creator_id: string;
          id?: string;
          user_id: string;
          value: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'internal_email_api_keys_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'internal_email_api_keys_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'internal_email_api_keys_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'internal_email_api_keys_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'internal_email_api_keys_user_id_fkey';
            isOneToOne: true;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'internal_email_api_keys_user_id_fkey';
            isOneToOne: true;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'internal_email_api_keys_user_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'internal_email_api_keys_user_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          allowed_emails: string[] | null;
          created_at: string;
          creator_id: string;
          id: string;
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
      };
      internal_emails: {
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
        Relationships: [
          {
            columns: ['user_id'];
            foreignKeyName: 'internal_emails_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'internal_emails_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'internal_emails_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'internal_emails_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'internal_emails_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'internal_emails_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      inventory_batch_products: {
        Insert: {
          amount?: number;
          batch_id: string;
          created_at?: string | null;
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
          created_at: string | null;
          price: number;
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
      };
      inventory_batches: {
        Insert: {
          created_at?: string | null;
          id?: string;
          price?: number;
          supplier_id?: string | null;
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
          created_at: string | null;
          id: string;
          price: number;
          supplier_id: string | null;
          total_diff: number;
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
      };
      inventory_products: {
        Insert: {
          amount?: number | null;
          created_at?: string | null;
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
          amount: number | null;
          created_at: string | null;
          min_amount: number;
          price: number;
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
      };
      inventory_suppliers: {
        Insert: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'inventory_suppliers_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'inventory_suppliers_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
      };
      inventory_units: {
        Insert: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'inventory_units_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'inventory_units_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
      };
      inventory_warehouses: {
        Insert: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'inventory_warehouses_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'inventory_warehouses_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
      };
      link_analytics: {
        Insert: {
          browser?: string | null;
          city?: string | null;
          clicked_at?: string;
          country?: string | null;
          country_region?: string | null;
          created_at?: string;
          device_type?: string | null;
          id?: string;
          ip_address?: unknown | null;
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
        Relationships: [
          {
            columns: ['link_id'];
            foreignKeyName: 'link_analytics_link_id_fkey';
            isOneToOne: false;
            referencedColumns: ['link_id'];
            referencedRelation: 'link_analytics_device_insights';
          },
          {
            columns: ['link_id'];
            foreignKeyName: 'link_analytics_link_id_fkey';
            isOneToOne: false;
            referencedColumns: ['link_id'];
            referencedRelation: 'link_analytics_geo_insights';
          },
          {
            columns: ['link_id'];
            foreignKeyName: 'link_analytics_link_id_fkey';
            isOneToOne: false;
            referencedColumns: ['link_id'];
            referencedRelation: 'link_analytics_summary';
          },
          {
            columns: ['link_id'];
            foreignKeyName: 'link_analytics_link_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links';
          },
        ];
        Row: {
          browser: string | null;
          city: string | null;
          clicked_at: string;
          country: string | null;
          country_region: string | null;
          created_at: string;
          device_type: string | null;
          id: string;
          ip_address: unknown | null;
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
        Update: {
          browser?: string | null;
          city?: string | null;
          clicked_at?: string;
          country?: string | null;
          country_region?: string | null;
          created_at?: string;
          device_type?: string | null;
          id?: string;
          ip_address?: unknown | null;
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
      };
      meet_together_guest_timeblocks: {
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
          tentative: boolean;
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
          agenda_content?: Json | null;
          created_at?: string | null;
          creator_id?: string | null;
          dates: string[];
          description?: string | null;
          end_time: string;
          id?: string;
          is_public?: boolean;
          name?: string | null;
          start_time: string;
          where_to_meet?: boolean;
          ws_id?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'meet_together_plans_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'meet_together_plans_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'meet_together_plans_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          agenda_content: Json | null;
          created_at: string | null;
          creator_id: string | null;
          dates: string[];
          description: string | null;
          end_time: string;
          id: string;
          is_public: boolean;
          name: string | null;
          start_time: string;
          where_to_meet: boolean;
          ws_id: string | null;
        };
        Update: {
          agenda_content?: Json | null;
          created_at?: string | null;
          creator_id?: string | null;
          dates?: string[];
          description?: string | null;
          end_time?: string;
          id?: string;
          is_public?: boolean;
          name?: string | null;
          start_time?: string;
          where_to_meet?: boolean;
          ws_id?: string | null;
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
          tentative?: boolean;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          tentative: boolean;
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
        Relationships: [];
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
          end_time?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          end_time: string | null;
          id: string;
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
      };
      nova_submission_criteria: {
        Insert: {
          created_at?: string;
          criteria_id: string;
          feedback: string;
          improvements?: string[] | null;
          score: number;
          strengths?: string[] | null;
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
          improvements: string[] | null;
          score: number;
          strengths: string[] | null;
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
      };
      nova_submission_test_cases: {
        Insert: {
          confidence?: number | null;
          created_at?: string;
          matched?: boolean;
          output: string;
          reasoning?: string | null;
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
          confidence: number | null;
          created_at: string;
          matched: boolean;
          output: string;
          reasoning: string | null;
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
      };
      nova_submissions: {
        Insert: {
          created_at?: string;
          id?: string;
          overall_assessment?: string | null;
          problem_id: string;
          prompt: string;
          session_id?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          overall_assessment: string | null;
          problem_id: string;
          prompt: string;
          session_id: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          description?: string | null;
          goals?: string | null;
          id?: string;
          name: string;
        };
        Relationships: [];
        Row: {
          created_at: string;
          description: string | null;
          goals: string | null;
          id: string;
          name: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          goals?: string | null;
          id?: string;
          name?: string;
        };
      };
      onboarding_progress: {
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
        Relationships: [
          {
            columns: ['user_id'];
            foreignKeyName: 'onboarding_progress_user_id_fkey';
            isOneToOne: true;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'onboarding_progress_user_id_fkey';
            isOneToOne: true;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'onboarding_progress_user_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'onboarding_progress_user_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
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
      };
      personal_notes: {
        Insert: {
          content?: string | null;
          created_at?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
            referencedRelation: 'shortened_links_creator_stats';
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
          content: string | null;
          created_at: string | null;
          owner_id: string;
          user_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string | null;
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
          allow_workspace_creation?: boolean;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          allow_workspace_creation: boolean;
          created_at: string;
          enabled: boolean;
          user_id: string;
        };
        Update: {
          allow_challenge_management?: boolean;
          allow_manage_all_challenges?: boolean;
          allow_role_management?: boolean;
          allow_workspace_creation?: boolean;
          created_at?: string;
          enabled?: boolean;
          user_id?: string;
        };
      };
      poll_guest_permissions: {
        Insert: {
          can_vote?: boolean;
          created_at?: string;
          delete_poll?: boolean;
          poll_id: string;
          read_poll?: boolean;
          update_poll?: boolean;
        };
        Relationships: [
          {
            columns: ['poll_id'];
            foreignKeyName: 'poll_guest_permissions_poll_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'polls';
          },
        ];
        Row: {
          can_vote: boolean;
          created_at: string;
          delete_poll: boolean;
          poll_id: string;
          read_poll: boolean;
          update_poll: boolean;
        };
        Update: {
          can_vote?: boolean;
          created_at?: string;
          delete_poll?: boolean;
          poll_id?: string;
          read_poll?: boolean;
          update_poll?: boolean;
        };
      };
      poll_guest_votes: {
        Insert: {
          created_at?: string;
          guest_id: string;
          id?: string;
          option_id: string;
        };
        Relationships: [
          {
            columns: ['guest_id'];
            foreignKeyName: 'guest_poll_votes_guest_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'meet_together_guests';
          },
          {
            columns: ['option_id'];
            foreignKeyName: 'guest_poll_votes_option_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'poll_options';
          },
        ];
        Row: {
          created_at: string;
          guest_id: string;
          id: string;
          option_id: string;
        };
        Update: {
          created_at?: string;
          guest_id?: string;
          id?: string;
          option_id?: string;
        };
      };
      poll_options: {
        Insert: {
          created_at?: string;
          id?: string;
          poll_id: string;
          value?: string;
        };
        Relationships: [
          {
            columns: ['poll_id'];
            foreignKeyName: 'poll_option_poll_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'polls';
          },
        ];
        Row: {
          created_at: string;
          id: string;
          poll_id: string;
          value: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          poll_id?: string;
          value?: string;
        };
      };
      poll_user_permissions: {
        Insert: {
          can_vote?: boolean;
          created_at?: string;
          delete_poll?: boolean;
          poll_id: string;
          read_poll?: boolean;
          update_poll?: boolean;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['poll_id'];
            foreignKeyName: 'poll_user_permissions_poll_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'polls';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'poll_user_permissions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'poll_user_permissions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'poll_user_permissions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'poll_user_permissions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          can_vote: boolean;
          created_at: string;
          delete_poll: boolean;
          poll_id: string;
          read_poll: boolean;
          update_poll: boolean;
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
      };
      poll_user_votes: {
        Insert: {
          created_at?: string;
          id?: string;
          option_id: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['option_id'];
            foreignKeyName: 'users_poll_votes_option_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'poll_options';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'users_poll_votes_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'users_poll_votes_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'users_poll_votes_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'users_poll_votes_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: string;
          id: string;
          option_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          option_id?: string;
          user_id?: string;
        };
      };
      polls: {
        Insert: {
          allow_anonymous_updates?: boolean;
          created_at?: string;
          creator_id: string;
          id?: string;
          name?: string;
          plan_id?: string | null;
          ws_id?: string | null;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'polls_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'polls_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'polls_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'polls_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['plan_id'];
            foreignKeyName: 'polls_plan_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'meet_together_plans';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'polls_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'polls_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          allow_anonymous_updates: boolean;
          created_at: string;
          creator_id: string;
          id: string;
          name: string;
          plan_id: string | null;
          ws_id: string | null;
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
      };
      product_categories: {
        Insert: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'product_categories_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'product_categories_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
      };
      product_stock_changes: {
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
          beneficiary_id: string | null;
          created_at: string;
          creator_id: string;
          id: string;
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
      };
      quiz_options: {
        Insert: {
          created_at?: string;
          explanation?: string | null;
          id?: string;
          is_correct: boolean;
          points?: number | null;
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
          explanation: string | null;
          id: string;
          is_correct: boolean;
          points: number | null;
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
      sent_emails: {
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
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['sender_id'];
            foreignKeyName: 'sent_emails_sender_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'sent_emails_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'sent_emails_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      shortened_links: {
        Insert: {
          created_at?: string;
          creator_id: string;
          domain: string;
          id?: string;
          link: string;
          slug: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'shortened_links_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'shortened_links_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'shortened_links_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'shortened_links_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'shortened_links_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'shortened_links_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          creator_id: string;
          domain: string;
          id: string;
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
          created_at?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          created_at: string | null;
          task_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          task_id?: string;
          user_id?: string;
        };
      };
      task_board_status_templates: {
        Insert: {
          created_at?: string | null;
          description?: string | null;
          id?: string;
          is_default?: boolean | null;
          name: string;
          statuses: Json;
          updated_at?: string | null;
        };
        Relationships: [];
        Row: {
          created_at: string | null;
          description: string | null;
          id: string;
          is_default: boolean | null;
          name: string;
          statuses: Json;
          updated_at: string | null;
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
      };
      task_lists: {
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
            referencedRelation: 'shortened_links_creator_stats';
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
          color: string | null;
          created_at: string | null;
          creator_id: string | null;
          deleted: boolean | null;
          id: string;
          name: string | null;
          position: number | null;
          status: Database['public']['Enums']['task_board_status'] | null;
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
      };
      tasks: {
        Insert: {
          archived?: boolean | null;
          calendar_hours?: Database['public']['Enums']['calendar_hours'] | null;
          completed?: boolean | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          is_splittable?: boolean | null;
          list_id?: string | null;
          max_split_duration_minutes?: number | null;
          min_split_duration_minutes?: number | null;
          name: string;
          priority?: number | null;
          start_date?: string | null;
          tags?: string[] | null;
          total_duration?: number | null;
          user_defined_priority?:
            | Database['public']['Enums']['task_priority']
            | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          calendar_hours: Database['public']['Enums']['calendar_hours'] | null;
          completed: boolean | null;
          created_at: string | null;
          creator_id: string | null;
          deleted: boolean | null;
          description: string | null;
          end_date: string | null;
          id: string;
          is_splittable: boolean | null;
          list_id: string | null;
          max_split_duration_minutes: number | null;
          min_split_duration_minutes: number | null;
          name: string;
          priority: number | null;
          start_date: string | null;
          tags: string[] | null;
          total_duration: number | null;
          user_defined_priority:
            | Database['public']['Enums']['task_priority']
            | null;
        };
        Update: {
          archived?: boolean | null;
          calendar_hours?: Database['public']['Enums']['calendar_hours'] | null;
          completed?: boolean | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          description?: string | null;
          end_date?: string | null;
          id?: string;
          is_splittable?: boolean | null;
          list_id?: string | null;
          max_split_duration_minutes?: number | null;
          min_split_duration_minutes?: number | null;
          name?: string;
          priority?: number | null;
          start_date?: string | null;
          tags?: string[] | null;
          total_duration?: number | null;
          user_defined_priority?:
            | Database['public']['Enums']['task_priority']
            | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          color?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          name: string;
          updated_at?: string | null;
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
            referencedRelation: 'workspace_link_counts';
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
          color: string | null;
          created_at: string | null;
          description: string | null;
          id: string;
          name: string;
          updated_at: string | null;
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
      };
      time_tracking_goals: {
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
            referencedRelation: 'workspace_link_counts';
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
      };
      time_tracking_sessions: {
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
          was_resumed?: boolean;
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
            referencedRelation: 'workspace_link_counts';
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
          was_resumed: boolean;
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
          was_resumed?: boolean;
          ws_id?: string;
        };
      };
      timezones: {
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
        Relationships: [];
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
      };
      transaction_categories: {
        Insert: {
          created_at?: string | null;
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
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'transaction_categories_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string | null;
          id: string;
          is_expense: boolean | null;
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
      };
      user_feedbacks: {
        Insert: {
          content: string;
          created_at?: string;
          creator_id?: string | null;
          group_id?: string | null;
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
          creator_id: string | null;
          group_id: string | null;
          id: string;
          require_attention: boolean;
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
          email_id?: string | null;
          is_completed: boolean;
          notes?: string | null;
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
          email_id: string | null;
          is_completed: boolean;
          notes: string | null;
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
      };
      user_group_posts: {
        Insert: {
          content?: string | null;
          created_at?: string;
          group_id: string;
          id?: string;
          notes?: string | null;
          title?: string | null;
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
          content: string | null;
          created_at: string;
          group_id: string;
          id: string;
          notes: string | null;
          title: string | null;
        };
        Update: {
          content?: string | null;
          created_at?: string;
          group_id?: string;
          id?: string;
          notes?: string | null;
          title?: string | null;
        };
      };
      user_indicators: {
        Insert: {
          created_at?: string;
          creator_id?: string | null;
          group_id: string;
          indicator_id: string;
          user_id: string;
          value?: number | null;
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
          creator_id: string | null;
          group_id: string;
          indicator_id: string;
          user_id: string;
          value: number | null;
        };
        Update: {
          created_at?: string;
          creator_id?: string | null;
          group_id?: string;
          indicator_id?: string;
          user_id?: string;
          value?: number | null;
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
          birthday?: string | null;
          default_workspace_id?: string | null;
          email?: string | null;
          full_name?: string | null;
          new_email?: string | null;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['default_workspace_id'];
            foreignKeyName: 'user_private_details_default_workspace_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
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
            referencedRelation: 'shortened_links_creator_stats';
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
          birthday: string | null;
          default_workspace_id: string | null;
          email: string | null;
          full_name: string | null;
          new_email: string | null;
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
      };
      users: {
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
          avatar_url: string | null;
          bio: string | null;
          created_at: string | null;
          deleted: boolean | null;
          display_name: string | null;
          handle: string | null;
          id: string;
          services: Database['public']['Enums']['platform_service'][];
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
      };
      vital_group_vitals: {
        Insert: {
          created_at?: string | null;
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
          created_at: string | null;
          group_id: string;
          vital_id: string;
        };
        Update: {
          created_at?: string | null;
          group_id?: string;
          vital_id?: string;
        };
      };
      wallet_transactions: {
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
      workspace_ai_executions: {
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
        Relationships: [
          {
            columns: ['api_key_id'];
            foreignKeyName: 'workspace_ai_executions_api_key_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_api_keys';
          },
          {
            columns: ['model_id'];
            foreignKeyName: 'workspace_ai_executions_model_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'ai_models';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_ai_executions_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_ai_executions_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      workspace_ai_models: {
        Insert: {
          created_at?: string;
          description?: string | null;
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
            referencedRelation: 'workspace_link_counts';
          },
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
          description: string | null;
          id: string;
          name: string;
          updated_at: string;
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
      };
      workspace_ai_prompts: {
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
            referencedRelation: 'shortened_links_creator_stats';
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
            referencedRelation: 'workspace_link_counts';
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
          creator_id: string | null;
          id: string;
          input: string;
          model: string;
          name: string | null;
          output: string;
          ws_id: string | null;
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
      };
      workspace_api_keys: {
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          scopes?: Database['public']['Enums']['workspace_api_key_scope'][];
          value: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_api_keys_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
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
          scopes: Database['public']['Enums']['workspace_api_key_scope'][];
          value: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          scopes?: Database['public']['Enums']['workspace_api_key_scope'][];
          value?: string;
          ws_id?: string;
        };
      };
      workspace_boards: {
        Insert: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
          tags?: Json | null;
          template_id?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'project_boards_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['template_id'];
            foreignKeyName: 'workspace_boards_template_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'task_board_status_templates';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_boards_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
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
          created_at: string | null;
          creator_id: string | null;
          deleted: boolean | null;
          id: string;
          name: string | null;
          tags: Json | null;
          template_id: string | null;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
          tags?: Json | null;
          template_id?: string | null;
          ws_id?: string;
        };
      };
      workspace_calendar_events: {
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
          task_id?: string | null;
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
            referencedRelation: 'workspace_link_counts';
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
          task_id: string | null;
          title: string;
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
          task_id?: string | null;
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
            referencedRelation: 'workspace_link_counts';
          },
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
      workspace_calendar_sync_coordination: {
        Insert: {
          created_at?: string | null;
          last_upsert?: string;
          updated_at?: string | null;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_calendar_sync_coordination_ws_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_calendar_sync_coordination_ws_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string | null;
          last_upsert: string;
          updated_at: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          last_upsert?: string;
          updated_at?: string | null;
          ws_id?: string;
        };
      };
      workspace_calendar_sync_log: {
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
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_calendar_sync_log_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_calendar_sync_log_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
            referencedRelation: 'workspace_link_counts';
          },
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
          youtube_links?: string[] | null;
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
          youtube_links: string[] | null;
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
      };
      workspace_courses: {
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
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_courses_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_courses_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      workspace_cron_executions: {
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
          cron_run_id: number | null;
          end_time: string | null;
          id: string;
          job_id: string;
          response: string | null;
          start_time: string | null;
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
      };
      workspace_cron_jobs: {
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
            referencedRelation: 'workspace_link_counts';
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
          cron_job_id: number | null;
          dataset_id: string;
          id: string;
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
      };
      workspace_dataset_cells: {
        Insert: {
          column_id: string;
          created_at?: string;
          data?: string | null;
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
          data: string | null;
          dataset_id: string;
          id: string;
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
      };
      workspace_dataset_columns: {
        Insert: {
          alias?: string | null;
          created_at?: string;
          dataset_id: string;
          description?: string | null;
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
          alias: string | null;
          created_at: string;
          dataset_id: string;
          description: string | null;
          id: string;
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
          description?: string | null;
          id?: string;
          name: string;
          url?: string | null;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_datasets_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
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
          description: string | null;
          id: string;
          name: string;
          url: string | null;
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
            referencedRelation: 'workspace_link_counts';
          },
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
          legacy_content?: string | null;
          name?: string | null;
          ws_id?: string | null;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_documents_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
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
          legacy_content: string | null;
          name: string | null;
          ws_id: string | null;
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
      };
      workspace_education_access_requests: {
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
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_education_access_requests_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_education_access_requests_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_education_access_requests_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_education_access_requests_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['reviewed_by'];
            foreignKeyName: 'workspace_education_access_requests_reviewed_by_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['reviewed_by'];
            foreignKeyName: 'workspace_education_access_requests_reviewed_by_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['reviewed_by'];
            foreignKeyName: 'workspace_education_access_requests_reviewed_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['reviewed_by'];
            foreignKeyName: 'workspace_education_access_requests_reviewed_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_education_access_requests_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_education_access_requests_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
            referencedRelation: 'workspace_link_counts';
          },
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
          invited_by?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
            referencedRelation: 'workspace_link_counts';
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
          invited_by: string | null;
          role: string;
          role_title: string;
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
            referencedRelation: 'workspace_link_counts';
          },
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
          created_at?: string | null;
          role?: string;
          role_title?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
            referencedRelation: 'workspace_link_counts';
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
          created_at: string | null;
          role: string;
          role_title: string | null;
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
      };
      workspace_members: {
        Insert: {
          created_at?: string | null;
          role?: string;
          role_title?: string;
          sort_key?: number | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
            referencedRelation: 'workspace_link_counts';
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
          created_at: string | null;
          role: string;
          role_title: string;
          sort_key: number | null;
          user_id: string;
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
      };
      workspace_products: {
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
            referencedRelation: 'workspace_link_counts';
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
      };
      workspace_promotions: {
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
            referencedRelation: 'workspace_link_counts';
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
      };
      workspace_quiz_attempt_answers: {
        Insert: {
          attempt_id: string;
          id?: string;
          is_correct: boolean;
          quiz_id: string;
          score_awarded: number;
          selected_option_id: string;
        };
        Relationships: [
          {
            columns: ['attempt_id'];
            foreignKeyName: 'wq_answer_attempt_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_quiz_attempts';
          },
          {
            columns: ['selected_option_id'];
            foreignKeyName: 'wq_answer_option_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'quiz_options';
          },
          {
            columns: ['quiz_id'];
            foreignKeyName: 'wq_answer_quiz_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_quizzes';
          },
        ];
        Row: {
          attempt_id: string;
          id: string;
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
      };
      workspace_quiz_attempts: {
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
        Relationships: [
          {
            columns: ['set_id'];
            foreignKeyName: 'wq_attempts_set_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_quiz_sets';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'wq_attempts_user_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'wq_attempts_user_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'wq_attempts_user_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'wq_attempts_user_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
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
      };
      workspace_quiz_sets: {
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
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_quiz_sets_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_quiz_sets_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      workspace_quizzes: {
        Insert: {
          created_at?: string;
          id?: string;
          instruction?: Json | null;
          question: string;
          score?: number;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_quizzes_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
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
          instruction: Json | null;
          question: string;
          score: number;
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
            referencedRelation: 'shortened_links_creator_stats';
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
            referencedRelation: 'workspace_link_counts';
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
            referencedRelation: 'workspace_link_counts';
          },
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
          value?: string | null;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_secrets_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
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
          value: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          value?: string | null;
          ws_id?: string;
        };
      };
      workspace_subscription: {
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
        Relationships: [
          {
            columns: ['product_id'];
            foreignKeyName: 'workspace_subscription_product_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_subscription_products';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_subscription_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_subscription_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      workspace_subscription_products: {
        Insert: {
          created_at?: string;
          description?: string | null;
          id: string;
          name?: string | null;
          price?: number | null;
          recurring_interval?: string | null;
        };
        Relationships: [];
        Row: {
          created_at: string;
          description: string | null;
          id: string;
          name: string | null;
          price: number | null;
          recurring_interval: string | null;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          id?: string;
          name?: string | null;
          price?: number | null;
          recurring_interval?: string | null;
        };
      };
      workspace_teams: {
        Insert: {
          created_at?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_teams_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_teams_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string | null;
          deleted: boolean | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
      };
      workspace_user_fields: {
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
            referencedRelation: 'workspace_link_counts';
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
          default_value: string | null;
          description: string | null;
          id: string;
          name: string;
          notes: string | null;
          possible_values: string[] | null;
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
          color?: string | null;
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
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'public_workspace_user_group_tags_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          color: string | null;
          created_at: string;
          id: string;
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
      };
      workspace_user_groups: {
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
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
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
          created_at: string | null;
          ending_date: string | null;
          id: string;
          name: string;
          notes: string | null;
          sessions: string[] | null;
          starting_date: string | null;
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
      };
      workspace_user_groups_users: {
        Insert: {
          created_at?: string | null;
          group_id: string;
          role?: string | null;
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
          created_at: string | null;
          group_id: string;
          role: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          group_id?: string;
          role?: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
            referencedRelation: 'workspace_link_counts';
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
          archived_until?: string | null;
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
            referencedRelation: 'workspace_link_counts';
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
          archived_until: string | null;
          created_at: string;
          creator_id: string;
          id: string;
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
      };
      workspace_users: {
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
            referencedRelation: 'workspace_link_counts';
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
      };
      workspace_wallet_transfers: {
        Insert: {
          created_at?: string | null;
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
          created_at: string | null;
          from_transaction_id: string;
          to_transaction_id: string;
        };
        Update: {
          created_at?: string | null;
          from_transaction_id?: string;
          to_transaction_id?: string;
        };
      };
      workspace_wallets: {
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
            referencedRelation: 'workspace_link_counts';
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
      };
      workspace_whiteboards: {
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
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_whiteboards_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_whiteboards_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_whiteboards_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_whiteboards_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_whiteboards_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_whiteboards_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      workspaces: {
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
            referencedRelation: 'shortened_links_creator_stats';
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
          avatar_url: string | null;
          created_at: string | null;
          creator_id: string | null;
          deleted: boolean | null;
          handle: string | null;
          id: string;
          logo_url: string | null;
          name: string | null;
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
      };
    };
    Views: {
      audit_logs: {
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
            referencedRelation: 'shortened_links_creator_stats';
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
      };
      calendar_event_participants: {
        Relationships: [];
        Row: {
          created_at: string | null;
          display_name: string | null;
          event_id: string | null;
          going: boolean | null;
          handle: string | null;
          participant_id: string | null;
          type: string | null;
        };
      };
      distinct_invoice_creators: {
        Relationships: [];
        Row: {
          display_name: string | null;
          id: string | null;
        };
      };
      link_analytics_device_insights: {
        Relationships: [];
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
      };
      link_analytics_geo_insights: {
        Relationships: [];
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
      };
      link_analytics_summary: {
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'shortened_links_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'shortened_links_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'shortened_links_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'shortened_links_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'shortened_links_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'shortened_links_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      meet_together_users: {
        Relationships: [];
        Row: {
          display_name: string | null;
          is_guest: boolean | null;
          plan_id: string | null;
          timeblock_count: number | null;
          user_id: string | null;
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
            referencedRelation: 'shortened_links_creator_stats';
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
          challenge_id: string | null;
          name: string | null;
          problem_scores: Json | null;
          score: number | null;
          team_id: string | null;
        };
      };
      nova_team_leaderboard: {
        Relationships: [];
        Row: {
          challenge_scores: Json | null;
          name: string | null;
          score: number | null;
          team_id: string | null;
        };
      };
      nova_user_challenge_leaderboard: {
        Relationships: [];
        Row: {
          avatar: string | null;
          challenge_id: string | null;
          name: string | null;
          problem_scores: Json | null;
          score: number | null;
          user_id: string | null;
        };
      };
      nova_user_leaderboard: {
        Relationships: [];
        Row: {
          avatar: string | null;
          challenge_scores: Json | null;
          name: string | null;
          score: number | null;
          user_id: string | null;
        };
      };
      shortened_links_creator_stats: {
        Relationships: [];
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
      };
      shortened_links_domain_stats: {
        Relationships: [];
        Row: {
          creator_count: number | null;
          domain: string | null;
          first_created: string | null;
          last_created: string | null;
          link_count: number | null;
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
            referencedRelation: 'workspace_link_counts';
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
      };
      user_groups_with_tags: {
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
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
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
          created_at: string | null;
          dataset_id: string | null;
          row_id: string | null;
        };
      };
      workspace_link_counts: {
        Relationships: [];
        Row: {
          id: string | null;
          link_count: number | null;
          logo_url: string | null;
          name: string | null;
        };
      };
      workspace_members_and_invites: {
        Relationships: [];
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
      };
      workspace_user_groups_with_amount: {
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_user_roles_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
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
      };
      workspace_users_with_groups: {
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
            referencedRelation: 'workspace_link_counts';
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
    | {
        schema: keyof DatabaseWithoutInternals;
      },
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
    | {
        schema: keyof DatabaseWithoutInternals;
      },
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
    | {
        schema: keyof DatabaseWithoutInternals;
      },
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
    | {
        schema: keyof DatabaseWithoutInternals;
      },
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
    | {
        schema: keyof DatabaseWithoutInternals;
      },
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
      calendar_hour_type: ['WORK', 'PERSONAL', 'MEETING'],
      calendar_hours: ['work_hours', 'personal_hours', 'meeting_hours'],
      certificate_templates: ['original', 'modern', 'elegant'],
      chat_role: ['FUNCTION', 'USER', 'SYSTEM', 'ASSISTANT'],
      dataset_type: ['excel', 'csv', 'html'],
      feature_flag: [
        'ENABLE_AI',
        'ENABLE_EDUCATION',
        'ENABLE_CHALLENGES',
        'ENABLE_QUIZZES',
      ],
      platform_service: ['TUTURUUU', 'REWISE', 'NOVA', 'UPSKII'],
      subscription_status: ['trialing', 'active', 'canceled', 'past_due'],
      task_board_status: ['not_started', 'active', 'done', 'closed'],
      task_priority: ['low', 'normal', 'high', 'critical'],
      workspace_api_key_scope: [
        'gemini-2.0-flash',
        'gemini-2.5-flash',
        'gemini-2.0-pro',
        'gemini-2.5-pro',
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
      ],
    },
  },
} as const;
