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
      ops_field_reports: {
        Row: {
          battery_voltage: number | null
          checklist: Json
          created_at: string
          fuel_level_pct: number | null
          hour_meter: number | null
          id: string
          notes: string | null
          photos: string[]
          task_id: string
          technician_name: string
        }
        Insert: {
          battery_voltage?: number | null
          checklist?: Json
          created_at?: string
          fuel_level_pct?: number | null
          hour_meter?: number | null
          id?: string
          notes?: string | null
          photos?: string[]
          task_id: string
          technician_name: string
        }
        Update: {
          battery_voltage?: number | null
          checklist?: Json
          created_at?: string
          fuel_level_pct?: number | null
          hour_meter?: number | null
          id?: string
          notes?: string | null
          photos?: string[]
          task_id?: string
          technician_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_field_reports_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ops_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_sites: {
        Row: {
          access_notes: string | null
          code: string
          created_at: string
          equipment: string | null
          id: string
          last_alert: string | null
          last_alert_at: string | null
          lat: number
          lng: number
          name: string
          region: string
          state: string
          status: string
          updated_at: string
        }
        Insert: {
          access_notes?: string | null
          code: string
          created_at?: string
          equipment?: string | null
          id?: string
          last_alert?: string | null
          last_alert_at?: string | null
          lat: number
          lng: number
          name: string
          region: string
          state: string
          status?: string
          updated_at?: string
        }
        Update: {
          access_notes?: string | null
          code?: string
          created_at?: string
          equipment?: string | null
          id?: string
          last_alert?: string | null
          last_alert_at?: string | null
          lat?: number
          lng?: number
          name?: string
          region?: string
          state?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ops_task_activity: {
        Row: {
          actor: string
          category: string
          created_at: string
          id: string
          message: string
          task_id: string
        }
        Insert: {
          actor: string
          category: string
          created_at?: string
          id?: string
          message: string
          task_id: string
        }
        Update: {
          actor?: string
          category?: string
          created_at?: string
          id?: string
          message?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "ops_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string
          due_at: string | null
          equipment: string | null
          escalated_at: string | null
          id: string
          priority: string
          site_id: string
          status: string
          task_code: string
          technician_id: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string
          due_at?: string | null
          equipment?: string | null
          escalated_at?: string | null
          id?: string
          priority?: string
          site_id: string
          status?: string
          task_code: string
          technician_id?: string | null
          title: string
          type: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string
          due_at?: string | null
          equipment?: string | null
          escalated_at?: string | null
          id?: string
          priority?: string
          site_id?: string
          status?: string
          task_code?: string
          technician_id?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_tasks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "ops_sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ops_tasks_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "ops_technicians"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_technicians: {
        Row: {
          availability: string
          call_sign: string
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          phone: string | null
          region: string
        }
        Insert: {
          availability?: string
          call_sign: string
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          phone?: string | null
          region: string
        }
        Update: {
          availability?: string
          call_sign?: string
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          phone?: string | null
          region?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
