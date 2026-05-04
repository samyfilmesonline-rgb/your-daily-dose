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
      profiles: {
        Row: {
          criado_em: string
          email: string
          id: string
        }
        Insert: {
          criado_em?: string
          email: string
          id: string
        }
        Update: {
          criado_em?: string
          email?: string
          id?: string
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
      [_ in never]: never
    }
    Functions: {
      current_partner_name: { Args: never; Returns: string }
      current_partner_whatsapp: { Args: never; Returns: string }
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
      parceiro_ativo: { Args: { _user_id: string }; Returns: boolean }
      recalc_parceiro_creditos: {
        Args: { _user_id: string }
        Returns: undefined
      }
      recalc_resumo_lovable_workspace: {
        Args: { p_email: string; p_id_do_usuario: string; p_workspace: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "admin" | "user"
      parceiro_status: "pendente" | "ativo" | "suspenso"
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
      parceiro_status: ["pendente", "ativo", "suspenso"],
    },
  },
} as const
