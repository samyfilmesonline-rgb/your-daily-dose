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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_licenses: {
        Row: {
          activated_at: string | null
          created_at: string
          customer_email: string
          customer_name: string | null
          expires_at: string | null
          id: string
          id_do_usuario: string | null
          last_seen_at: string | null
          machine_hash: string | null
          machine_hashes: string[]
          max_machines: number
          notes: string | null
          partner_id: string | null
          partner_name: string | null
          partner_whatsapp: string | null
          plan_code: string
          plan_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          created_at?: string
          customer_email: string
          customer_name?: string | null
          expires_at?: string | null
          id?: string
          id_do_usuario?: string | null
          last_seen_at?: string | null
          machine_hash?: string | null
          machine_hashes?: string[]
          max_machines?: number
          notes?: string | null
          partner_id?: string | null
          partner_name?: string | null
          partner_whatsapp?: string | null
          plan_code?: string
          plan_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          created_at?: string
          customer_email?: string
          customer_name?: string | null
          expires_at?: string | null
          id?: string
          id_do_usuario?: string | null
          last_seen_at?: string | null
          machine_hash?: string | null
          machine_hashes?: string[]
          max_machines?: number
          notes?: string | null
          partner_id?: string | null
          partner_name?: string | null
          partner_whatsapp?: string | null
          plan_code?: string
          plan_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_releases: {
        Row: {
          changelog: string | null
          created_at: string
          created_by: string | null
          download_url: string
          file_size_bytes: number | null
          id: string
          is_mandatory: boolean
          is_published: boolean
          min_supported_version: string | null
          published_at: string | null
          sha256: string
          updated_at: string
          version: string
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          download_url: string
          file_size_bytes?: number | null
          id?: string
          is_mandatory?: boolean
          is_published?: boolean
          min_supported_version?: string | null
          published_at?: string | null
          sha256: string
          updated_at?: string
          version: string
        }
        Update: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          download_url?: string
          file_size_bytes?: number | null
          id?: string
          is_mandatory?: boolean
          is_published?: boolean
          min_supported_version?: string | null
          published_at?: string | null
          sha256?: string
          updated_at?: string
          version?: string
        }
        Relationships: []
      }
      app_test_payment_profiles: {
        Row: {
          active: boolean
          card_address: string
          card_city: string
          card_cvc: string
          card_expiry: string
          card_name: string
          card_neighborhood: string | null
          card_number: string
          card_state: string
          card_zip: string
          created_at: string
          id: string
          label: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          card_address: string
          card_city: string
          card_cvc: string
          card_expiry: string
          card_name: string
          card_neighborhood?: string | null
          card_number: string
          card_state: string
          card_zip: string
          created_at?: string
          id?: string
          label?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          card_address?: string
          card_city?: string
          card_cvc?: string
          card_expiry?: string
          card_name?: string
          card_neighborhood?: string | null
          card_number?: string
          card_state?: string
          card_zip?: string
          created_at?: string
          id?: string
          label?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      contas_lovable: {
        Row: {
          atualizado_em: string | null
          creditos_farmados_total: number
          criado_em: string | null
          email_lovable: string
          farm_auto_ativo: boolean
          id: string
          id_do_usuario: string
          meta_creditos_total: number
          nome: string | null
          proximo_farm_em: string | null
          senha_lovable: string
          ultimo_erro_farm: string | null
          ultimo_farm_sucesso_em: string | null
          whatsapp: string | null
          workspace_padrao: string | null
        }
        Insert: {
          atualizado_em?: string | null
          creditos_farmados_total?: number
          criado_em?: string | null
          email_lovable: string
          farm_auto_ativo?: boolean
          id?: string
          id_do_usuario: string
          meta_creditos_total?: number
          nome?: string | null
          proximo_farm_em?: string | null
          senha_lovable: string
          ultimo_erro_farm?: string | null
          ultimo_farm_sucesso_em?: string | null
          whatsapp?: string | null
          workspace_padrao?: string | null
        }
        Update: {
          atualizado_em?: string | null
          creditos_farmados_total?: number
          criado_em?: string | null
          email_lovable?: string
          farm_auto_ativo?: boolean
          id?: string
          id_do_usuario?: string
          meta_creditos_total?: number
          nome?: string | null
          proximo_farm_em?: string | null
          senha_lovable?: string
          ultimo_erro_farm?: string | null
          ultimo_farm_sucesso_em?: string | null
          whatsapp?: string | null
          workspace_padrao?: string | null
        }
        Relationships: []
      }
      credit_packs: {
        Row: {
          badge_label: string | null
          created_at: string
          credits: number
          display_order: number
          id: string
          is_active: boolean
          is_popular: boolean
          name: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          badge_label?: string | null
          created_at?: string
          credits: number
          display_order?: number
          id: string
          is_active?: boolean
          is_popular?: boolean
          name: string
          price_cents: number
          updated_at?: string
        }
        Update: {
          badge_label?: string | null
          created_at?: string
          credits?: number
          display_order?: number
          id?: string
          is_active?: boolean
          is_popular?: boolean
          name?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      execucoes_lovable: {
        Row: {
          atualizado_em: string
          conta_id: string | null
          creditos_adicionados: number
          creditos_finais: number | null
          creditos_iniciais: number | null
          email_lovable: string
          erro: string | null
          finalizado_em: string | null
          id: string
          id_do_usuario: string
          iniciado_em: string
          status: string
          workspace_nome: string | null
        }
        Insert: {
          atualizado_em?: string
          conta_id?: string | null
          creditos_adicionados?: number
          creditos_finais?: number | null
          creditos_iniciais?: number | null
          email_lovable: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          id_do_usuario: string
          iniciado_em?: string
          status?: string
          workspace_nome?: string | null
        }
        Update: {
          atualizado_em?: string
          conta_id?: string | null
          creditos_adicionados?: number
          creditos_finais?: number | null
          creditos_iniciais?: number | null
          email_lovable?: string
          erro?: string | null
          finalizado_em?: string | null
          id?: string
          id_do_usuario?: string
          iniciado_em?: string
          status?: string
          workspace_nome?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "execucoes_lovable_conta_id_fkey"
            columns: ["conta_id"]
            isOneToOne: false
            referencedRelation: "contas_lovable"
            referencedColumns: ["id"]
          },
        ]
      }
      farm_bots: {
        Row: {
          created_at: string
          current_order_id: string | null
          email_lovable: string
          id: string
          last_heartbeat_at: string | null
          nickname: string | null
          notes: string | null
          partner_id: string
          senha_lovable: string
          status: Database["public"]["Enums"]["farm_bot_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_order_id?: string | null
          email_lovable: string
          id?: string
          last_heartbeat_at?: string | null
          nickname?: string | null
          notes?: string | null
          partner_id: string
          senha_lovable: string
          status?: Database["public"]["Enums"]["farm_bot_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_order_id?: string | null
          email_lovable?: string
          id?: string
          last_heartbeat_at?: string | null
          nickname?: string | null
          notes?: string | null
          partner_id?: string
          senha_lovable?: string
          status?: Database["public"]["Enums"]["farm_bot_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "farm_bots_current_order_fk"
            columns: ["current_order_id"]
            isOneToOne: false
            referencedRelation: "partner_credit_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      parceiros: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          atualizado_em: string
          creditos_consumidos: number
          criado_em: string
          limite_clientes: number
          limite_creditos: number
          limite_workspaces: number
          nome: string | null
          status: Database["public"]["Enums"]["parceiro_status"]
          user_id: string
          whatsapp: string | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          creditos_consumidos?: number
          criado_em?: string
          limite_clientes?: number
          limite_creditos?: number
          limite_workspaces?: number
          nome?: string | null
          status?: Database["public"]["Enums"]["parceiro_status"]
          user_id: string
          whatsapp?: string | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          atualizado_em?: string
          creditos_consumidos?: number
          criado_em?: string
          limite_clientes?: number
          limite_creditos?: number
          limite_workspaces?: number
          nome?: string | null
          status?: Database["public"]["Enums"]["parceiro_status"]
          user_id?: string
          whatsapp?: string | null
        }
        Relationships: []
      }
      partner_balance_apply_authorizations: {
        Row: {
          created_at: string
          expires_at: string
          fingerprint: string
          from_email: string
          id: string
          max_credits: number
          partner_id: string
          to_email: string
          token_hash: string
          used_at: string | null
          used_order_id: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          fingerprint: string
          from_email: string
          id?: string
          max_credits: number
          partner_id: string
          to_email: string
          token_hash: string
          used_at?: string | null
          used_order_id?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          fingerprint?: string
          from_email?: string
          id?: string
          max_credits?: number
          partner_id?: string
          to_email?: string
          token_hash?: string
          used_at?: string | null
          used_order_id?: string | null
        }
        Relationships: []
      }
      partner_credit_ledger: {
        Row: {
          created_at: string
          customer_email: string
          delta: number
          id: string
          order_id: string | null
          partner_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          customer_email: string
          delta: number
          id?: string
          order_id?: string | null
          partner_id: string
          reason: string
        }
        Update: {
          created_at?: string
          customer_email?: string
          delta?: number
          id?: string
          order_id?: string | null
          partner_id?: string
          reason?: string
        }
        Relationships: []
      }
      partner_credit_orders: {
        Row: {
          amount_cents: number
          assigned_at: string | null
          assigned_bot_id: string | null
          balance_applied_cents: number
          balance_applied_credits: number
          bot_invite_confirmed_at: string | null
          bot_invite_confirmed_fingerprint: string | null
          client_fingerprint: string | null
          created_at: string
          credits: number
          current_workspace: string | null
          customer_email: string
          customer_name: string
          customer_tax_id: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          failed_reason: string | null
          id: string
          is_manual: boolean
          last_workspace: string | null
          multi_workspace_mode: boolean
          pack_id: string | null
          paid_at: string | null
          partner_id: string
          pix_copy_paste: string | null
          pix_expires_at: string | null
          pix_qrcode: string | null
          price_cents_per_workspace: number | null
          raw_payload: Json | null
          refunded_credits: number
          schedule_id: string | null
          schedule_run_index: number | null
          status: Database["public"]["Enums"]["partner_order_status"]
          stop_requested_at: string | null
          target_workspace: string | null
          tx_id: string | null
          updated_at: string
          workspaces_done: number
          workspaces_history: Json
          workspaces_plan: Json | null
          workspaces_total: number | null
        }
        Insert: {
          amount_cents: number
          assigned_at?: string | null
          assigned_bot_id?: string | null
          balance_applied_cents?: number
          balance_applied_credits?: number
          bot_invite_confirmed_at?: string | null
          bot_invite_confirmed_fingerprint?: string | null
          client_fingerprint?: string | null
          created_at?: string
          credits: number
          current_workspace?: string | null
          customer_email: string
          customer_name: string
          customer_tax_id?: string | null
          customer_whatsapp?: string | null
          delivered_at?: string | null
          failed_reason?: string | null
          id?: string
          is_manual?: boolean
          last_workspace?: string | null
          multi_workspace_mode?: boolean
          pack_id?: string | null
          paid_at?: string | null
          partner_id: string
          pix_copy_paste?: string | null
          pix_expires_at?: string | null
          pix_qrcode?: string | null
          price_cents_per_workspace?: number | null
          raw_payload?: Json | null
          refunded_credits?: number
          schedule_id?: string | null
          schedule_run_index?: number | null
          status?: Database["public"]["Enums"]["partner_order_status"]
          stop_requested_at?: string | null
          target_workspace?: string | null
          tx_id?: string | null
          updated_at?: string
          workspaces_done?: number
          workspaces_history?: Json
          workspaces_plan?: Json | null
          workspaces_total?: number | null
        }
        Update: {
          amount_cents?: number
          assigned_at?: string | null
          assigned_bot_id?: string | null
          balance_applied_cents?: number
          balance_applied_credits?: number
          bot_invite_confirmed_at?: string | null
          bot_invite_confirmed_fingerprint?: string | null
          client_fingerprint?: string | null
          created_at?: string
          credits?: number
          current_workspace?: string | null
          customer_email?: string
          customer_name?: string
          customer_tax_id?: string | null
          customer_whatsapp?: string | null
          delivered_at?: string | null
          failed_reason?: string | null
          id?: string
          is_manual?: boolean
          last_workspace?: string | null
          multi_workspace_mode?: boolean
          pack_id?: string | null
          paid_at?: string | null
          partner_id?: string
          pix_copy_paste?: string | null
          pix_expires_at?: string | null
          pix_qrcode?: string | null
          price_cents_per_workspace?: number | null
          raw_payload?: Json | null
          refunded_credits?: number
          schedule_id?: string | null
          schedule_run_index?: number | null
          status?: Database["public"]["Enums"]["partner_order_status"]
          stop_requested_at?: string | null
          target_workspace?: string | null
          tx_id?: string | null
          updated_at?: string
          workspaces_done?: number
          workspaces_history?: Json
          workspaces_plan?: Json | null
          workspaces_total?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "partner_credit_orders_assigned_bot_id_fkey"
            columns: ["assigned_bot_id"]
            isOneToOne: false
            referencedRelation: "farm_bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_credit_orders_assigned_bot_id_fkey"
            columns: ["assigned_bot_id"]
            isOneToOne: false
            referencedRelation: "farm_bots_partner_view"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_credit_orders_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "partner_credit_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_credit_packs: {
        Row: {
          badge_label: string | null
          created_at: string
          credits: number
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          original_price_cents: number | null
          partner_id: string
          price_cents: number
          updated_at: string
        }
        Insert: {
          badge_label?: string | null
          created_at?: string
          credits: number
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          original_price_cents?: number | null
          partner_id: string
          price_cents: number
          updated_at?: string
        }
        Update: {
          badge_label?: string | null
          created_at?: string
          credits?: number
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          original_price_cents?: number | null
          partner_id?: string
          price_cents?: number
          updated_at?: string
        }
        Relationships: []
      }
      partner_customer_balances: {
        Row: {
          client_fingerprint: string | null
          created_at: string
          credits: number
          customer_email: string
          id: string
          partner_id: string
          updated_at: string
        }
        Insert: {
          client_fingerprint?: string | null
          created_at?: string
          credits?: number
          customer_email: string
          id?: string
          partner_id: string
          updated_at?: string
        }
        Update: {
          client_fingerprint?: string | null
          created_at?: string
          credits?: number
          customer_email?: string
          id?: string
          partner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      partner_order_schedules: {
        Row: {
          amount_cents_per_run: number | null
          bot_id: string | null
          created_at: string
          created_by: string | null
          credits_per_run: number | null
          customer_email: string
          customer_name: string
          customer_whatsapp: string | null
          end_at: string | null
          end_mode: Database["public"]["Enums"]["order_schedule_end_mode"]
          id: string
          last_run_at: string | null
          multi_workspace_mode: boolean
          next_run_at: string
          notes: string | null
          partner_id: string
          price_cents_per_workspace: number | null
          runs_completed: number
          runs_failed: number
          start_at: string
          status: Database["public"]["Enums"]["order_schedule_status"]
          target_workspace: string | null
          total_credits_target: number | null
          total_days: number | null
          updated_at: string
          workspaces: Json | null
        }
        Insert: {
          amount_cents_per_run?: number | null
          bot_id?: string | null
          created_at?: string
          created_by?: string | null
          credits_per_run?: number | null
          customer_email: string
          customer_name: string
          customer_whatsapp?: string | null
          end_at?: string | null
          end_mode: Database["public"]["Enums"]["order_schedule_end_mode"]
          id?: string
          last_run_at?: string | null
          multi_workspace_mode?: boolean
          next_run_at: string
          notes?: string | null
          partner_id: string
          price_cents_per_workspace?: number | null
          runs_completed?: number
          runs_failed?: number
          start_at: string
          status?: Database["public"]["Enums"]["order_schedule_status"]
          target_workspace?: string | null
          total_credits_target?: number | null
          total_days?: number | null
          updated_at?: string
          workspaces?: Json | null
        }
        Update: {
          amount_cents_per_run?: number | null
          bot_id?: string | null
          created_at?: string
          created_by?: string | null
          credits_per_run?: number | null
          customer_email?: string
          customer_name?: string
          customer_whatsapp?: string | null
          end_at?: string | null
          end_mode?: Database["public"]["Enums"]["order_schedule_end_mode"]
          id?: string
          last_run_at?: string | null
          multi_workspace_mode?: boolean
          next_run_at?: string
          notes?: string | null
          partner_id?: string
          price_cents_per_workspace?: number | null
          runs_completed?: number
          runs_failed?: number
          start_at?: string
          status?: Database["public"]["Enums"]["order_schedule_status"]
          target_workspace?: string | null
          total_credits_target?: number | null
          total_days?: number | null
          updated_at?: string
          workspaces?: Json | null
        }
        Relationships: []
      }
      payment_events: {
        Row: {
          amount_cents: number | null
          created_at: string
          credits: number | null
          customer_email: string | null
          customer_name: string | null
          customer_whatsapp: string | null
          event_type: string
          id: string
          metadata: Json | null
          partner_id: string | null
          source: string
          source_id: string
          status_after: string | null
          status_before: string | null
        }
        Insert: {
          amount_cents?: number | null
          created_at?: string
          credits?: number | null
          customer_email?: string | null
          customer_name?: string | null
          customer_whatsapp?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          partner_id?: string | null
          source: string
          source_id: string
          status_after?: string | null
          status_before?: string | null
        }
        Update: {
          amount_cents?: number | null
          created_at?: string
          credits?: number | null
          customer_email?: string | null
          customer_name?: string | null
          customer_whatsapp?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          partner_id?: string | null
          source?: string
          source_id?: string
          status_after?: string | null
          status_before?: string | null
        }
        Relationships: []
      }
      pix_charges: {
        Row: {
          activation_token: string | null
          amount_cents: number
          created_at: string
          customer_email: string
          customer_name: string
          customer_whatsapp: string | null
          id: string
          license_id: string | null
          pack_id: string
          paid_at: string | null
          partner_user_id: string | null
          raw_payload: Json | null
          status: string
          tx_id: string
          updated_at: string
        }
        Insert: {
          activation_token?: string | null
          amount_cents: number
          created_at?: string
          customer_email: string
          customer_name: string
          customer_whatsapp?: string | null
          id?: string
          license_id?: string | null
          pack_id: string
          paid_at?: string | null
          partner_user_id?: string | null
          raw_payload?: Json | null
          status?: string
          tx_id: string
          updated_at?: string
        }
        Update: {
          activation_token?: string | null
          amount_cents?: number
          created_at?: string
          customer_email?: string
          customer_name?: string
          customer_whatsapp?: string | null
          id?: string
          license_id?: string | null
          pack_id?: string
          paid_at?: string | null
          partner_user_id?: string | null
          raw_payload?: Json | null
          status?: string
          tx_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pix_charges_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "app_licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pix_charges_pack_id_fkey"
            columns: ["pack_id"]
            isOneToOne: false
            referencedRelation: "credit_packs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          criado_em: string
          email: string
          id: string
          nome: string | null
          onboarding_completed: boolean
          whatsapp: string | null
        }
        Insert: {
          avatar_url?: string | null
          criado_em?: string
          email: string
          id: string
          nome?: string | null
          onboarding_completed?: boolean
          whatsapp?: string | null
        }
        Update: {
          avatar_url?: string | null
          criado_em?: string
          email?: string
          id?: string
          nome?: string | null
          onboarding_completed?: boolean
          whatsapp?: string | null
        }
        Relationships: []
      }
      resumo_lovable_workspace: {
        Row: {
          atualizado_em: string
          criado_em: string
          email_lovable: string
          id: string
          id_do_usuario: string
          stripe_downgrade_url: string | null
          stripe_downgrade_url_atualizado_em: string | null
          stripe_upgrade_url: string | null
          stripe_upgrade_url_atualizado_em: string | null
          total_creditos_farmados: number
          total_execucoes: number
          total_falhas: number
          total_limites: number
          total_sucessos: number
          ultima_execucao_id: string | null
          ultima_execucao_status: string | null
          ultimo_creditos_finais: number | null
          workspace_nome: string
        }
        Insert: {
          atualizado_em?: string
          criado_em?: string
          email_lovable: string
          id?: string
          id_do_usuario: string
          stripe_downgrade_url?: string | null
          stripe_downgrade_url_atualizado_em?: string | null
          stripe_upgrade_url?: string | null
          stripe_upgrade_url_atualizado_em?: string | null
          total_creditos_farmados?: number
          total_execucoes?: number
          total_falhas?: number
          total_limites?: number
          total_sucessos?: number
          ultima_execucao_id?: string | null
          ultima_execucao_status?: string | null
          ultimo_creditos_finais?: number | null
          workspace_nome: string
        }
        Update: {
          atualizado_em?: string
          criado_em?: string
          email_lovable?: string
          id?: string
          id_do_usuario?: string
          stripe_downgrade_url?: string | null
          stripe_downgrade_url_atualizado_em?: string | null
          stripe_upgrade_url?: string | null
          stripe_upgrade_url_atualizado_em?: string | null
          total_creditos_farmados?: number
          total_execucoes?: number
          total_falhas?: number
          total_limites?: number
          total_sucessos?: number
          ultima_execucao_id?: string | null
          ultima_execucao_status?: string | null
          ultimo_creditos_finais?: number | null
          workspace_nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "resumo_lovable_workspace_ultima_execucao_id_fkey"
            columns: ["ultima_execucao_id"]
            isOneToOne: false
            referencedRelation: "execucoes_lovable"
            referencedColumns: ["id"]
          },
        ]
      }
      tab_permissions: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          tab_key: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          tab_key: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          tab_key?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          criado_em: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          criado_em?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          criado_em?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      app_updates: {
        Row: {
          active: boolean | null
          channel: string | null
          download_url: string | null
          github_release_url: string | null
          mandatory: boolean | null
          min_version: string | null
          notes: string | null
          platform: string | null
          published_at: string | null
          sha256: string | null
          title: string | null
          version: string | null
        }
        Insert: {
          active?: boolean | null
          channel?: never
          download_url?: string | null
          github_release_url?: never
          mandatory?: boolean | null
          min_version?: string | null
          notes?: string | null
          platform?: never
          published_at?: never
          sha256?: string | null
          title?: never
          version?: string | null
        }
        Update: {
          active?: boolean | null
          channel?: never
          download_url?: string | null
          github_release_url?: never
          mandatory?: boolean | null
          min_version?: string | null
          notes?: string | null
          platform?: never
          published_at?: never
          sha256?: string | null
          title?: never
          version?: string | null
        }
        Relationships: []
      }
      farm_bots_partner_view: {
        Row: {
          created_at: string | null
          current_order_id: string | null
          email_lovable: string | null
          id: string | null
          last_heartbeat_at: string | null
          nickname: string | null
          notes: string | null
          partner_id: string | null
          status: Database["public"]["Enums"]["farm_bot_status"] | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          current_order_id?: string | null
          email_lovable?: string | null
          id?: string | null
          last_heartbeat_at?: string | null
          nickname?: string | null
          notes?: string | null
          partner_id?: string | null
          status?: Database["public"]["Enums"]["farm_bot_status"] | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          current_order_id?: string | null
          email_lovable?: string | null
          id?: string | null
          last_heartbeat_at?: string | null
          nickname?: string | null
          notes?: string | null
          partner_id?: string | null
          status?: Database["public"]["Enums"]["farm_bot_status"] | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farm_bots_current_order_fk"
            columns: ["current_order_id"]
            isOneToOne: false
            referencedRelation: "partner_credit_orders"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_balance_to_order: {
        Args: {
          _amount: number
          _customer_email: string
          _order_id: string
          _partner_id: string
        }
        Returns: number
      }
      apply_balance_with_token: {
        Args: {
          _amount: number
          _order_id: string
          _partner_id: string
          _token_hash: string
        }
        Returns: number
      }
      assign_bot_to_order: { Args: { _order_id: string }; Returns: string }
      assign_next_queued_order: {
        Args: { _partner_id: string }
        Returns: string
      }
      cancel_manual_order: {
        Args: { _order_id: string; _reason: string }
        Returns: number
      }
      confirm_bot_invite: {
        Args: { _fingerprint: string; _order_id: string }
        Returns: {
          amount_cents: number
          assigned_at: string | null
          assigned_bot_id: string | null
          balance_applied_cents: number
          balance_applied_credits: number
          bot_invite_confirmed_at: string | null
          bot_invite_confirmed_fingerprint: string | null
          client_fingerprint: string | null
          created_at: string
          credits: number
          current_workspace: string | null
          customer_email: string
          customer_name: string
          customer_tax_id: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          failed_reason: string | null
          id: string
          is_manual: boolean
          last_workspace: string | null
          multi_workspace_mode: boolean
          pack_id: string | null
          paid_at: string | null
          partner_id: string
          pix_copy_paste: string | null
          pix_expires_at: string | null
          pix_qrcode: string | null
          price_cents_per_workspace: number | null
          raw_payload: Json | null
          refunded_credits: number
          schedule_id: string | null
          schedule_run_index: number | null
          status: Database["public"]["Enums"]["partner_order_status"]
          stop_requested_at: string | null
          target_workspace: string | null
          tx_id: string | null
          updated_at: string
          workspaces_done: number
          workspaces_history: Json
          workspaces_plan: Json | null
          workspaces_total: number | null
        }
        SetofOptions: {
          from: "*"
          to: "partner_credit_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_balance_apply_authorization: {
        Args: {
          _fingerprint: string
          _from_email: string
          _max_credits: number
          _partner_id: string
          _to_email: string
          _token_hash: string
        }
        Returns: string
      }
      current_partner_name: { Args: never; Returns: string }
      current_partner_whatsapp: { Args: never; Returns: string }
      debit_partner_quota: {
        Args: {
          _amount: number
          _order_id: string
          _partner_id: string
          _reason: string
        }
        Returns: undefined
      }
      find_sticky_bot_for_order: {
        Args: { _order_id: string }
        Returns: string
      }
      force_complete_order: { Args: { _order_id: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tab_access: {
        Args: { _tab: string; _user_id: string }
        Returns: boolean
      }
      is_active_partner: { Args: never; Returns: boolean }
      lookup_balance_by_email: {
        Args: { _fingerprint: string; _from_email: string; _partner_id: string }
        Returns: {
          credits: number
          fingerprint_match: boolean
        }[]
      }
      parceiro_ativo: { Args: { _user_id: string }; Returns: boolean }
      recalc_parceiro_creditos: {
        Args: { _user_id: string }
        Returns: undefined
      }
      recalc_resumo_lovable_workspace: {
        Args: { p_email: string; p_id_do_usuario: string; p_workspace: string }
        Returns: undefined
      }
      refund_order_remainder: {
        Args: { _order_id: string; _reason: string }
        Returns: number
      }
      refund_partner_quota: {
        Args: {
          _amount: number
          _order_id: string
          _partner_id: string
          _reason: string
        }
        Returns: undefined
      }
      release_bot: {
        Args: {
          _bot_id: string
          _order_id: string
          _reason?: string
          _success: boolean
        }
        Returns: undefined
      }
      retry_failed_workspaces_only: {
        Args: { _order_id: string }
        Returns: Json
      }
      retry_manual_order: { Args: { _order_id: string }; Returns: Json }
      set_order_target_workspace: {
        Args: { _fingerprint: string; _order_id: string; _workspace: string }
        Returns: {
          amount_cents: number
          assigned_at: string | null
          assigned_bot_id: string | null
          balance_applied_cents: number
          balance_applied_credits: number
          bot_invite_confirmed_at: string | null
          bot_invite_confirmed_fingerprint: string | null
          client_fingerprint: string | null
          created_at: string
          credits: number
          current_workspace: string | null
          customer_email: string
          customer_name: string
          customer_tax_id: string | null
          customer_whatsapp: string | null
          delivered_at: string | null
          failed_reason: string | null
          id: string
          is_manual: boolean
          last_workspace: string | null
          multi_workspace_mode: boolean
          pack_id: string | null
          paid_at: string | null
          partner_id: string
          pix_copy_paste: string | null
          pix_expires_at: string | null
          pix_qrcode: string | null
          price_cents_per_workspace: number | null
          raw_payload: Json | null
          refunded_credits: number
          schedule_id: string | null
          schedule_run_index: number | null
          status: Database["public"]["Enums"]["partner_order_status"]
          stop_requested_at: string | null
          target_workspace: string | null
          tx_id: string | null
          updated_at: string
          workspaces_done: number
          workspaces_history: Json
          workspaces_plan: Json | null
          workspaces_total: number | null
        }
        SetofOptions: {
          from: "*"
          to: "partner_credit_orders"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      skip_current_workspace: {
        Args: { _order_id: string; _reason?: string }
        Returns: Json
      }
      stop_order_partial: {
        Args: { _fingerprint: string; _order_id: string }
        Returns: number
      }
      transfer_balance_between_emails: {
        Args: {
          _fingerprint: string
          _from_email: string
          _partner_id: string
          _to_email: string
        }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user"
      farm_bot_status: "idle" | "busy" | "offline" | "disabled"
      order_schedule_end_mode: "days" | "until_date" | "total_credits"
      order_schedule_status: "active" | "paused" | "completed" | "canceled"
      parceiro_status: "pendente" | "ativo" | "suspenso"
      partner_order_status:
        | "pending"
        | "paid"
        | "queued"
        | "processing"
        | "delivered"
        | "failed"
        | "refunded"
        | "expired"
        | "waiting_invite"
        | "waiting_workspace"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      farm_bot_status: ["idle", "busy", "offline", "disabled"],
      order_schedule_end_mode: ["days", "until_date", "total_credits"],
      order_schedule_status: ["active", "paused", "completed", "canceled"],
      parceiro_status: ["pendente", "ativo", "suspenso"],
      partner_order_status: [
        "pending",
        "paid",
        "queued",
        "processing",
        "delivered",
        "failed",
        "refunded",
        "expired",
        "waiting_invite",
        "waiting_workspace",
      ],
    },
  },
} as const
