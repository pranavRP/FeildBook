
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "api_keys": {
                  Row: {
                    "created_at": string,"created_by": string | null,"id": string,"key_hash": string,"label": string | null,"last_used_at": string | null,"prefix": string,"revoked_at": string | null,"rig_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"key_hash": string,"label"?: string | null,"last_used_at"?: string | null,"prefix": string,"revoked_at"?: string | null,"rig_id": string
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"id"?: string,"key_hash"?: string,"label"?: string | null,"last_used_at"?: string | null,"prefix"?: string,"revoked_at"?: string | null,"rig_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "api_keys_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "api_keys_rig_id_fkey"
      columns: ["rig_id"]
isOneToOne: false
      referencedRelation: "rigs"
      referencedColumns: ["id"]
    }
                  ]
                },"audit_log": {
                  Row: {
                    "action": string,"actor_id": string | null,"created_at": string,"diff": Json | null,"id": number,"row_id": string | null,"table_name": string
                  }
                  ComputedFields: never
                  Insert: {
                    "action": string,"actor_id"?: string | null,"created_at"?: string,"diff"?: Json | null,"id"?: never,"row_id"?: string | null,"table_name": string
                  }
                  Update: {
                    "action"?: string,"actor_id"?: string | null,"created_at"?: string,"diff"?: Json | null,"id"?: never,"row_id"?: string | null,"table_name"?: string
                  }
                  Relationships: [
                    
                  ]
                },"episodes": {
                  Row: {
                    "created_at": string,"data_uri": string | null,"duration_s": number | null,"external_id": string,"failure_reason": string | null,"id": string,"metadata": NonNullable<Json>,"outcome": Database["public"]['Enums']["episode_outcome"],"session_id": string,"task_id": string,"task_version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"data_uri"?: string | null,"duration_s"?: number | null,"external_id"?: string,"failure_reason"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"outcome": Database["public"]['Enums']["episode_outcome"],"session_id": string,"task_id": string,"task_version": number
                  }
                  Update: {
                    "created_at"?: string,"data_uri"?: string | null,"duration_s"?: number | null,"external_id"?: string,"failure_reason"?: string | null,"id"?: string,"metadata"?: NonNullable<Json>,"outcome"?: Database["public"]['Enums']["episode_outcome"],"session_id"?: string,"task_id"?: string,"task_version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "episodes_session_id_fkey"
      columns: ["session_id"]
isOneToOne: false
      referencedRelation: "sessions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "episodes_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "active": boolean,"created_at": string,"email": string,"full_name": string | null,"id": string,"is_contractor": boolean,"role": Database["public"]['Enums']["user_role"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"created_at"?: string,"email": string,"full_name"?: string | null,"id": string,"is_contractor"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"created_at"?: string,"email"?: string,"full_name"?: string | null,"id"?: string,"is_contractor"?: boolean,"role"?: Database["public"]['Enums']["user_role"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"props": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"notes": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"notes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"notes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"rigs": {
                  Row: {
                    "active": boolean,"arm_model": string | null,"arms": number,"created_at": string,"headset": string | null,"id": string,"name": string,"notes": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "active"?: boolean,"arm_model"?: string | null,"arms"?: number,"created_at"?: string,"headset"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "active"?: boolean,"arm_model"?: string | null,"arms"?: number,"created_at"?: string,"headset"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"scene_photos": {
                  Row: {
                    "annotations": NonNullable<Json>,"caption": string | null,"content_hash": string | null,"created_at": string,"height": number | null,"id": string,"kind": Database["public"]['Enums']["photo_kind"],"scene_id": string,"storage_path": string,"thumb_path": string,"uploaded_by": string | null,"width": number | null
                  }
                  ComputedFields: never
                  Insert: {
                    "annotations"?: NonNullable<Json>,"caption"?: string | null,"content_hash"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["photo_kind"],"scene_id": string,"storage_path": string,"thumb_path": string,"uploaded_by"?: string | null,"width"?: number | null
                  }
                  Update: {
                    "annotations"?: NonNullable<Json>,"caption"?: string | null,"content_hash"?: string | null,"created_at"?: string,"height"?: number | null,"id"?: string,"kind"?: Database["public"]['Enums']["photo_kind"],"scene_id"?: string,"storage_path"?: string,"thumb_path"?: string,"uploaded_by"?: string | null,"width"?: number | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "scene_photos_scene_id_fkey"
      columns: ["scene_id"]
isOneToOne: false
      referencedRelation: "scenes"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "scene_photos_uploaded_by_fkey"
      columns: ["uploaded_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"scenes": {
                  Row: {
                    "archived": boolean,"clearance_notes": string | null,"created_at": string,"description": string | null,"id": string,"name": string,"reset_instructions": string | null,"surface_height_in": number | null,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"clearance_notes"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"name": string,"reset_instructions"?: string | null,"surface_height_in"?: number | null,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "archived"?: boolean,"clearance_notes"?: string | null,"created_at"?: string,"description"?: string | null,"id"?: string,"name"?: string,"reset_instructions"?: string | null,"surface_height_in"?: number | null,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "scenes_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"sessions": {
                  Row: {
                    "created_at": string,"ended_at": string | null,"id": string,"notes": string | null,"operator_id": string,"rig_id": string | null,"source": string,"started_at": string,"updated_at": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"ended_at"?: string | null,"id"?: string,"notes"?: string | null,"operator_id": string,"rig_id"?: string | null,"source"?: string,"started_at"?: string,"updated_at"?: string,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"ended_at"?: string | null,"id"?: string,"notes"?: string | null,"operator_id"?: string,"rig_id"?: string | null,"source"?: string,"started_at"?: string,"updated_at"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "sessions_operator_id_fkey"
      columns: ["operator_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_rig_id_fkey"
      columns: ["rig_id"]
isOneToOne: false
      referencedRelation: "rigs"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "sessions_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"task_props": {
                  Row: {
                    "acquired": boolean,"created_at": string,"prop_id": string,"qty": number,"source": Database["public"]['Enums']["prop_source"],"task_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "acquired"?: boolean,"created_at"?: string,"prop_id": string,"qty"?: number,"source"?: Database["public"]['Enums']["prop_source"],"task_id": string,"updated_at"?: string
                  }
                  Update: {
                    "acquired"?: boolean,"created_at"?: string,"prop_id"?: string,"qty"?: number,"source"?: Database["public"]['Enums']["prop_source"],"task_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_props_prop_id_fkey"
      columns: ["prop_id"]
isOneToOne: false
      referencedRelation: "props"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_props_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"task_versions": {
                  Row: {
                    "change_reason": string | null,"changed_by": string | null,"created_at": string,"id": string,"instruction": string,"task_id": string,"version": number
                  }
                  ComputedFields: never
                  Insert: {
                    "change_reason"?: string | null,"changed_by"?: string | null,"created_at"?: string,"id"?: string,"instruction": string,"task_id": string,"version": number
                  }
                  Update: {
                    "change_reason"?: string | null,"changed_by"?: string | null,"created_at"?: string,"id"?: string,"instruction"?: string,"task_id"?: string,"version"?: number
                  }
                  Relationships: [
                    {
      foreignKeyName: "task_versions_changed_by_fkey"
      columns: ["changed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "task_versions_task_id_fkey"
      columns: ["task_id"]
isOneToOne: false
      referencedRelation: "tasks"
      referencedColumns: ["id"]
    }
                  ]
                },"tasks": {
                  Row: {
                    "archived": boolean,"arms_required": number,"code": string,"created_at": string,"created_by": string | null,"current_version": number,"difficulty": number | null,"episode_count": number,"feasibility_notes": string | null,"id": string,"import_key": string | null,"instruction": string,"max_prop_weight_g": number | null,"notes": string | null,"priority": number,"scene_id": string,"status": Database["public"]['Enums']["task_status"],"success_count": number,"tags": (string)[],"target_episodes": number,"updated_at": string,"version_change_reason": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "archived"?: boolean,"arms_required"?: number,"code"?: string,"created_at"?: string,"created_by"?: string | null,"current_version"?: number,"difficulty"?: number | null,"episode_count"?: number,"feasibility_notes"?: string | null,"id"?: string,"import_key"?: string | null,"instruction": string,"max_prop_weight_g"?: number | null,"notes"?: string | null,"priority"?: number,"scene_id": string,"status"?: Database["public"]['Enums']["task_status"],"success_count"?: number,"tags"?: (string)[],"target_episodes"?: number,"updated_at"?: string,"version_change_reason"?: string | null
                  }
                  Update: {
                    "archived"?: boolean,"arms_required"?: number,"code"?: string,"created_at"?: string,"created_by"?: string | null,"current_version"?: number,"difficulty"?: number | null,"episode_count"?: number,"feasibility_notes"?: string | null,"id"?: string,"import_key"?: string | null,"instruction"?: string,"max_prop_weight_g"?: number | null,"notes"?: string | null,"priority"?: number,"scene_id"?: string,"status"?: Database["public"]['Enums']["task_status"],"success_count"?: number,"tags"?: (string)[],"target_episodes"?: number,"updated_at"?: string,"version_change_reason"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tasks_created_by_fkey"
      columns: ["created_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tasks_scene_id_fkey"
      columns: ["scene_id"]
isOneToOne: false
      referencedRelation: "scenes"
      referencedColumns: ["id"]
    }
                  ]
                },"venue_assignments": {
                  Row: {
                    "created_at": string,"user_id": string,"venue_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"user_id": string,"venue_id": string
                  }
                  Update: {
                    "created_at"?: string,"user_id"?: string,"venue_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "venue_assignments_user_id_fkey"
      columns: ["user_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "venue_assignments_venue_id_fkey"
      columns: ["venue_id"]
isOneToOne: false
      referencedRelation: "venues"
      referencedColumns: ["id"]
    }
                  ]
                },"venues": {
                  Row: {
                    "address": string | null,"archived": boolean,"created_at": string,"drive_folder_url": string | null,"id": string,"name": string,"notes": string | null,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "address"?: string | null,"archived"?: boolean,"created_at"?: string,"drive_folder_url"?: string | null,"id"?: string,"name": string,"notes"?: string | null,"updated_at"?: string
                  }
                  Update: {
                    "address"?: string | null,"archived"?: boolean,"created_at"?: string,"drive_folder_url"?: string | null,"id"?: string,"name"?: string,"notes"?: string | null,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_revoke_sessions":
{ Args: { "p_user_id": string }; Returns: number
                           },
"api_rate_limit_hit":
{ Args: { "p_key_id": string,"p_limit"?: number,"p_window_seconds"?: number }; Returns: boolean
                           },
"dashboard_daily":
{ Args: { "p_days"?: number,"p_tz"?: string }; Returns: {
              "aborted": number,"day": string,"failure": number,"success": number
            }[]
                           },
"save_task_props":
{ Args: { "p_props": Json,"p_task_id": string }; Returns: undefined
                           },
"set_task_feasibility":
{ Args: { "p_notes"?: string,"p_result": Database["public"]['Enums']["task_status"],"p_task_id": string }; Returns: {
              "archived": boolean,
"arms_required": number,
"code": string,
"created_at": string,
"created_by": string | null,
"current_version": number,
"difficulty": number | null,
"episode_count": number,
"feasibility_notes": string | null,
"id": string,
"import_key": string | null,
"instruction": string,
"max_prop_weight_g": number | null,
"notes": string | null,
"priority": number,
"scene_id": string,
"status": Database["public"]['Enums']["task_status"],
"success_count": number,
"tags": (string)[],
"target_episodes": number,
"updated_at": string,
"version_change_reason": string | null
            }
                          SetofOptions: {
        from: "*"
        to: "tasks"
        isOneToOne: true
        isSetofReturn: false
      } },
"similar_tasks":
{ Args: { "p_exclude"?: string,"p_query": string,"p_threshold"?: number }; Returns: {
              "code": string,"id": string,"instruction": string,"similarity": number,"status": Database["public"]['Enums']["task_status"]
            }[]
                           }
          }
          Enums: {
            "episode_outcome": "success"|"failure"|"aborted","photo_kind": "reference"|"layout"|"reset"|"other","prop_source": "at_scene"|"to_buy","task_status": "proposed"|"feasibility_test"|"feasible"|"needs_change"|"infeasible"|"ready"|"collecting"|"done","user_role": "admin"|"designer"|"operator"|"viewer"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "episode_outcome": ["success", "failure", "aborted"],"photo_kind": ["reference", "layout", "reset", "other"],"prop_source": ["at_scene", "to_buy"],"task_status": ["proposed", "feasibility_test", "feasible", "needs_change", "infeasible", "ready", "collecting", "done"],"user_role": ["admin", "designer", "operator", "viewer"]
          }
        }
} as const
