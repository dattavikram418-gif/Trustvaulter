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
      account_notifications: {
        Row: {
          bucket_start: string
          first_at: string
          id: string
          kind: string
          last_at: string
          occurrences: number
          read_at: string | null
          recipient_id: string
          subject_id: string
        }
        Insert: {
          bucket_start: string
          first_at?: string
          id?: string
          kind: string
          last_at?: string
          occurrences?: number
          read_at?: string | null
          recipient_id: string
          subject_id: string
        }
        Update: {
          bucket_start?: string
          first_at?: string
          id?: string
          kind?: string
          last_at?: string
          occurrences?: number
          read_at?: string | null
          recipient_id?: string
          subject_id?: string
        }
        Relationships: []
      }
      audit_checkpoint_state: {
        Row: {
          chain_id: string
          counter: number
          singleton: boolean
          system_id: string
        }
        Insert: {
          chain_id?: string
          counter?: number
          singleton?: boolean
          system_id?: string
        }
        Update: {
          chain_id?: string
          counter?: number
          singleton?: boolean
          system_id?: string
        }
        Relationships: []
      }
      audit_events: {
        Row: {
          action: string
          actor_id: string | null
          at: string
          canonical: string
          canonical_version: number
          changes: Json
          document_id: string | null
          event_hash: string
          outcome: string
          previous_hash: string
          reason: string
          request_id: string | null
          sequence: number
          session_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          at: string
          canonical: string
          canonical_version?: number
          changes?: Json
          document_id?: string | null
          event_hash: string
          outcome: string
          previous_hash: string
          reason: string
          request_id?: string | null
          sequence?: never
          session_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          at?: string
          canonical?: string
          canonical_version?: number
          changes?: Json
          document_id?: string | null
          event_hash?: string
          outcome?: string
          previous_hash?: string
          reason?: string
          request_id?: string | null
          sequence?: never
          session_id?: string | null
        }
        Relationships: []
      }
      document_grants: {
        Row: {
          document_id: string
          permission: string
          shared_email: string | null
          user_id: string
        }
        Insert: {
          document_id: string
          permission: string
          shared_email?: string | null
          user_id: string
        }
        Update: {
          document_id?: string
          permission?: string
          shared_email?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_grants_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_grants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      document_versions: {
        Row: {
          document_id: string
          id: string
          quarantine_state: string
          version_number: number
        }
        Insert: {
          document_id: string
          id?: string
          quarantine_state?: string
          version_number: number
        }
        Update: {
          document_id?: string
          id?: string
          quarantine_state?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          acl_revision: number
          category: string
          created_at: string
          deleted_at: string | null
          id: string
          lifecycle: string
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          acl_revision?: number
          category?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lifecycle?: string
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          acl_revision?: number
          category?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          lifecycle?: string
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          active: boolean
          display_name: string
          user_id: string
        }
        Insert: {
          active?: boolean
          display_name?: string
          user_id: string
        }
        Update: {
          active?: boolean
          display_name?: string
          user_id?: string
        }
        Relationships: []
      }
      quarantine_cleanup_attempts: {
        Row: {
          claim_until: string
          finished_at: string | null
          id: string
          intent_request_id: string
          outcome: string | null
          receipt_request_id: string | null
          reservation_id: string
          started_at: string
        }
        Insert: {
          claim_until: string
          finished_at?: string | null
          id: string
          intent_request_id: string
          outcome?: string | null
          receipt_request_id?: string | null
          reservation_id: string
          started_at?: string
        }
        Update: {
          claim_until?: string
          finished_at?: string | null
          id?: string
          intent_request_id?: string
          outcome?: string | null
          receipt_request_id?: string | null
          reservation_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quarantine_cleanup_attempts_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "quarantine_cleanup_intents"
            referencedColumns: ["reservation_id"]
          },
        ]
      }
      quarantine_cleanup_intents: {
        Row: {
          attempts: number
          claim_id: string | null
          claim_until: string | null
          completed_at: string | null
          created_at: string
          next_attempt_at: string
          reservation_id: string
        }
        Insert: {
          attempts?: number
          claim_id?: string | null
          claim_until?: string | null
          completed_at?: string | null
          created_at?: string
          next_attempt_at?: string
          reservation_id: string
        }
        Update: {
          attempts?: number
          claim_id?: string | null
          claim_until?: string | null
          completed_at?: string | null
          created_at?: string
          next_attempt_at?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quarantine_cleanup_intents_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "upload_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      quarantine_scan_checks: {
        Row: {
          byte_size: number
          checked_at: string
          digest: string
          document_id: string
          engine: string | null
          evidence_hash: string
          evidence_request_id: string
          id: string
          nonce: string | null
          reservation_id: string
          response_signature: string | null
          signature_version: string | null
          signed_body: string | null
          upload_request_id: string
          verdict: string
          version_id: string
        }
        Insert: {
          byte_size: number
          checked_at?: string
          digest: string
          document_id: string
          engine?: string | null
          evidence_hash: string
          evidence_request_id: string
          id?: string
          nonce?: string | null
          reservation_id: string
          response_signature?: string | null
          signature_version?: string | null
          signed_body?: string | null
          upload_request_id: string
          verdict: string
          version_id: string
        }
        Update: {
          byte_size?: number
          checked_at?: string
          digest?: string
          document_id?: string
          engine?: string | null
          evidence_hash?: string
          evidence_request_id?: string
          id?: string
          nonce?: string | null
          reservation_id?: string
          response_signature?: string | null
          signature_version?: string | null
          signed_body?: string | null
          upload_request_id?: string
          verdict?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quarantine_scan_checks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quarantine_scan_checks_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "upload_reservations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quarantine_scan_checks_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: true
            referencedRelation: "quarantined_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      quarantined_versions: {
        Row: {
          byte_size: number
          created_at: string
          digest: string
          document_id: string
          filename: string
          id: string
          mime: string
          object_key: string
          quarantine_state: string
          reservation_id: string
          scan_evidence: string
          version_number: number
        }
        Insert: {
          byte_size: number
          created_at?: string
          digest: string
          document_id: string
          filename: string
          id?: string
          mime: string
          object_key: string
          quarantine_state?: string
          reservation_id: string
          scan_evidence: string
          version_number: number
        }
        Update: {
          byte_size?: number
          created_at?: string
          digest?: string
          document_id?: string
          filename?: string
          id?: string
          mime?: string
          object_key?: string
          quarantine_state?: string
          reservation_id?: string
          scan_evidence?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "quarantined_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quarantined_versions_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "upload_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      share_email_attempts: {
        Row: {
          actor_id: string
          at: string
          id: string
        }
        Insert: {
          actor_id: string
          at?: string
          id?: string
        }
        Update: {
          actor_id?: string
          at?: string
          id?: string
        }
        Relationships: []
      }
      upload_receiving_claims: {
        Row: {
          acquired_at: string
          actor_id: string
          fence_hash: string
          id: string
          lease_until: string
          release_outcome: string | null
          released_at: string | null
          reservation_id: string
          session_id: string
          state: string
        }
        Insert: {
          acquired_at?: string
          actor_id: string
          fence_hash: string
          id?: string
          lease_until: string
          release_outcome?: string | null
          released_at?: string | null
          reservation_id: string
          session_id: string
          state?: string
        }
        Update: {
          acquired_at?: string
          actor_id?: string
          fence_hash?: string
          id?: string
          lease_until?: string
          release_outcome?: string | null
          released_at?: string | null
          reservation_id?: string
          session_id?: string
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "upload_receiving_claims_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: true
            referencedRelation: "upload_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      upload_reservations: {
        Row: {
          actor_id: string
          byte_size: number | null
          digest: string | null
          document_id: string
          expected_revision: number
          expires_at: string
          filename: string | null
          id: string
          mime: string | null
          object_key: string
          session_id: string
          state: string
          version_id: string | null
        }
        Insert: {
          actor_id: string
          byte_size?: number | null
          digest?: string | null
          document_id: string
          expected_revision: number
          expires_at?: string
          filename?: string | null
          id?: string
          mime?: string | null
          object_key?: string
          session_id: string
          state?: string
          version_id?: string | null
        }
        Update: {
          actor_id?: string
          byte_size?: number | null
          digest?: string | null
          document_id?: string
          expected_revision?: number
          expires_at?: string
          filename?: string | null
          id?: string
          mime?: string | null
          object_key?: string
          session_id?: string
          state?: string
          version_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "upload_reservations_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          role: Database["public"]["Enums"]["tv_role"]
          user_id: string
        }
        Insert: {
          role?: Database["public"]["Enums"]["tv_role"]
          user_id: string
        }
        Update: {
          role?: Database["public"]["Enums"]["tv_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      tv_admin_change: {
        Args: { e: Database["public"]["Tables"]["audit_events"]["Row"] }
        Returns: Json
      }
      tv_admin_events: { Args: { payload: Json }; Returns: Json }
      tv_append_audit: {
        Args: { a: string; act: string; d: string; result: string; why: string }
        Returns: undefined
      }
      tv_append_audit_v2: {
        Args: {
          a: string
          act: string
          c: Json
          d: string
          r: string
          result: string
          s: string
          why: string
        }
        Returns: undefined
      }
      tv_audit_checkpoint_snapshot: { Args: never; Returns: Json }
      tv_bridge_identity: { Args: { a: string; s: string }; Returns: boolean }
      tv_notifications: { Args: { act: string; payload: Json }; Returns: Json }
      tv_notify: {
        Args: { k: string; recipient: string; subject: string }
        Returns: undefined
      }
      tv_operation: { Args: { action: string; payload?: Json }; Returns: Json }
      tv_quarantine_cleanup_candidates: {
        Args: { maximum?: number }
        Returns: Json
      }
      tv_quarantine_cleanup_claim: { Args: { maximum?: number }; Returns: Json }
      tv_quarantine_cleanup_receipt: {
        Args: { claim: string; outcome: string }
        Returns: Json
      }
      tv_session_failure: { Args: never; Returns: undefined }
      tv_session_failure_correlated: { Args: never; Returns: string }
      tv_share_email: { Args: { payload: Json }; Returns: Json }
      tv_upload_access: {
        Args: {
          a: string
          d: string
          rev: number
          s: string
          write_access: boolean
        }
        Returns: string
      }
      tv_upload_admission_busy: {
        Args: { caller: string; caller_session: string }
        Returns: Json
      }
      tv_upload_claim: {
        Args: { caller: string; caller_session: string; ticket_id: string }
        Returns: Json
      }
      tv_upload_claim_recover: {
        Args: { attestation: string; cid: string }
        Returns: Json
      }
      tv_upload_claim_valid: {
        Args: {
          caller: string
          caller_session: string
          cid: string
          fence: string
          require_lease: boolean
        }
        Returns: {
          acquired_at: string
          actor_id: string
          fence_hash: string
          id: string
          lease_until: string
          release_outcome: string | null
          released_at: string | null
          reservation_id: string
          session_id: string
          state: string
        }
        SetofOptions: {
          from: "*"
          to: "upload_receiving_claims"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      tv_upload_envelope: { Args: { req: string; why: string }; Returns: Json }
      tv_upload_fail_fenced: {
        Args: {
          caller: string
          caller_session: string
          cid: string
          fence: string
        }
        Returns: Json
      }
      tv_upload_fenced_denial: {
        Args: { caller: string; caller_session: string; step: string }
        Returns: Json
      }
      tv_upload_finish_evidenced: {
        Args: {
          caller: string
          caller_session: string
          scan_result?: Json
          scan_verdict: string
          ticket_id: string
        }
        Returns: Json
      }
      tv_upload_finish_fenced: {
        Args: {
          caller: string
          caller_session: string
          cid: string
          fence: string
          scan_result?: Json
          scan_verdict: string
        }
        Returns: Json
      }
      tv_upload_release_fenced: {
        Args: { cid: string; fence: string; outcome: string }
        Returns: Json
      }
      tv_upload_request: {
        Args: { action: string; payload?: Json }
        Returns: Json
      }
      tv_upload_stage_fenced: {
        Args: {
          caller: string
          caller_session: string
          cid: string
          fence: string
          hash: string
          media: string
          safe_name: string
          size: number
        }
        Returns: Json
      }
      tv_upload_transition: {
        Args: {
          caller: string
          caller_session: string
          hash?: string
          media?: string
          safe_name?: string
          size?: number
          step: string
          ticket_id: string
          verdict?: string
        }
        Returns: Json
      }
      tv_verified_caller: { Args: never; Returns: Record<string, unknown> }
    }
    Enums: {
      tv_role: "administrator" | "document_creator" | "viewer"
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
      tv_role: ["administrator", "document_creator", "viewer"],
    },
  },
} as const
