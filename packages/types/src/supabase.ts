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
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '13.0.5';
  };
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
      calendar_hours: 'meeting_hours' | 'personal_hours' | 'work_hours';
      certificate_templates: 'elegant' | 'modern' | 'original';
      chat_role: 'ASSISTANT' | 'FUNCTION' | 'SYSTEM' | 'USER';
      dataset_type: 'csv' | 'excel' | 'html';
      estimation_type: 'exponential' | 'fibonacci' | 'linear' | 't-shirt';
      feature_flag:
        | 'ENABLE_AI'
        | 'ENABLE_CHALLENGES'
        | 'ENABLE_EDUCATION'
        | 'ENABLE_QUIZZES';
      platform_service: 'NOVA' | 'REWISE' | 'TUTURUUU' | 'UPSKII';
      product:
        | 'calendar'
        | 'drive'
        | 'finance'
        | 'mail'
        | 'nova'
        | 'other'
        | 'qr'
        | 'rewise'
        | 'shortener'
        | 'tudo'
        | 'tumeet'
        | 'web';
      promotion_type: 'REFERRAL' | 'REGULAR';
      recording_status:
        | 'completed'
        | 'failed'
        | 'interrupted'
        | 'pending_transcription'
        | 'recording'
        | 'transcribing';
      recurring_frequency: 'daily' | 'monthly' | 'weekly' | 'yearly';
      subscription_status: 'active' | 'canceled' | 'past_due' | 'trialing';
      support_type: 'bug' | 'feature-request' | 'job-application' | 'support';
      task_board_status: 'active' | 'closed' | 'done' | 'not_started';
      task_priority: 'critical' | 'high' | 'low' | 'normal';
      workspace_api_key_scope:
        | 'gemini-2.0-flash-lite'
        | 'gemini-2.0-flash'
        | 'gemini-2.0-pro'
        | 'gemini-2.5-flash-lite'
        | 'gemini-2.5-flash'
        | 'gemini-2.5-pro';
      workspace_role_permission:
        | 'ai_chat'
        | 'ai_lab'
        | 'check_user_attendance'
        | 'create_inventory'
        | 'create_invoices'
        | 'create_transactions'
        | 'create_user_groups_scores'
        | 'create_user_groups'
        | 'create_users'
        | 'delete_inventory'
        | 'delete_invoices'
        | 'delete_transactions'
        | 'delete_user_groups_scores'
        | 'delete_user_groups'
        | 'delete_users'
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
        | 'update_inventory'
        | 'update_invoices'
        | 'update_transactions'
        | 'update_user_groups_scores'
        | 'update_user_groups'
        | 'update_users'
        | 'view_finance_stats'
        | 'view_infrastructure'
        | 'view_inventory'
        | 'view_invoices'
        | 'view_transactions'
        | 'view_user_groups_scores'
        | 'view_user_groups'
        | 'view_users_private_info'
        | 'view_users_public_info';
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
        Args: {
          category_color: string;
          duration_seconds: number;
        };
        Returns: number;
      };
      can_create_workspace: {
        Args: {
          p_user_id: string;
        };
        Returns: boolean;
      };
      can_manage_indicator: {
        Args: {
          p_indicator_id: string;
        };
        Returns: boolean;
      };
      check_guest_group: {
        Args: {
          group_id: string;
        };
        Returns: boolean;
      };
      check_guest_lead_eligibility: {
        Args: {
          p_user_id: string;
          p_ws_id: string;
        };
        Returns: Json;
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
      cleanup_old_typing_indicators: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
      cleanup_role_inconsistencies: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
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
        Args: {
          p_user_id: string;
          p_ws_id: string;
        };
        Returns: {
          display_name: string;
          email: string;
          full_name: string;
          id: string;
          phone: string;
        }[];
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
      get_budget_status: {
        Args: {
          _ws_id: string;
        };
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
      get_created_workspace_count: {
        Args: {
          user_id: string;
        };
        Returns: number;
      };
      get_daily_activity_heatmap: {
        Args: {
          p_days_back?: number;
          p_user_id?: string;
          p_ws_id: string;
        };
        Returns: Json;
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
      get_default_ai_pricing: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
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
      get_joined_workspace_count: {
        Args: {
          user_id: string;
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
      get_pending_invoices: {
        Args: {
          p_limit?: number;
          p_offset?: number;
          p_ws_id: string;
        };
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
      get_pending_invoices_count: {
        Args: {
          p_ws_id: string;
        };
        Returns: number;
      };
      get_period_summary_stats: {
        Args: {
          p_period?: string;
          p_ws_id: string;
        };
        Returns: Json;
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
        Args: {
          p_user_id?: string;
          p_ws_id: string;
        };
        Returns: Json;
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
      get_transaction_categories_with_amount_by_workspace: {
        Args: {
          p_ws_id: string;
        };
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
        Args: {
          _ws_id: string;
        };
        Returns: {
          tag_color: string;
          tag_id: string;
          tag_name: string;
          transaction_count: number;
        }[];
      };
      get_upcoming_recurring_transactions: {
        Args: {
          _ws_id: string;
          days_ahead?: number;
        };
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
          task_archived: boolean;
          task_calendar_hours: Database['public']['Enums']['calendar_hours'];
          task_completed: boolean;
          task_created_at: string;
          task_creator_id: string;
          task_deleted: boolean;
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
      get_workspace_member_count: {
        Args: {
          p_ws_id: string;
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
      get_workspace_user_with_details: {
        Args: {
          p_user_id: string;
          p_ws_id: string;
        };
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
      is_personal_workspace: {
        Args: {
          p_ws_id: string;
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
      is_user_guest: {
        Args: {
          user_uuid: string;
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
      is_workspace_owner: {
        Args: {
          p_user_id: string;
          p_ws_id: string;
        };
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
          archived: boolean;
          completed: boolean;
          description: string;
          end_date: string;
          id: string;
          list_id: string;
          name: string;
          similarity: number;
          start_date: string;
        }[];
      };
      normalize_task_sort_keys: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
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
      process_recurring_transactions: {
        Args: Record<PropertyKey, never>;
        Returns: {
          processed_count: number;
          recurring_id: string;
          transaction_id: string;
        }[];
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
      upsert_calendar_events_and_count: {
        Args: {
          events: Json;
        };
        Returns: Json;
      };
      user_is_in_channel: {
        Args: {
          p_channel_id: string;
          p_user_id: string;
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
      audio_chunks: {
        Insert: {
          chunk_order: number;
          created_at?: string;
          id?: string;
          session_id: string;
          storage_path: string;
        };
        Relationships: [
          {
            columns: ['session_id'];
            foreignKeyName: 'audio_chunks_session_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'recording_sessions';
          },
        ];
        Row: {
          chunk_order: number;
          created_at: string;
          id: string;
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
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
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
          {
            columns: ['group_id'];
            foreignKeyName: 'calendar_event_participant_groups_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
      calendar_sync_dashboard: {
        Insert: {
          deleted_events?: null | number;
          end_time?: null | string;
          id?: string;
          inserted_events?: null | number;
          source?: null | string;
          start_time?: null | string;
          status?: null | string;
          triggered_by: string;
          type?: null | string;
          updated_at?: string;
          updated_events?: null | number;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['triggered_by'];
            foreignKeyName: 'calendar_sync_dashboard_triggered_by_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['triggered_by'];
            foreignKeyName: 'calendar_sync_dashboard_triggered_by_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['triggered_by'];
            foreignKeyName: 'calendar_sync_dashboard_triggered_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['triggered_by'];
            foreignKeyName: 'calendar_sync_dashboard_triggered_by_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'calendar_sync_dashboard_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'calendar_sync_dashboard_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          deleted_events: null | number;
          end_time: null | string;
          id: string;
          inserted_events: null | number;
          source: null | string;
          start_time: null | string;
          status: null | string;
          triggered_by: string;
          type: null | string;
          updated_at: string;
          updated_events: null | number;
          ws_id: string;
        };
        Update: {
          deleted_events?: null | number;
          end_time?: null | string;
          id?: string;
          inserted_events?: null | number;
          source?: null | string;
          start_time?: null | string;
          status?: null | string;
          triggered_by?: string;
          type?: null | string;
          updated_at?: string;
          updated_events?: null | number;
          ws_id?: string;
        };
      };
      calendar_sync_states: {
        Insert: {
          calendar_id?: string;
          last_synced_at?: null | string;
          sync_token?: null | string;
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
          last_synced_at: null | string;
          sync_token: null | string;
          ws_id: string;
        };
        Update: {
          calendar_id?: string;
          last_synced_at?: null | string;
          sync_token?: null | string;
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
      discord_guild_members: {
        Insert: {
          created_at?: string;
          discord_guild_id: string;
          discord_user_id: string;
          id?: string;
          platform_user_id: string;
        };
        Relationships: [
          {
            columns: ['platform_user_id'];
            foreignKeyName: 'discord_guild_members_platform_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['platform_user_id'];
            foreignKeyName: 'discord_guild_members_platform_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['platform_user_id'];
            foreignKeyName: 'discord_guild_members_platform_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['platform_user_id'];
            foreignKeyName: 'discord_guild_members_platform_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: string;
          discord_guild_id: string;
          discord_user_id: string;
          id: string;
          platform_user_id: string;
        };
        Update: {
          created_at?: string;
          discord_guild_id?: string;
          discord_user_id?: string;
          id?: string;
          platform_user_id?: string;
        };
      };
      discord_integrations: {
        Insert: {
          created_at?: string;
          creator_id?: string;
          discord_guild_id: string;
          id?: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'discord_integrations_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'discord_integrations_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'discord_integrations_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'discord_integrations_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'discord_integrations_ws_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'discord_integrations_ws_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          creator_id: string;
          discord_guild_id: string;
          id: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          discord_guild_id?: string;
          id?: string;
          ws_id?: string;
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
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
            columns: ['group_id'];
            foreignKeyName: 'external_user_monthly_report_logs_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
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
            columns: ['group_id'];
            foreignKeyName: 'external_user_monthly_reports_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
      finance_budgets: {
        Insert: {
          alert_threshold?: null | number;
          amount?: number;
          category_id?: null | string;
          created_at?: null | string;
          description?: null | string;
          end_date?: null | string;
          id?: string;
          is_active?: boolean;
          name: string;
          period?: string;
          spent?: number;
          start_date: string;
          updated_at?: null | string;
          wallet_id?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['category_id'];
            foreignKeyName: 'finance_budgets_category_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'transaction_categories';
          },
          {
            columns: ['wallet_id'];
            foreignKeyName: 'finance_budgets_wallet_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_wallets';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'finance_budgets_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'finance_budgets_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          alert_threshold: null | number;
          amount: number;
          category_id: null | string;
          created_at: null | string;
          description: null | string;
          end_date: null | string;
          id: string;
          is_active: boolean;
          name: string;
          period: string;
          spent: number;
          start_date: string;
          updated_at: null | string;
          wallet_id: null | string;
          ws_id: string;
        };
        Update: {
          alert_threshold?: null | number;
          amount?: number;
          category_id?: null | string;
          created_at?: null | string;
          description?: null | string;
          end_date?: null | string;
          id?: string;
          is_active?: boolean;
          name?: string;
          period?: string;
          spent?: number;
          start_date?: string;
          updated_at?: null | string;
          wallet_id?: null | string;
          ws_id?: string;
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
            referencedColumns: ['promo_id'];
            referencedRelation: 'v_user_referral_discounts';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['user_group_id'];
            foreignKeyName: 'public_finance_invoices_user_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
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
          {
            columns: ['user_group_id'];
            foreignKeyName: 'public_finance_invoices_user_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
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
      guest_users_lead_generation: {
        Insert: {
          created_at?: string;
          id?: number;
          mail_id: string;
          user_id: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['mail_id'];
            foreignKeyName: 'guest_users_lead_generation_mail_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'sent_emails';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'guest_users_lead_generation_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'guest_users_lead_generation_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'guest_users_lead_generation_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'guest_users_lead_generation_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'guest_users_lead_generation_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'guest_users_lead_generation_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          id: number;
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
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
          {
            columns: ['group_id'];
            foreignKeyName: 'public_healthcare_vitals_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
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
      internal_email_api_keys: {
        Insert: {
          allowed_emails?: null | string[];
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
          allowed_emails: null | string[];
          created_at: string;
          creator_id: string;
          id: string;
          user_id: string;
          value: string;
        };
        Update: {
          allowed_emails?: null | string[];
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
      link_analytics: {
        Insert: {
          browser?: null | string;
          city?: null | string;
          clicked_at?: string;
          country?: null | string;
          country_region?: null | string;
          created_at?: string;
          device_type?: null | string;
          id?: string;
          ip_address?: null | unknown;
          latitude?: null | number;
          link_id: string;
          longitude?: null | number;
          os?: null | string;
          postal_code?: null | string;
          referrer?: null | string;
          referrer_domain?: null | string;
          timezone?: null | string;
          user_agent?: null | string;
          vercel_id?: null | string;
          vercel_region?: null | string;
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
          browser: null | string;
          city: null | string;
          clicked_at: string;
          country: null | string;
          country_region: null | string;
          created_at: string;
          device_type: null | string;
          id: string;
          ip_address: null | unknown;
          latitude: null | number;
          link_id: string;
          longitude: null | number;
          os: null | string;
          postal_code: null | string;
          referrer: null | string;
          referrer_domain: null | string;
          timezone: null | string;
          user_agent: null | string;
          vercel_id: null | string;
          vercel_region: null | string;
        };
        Update: {
          browser?: null | string;
          city?: null | string;
          clicked_at?: string;
          country?: null | string;
          country_region?: null | string;
          created_at?: string;
          device_type?: null | string;
          id?: string;
          ip_address?: null | unknown;
          latitude?: null | number;
          link_id?: string;
          longitude?: null | number;
          os?: null | string;
          postal_code?: null | string;
          referrer?: null | string;
          referrer_domain?: null | string;
          timezone?: null | string;
          user_agent?: null | string;
          vercel_id?: null | string;
          vercel_region?: null | string;
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
          created_at?: null | string;
          creator_id?: null | string;
          dates: string[];
          description?: null | string;
          end_time: string;
          id?: string;
          is_confirmed?: boolean;
          is_public?: boolean;
          name?: null | string;
          start_time: string;
          where_to_meet?: boolean;
          ws_id?: null | string;
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
          created_at: null | string;
          creator_id: null | string;
          dates: string[];
          description: null | string;
          end_time: string;
          id: string;
          is_confirmed: boolean;
          is_public: boolean;
          name: null | string;
          start_time: string;
          where_to_meet: boolean;
          ws_id: null | string;
        };
        Update: {
          agenda_content?: Json | null;
          created_at?: null | string;
          creator_id?: null | string;
          dates?: string[];
          description?: null | string;
          end_time?: string;
          id?: string;
          is_confirmed?: boolean;
          is_public?: boolean;
          name?: null | string;
          start_time?: string;
          where_to_meet?: boolean;
          ws_id?: null | string;
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
      notes: {
        Insert: {
          archived?: boolean | null;
          content: Json;
          created_at?: null | string;
          creator_id?: string;
          deleted?: boolean | null;
          id?: string;
          updated_at?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'notes_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'notes_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'notes_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'notes_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'notes_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'notes_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          archived: boolean | null;
          content: Json;
          created_at: null | string;
          creator_id: string;
          deleted: boolean | null;
          id: string;
          updated_at: null | string;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          content?: Json;
          created_at?: null | string;
          creator_id?: string;
          deleted?: boolean | null;
          id?: string;
          updated_at?: null | string;
          ws_id?: string;
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
      onboarding_progress: {
        Insert: {
          completed_at?: null | string;
          completed_steps?: string[];
          created_at?: string;
          current_step?: string;
          profile_completed?: boolean;
          tour_completed?: boolean;
          updated_at?: string;
          user_id: string;
          workspace_avatar_url?: null | string;
          workspace_description?: null | string;
          workspace_name?: null | string;
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
          completed_at: null | string;
          completed_steps: string[];
          created_at: string;
          current_step: string;
          profile_completed: boolean;
          tour_completed: boolean;
          updated_at: string;
          user_id: string;
          workspace_avatar_url: null | string;
          workspace_description: null | string;
          workspace_name: null | string;
        };
        Update: {
          completed_at?: null | string;
          completed_steps?: string[];
          created_at?: string;
          current_step?: string;
          profile_completed?: boolean;
          tour_completed?: boolean;
          updated_at?: string;
          user_id?: string;
          workspace_avatar_url?: null | string;
          workspace_description?: null | string;
          workspace_name?: null | string;
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
          allow_discord_integrations?: boolean;
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
          allow_discord_integrations: boolean;
          allow_manage_all_challenges: boolean;
          allow_role_management: boolean;
          allow_workspace_creation: boolean;
          created_at: string;
          enabled: boolean;
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
          plan_id?: null | string;
          ws_id?: null | string;
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
          plan_id: null | string;
          ws_id: null | string;
        };
        Update: {
          allow_anonymous_updates?: boolean;
          created_at?: string;
          creator_id?: string;
          id?: string;
          name?: string;
          plan_id?: null | string;
          ws_id?: null | string;
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
      recording_sessions: {
        Insert: {
          created_at?: string;
          id?: string;
          meeting_id: string;
          status?: Database['public']['Enums']['recording_status'];
          updated_at?: string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['meeting_id'];
            foreignKeyName: 'recording_sessions_meeting_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_meetings';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'recording_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'recording_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'recording_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'recording_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: string;
          id: string;
          meeting_id: string;
          status: Database['public']['Enums']['recording_status'];
          updated_at: string;
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
      };
      recording_transcripts: {
        Insert: {
          created_at?: string;
          duration_in_seconds?: number;
          id?: string;
          language?: string;
          segments?: Json | null;
          session_id: string;
          text: string;
        };
        Relationships: [
          {
            columns: ['session_id'];
            foreignKeyName: 'recording_transcripts_session_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'recording_sessions';
          },
        ];
        Row: {
          created_at: string;
          duration_in_seconds: number;
          id: string;
          language: string;
          segments: Json | null;
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
      };
      recurring_transactions: {
        Insert: {
          amount: number;
          category_id?: null | string;
          created_at?: null | string;
          description?: null | string;
          end_date?: null | string;
          frequency?: Database['public']['Enums']['recurring_frequency'];
          id?: string;
          is_active?: boolean;
          last_occurrence?: null | string;
          name: string;
          next_occurrence: string;
          start_date: string;
          updated_at?: null | string;
          wallet_id: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['category_id'];
            foreignKeyName: 'recurring_transactions_category_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'transaction_categories';
          },
          {
            columns: ['wallet_id'];
            foreignKeyName: 'recurring_transactions_wallet_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_wallets';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'recurring_transactions_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'recurring_transactions_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          amount: number;
          category_id: null | string;
          created_at: null | string;
          description: null | string;
          end_date: null | string;
          frequency: Database['public']['Enums']['recurring_frequency'];
          id: string;
          is_active: boolean;
          last_occurrence: null | string;
          name: string;
          next_occurrence: string;
          start_date: string;
          updated_at: null | string;
          wallet_id: string;
          ws_id: string;
        };
        Update: {
          amount?: number;
          category_id?: null | string;
          created_at?: null | string;
          description?: null | string;
          end_date?: null | string;
          frequency?: Database['public']['Enums']['recurring_frequency'];
          id?: string;
          is_active?: boolean;
          last_occurrence?: null | string;
          name?: string;
          next_occurrence?: string;
          start_date?: string;
          updated_at?: null | string;
          wallet_id?: string;
          ws_id?: string;
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
          post_id: null | string;
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
          post_id?: null | string;
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
          creator_id?: null | string;
          email: string;
          id?: string;
          images?: null | string[];
          is_read?: boolean;
          is_resolved?: boolean;
          message: string;
          name: string;
          product?: Database['public']['Enums']['product'];
          subject: string;
          type?: Database['public']['Enums']['support_type'];
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'fk_support_inquiries_creator_id';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'fk_support_inquiries_creator_id';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'fk_support_inquiries_creator_id';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'fk_support_inquiries_creator_id';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
        ];
        Row: {
          created_at: string;
          creator_id: null | string;
          email: string;
          id: string;
          images: null | string[];
          is_read: boolean;
          is_resolved: boolean;
          message: string;
          name: string;
          product: Database['public']['Enums']['product'];
          subject: string;
          type: Database['public']['Enums']['support_type'];
        };
        Update: {
          created_at?: string;
          creator_id?: null | string;
          email?: string;
          id?: string;
          images?: null | string[];
          is_read?: boolean;
          is_resolved?: boolean;
          message?: string;
          name?: string;
          product?: Database['public']['Enums']['product'];
          subject?: string;
          type?: Database['public']['Enums']['support_type'];
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
      task_board_status_templates: {
        Insert: {
          created_at?: null | string;
          description?: null | string;
          id?: string;
          is_default?: boolean | null;
          name: string;
          statuses: Json;
          updated_at?: null | string;
        };
        Relationships: [];
        Row: {
          created_at: null | string;
          description: null | string;
          id: string;
          is_default: boolean | null;
          name: string;
          statuses: Json;
          updated_at: null | string;
        };
        Update: {
          created_at?: null | string;
          description?: null | string;
          id?: string;
          is_default?: boolean | null;
          name?: string;
          statuses?: Json;
          updated_at?: null | string;
        };
      };
      task_cycle_tasks: {
        Insert: {
          created_at?: null | string;
          cycle_id: string;
          task_id: string;
        };
        Relationships: [
          {
            columns: ['cycle_id'];
            foreignKeyName: 'task_cycle_tasks_cycle_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'task_cycles';
          },
          {
            columns: ['task_id'];
            foreignKeyName: 'task_cycle_tasks_task_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'tasks';
          },
        ];
        Row: {
          created_at: null | string;
          cycle_id: string;
          task_id: string;
        };
        Update: {
          created_at?: null | string;
          cycle_id?: string;
          task_id?: string;
        };
      };
      task_cycles: {
        Insert: {
          archived?: boolean | null;
          created_at?: null | string;
          creator_id?: string;
          deleted?: boolean | null;
          description?: null | string;
          end_date?: null | string;
          id?: string;
          name: string;
          start_date?: null | string;
          status?: null | string;
          updated_at?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_cycles_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_cycles_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_cycles_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_cycles_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'task_cycles_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'task_cycles_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          archived: boolean | null;
          created_at: null | string;
          creator_id: string;
          deleted: boolean | null;
          description: null | string;
          end_date: null | string;
          id: string;
          name: string;
          start_date: null | string;
          status: null | string;
          updated_at: null | string;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          created_at?: null | string;
          creator_id?: string;
          deleted?: boolean | null;
          description?: null | string;
          end_date?: null | string;
          id?: string;
          name?: string;
          start_date?: null | string;
          status?: null | string;
          updated_at?: null | string;
          ws_id?: string;
        };
      };
      task_initiatives: {
        Insert: {
          archived?: boolean | null;
          created_at?: null | string;
          creator_id?: string;
          deleted?: boolean | null;
          description?: null | string;
          id?: string;
          name: string;
          status?: null | string;
          updated_at?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_initiatives_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_initiatives_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_initiatives_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_initiatives_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'task_initiatives_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'task_initiatives_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          archived: boolean | null;
          created_at: null | string;
          creator_id: string;
          deleted: boolean | null;
          description: null | string;
          id: string;
          name: string;
          status: null | string;
          updated_at: null | string;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          created_at?: null | string;
          creator_id?: string;
          deleted?: boolean | null;
          description?: null | string;
          id?: string;
          name?: string;
          status?: null | string;
          updated_at?: null | string;
          ws_id?: string;
        };
      };
      task_labels: {
        Insert: {
          label_id: string;
          task_id: string;
        };
        Relationships: [
          {
            columns: ['label_id'];
            foreignKeyName: 'task_labels_label_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_task_labels';
          },
          {
            columns: ['task_id'];
            foreignKeyName: 'task_labels_task_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'tasks';
          },
        ];
        Row: {
          label_id: string;
          task_id: string;
        };
        Update: {
          label_id?: string;
          task_id?: string;
        };
      };
      task_lists: {
        Insert: {
          archived?: boolean | null;
          board_id: string;
          color?: null | string;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          id?: string;
          name?: null | string;
          position?: null | number;
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
          color: null | string;
          created_at: null | string;
          creator_id: null | string;
          deleted: boolean | null;
          id: string;
          name: null | string;
          position: null | number;
          status: Database['public']['Enums']['task_board_status'] | null;
        };
        Update: {
          archived?: boolean | null;
          board_id?: string;
          color?: null | string;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          id?: string;
          name?: null | string;
          position?: null | number;
          status?: Database['public']['Enums']['task_board_status'] | null;
        };
      };
      task_project_initiatives: {
        Insert: {
          created_at?: null | string;
          initiative_id: string;
          project_id: string;
        };
        Relationships: [
          {
            columns: ['initiative_id'];
            foreignKeyName: 'task_project_initiatives_initiative_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'task_initiatives';
          },
          {
            columns: ['project_id'];
            foreignKeyName: 'task_project_initiatives_project_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'task_projects';
          },
        ];
        Row: {
          created_at: null | string;
          initiative_id: string;
          project_id: string;
        };
        Update: {
          created_at?: null | string;
          initiative_id?: string;
          project_id?: string;
        };
      };
      task_project_tasks: {
        Insert: {
          created_at?: null | string;
          project_id: string;
          task_id: string;
        };
        Relationships: [
          {
            columns: ['project_id'];
            foreignKeyName: 'task_project_tasks_project_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'task_projects';
          },
          {
            columns: ['task_id'];
            foreignKeyName: 'task_project_tasks_task_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'tasks';
          },
        ];
        Row: {
          created_at: null | string;
          project_id: string;
          task_id: string;
        };
        Update: {
          created_at?: null | string;
          project_id?: string;
          task_id?: string;
        };
      };
      task_projects: {
        Insert: {
          archived?: boolean | null;
          created_at?: null | string;
          creator_id?: string;
          deleted?: boolean | null;
          description?: null | string;
          id?: string;
          name: string;
          status?: null | string;
          updated_at?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_projects_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_projects_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_projects_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'task_projects_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'task_projects_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'task_projects_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          archived: boolean | null;
          created_at: null | string;
          creator_id: string;
          deleted: boolean | null;
          description: null | string;
          id: string;
          name: string;
          status: null | string;
          updated_at: null | string;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          created_at?: null | string;
          creator_id?: string;
          deleted?: boolean | null;
          description?: null | string;
          id?: string;
          name?: string;
          status?: null | string;
          updated_at?: null | string;
          ws_id?: string;
        };
      };
      tasks: {
        Insert: {
          archived?: boolean | null;
          calendar_hours?: Database['public']['Enums']['calendar_hours'] | null;
          completed?: boolean | null;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          description?: null | string;
          description_yjs_state?: null | number[];
          embedding?: null | string;
          end_date?: null | string;
          estimation_points?: null | number;
          fts?: null | unknown;
          id?: string;
          is_splittable?: boolean | null;
          list_id?: null | string;
          max_split_duration_minutes?: null | number;
          min_split_duration_minutes?: null | number;
          name: string;
          priority?: Database['public']['Enums']['task_priority'] | null;
          sort_key?: null | number;
          start_date?: null | string;
          total_duration?: null | number;
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
          created_at: null | string;
          creator_id: null | string;
          deleted: boolean | null;
          description: null | string;
          description_yjs_state: null | number[];
          embedding: null | string;
          end_date: null | string;
          estimation_points: null | number;
          fts: null | unknown;
          id: string;
          is_splittable: boolean | null;
          list_id: null | string;
          max_split_duration_minutes: null | number;
          min_split_duration_minutes: null | number;
          name: string;
          priority: Database['public']['Enums']['task_priority'] | null;
          sort_key: null | number;
          start_date: null | string;
          total_duration: null | number;
        };
        Update: {
          archived?: boolean | null;
          calendar_hours?: Database['public']['Enums']['calendar_hours'] | null;
          completed?: boolean | null;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          description?: null | string;
          description_yjs_state?: null | number[];
          embedding?: null | string;
          end_date?: null | string;
          estimation_points?: null | number;
          fts?: null | unknown;
          id?: string;
          is_splittable?: boolean | null;
          list_id?: null | string;
          max_split_duration_minutes?: null | number;
          min_split_duration_minutes?: null | number;
          name?: string;
          priority?: Database['public']['Enums']['task_priority'] | null;
          sort_key?: null | number;
          start_date?: null | string;
          total_duration?: null | number;
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
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_goals_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_goals_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_goals_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_goals_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
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
          date?: null | string;
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
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
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
          category_id: null | string;
          created_at: null | string;
          date: null | string;
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
          was_resumed: boolean;
          ws_id: string;
        };
        Update: {
          category_id?: null | string;
          created_at?: null | string;
          date?: null | string;
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
          was_resumed?: boolean;
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
      transaction_tags: {
        Insert: {
          color?: string;
          created_at?: null | string;
          description?: null | string;
          id?: string;
          name: string;
          updated_at?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'transaction_tags_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'transaction_tags_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          color: string;
          created_at: null | string;
          description: null | string;
          id: string;
          name: string;
          updated_at: null | string;
          ws_id: string;
        };
        Update: {
          color?: string;
          created_at?: null | string;
          description?: null | string;
          id?: string;
          name?: string;
          updated_at?: null | string;
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
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
            columns: ['group_id'];
            foreignKeyName: 'user_feedbacks_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
          },
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
            columns: ['group_id'];
            foreignKeyName: 'user_group_attendance_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
      user_group_linked_products: {
        Insert: {
          created_at?: string;
          group_id: string;
          product_id: string;
          unit_id: string;
          warehouse_id?: null | string;
        };
        Relationships: [
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
          },
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
            columns: ['group_id'];
            foreignKeyName: 'user_group_linked_products_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
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
          {
            columns: ['warehouse_id'];
            foreignKeyName: 'user_group_linked_products_warehouse_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'inventory_warehouses';
          },
        ];
        Row: {
          created_at: string;
          group_id: string;
          product_id: string;
          unit_id: string;
          warehouse_id: null | string;
        };
        Update: {
          created_at?: string;
          group_id?: string;
          product_id?: string;
          unit_id?: string;
          warehouse_id?: null | string;
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_posts_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
          },
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
          {
            columns: ['group_id'];
            foreignKeyName: 'user_group_posts_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
          indicator_id: string;
          user_id: string;
          value: null | number;
        };
        Update: {
          created_at?: string;
          creator_id?: null | string;
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
            referencedColumns: ['promo_id'];
            referencedRelation: 'v_user_referral_discounts';
          },
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
          avatar_url: null | string;
          bio: null | string;
          created_at: null | string;
          deleted: boolean | null;
          display_name: null | string;
          handle: null | string;
          id: string;
          services: Database['public']['Enums']['platform_service'][];
        };
        Update: {
          avatar_url?: null | string;
          bio?: null | string;
          created_at?: null | string;
          deleted?: boolean | null;
          display_name?: null | string;
          handle?: null | string;
          id?: string;
          services?: Database['public']['Enums']['platform_service'][];
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
      wallet_transaction_tags: {
        Insert: {
          created_at?: null | string;
          tag_id: string;
          transaction_id: string;
        };
        Relationships: [
          {
            columns: ['tag_id'];
            foreignKeyName: 'wallet_transaction_tags_tag_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'transaction_tags';
          },
          {
            columns: ['transaction_id'];
            foreignKeyName: 'wallet_transaction_tags_transaction_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'wallet_transactions';
          },
        ];
        Row: {
          created_at: null | string;
          tag_id: string;
          transaction_id: string;
        };
        Update: {
          created_at?: null | string;
          tag_id?: string;
          transaction_id?: string;
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
          allow_zero_estimates?: boolean;
          archived?: boolean | null;
          count_unestimated_issues?: boolean;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          estimation_type?:
            | Database['public']['Enums']['estimation_type']
            | null;
          extended_estimation?: boolean;
          id?: string;
          name?: null | string;
          template_id?: null | string;
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
          allow_zero_estimates: boolean;
          archived: boolean | null;
          count_unestimated_issues: boolean;
          created_at: null | string;
          creator_id: null | string;
          deleted: boolean | null;
          estimation_type:
            | Database['public']['Enums']['estimation_type']
            | null;
          extended_estimation: boolean;
          id: string;
          name: null | string;
          template_id: null | string;
          ws_id: string;
        };
        Update: {
          allow_zero_estimates?: boolean;
          archived?: boolean | null;
          count_unestimated_issues?: boolean;
          created_at?: null | string;
          creator_id?: null | string;
          deleted?: boolean | null;
          estimation_type?:
            | Database['public']['Enums']['estimation_type']
            | null;
          extended_estimation?: boolean;
          id?: string;
          name?: null | string;
          template_id?: null | string;
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
          start_at: string;
          task_id?: null | string;
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
          color: null | string;
          created_at: null | string;
          description: string;
          end_at: string;
          google_event_id: null | string;
          id: string;
          location: null | string;
          locked: boolean;
          start_at: string;
          task_id: null | string;
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
          start_at?: string;
          task_id?: null | string;
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
          created_at?: null | string;
          last_upsert?: string;
          updated_at?: null | string;
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
          created_at: null | string;
          last_upsert: string;
          updated_at: null | string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          last_upsert?: string;
          updated_at?: null | string;
          ws_id?: string;
        };
      };
      workspace_calendar_sync_log: {
        Insert: {
          created_at?: string;
          deleted_events?: Json | null;
          error_message?: null | string;
          event_snapshot_before: Json;
          google_account_email?: null | string;
          id?: string;
          status: string;
          sync_ended_at?: null | string;
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
          error_message: null | string;
          event_snapshot_before: Json;
          google_account_email: null | string;
          id: string;
          status: string;
          sync_ended_at: null | string;
          sync_started_at: string;
          triggered_by: string;
          upserted_events: Json | null;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          deleted_events?: Json | null;
          error_message?: null | string;
          event_snapshot_before?: Json;
          google_account_email?: null | string;
          id?: string;
          status?: string;
          sync_ended_at?: null | string;
          sync_started_at?: string;
          triggered_by?: string;
          upserted_events?: Json | null;
          ws_id?: string;
        };
      };
      workspace_chat_channels: {
        Insert: {
          created_at?: null | string;
          created_by?: null | string;
          description?: null | string;
          id?: string;
          is_private?: boolean | null;
          name: string;
          updated_at?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_chat_channels_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_chat_channels_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: null | string;
          created_by: null | string;
          description: null | string;
          id: string;
          is_private: boolean | null;
          name: string;
          updated_at: null | string;
          ws_id: string;
        };
        Update: {
          created_at?: null | string;
          created_by?: null | string;
          description?: null | string;
          id?: string;
          is_private?: boolean | null;
          name?: string;
          updated_at?: null | string;
          ws_id?: string;
        };
      };
      workspace_chat_messages: {
        Insert: {
          channel_id: string;
          content: string;
          created_at?: null | string;
          deleted_at?: null | string;
          id?: string;
          updated_at?: null | string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['channel_id'];
            foreignKeyName: 'workspace_chat_messages_channel_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_chat_channels';
          },
        ];
        Row: {
          channel_id: string;
          content: string;
          created_at: null | string;
          deleted_at: null | string;
          id: string;
          updated_at: null | string;
          user_id: string;
        };
        Update: {
          channel_id?: string;
          content?: string;
          created_at?: null | string;
          deleted_at?: null | string;
          id?: string;
          updated_at?: null | string;
          user_id?: string;
        };
      };
      workspace_chat_participants: {
        Insert: {
          channel_id: string;
          id?: string;
          joined_at?: null | string;
          last_read_at?: null | string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['channel_id'];
            foreignKeyName: 'workspace_chat_participants_channel_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_chat_channels';
          },
        ];
        Row: {
          channel_id: string;
          id: string;
          joined_at: null | string;
          last_read_at: null | string;
          user_id: string;
        };
        Update: {
          channel_id?: string;
          id?: string;
          joined_at?: null | string;
          last_read_at?: null | string;
          user_id?: string;
        };
      };
      workspace_chat_typing_indicators: {
        Insert: {
          channel_id: string;
          id?: string;
          updated_at?: null | string;
          user_id: string;
        };
        Relationships: [
          {
            columns: ['channel_id'];
            foreignKeyName: 'workspace_chat_typing_indicators_channel_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_chat_channels';
          },
        ];
        Row: {
          channel_id: string;
          id: string;
          updated_at: null | string;
          user_id: string;
        };
        Update: {
          channel_id?: string;
          id?: string;
          updated_at?: null | string;
          user_id?: string;
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
          cert_template?: Database['public']['Enums']['certificate_templates'];
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
          description: null | string;
          id: string;
          is_public: boolean;
          is_published: boolean;
          name: string;
          ws_id: string;
        };
        Update: {
          cert_template?: Database['public']['Enums']['certificate_templates'];
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
      workspace_education_access_requests: {
        Insert: {
          admin_notes?: null | string;
          created_at?: string;
          creator_id: string;
          feature?: Database['public']['Enums']['feature_flag'];
          id?: string;
          message: string;
          reviewed_at?: null | string;
          reviewed_by?: null | string;
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
          admin_notes: null | string;
          created_at: string;
          creator_id: string;
          feature: Database['public']['Enums']['feature_flag'];
          id: string;
          message: string;
          reviewed_at: null | string;
          reviewed_by: null | string;
          status: string;
          updated_at: string;
          workspace_name: string;
          ws_id: string;
        };
        Update: {
          admin_notes?: null | string;
          created_at?: string;
          creator_id?: string;
          feature?: Database['public']['Enums']['feature_flag'];
          id?: string;
          message?: string;
          reviewed_at?: null | string;
          reviewed_by?: null | string;
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
      workspace_meetings: {
        Insert: {
          created_at?: string;
          creator_id: string;
          id?: string;
          name: string;
          time?: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_meetings_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_meetings_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_meetings_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_meetings_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_meetings_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_meetings_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          creator_id: string;
          id: string;
          name: string;
          time: string;
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
          owner_id?: null | string;
          promo_type?: Database['public']['Enums']['promotion_type'];
          use_ratio?: boolean;
          value: number;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['owner_id'];
            foreignKeyName: 'fk_workspace_promotions_owner';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['owner_id'];
            foreignKeyName: 'fk_workspace_promotions_owner';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
          },
          {
            columns: ['owner_id'];
            foreignKeyName: 'fk_workspace_promotions_owner';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['owner_id'];
            foreignKeyName: 'fk_workspace_promotions_owner';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
          code: null | string;
          created_at: string;
          creator_id: null | string;
          description: null | string;
          id: string;
          name: null | string;
          owner_id: null | string;
          promo_type: Database['public']['Enums']['promotion_type'];
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
          owner_id?: null | string;
          promo_type?: Database['public']['Enums']['promotion_type'];
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
          completed_at?: null | string;
          duration_seconds?: null | number;
          id?: string;
          set_id: string;
          started_at?: string;
          submitted_at?: string;
          total_score?: null | number;
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
          completed_at: null | string;
          duration_seconds: null | number;
          id: string;
          set_id: string;
          started_at: string;
          submitted_at: string;
          total_score: null | number;
          user_id: string;
        };
        Update: {
          attempt_number?: number;
          completed_at?: null | string;
          duration_seconds?: null | number;
          id?: string;
          set_id?: string;
          started_at?: string;
          submitted_at?: string;
          total_score?: null | number;
          user_id?: string;
        };
      };
      workspace_quiz_sets: {
        Insert: {
          allow_view_old_attempts?: boolean;
          allow_view_results?: boolean;
          attempt_limit?: null | number;
          available_date?: string;
          created_at?: string;
          due_date?: string;
          explanation_mode?: number;
          id?: string;
          instruction?: Json | null;
          name?: string;
          results_released?: boolean;
          time_limit_minutes?: null | number;
          ws_id?: null | string;
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
          attempt_limit: null | number;
          available_date: string;
          created_at: string;
          due_date: string;
          explanation_mode: number;
          id: string;
          instruction: Json | null;
          name: string;
          results_released: boolean;
          time_limit_minutes: null | number;
          ws_id: null | string;
        };
        Update: {
          allow_view_old_attempts?: boolean;
          allow_view_results?: boolean;
          attempt_limit?: null | number;
          available_date?: string;
          created_at?: string;
          due_date?: string;
          explanation_mode?: number;
          id?: string;
          instruction?: Json | null;
          name?: string;
          results_released?: boolean;
          time_limit_minutes?: null | number;
          ws_id?: null | string;
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
          value?: null | string;
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
      workspace_settings: {
        Insert: {
          created_at?: string;
          guest_user_checkup_threshold?: null | number;
          referral_count_cap?: number;
          referral_increment_percent?: number;
          referral_promotion_id?: null | string;
          updated_at?: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['ws_id', 'referral_promotion_id'];
            foreignKeyName: 'workspace_settings_referral_promo_fkey';
            isOneToOne: false;
            referencedColumns: ['ws_id', 'promo_id'];
            referencedRelation: 'v_user_referral_discounts';
          },
          {
            columns: ['ws_id', 'referral_promotion_id'];
            foreignKeyName: 'workspace_settings_referral_promo_fkey';
            isOneToOne: false;
            referencedColumns: ['ws_id', 'id'];
            referencedRelation: 'workspace_promotions';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_settings_ws_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_settings_ws_id_fkey';
            isOneToOne: true;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          created_at: string;
          guest_user_checkup_threshold: null | number;
          referral_count_cap: number;
          referral_increment_percent: number;
          referral_promotion_id: null | string;
          updated_at: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          guest_user_checkup_threshold?: null | number;
          referral_count_cap?: number;
          referral_increment_percent?: number;
          referral_promotion_id?: null | string;
          updated_at?: string;
          ws_id?: string;
        };
      };
      workspace_subscription: {
        Insert: {
          cancel_at_period_end?: boolean | null;
          created_at?: string;
          current_period_end?: null | string;
          current_period_start?: null | string;
          id?: string;
          polar_subscription_id: string;
          product_id?: null | string;
          status?: Database['public']['Enums']['subscription_status'] | null;
          updated_at?: null | string;
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
          current_period_end: null | string;
          current_period_start: null | string;
          id: string;
          polar_subscription_id: string;
          product_id: null | string;
          status: Database['public']['Enums']['subscription_status'] | null;
          updated_at: null | string;
          ws_id: string;
        };
        Update: {
          cancel_at_period_end?: boolean | null;
          created_at?: string;
          current_period_end?: null | string;
          current_period_start?: null | string;
          id?: string;
          polar_subscription_id?: string;
          product_id?: null | string;
          status?: Database['public']['Enums']['subscription_status'] | null;
          updated_at?: null | string;
          ws_id?: string;
        };
      };
      workspace_subscription_products: {
        Insert: {
          created_at?: string;
          description?: null | string;
          id: string;
          name?: null | string;
          price?: null | number;
          recurring_interval?: null | string;
        };
        Relationships: [];
        Row: {
          created_at: string;
          description: null | string;
          id: string;
          name: null | string;
          price: null | number;
          recurring_interval: null | string;
        };
        Update: {
          created_at?: string;
          description?: null | string;
          id?: string;
          name?: null | string;
          price?: null | number;
          recurring_interval?: null | string;
        };
      };
      workspace_task_labels: {
        Insert: {
          color: string;
          created_at?: string;
          creator_id?: null | string;
          id?: string;
          name: string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_task_labels_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_task_labels_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_task_labels_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['creator_id'];
            foreignKeyName: 'workspace_task_labels_creator_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_task_labels_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_link_counts';
          },
          {
            columns: ['ws_id'];
            foreignKeyName: 'workspace_task_labels_ws_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspaces';
          },
        ];
        Row: {
          color: string;
          created_at: string;
          creator_id: null | string;
          id: string;
          name: string;
          ws_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          creator_id?: null | string;
          id?: string;
          name?: string;
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
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
          },
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
            columns: ['group_id'];
            foreignKeyName: 'public_workspace_user_group_tag_groups_group_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
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
          is_guest?: boolean | null;
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
          created_at: null | string;
          ending_date: null | string;
          id: string;
          is_guest: boolean | null;
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
          is_guest?: boolean | null;
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
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
          },
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
            columns: ['group_id'];
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
          referred_by?: null | string;
          updated_at?: string;
          updated_by?: null | string;
          ws_id: string;
        };
        Relationships: [
          {
            columns: ['referred_by'];
            foreignKeyName: 'fk_workspace_users_referred_by';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['referred_by'];
            foreignKeyName: 'fk_workspace_users_referred_by';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
          },
          {
            columns: ['referred_by'];
            foreignKeyName: 'fk_workspace_users_referred_by';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['referred_by'];
            foreignKeyName: 'fk_workspace_users_referred_by';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users_with_groups';
          },
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
          referred_by: null | string;
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
          referred_by?: null | string;
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
      workspace_whiteboards: {
        Insert: {
          created_at?: string;
          creator_id: string;
          description?: null | string;
          id?: string;
          snapshot?: Json | null;
          thumbnail_url?: null | string;
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
          description: null | string;
          id: string;
          snapshot: Json | null;
          thumbnail_url: null | string;
          title: string;
          updated_at: string;
          ws_id: string;
        };
        Update: {
          created_at?: string;
          creator_id?: string;
          description?: null | string;
          id?: string;
          snapshot?: Json | null;
          thumbnail_url?: null | string;
          title?: string;
          updated_at?: string;
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
          personal?: boolean;
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
          avatar_url: null | string;
          created_at: null | string;
          creator_id: null | string;
          deleted: boolean | null;
          handle: null | string;
          id: string;
          logo_url: null | string;
          name: null | string;
          personal: boolean;
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
          personal?: boolean;
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
          table_name?: null | unknown;
          ts?: null | string;
          ws_id?: never;
        };
        Relationships: [];
        Row: {
          auth_role: null | string;
          auth_uid: null | string;
          id: null | number;
          old_record: Json | null;
          old_record_id: null | string;
          op: 'DELETE' | 'INSERT' | 'TRUNCATE' | 'UPDATE' | null;
          record: Json | null;
          record_id: null | string;
          table_name: null | unknown;
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
          table_name?: null | unknown;
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
      group_user_with_attendance: {
        Relationships: [
          {
            columns: ['post_id'];
            foreignKeyName: 'user_group_post_checks_post_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_group_posts';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_users_with_post_checks';
          },
          {
            columns: ['group_id'];
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            isOneToOne: false;
            referencedColumns: ['group_id'];
            referencedRelation: 'group_with_attendance';
          },
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
            columns: ['group_id'];
            foreignKeyName: 'workspace_user_roles_users_role_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_user_groups_with_guest';
          },
        ];
        Row: {
          attendance_count: null | number;
          full_name: null | string;
          group_id: null | string;
          is_completed: boolean | null;
          post_id: null | string;
          user_id: null | string;
        };
      };
      group_users_with_post_checks: {
        Relationships: [
          {
            columns: ['post_id'];
            foreignKeyName: 'user_group_post_checks_post_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'user_group_posts';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
          attendance_count: null | number;
          email: null | string;
          full_name: null | string;
          gender: null | string;
          group_id: null | string;
          is_completed: boolean | null;
          phone: null | string;
          post_id: null | string;
          user_id: null | string;
          ws_id: null | string;
        };
      };
      group_with_attendance: {
        Relationships: [
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
          attendance_count: null | number;
          email: null | string;
          full_name: null | string;
          gender: null | string;
          group_id: null | string;
          phone: null | string;
          user_id: null | string;
          ws_id: null | string;
        };
      };
      link_analytics_device_insights: {
        Relationships: [];
        Row: {
          browser: null | string;
          click_count: null | number;
          device_type: null | string;
          domain: null | string;
          first_click_at: null | string;
          last_click_at: null | string;
          link_id: null | string;
          os: null | string;
          slug: null | string;
          unique_visitors: null | number;
        };
      };
      link_analytics_geo_insights: {
        Relationships: [];
        Row: {
          city: null | string;
          click_count: null | number;
          country: null | string;
          country_region: null | string;
          domain: null | string;
          first_click_at: null | string;
          last_click_at: null | string;
          latitude: null | number;
          link_id: null | string;
          longitude: null | number;
          postal_code: null | string;
          slug: null | string;
          timezone: null | string;
          unique_visitors: null | number;
          vercel_region: null | string;
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
          creator_id: null | string;
          domain: null | string;
          first_click_at: null | string;
          last_click_at: null | string;
          link_created_at: null | string;
          link_id: null | string;
          original_url: null | string;
          slug: null | string;
          top_browser: null | string;
          top_city: null | string;
          top_country: null | string;
          top_device_type: null | string;
          top_os: null | string;
          top_referrer_domain: null | string;
          top_vercel_region: null | string;
          total_clicks: null | number;
          unique_browsers: null | number;
          unique_cities: null | number;
          unique_countries: null | number;
          unique_device_types: null | number;
          unique_operating_systems: null | number;
          unique_referrers: null | number;
          unique_visitors: null | number;
          ws_id: null | string;
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
      shortened_links_creator_stats: {
        Relationships: [];
        Row: {
          avatar_url: null | string;
          display_name: null | string;
          domain_count: null | number;
          email: null | string;
          first_link_created: null | string;
          id: null | string;
          last_link_created: null | string;
          link_count: null | number;
        };
      };
      shortened_links_domain_stats: {
        Relationships: [];
        Row: {
          creator_count: null | number;
          domain: null | string;
          first_created: null | string;
          last_created: null | string;
          link_count: null | number;
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
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_challenge_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'nova_user_leaderboard';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'shortened_links_creator_stats';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'time_tracking_sessions_user_id_fkey';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'users';
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
          was_resumed: boolean | null;
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
      v_user_referral_discounts: {
        Relationships: [
          {
            columns: ['user_id'];
            foreignKeyName: 'fk_workspace_promotions_owner';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'distinct_invoice_creators';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'fk_workspace_promotions_owner';
            isOneToOne: false;
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'fk_workspace_promotions_owner';
            isOneToOne: false;
            referencedColumns: ['id'];
            referencedRelation: 'workspace_users';
          },
          {
            columns: ['user_id'];
            foreignKeyName: 'fk_workspace_promotions_owner';
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
          calculated_discount_value: null | number;
          promo_code: null | string;
          promo_id: null | string;
          user_id: null | string;
          ws_id: null | string;
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
      workspace_link_counts: {
        Relationships: [];
        Row: {
          id: null | string;
          link_count: null | number;
          logo_url: null | string;
          name: null | string;
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
      workspace_user_groups_with_guest: {
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
          amount: null | number;
          archived: boolean | null;
          created_at: null | string;
          ending_date: null | string;
          id: null | string;
          is_guest: boolean | null;
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
            referencedColumns: ['user_id'];
            referencedRelation: 'group_user_with_attendance';
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
      calendar_hours: ['meeting_hours', 'personal_hours', 'work_hours'],
      certificate_templates: ['elegant', 'modern', 'original'],
      chat_role: ['ASSISTANT', 'FUNCTION', 'SYSTEM', 'USER'],
      dataset_type: ['csv', 'excel', 'html'],
      estimation_type: ['exponential', 'fibonacci', 'linear', 't-shirt'],
      feature_flag: [
        'ENABLE_AI',
        'ENABLE_CHALLENGES',
        'ENABLE_EDUCATION',
        'ENABLE_QUIZZES',
      ],
      platform_service: ['NOVA', 'REWISE', 'TUTURUUU', 'UPSKII'],
      product: [
        'calendar',
        'drive',
        'finance',
        'mail',
        'nova',
        'other',
        'qr',
        'rewise',
        'shortener',
        'tudo',
        'tumeet',
        'web',
      ],
      promotion_type: ['REFERRAL', 'REGULAR'],
      recording_status: [
        'completed',
        'failed',
        'interrupted',
        'pending_transcription',
        'recording',
        'transcribing',
      ],
      recurring_frequency: ['daily', 'monthly', 'weekly', 'yearly'],
      subscription_status: ['active', 'canceled', 'past_due', 'trialing'],
      support_type: ['bug', 'feature-request', 'job-application', 'support'],
      task_board_status: ['active', 'closed', 'done', 'not_started'],
      task_priority: ['critical', 'high', 'low', 'normal'],
      workspace_api_key_scope: [
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-2.0-pro',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.5-pro',
      ],
      workspace_role_permission: [
        'ai_chat',
        'ai_lab',
        'check_user_attendance',
        'create_inventory',
        'create_invoices',
        'create_transactions',
        'create_user_groups',
        'create_user_groups_scores',
        'create_users',
        'delete_inventory',
        'delete_invoices',
        'delete_transactions',
        'delete_user_groups',
        'delete_user_groups_scores',
        'delete_users',
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
        'update_inventory',
        'update_invoices',
        'update_transactions',
        'update_user_groups',
        'update_user_groups_scores',
        'update_users',
        'view_finance_stats',
        'view_infrastructure',
        'view_inventory',
        'view_invoices',
        'view_transactions',
        'view_user_groups',
        'view_user_groups_scores',
        'view_users_private_info',
        'view_users_public_info',
      ],
    },
  },
} as const;
