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
      checklist_tasks: {
        Row: {
          checklist_id: string
          created_at: string
          id: string
          position: number
          title: string
        }
        Insert: {
          checklist_id: string
          created_at?: string
          id?: string
          position?: number
          title: string
        }
        Update: {
          checklist_id?: string
          created_at?: string
          id?: string
          position?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_tasks_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklists: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          fixed_params: boolean
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string
          fixed_params?: boolean
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          fixed_params?: boolean
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      liberacao_eventos: {
        Row: {
          autor: string | null
          autor_nome: string
          created_at: string
          detalhe: string
          id: string
          liberacao_id: string
          tipo: string
        }
        Insert: {
          autor?: string | null
          autor_nome?: string
          created_at?: string
          detalhe?: string
          id?: string
          liberacao_id: string
          tipo: string
        }
        Update: {
          autor?: string | null
          autor_nome?: string
          created_at?: string
          detalhe?: string
          id?: string
          liberacao_id?: string
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "liberacao_eventos_liberacao_id_fkey"
            columns: ["liberacao_id"]
            isOneToOne: false
            referencedRelation: "liberacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      liberacao_itens: {
        Row: {
          acabamento: string
          altura_cm: number | null
          created_at: string
          detalhes: string
          id: string
          instalacao: string
          insumos: string
          largura_cm: number | null
          liberacao_id: string
          local_instalacao: string
          position: number
          quantidade: number | null
          referencia: string
          servico: string
        }
        Insert: {
          acabamento?: string
          altura_cm?: number | null
          created_at?: string
          detalhes?: string
          id?: string
          instalacao?: string
          insumos?: string
          largura_cm?: number | null
          liberacao_id: string
          local_instalacao?: string
          position?: number
          quantidade?: number | null
          referencia?: string
          servico?: string
        }
        Update: {
          acabamento?: string
          altura_cm?: number | null
          created_at?: string
          detalhes?: string
          id?: string
          instalacao?: string
          insumos?: string
          largura_cm?: number | null
          liberacao_id?: string
          local_instalacao?: string
          position?: number
          quantidade?: number | null
          referencia?: string
          servico?: string
        }
        Relationships: [
          {
            foreignKeyName: "liberacao_itens_liberacao_id_fkey"
            columns: ["liberacao_id"]
            isOneToOne: false
            referencedRelation: "liberacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      liberacoes: {
        Row: {
          bissemana: string
          classificacao_venda: string
          cliente: string
          contato: string
          created_at: string
          created_by: string | null
          data_entrega: string | null
          data_liberacao: string | null
          decidido_em: string | null
          decidido_por: string | null
          decidido_por_nome: string
          endereco: string
          enviada_em: string
          horario_instalacao: string
          id: string
          modelo: string
          motivo_reprovacao: string
          numero: number
          observacoes: string
          ponto_energia: string
          project_id: string | null
          projetista: string
          responsavel: string
          status: string
          updated_at: string
          vendedor: string
        }
        Insert: {
          bissemana?: string
          classificacao_venda?: string
          cliente?: string
          contato?: string
          created_at?: string
          created_by?: string | null
          data_entrega?: string | null
          data_liberacao?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          decidido_por_nome?: string
          endereco?: string
          enviada_em?: string
          horario_instalacao?: string
          id?: string
          modelo: string
          motivo_reprovacao?: string
          numero?: number
          observacoes?: string
          ponto_energia?: string
          project_id?: string | null
          projetista?: string
          responsavel?: string
          status?: string
          updated_at?: string
          vendedor?: string
        }
        Update: {
          bissemana?: string
          classificacao_venda?: string
          cliente?: string
          contato?: string
          created_at?: string
          created_by?: string | null
          data_entrega?: string | null
          data_liberacao?: string | null
          decidido_em?: string | null
          decidido_por?: string | null
          decidido_por_nome?: string
          endereco?: string
          enviada_em?: string
          horario_instalacao?: string
          id?: string
          modelo?: string
          motivo_reprovacao?: string
          numero?: number
          observacoes?: string
          ponto_energia?: string
          project_id?: string | null
          projetista?: string
          responsavel?: string
          status?: string
          updated_at?: string
          vendedor?: string
        }
        Relationships: [
          {
            foreignKeyName: "liberacoes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      project_blockers: {
        Row: {
          created_at: string
          created_by: string | null
          created_by_name: string | null
          description: string
          id: string
          project_id: string
          resolved_at: string | null
          suggestion: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description: string
          id?: string
          project_id: string
          resolved_at?: string | null
          suggestion?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          created_by_name?: string | null
          description?: string
          id?: string
          project_id?: string
          resolved_at?: string | null
          suggestion?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_blockers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_blockers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completed_by_name: string | null
          created_at: string
          id: string
          position: number
          project_id: string
          title: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          id?: string
          position?: number
          project_id: string
          title: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completed_by_name?: string | null
          created_at?: string
          id?: string
          position?: number
          project_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          archived: boolean
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string
          due_date: string | null
          id: string
          locked: boolean
          name: string
          source_checklist_id: string | null
          updated_at: string
        }
        Insert: {
          archived?: boolean
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          locked?: boolean
          name: string
          source_checklist_id?: string | null
          updated_at?: string
        }
        Update: {
          archived?: boolean
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          due_date?: string | null
          id?: string
          locked?: boolean
          name?: string
          source_checklist_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_source_checklist_id_fkey"
            columns: ["source_checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      can_aprovar_liberacoes: { Args: { _user_id: string }; Returns: boolean }
      can_edit_liberacoes: { Args: { _user_id: string }; Returns: boolean }
      create_project: {
        Args: {
          _checklist_id: string
          _description: string
          _due_date: string
          _name: string
        }
        Returns: string
      }
      current_display_name: { Args: never; Returns: string }
      duplicate_project: { Args: { _project_id: string }; Returns: string }
      has_any_role: {
        Args: { _roles: string[]; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_team_member: { Args: { _user_id: string }; Returns: boolean }
      liberacao_editavel: { Args: { _liberacao_id: string }; Returns: boolean }
      old_with_project: {
        Args: {
          _old: Database["public"]["Tables"]["liberacoes"]["Row"]
          _project: string
        }
        Returns: {
          bissemana: string
          classificacao_venda: string
          cliente: string
          contato: string
          created_at: string
          created_by: string | null
          data_entrega: string | null
          data_liberacao: string | null
          decidido_em: string | null
          decidido_por: string | null
          decidido_por_nome: string
          endereco: string
          enviada_em: string
          horario_instalacao: string
          id: string
          modelo: string
          motivo_reprovacao: string
          numero: number
          observacoes: string
          ponto_energia: string
          project_id: string | null
          projetista: string
          responsavel: string
          status: string
          updated_at: string
          vendedor: string
        }
        SetofOptions: {
          from: "*"
          to: "liberacoes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      app_role:
        | "gestor"
        | "membro"
        | "comercial"
        | "pcp"
        | "direcao"
        | "criacao"
        | "producao"
        | "montagem"
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
    Enums: {
      app_role: [
        "gestor",
        "membro",
        "comercial",
        "pcp",
        "direcao",
        "criacao",
        "producao",
        "montagem",
      ],
    },
  },
} as const
