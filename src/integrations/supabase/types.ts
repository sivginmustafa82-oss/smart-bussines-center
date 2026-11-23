export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ad_daily_performance: {
        Row: {
          campaign_name: string | null
          clicks: number
          created_at: string
          currency: string
          external_campaign_id: string | null
          id: string
          impressions: number
          orders_count: number
          organization_id: string
          performance_date: string
          revenue: number
          spend: number
          store_id: string
        }
        Insert: {
          campaign_name?: string | null
          clicks?: number
          created_at?: string
          currency?: string
          external_campaign_id?: string | null
          id?: string
          impressions?: number
          orders_count?: number
          organization_id: string
          performance_date: string
          revenue?: number
          spend?: number
          store_id: string
        }
        Update: {
          campaign_name?: string | null
          clicks?: number
          created_at?: string
          currency?: string
          external_campaign_id?: string | null
          id?: string
          impressions?: number
          orders_count?: number
          organization_id?: string
          performance_date?: string
          revenue?: number
          spend?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_daily_performance_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ad_daily_performance_store_id_organization_id_fkey"
            columns: ["store_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          details: Json
          entity_id: string | null
          entity_type: string | null
          id: string
          organization_id: string
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id: string
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string
          data_source: string
          description: string | null
          expense_date: string
          id: string
          organization_id: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          currency?: string
          data_source?: string
          description?: string | null
          expense_date?: string
          id?: string
          organization_id: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          data_source?: string
          description?: string | null
          expense_date?: string
          id?: string
          organization_id?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_store_id_organization_id_fkey"
            columns: ["store_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          external_transaction_id: string | null
          gross_amount: number
          id: string
          order_id: string | null
          organization_id: string
          raw_data: Json
          signed_amount: number
          source: string
          store_id: string
          transaction_date: string
          transaction_type: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          external_transaction_id?: string | null
          gross_amount?: number
          id?: string
          order_id?: string | null
          organization_id: string
          raw_data?: Json
          signed_amount?: number
          source?: string
          store_id: string
          transaction_date: string
          transaction_type: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          external_transaction_id?: string | null
          gross_amount?: number
          id?: string
          order_id?: string | null
          organization_id?: string
          raw_data?: Json
          signed_amount?: number
          source?: string
          store_id?: string
          transaction_date?: string
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_transactions_order_id_organization_id_fkey"
            columns: ["order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "financial_transactions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_transactions_store_id_organization_id_fkey"
            columns: ["store_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      order_items: {
        Row: {
          barcode: string | null
          cancelled_quantity: number
          coupon_discount: number
          created_at: string
          currency: string
          external_line_id: string | null
          id: string
          line_gross: number
          order_id: string
          organization_id: string
          product_title: string | null
          quantity: number
          returned_quantity: number
          seller_discount: number
          unit_price: number
          variant_id: string | null
        }
        Insert: {
          barcode?: string | null
          cancelled_quantity?: number
          coupon_discount?: number
          created_at?: string
          currency?: string
          external_line_id?: string | null
          id?: string
          line_gross?: number
          order_id: string
          organization_id: string
          product_title?: string | null
          quantity?: number
          returned_quantity?: number
          seller_discount?: number
          unit_price?: number
          variant_id?: string | null
        }
        Update: {
          barcode?: string | null
          cancelled_quantity?: number
          coupon_discount?: number
          created_at?: string
          currency?: string
          external_line_id?: string | null
          id?: string
          line_gross?: number
          order_id?: string
          organization_id?: string
          product_title?: string | null
          quantity?: number
          returned_quantity?: number
          seller_discount?: number
          unit_price?: number
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_organization_id_fkey"
            columns: ["order_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_organization_id_fkey"
            columns: ["variant_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      order_records: {
        Row: {
          commission_amount: number
          coupon_amount: number
          created_at: string
          currency: string
          data_source: string
          discount_amount: number
          gross_amount: number
          id: string
          note: string
          order_number: string
          organization_id: string
          product_id: string | null
          quantity: number
          record_date: string
          record_type: string
          shipping_amount: number
          store_id: string
          updated_at: string
          verified: boolean
          withholding_amount: number
        }
        Insert: {
          commission_amount?: number
          coupon_amount?: number
          created_at?: string
          currency?: string
          data_source?: string
          discount_amount?: number
          gross_amount: number
          id?: string
          note?: string
          order_number: string
          organization_id: string
          product_id?: string | null
          quantity: number
          record_date: string
          record_type: string
          shipping_amount?: number
          store_id: string
          updated_at?: string
          verified?: boolean
          withholding_amount?: number
        }
        Update: {
          commission_amount?: number
          coupon_amount?: number
          created_at?: string
          currency?: string
          data_source?: string
          discount_amount?: number
          gross_amount?: number
          id?: string
          note?: string
          order_number?: string
          organization_id?: string
          product_id?: string | null
          quantity?: number
          record_date?: string
          record_type?: string
          shipping_amount?: number
          store_id?: string
          updated_at?: string
          verified?: boolean
          withholding_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_records_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_records_store_fk"
            columns: ["store_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      orders: {
        Row: {
          cancelled_at: string | null
          coupon_discount: number
          created_at: string
          currency: string
          external_order_id: string
          gross_amount: number
          id: string
          marketplace_discount: number
          order_date: string | null
          order_number: string | null
          organization_id: string
          package_number: string | null
          raw_data: Json
          returned_at: string | null
          seller_discount: number
          shipping_amount: number
          status: string | null
          store_id: string
          synced_at: string
        }
        Insert: {
          cancelled_at?: string | null
          coupon_discount?: number
          created_at?: string
          currency?: string
          external_order_id: string
          gross_amount?: number
          id?: string
          marketplace_discount?: number
          order_date?: string | null
          order_number?: string | null
          organization_id: string
          package_number?: string | null
          raw_data?: Json
          returned_at?: string | null
          seller_discount?: number
          shipping_amount?: number
          status?: string | null
          store_id: string
          synced_at?: string
        }
        Update: {
          cancelled_at?: string | null
          coupon_discount?: number
          created_at?: string
          currency?: string
          external_order_id?: string
          gross_amount?: number
          id?: string
          marketplace_discount?: number
          order_date?: string | null
          order_number?: string | null
          organization_id?: string
          package_number?: string | null
          raw_data?: Json
          returned_at?: string | null
          seller_discount?: number
          shipping_amount?: number
          status?: string | null
          store_id?: string
          synced_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_organization_id_fkey"
            columns: ["store_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      organization_memberships: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          country_code: string
          created_at: string
          default_currency: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          default_currency?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          country_code?: string
          created_at?: string
          default_currency?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      product_costs: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          id: string
          notes: string | null
          organization_id: string
          source: string
          unit_cost: number
          variant_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          notes?: string | null
          organization_id: string
          source?: string
          unit_cost: number
          variant_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          id?: string
          notes?: string | null
          organization_id?: string
          source?: string
          unit_cost?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_costs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_costs_variant_id_organization_id_fkey"
            columns: ["variant_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      product_variants: {
        Row: {
          barcode: string | null
          created_at: string
          currency: string
          external_variant_id: string | null
          id: string
          list_price: number | null
          organization_id: string
          product_id: string
          sale_price: number | null
          sku: string | null
          stock_quantity: number
          updated_at: string
          variant_name: string | null
          vat_rate: number | null
        }
        Insert: {
          barcode?: string | null
          created_at?: string
          currency?: string
          external_variant_id?: string | null
          id?: string
          list_price?: number | null
          organization_id: string
          product_id: string
          sale_price?: number | null
          sku?: string | null
          stock_quantity?: number
          updated_at?: string
          variant_name?: string | null
          vat_rate?: number | null
        }
        Update: {
          barcode?: string | null
          created_at?: string
          currency?: string
          external_variant_id?: string | null
          id?: string
          list_price?: number | null
          organization_id?: string
          product_id?: string
          sale_price?: number | null
          sku?: string | null
          stock_quantity?: number
          updated_at?: string
          variant_name?: string | null
          vat_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_organization_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "app_products"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "product_variants_product_id_organization_id_fkey"
            columns: ["product_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category: string | null
          created_at: string
          data_source: string
          external_product_id: string | null
          id: string
          organization_id: string
          product_url: string | null
          status: string
          store_id: string
          title: string
          updated_at: string
          verified: boolean
        }
        Insert: {
          brand?: string | null
          category?: string | null
          created_at?: string
          data_source?: string
          external_product_id?: string | null
          id?: string
          organization_id: string
          product_url?: string | null
          status?: string
          store_id: string
          title: string
          updated_at?: string
          verified?: boolean
        }
        Update: {
          brand?: string | null
          category?: string | null
          created_at?: string
          data_source?: string
          external_product_id?: string | null
          id?: string
          organization_id?: string
          product_url?: string | null
          status?: string
          store_id?: string
          title?: string
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_organization_id_fkey"
            columns: ["store_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      reconciliations: {
        Row: {
          cancellations: number | null
          commission: number | null
          created_at: string
          data_source: string
          discounts: number | null
          gross_sales: number | null
          id: string
          net_payout: number | null
          note: string
          organization_id: string
          period: string
          returns: number | null
          shipping: number | null
          store_id: string
          updated_at: string
          withholding: number | null
        }
        Insert: {
          cancellations?: number | null
          commission?: number | null
          created_at?: string
          data_source?: string
          discounts?: number | null
          gross_sales?: number | null
          id?: string
          net_payout?: number | null
          note?: string
          organization_id: string
          period: string
          returns?: number | null
          shipping?: number | null
          store_id: string
          updated_at?: string
          withholding?: number | null
        }
        Update: {
          cancellations?: number | null
          commission?: number | null
          created_at?: string
          data_source?: string
          discounts?: number | null
          gross_sales?: number | null
          id?: string
          net_payout?: number | null
          note?: string
          organization_id?: string
          period?: string
          returns?: number | null
          shipping?: number | null
          store_id?: string
          updated_at?: string
          withholding?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reconciliations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliations_store_fk"
            columns: ["store_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      shipping_rate_cards: {
        Row: {
          carrier_name: string
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          id: string
          max_desi: number | null
          min_desi: number
          organization_id: string
          price: number
          store_id: string | null
        }
        Insert: {
          carrier_name: string
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          max_desi?: number | null
          min_desi: number
          organization_id: string
          price: number
          store_id?: string | null
        }
        Update: {
          carrier_name?: string
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          max_desi?: number | null
          min_desi?: number
          organization_id?: string
          price?: number
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_rate_cards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shipping_rate_cards_store_id_organization_id_fkey"
            columns: ["store_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      stores: {
        Row: {
          connection_status: string
          country_code: string
          created_at: string
          currency: string
          id: string
          last_synced_at: string | null
          marketplace: string
          name: string
          organization_id: string
          seller_id: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          connection_status?: string
          country_code?: string
          created_at?: string
          currency?: string
          id?: string
          last_synced_at?: string | null
          marketplace: string
          name: string
          organization_id: string
          seller_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          connection_status?: string
          country_code?: string
          created_at?: string
          currency?: string
          id?: string
          last_synced_at?: string | null
          marketplace?: string
          name?: string
          organization_id?: string
          seller_id?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          created_at: string
          error_message: string | null
          finished_at: string | null
          id: string
          organization_id: string
          records_read: number
          records_written: number
          started_at: string | null
          status: string
          store_id: string
          sync_type: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          organization_id: string
          records_read?: number
          records_written?: number
          started_at?: string | null
          status?: string
          store_id: string
          sync_type: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          finished_at?: string | null
          id?: string
          organization_id?: string
          records_read?: number
          records_written?: number
          started_at?: string | null
          status?: string
          store_id?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_store_id_organization_id_fkey"
            columns: ["store_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Views: {
      app_products: {
        Row: {
          barcode: string | null
          created_at: string | null
          data_source: string | null
          id: string | null
          name: string | null
          organization_id: string | null
          sku: string | null
          store_id: string | null
          unit_cost: number | null
          updated_at: string | null
          variant_id: string | null
          vat_rate: number | null
          verified: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_organization_id_fkey"
            columns: ["store_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
    }
    Functions: {
      delete_store: { Args: { p_store_id: string }; Returns: undefined }
      get_marketplace_secret_for_user: {
        Args: { p_store_id: string }
        Returns: {
          credential_ciphertext: string
          encryption_key_version: number
        }[]
      }
      has_org_role: {
        Args: { _org: string; _roles: string[] }
        Returns: boolean
      }
      import_trendyol_order_records: {
        Args: { p_records: Json; p_store_id: string }
        Returns: Json
      }
      import_trendyol_products: {
        Args: { p_products: Json; p_store_id: string; p_variants: Json }
        Returns: Json
      }
      match_trendyol_order_products: {
        Args: { p_store_id: string }
        Returns: Json
      }
      save_manual_product: {
        Args: {
          p_barcode: string
          p_name: string
          p_product_id: string
          p_sku: string
          p_store_id: string
          p_unit_cost: number
          p_vat_rate: number
        }
        Returns: string
      }
      set_product_unit_cost: {
        Args: { p_product_id: string; p_unit_cost: number }
        Returns: undefined
      }
      upsert_marketplace_secret: {
        Args: {
          p_ciphertext: string
          p_key_version?: number
          p_store_id: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
