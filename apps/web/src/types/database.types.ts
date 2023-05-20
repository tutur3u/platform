export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

export interface Database {
  audit: {
    Tables: {
      record_version: {
        Row: {
          auth_role: string | null;
          auth_uid: string | null;
          id: number;
          old_record: Json | null;
          old_record_id: string | null;
          op: Database['audit']['Enums']['operation'];
          record: Json | null;
          record_id: string | null;
          table_name: unknown;
          table_oid: unknown;
          table_schema: unknown;
          ts: string;
          ws_id: string | null;
        };
        Insert: {
          auth_role?: string | null;
          auth_uid?: string | null;
          id?: number;
          old_record?: Json | null;
          old_record_id?: string | null;
          op: Database['audit']['Enums']['operation'];
          record?: Json | null;
          record_id?: string | null;
          table_name: unknown;
          table_oid: unknown;
          table_schema: unknown;
          ts?: string;
          ws_id?: string | null;
        };
        Update: {
          auth_role?: string | null;
          auth_uid?: string | null;
          id?: number;
          old_record?: Json | null;
          old_record_id?: string | null;
          op?: Database['audit']['Enums']['operation'];
          record?: Json | null;
          record_id?: string | null;
          table_name?: unknown;
          table_oid?: unknown;
          table_schema?: unknown;
          ts?: string;
          ws_id?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      disable_tracking: {
        Args: {
          '': unknown;
        };
        Returns: undefined;
      };
      enable_tracking: {
        Args: {
          '': unknown;
        };
        Returns: undefined;
      };
      primary_key_columns: {
        Args: {
          entity_oid: unknown;
        };
        Returns: string[];
      };
      to_record_id: {
        Args: {
          entity_oid: unknown;
          pkey_cols: string[];
          rec: Json;
        };
        Returns: string;
      };
    };
    Enums: {
      operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'TRUNCATE';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          operationName?: string;
          query?: string;
          variables?: Json;
          extensions?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
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
      };
      finance_invoice_products: {
        Row: {
          amount: number;
          created_at: string | null;
          invoice_id: string;
          price: number;
          product_id: string;
          total_diff: number;
          unit_id: string;
          warehouse_id: string;
        };
        Insert: {
          amount: number;
          created_at?: string | null;
          invoice_id: string;
          price: number;
          product_id: string;
          total_diff?: number;
          unit_id: string;
          warehouse_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string | null;
          invoice_id?: string;
          price?: number;
          product_id?: string;
          total_diff?: number;
          unit_id?: string;
          warehouse_id?: string;
        };
      };
      finance_invoices: {
        Row: {
          completed_at: string | null;
          created_at: string | null;
          creator_id: string;
          customer_id: string | null;
          id: string;
          note: string | null;
          notice: string | null;
          price: number;
          total_diff: number;
          transaction_id: string;
          ws_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string | null;
          creator_id: string;
          customer_id?: string | null;
          id?: string;
          note?: string | null;
          notice?: string | null;
          price: number;
          total_diff?: number;
          transaction_id: string;
          ws_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string | null;
          creator_id?: string;
          customer_id?: string | null;
          id?: string;
          note?: string | null;
          notice?: string | null;
          price?: number;
          total_diff?: number;
          transaction_id?: string;
          ws_id?: string;
        };
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
      };
      healthcare_vitals: {
        Row: {
          created_at: string | null;
          id: string;
          name: string;
          unit: string | null;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name: string;
          unit?: string | null;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string;
          unit?: string | null;
          ws_id?: string;
        };
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
      };
      inventory_products: {
        Row: {
          amount: number;
          created_at: string | null;
          min_amount: number;
          price: number;
          product_id: string;
          unit_id: string;
          warehouse_id: string;
        };
        Insert: {
          amount?: number;
          created_at?: string | null;
          min_amount?: number;
          price?: number;
          product_id: string;
          unit_id: string;
          warehouse_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string | null;
          min_amount?: number;
          price?: number;
          product_id?: string;
          unit_id?: string;
          warehouse_id?: string;
        };
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
      };
      task_lists: {
        Row: {
          archived: boolean | null;
          board_id: string;
          created_at: string | null;
          creator_id: string | null;
          deleted: boolean | null;
          id: string;
          name: string | null;
        };
        Insert: {
          archived?: boolean | null;
          board_id: string;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
        };
        Update: {
          archived?: boolean | null;
          board_id?: string;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
        };
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
      };
      user_private_details: {
        Row: {
          birthday: string | null;
          email: string | null;
          new_email: string | null;
          user_id: string;
        };
        Insert: {
          birthday?: string | null;
          email?: string | null;
          new_email?: string | null;
          user_id: string;
        };
        Update: {
          birthday?: string | null;
          email?: string | null;
          new_email?: string | null;
          user_id?: string;
        };
      };
      users: {
        Row: {
          avatar_url: string | null;
          created_at: string | null;
          deleted: boolean | null;
          display_name: string | null;
          handle: string | null;
          id: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string | null;
          deleted?: boolean | null;
          display_name?: string | null;
          handle?: string | null;
          id?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string | null;
          deleted?: boolean | null;
          display_name?: string | null;
          handle?: string | null;
          id?: string;
        };
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
      };
      wallet_transactions: {
        Row: {
          amount: number | null;
          category_id: string | null;
          created_at: string | null;
          description: string | null;
          id: string;
          taken_at: string;
          wallet_id: string;
        };
        Insert: {
          amount?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          taken_at?: string;
          wallet_id: string;
        };
        Update: {
          amount?: number | null;
          category_id?: string | null;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          taken_at?: string;
          wallet_id?: string;
        };
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
      };
      workspace_boards: {
        Row: {
          archived: boolean | null;
          created_at: string | null;
          creator_id: string | null;
          deleted: boolean | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Insert: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Update: {
          archived?: boolean | null;
          created_at?: string | null;
          creator_id?: string | null;
          deleted?: boolean | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
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
      };
      workspace_documents: {
        Row: {
          content: string | null;
          created_at: string | null;
          id: string;
          name: string | null;
          ws_id: string;
        };
        Insert: {
          content?: string | null;
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id: string;
        };
        Update: {
          content?: string | null;
          created_at?: string | null;
          id?: string;
          name?: string | null;
          ws_id?: string;
        };
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
      };
      workspace_presets: {
        Row: {
          enabled: boolean;
          name: string;
        };
        Insert: {
          enabled?: boolean;
          name: string;
        };
        Update: {
          enabled?: boolean;
          name?: string;
        };
      };
      workspace_products: {
        Row: {
          category_id: string;
          created_at: string | null;
          description: string | null;
          id: string;
          manufacturer: string | null;
          name: string | null;
          usage: string | null;
          ws_id: string;
        };
        Insert: {
          category_id: string;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          manufacturer?: string | null;
          name?: string | null;
          usage?: string | null;
          ws_id: string;
        };
        Update: {
          category_id?: string;
          created_at?: string | null;
          description?: string | null;
          id?: string;
          manufacturer?: string | null;
          name?: string | null;
          usage?: string | null;
          ws_id?: string;
        };
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
      };
      workspace_user_groups: {
        Row: {
          created_at: string | null;
          id: string;
          name: string;
          ws_id: string;
        };
        Insert: {
          created_at?: string | null;
          id?: string;
          name: string;
          ws_id: string;
        };
        Update: {
          created_at?: string | null;
          id?: string;
          name?: string;
          ws_id?: string;
        };
      };
      workspace_user_groups_users: {
        Row: {
          created_at: string | null;
          group_id: string;
          user_id: string;
        };
        Insert: {
          created_at?: string | null;
          group_id: string;
          user_id: string;
        };
        Update: {
          created_at?: string | null;
          group_id?: string;
          user_id?: string;
        };
      };
      workspace_users: {
        Row: {
          address: string | null;
          balance: number | null;
          birthday: string | null;
          created_at: string | null;
          email: string | null;
          ethnicity: string | null;
          gender: string | null;
          guardian: string | null;
          id: string;
          name: string | null;
          national_id: string | null;
          note: string | null;
          phone: string | null;
          ws_id: string;
        };
        Insert: {
          address?: string | null;
          balance?: number | null;
          birthday?: string | null;
          created_at?: string | null;
          email?: string | null;
          ethnicity?: string | null;
          gender?: string | null;
          guardian?: string | null;
          id?: string;
          name?: string | null;
          national_id?: string | null;
          note?: string | null;
          phone?: string | null;
          ws_id: string;
        };
        Update: {
          address?: string | null;
          balance?: number | null;
          birthday?: string | null;
          created_at?: string | null;
          email?: string | null;
          ethnicity?: string | null;
          gender?: string | null;
          guardian?: string | null;
          id?: string;
          name?: string | null;
          national_id?: string | null;
          note?: string | null;
          phone?: string | null;
          ws_id?: string;
        };
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
      };
      workspace_wallets: {
        Row: {
          balance: number | null;
          created_at: string | null;
          currency: string;
          description: string | null;
          id: string;
          name: string | null;
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
          type?: string;
          ws_id?: string;
        };
      };
      workspaces: {
        Row: {
          created_at: string | null;
          deleted: boolean | null;
          handle: string | null;
          id: string;
          name: string | null;
          preset: string;
        };
        Insert: {
          created_at?: string | null;
          deleted?: boolean | null;
          handle?: string | null;
          id?: string;
          name?: string | null;
          preset?: string;
        };
        Update: {
          created_at?: string | null;
          deleted?: boolean | null;
          handle?: string | null;
          id?: string;
          name?: string | null;
          preset?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
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
          _ws_id?: string;
          _warehouse_ids?: string[];
          _has_unit?: boolean;
        };
        Returns: {
          id: string;
          name: string;
          manufacturer: string;
          unit: string;
          unit_id: string;
          category: string;
          price: number;
          amount: number;
          ws_id: string;
          created_at: string;
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
          id: string;
          name: string;
          description: string;
          priority: number;
          completed: boolean;
          start_date: string;
          end_date: string;
          list_id: string;
          board_id: string;
        }[];
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
          ws_id: string;
          start_date?: string;
          end_date?: string;
        };
        Returns: number;
      };
      get_workspace_user_groups_count: {
        Args: {
          ws_id: string;
        };
        Returns: number;
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
          ws_id: string;
          start_date?: string;
          end_date?: string;
        };
        Returns: number;
      };
      get_workspace_wallets_income: {
        Args: {
          ws_id: string;
          start_date?: string;
          end_date?: string;
        };
        Returns: number;
      };
      get_workspace_wallets_sum: {
        Args: {
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
          _ws_id: string;
          _user_id: string;
        };
        Returns: boolean;
      };
      is_list_accessible: {
        Args: {
          _list_id: string;
        };
        Returns: boolean;
      };
      is_member_invited: {
        Args: {
          _user_id: string;
          _org_id: string;
        };
        Returns: boolean;
      };
      is_org_member: {
        Args: {
          _user_id: string;
          _org_id: string;
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
          _user_id: string;
          _board_id: string;
        };
        Returns: boolean;
      };
      is_user_task_in_board: {
        Args: {
          _user_id: string;
          _task_id: string;
        };
        Returns: boolean;
      };
      search_users_by_name: {
        Args: {
          search_query: string;
        };
        Returns: {
          id: string;
          handle: string;
          display_name: string;
          avatar_url: string;
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
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null;
          avif_autodetection: boolean | null;
          created_at: string | null;
          file_size_limit: number | null;
          id: string;
          name: string;
          owner: string | null;
          public: boolean | null;
          updated_at: string | null;
        };
        Insert: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id: string;
          name: string;
          owner?: string | null;
          public?: boolean | null;
          updated_at?: string | null;
        };
        Update: {
          allowed_mime_types?: string[] | null;
          avif_autodetection?: boolean | null;
          created_at?: string | null;
          file_size_limit?: number | null;
          id?: string;
          name?: string;
          owner?: string | null;
          public?: boolean | null;
          updated_at?: string | null;
        };
      };
      migrations: {
        Row: {
          executed_at: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Insert: {
          executed_at?: string | null;
          hash: string;
          id: number;
          name: string;
        };
        Update: {
          executed_at?: string | null;
          hash?: string;
          id?: number;
          name?: string;
        };
      };
      objects: {
        Row: {
          bucket_id: string | null;
          created_at: string | null;
          id: string;
          last_accessed_at: string | null;
          metadata: Json | null;
          name: string | null;
          owner: string | null;
          path_tokens: string[] | null;
          updated_at: string | null;
          version: string | null;
        };
        Insert: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          version?: string | null;
        };
        Update: {
          bucket_id?: string | null;
          created_at?: string | null;
          id?: string;
          last_accessed_at?: string | null;
          metadata?: Json | null;
          name?: string | null;
          owner?: string | null;
          path_tokens?: string[] | null;
          updated_at?: string | null;
          version?: string | null;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_insert_object: {
        Args: {
          bucketid: string;
          name: string;
          owner: string;
          metadata: Json;
        };
        Returns: undefined;
      };
      extension: {
        Args: {
          name: string;
        };
        Returns: string;
      };
      filename: {
        Args: {
          name: string;
        };
        Returns: string;
      };
      foldername: {
        Args: {
          name: string;
        };
        Returns: string[];
      };
      get_size_by_bucket: {
        Args: Record<PropertyKey, never>;
        Returns: {
          size: number;
          bucket_id: string;
        }[];
      };
      search: {
        Args: {
          prefix: string;
          bucketname: string;
          limits?: number;
          levels?: number;
          offsets?: number;
          search?: string;
          sortcolumn?: string;
          sortorder?: string;
        };
        Returns: {
          name: string;
          id: string;
          updated_at: string;
          created_at: string;
          last_accessed_at: string;
          metadata: Json;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
