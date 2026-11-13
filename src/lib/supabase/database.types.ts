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
      conferences: {
        Row: {
          abbreviation: string | null
          cfbd_id: number | null
          created_at: string
          id: number
          name: string
        }
        Insert: {
          abbreviation?: string | null
          cfbd_id?: number | null
          created_at?: string
          id?: never
          name: string
        }
        Update: {
          abbreviation?: string | null
          cfbd_id?: number | null
          created_at?: string
          id?: never
          name?: string
        }
        Relationships: []
      }
      entries: {
        Row: {
          created_at: string
          id: number
          league_id: number
          profile_id: string
          season_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          league_id: number
          profile_id: string
          season_id: number
        }
        Update: {
          created_at?: string
          id?: never
          league_id?: number
          profile_id?: string
          season_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "entries_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_league_id_profile_id_fkey"
            columns: ["league_id", "profile_id"]
            isOneToOne: false
            referencedRelation: "league_members"
            referencedColumns: ["league_id", "profile_id"]
          },
          {
            foreignKeyName: "entries_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entries_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      game_lines: {
        Row: {
          fetched_at: string
          game_id: number
          id: number
          provider: string
          source: Database["public"]["Enums"]["data_source"]
          spread_home: number | null
          spread_open_home: number | null
        }
        Insert: {
          fetched_at?: string
          game_id: number
          id?: never
          provider: string
          source?: Database["public"]["Enums"]["data_source"]
          spread_home?: number | null
          spread_open_home?: number | null
        }
        Update: {
          fetched_at?: string
          game_id?: number
          id?: never
          provider?: string
          source?: Database["public"]["Enums"]["data_source"]
          spread_home?: number | null
          spread_open_home?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "game_lines_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
        ]
      }
      games: {
        Row: {
          away_points: number | null
          away_team_id: number
          cfbd_id: number
          completed: boolean
          conference_game: boolean
          created_at: string
          home_points: number | null
          home_team_id: number
          id: number
          kickoff_at: string
          neutral_site: boolean
          season_id: number
          season_type: Database["public"]["Enums"]["season_type"]
          start_time_tbd: boolean
          updated_at: string
          week: number
        }
        Insert: {
          away_points?: number | null
          away_team_id: number
          cfbd_id: number
          completed?: boolean
          conference_game?: boolean
          created_at?: string
          home_points?: number | null
          home_team_id: number
          id?: never
          kickoff_at: string
          neutral_site?: boolean
          season_id: number
          season_type?: Database["public"]["Enums"]["season_type"]
          start_time_tbd?: boolean
          updated_at?: string
          week: number
        }
        Update: {
          away_points?: number | null
          away_team_id?: number
          cfbd_id?: number
          completed?: boolean
          conference_game?: boolean
          created_at?: string
          home_points?: number | null
          home_team_id?: number
          id?: never
          kickoff_at?: string
          neutral_site?: boolean
          season_id?: number
          season_type?: Database["public"]["Enums"]["season_type"]
          start_time_tbd?: boolean
          updated_at?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "games_away_team_id_fkey"
            columns: ["away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_home_team_id_fkey"
            columns: ["home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      league_members: {
        Row: {
          created_at: string
          league_id: number
          profile_id: string
          role: Database["public"]["Enums"]["member_role"]
          sheet_tab: string | null
        }
        Insert: {
          created_at?: string
          league_id: number
          profile_id: string
          role?: Database["public"]["Enums"]["member_role"]
          sheet_tab?: string | null
        }
        Update: {
          created_at?: string
          league_id?: number
          profile_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          sheet_tab?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_seasons: {
        Row: {
          league_id: number
          pick_sheet_id: string | null
          season_id: number
        }
        Insert: {
          league_id: number
          pick_sheet_id?: string | null
          season_id: number
        }
        Update: {
          league_id?: number
          pick_sheet_id?: string | null
          season_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_seasons_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      league_weeks: {
        Row: {
          league_id: number
          rule: Database["public"]["Enums"]["week_rule"]
          season_id: number
          week: number
        }
        Insert: {
          league_id: number
          rule?: Database["public"]["Enums"]["week_rule"]
          season_id: number
          week: number
        }
        Update: {
          league_id?: number
          rule?: Database["public"]["Enums"]["week_rule"]
          season_id?: number
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_weeks_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_weeks_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          created_at: string
          id: number
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: never
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: never
          name?: string
          slug?: string
        }
        Relationships: []
      }
      pick_import_overrides: {
        Row: {
          cell_text: string
          created_at: string
          entry_id: number
          player_id: number
          slot: Database["public"]["Enums"]["pick_slot"]
          week: number
        }
        Insert: {
          cell_text: string
          created_at?: string
          entry_id: number
          player_id: number
          slot: Database["public"]["Enums"]["pick_slot"]
          week: number
        }
        Update: {
          cell_text?: string
          created_at?: string
          entry_id?: number
          player_id?: number
          slot?: Database["public"]["Enums"]["pick_slot"]
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "pick_import_overrides_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pick_import_overrides_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      picks: {
        Row: {
          created_at: string
          entry_id: number
          game_id: number
          id: number
          player_id: number
          points: number | null
          review_reason: string | null
          slot: Database["public"]["Enums"]["pick_slot"]
          spread_at_pick: number | null
          status: Database["public"]["Enums"]["pick_status"]
          team_id: number
          updated_at: string
          week: number
        }
        Insert: {
          created_at?: string
          entry_id: number
          game_id: number
          id?: never
          player_id: number
          points?: number | null
          review_reason?: string | null
          slot: Database["public"]["Enums"]["pick_slot"]
          spread_at_pick?: number | null
          status?: Database["public"]["Enums"]["pick_status"]
          team_id: number
          updated_at?: string
          week: number
        }
        Update: {
          created_at?: string
          entry_id?: number
          game_id?: number
          id?: never
          player_id?: number
          points?: number | null
          review_reason?: string | null
          slot?: Database["public"]["Enums"]["pick_slot"]
          spread_at_pick?: number | null
          status?: Database["public"]["Enums"]["pick_status"]
          team_id?: number
          updated_at?: string
          week?: number
        }
        Relationships: [
          {
            foreignKeyName: "picks_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picks_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picks_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "picks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_game_stats: {
        Row: {
          appeared: boolean
          fumbles_lost: number
          game_id: number
          interceptions: number
          note: string | null
          pass_td: number
          pass_yds: number
          player_id: number
          rec_td: number
          rec_yds: number
          rush_td: number
          rush_yds: number
          source: Database["public"]["Enums"]["data_source"]
          team_id: number
          updated_at: string
        }
        Insert: {
          appeared?: boolean
          fumbles_lost?: number
          game_id: number
          interceptions?: number
          note?: string | null
          pass_td?: number
          pass_yds?: number
          player_id: number
          rec_td?: number
          rec_yds?: number
          rush_td?: number
          rush_yds?: number
          source?: Database["public"]["Enums"]["data_source"]
          team_id: number
          updated_at?: string
        }
        Update: {
          appeared?: boolean
          fumbles_lost?: number
          game_id?: number
          interceptions?: number
          note?: string | null
          pass_td?: number
          pass_yds?: number
          player_id?: number
          rec_td?: number
          rec_yds?: number
          rush_td?: number
          rush_yds?: number
          source?: Database["public"]["Enums"]["data_source"]
          team_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_game_stats_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_game_stats_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_game_stats_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      player_seasons: {
        Row: {
          jersey: number | null
          player_id: number
          position: string | null
          position_override: string | null
          season_id: number
          team_id: number
        }
        Insert: {
          jersey?: number | null
          player_id: number
          position?: string | null
          position_override?: string | null
          season_id: number
          team_id: number
        }
        Update: {
          jersey?: number | null
          player_id?: number
          position?: string | null
          position_override?: string | null
          season_id?: number
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_seasons_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_seasons_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_seasons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          cfbd_id: number | null
          created_at: string
          id: number
          name: string
          source: Database["public"]["Enums"]["data_source"]
          updated_at: string
        }
        Insert: {
          cfbd_id?: number | null
          created_at?: string
          id?: never
          name: string
          source?: Database["public"]["Enums"]["data_source"]
          updated_at?: string
        }
        Update: {
          cfbd_id?: number | null
          created_at?: string
          id?: never
          name?: string
          source?: Database["public"]["Enums"]["data_source"]
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          auth_user_id: string | null
          created_at: string
          display_name: string
          id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          display_name: string
          id?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          display_name?: string
          id?: string
        }
        Relationships: []
      }
      seasons: {
        Row: {
          created_at: string
          id: number
          scoring_rules: Json
          year: number
        }
        Insert: {
          created_at?: string
          id?: never
          scoring_rules?: Json
          year: number
        }
        Update: {
          created_at?: string
          id?: never
          scoring_rules?: Json
          year?: number
        }
        Relationships: []
      }
      sync_runs: {
        Row: {
          cfbd_calls: number
          cfbd_calls_remaining: number | null
          error: string | null
          finished_at: string | null
          id: number
          kind: string
          season_year: number
          started_at: string
          status: string
          summary: Json | null
          week: number | null
        }
        Insert: {
          cfbd_calls?: number
          cfbd_calls_remaining?: number | null
          error?: string | null
          finished_at?: string | null
          id?: never
          kind: string
          season_year: number
          started_at?: string
          status?: string
          summary?: Json | null
          week?: number | null
        }
        Update: {
          cfbd_calls?: number
          cfbd_calls_remaining?: number | null
          error?: string | null
          finished_at?: string | null
          id?: never
          kind?: string
          season_year?: number
          started_at?: string
          status?: string
          summary?: Json | null
          week?: number | null
        }
        Relationships: []
      }
      team_seasons: {
        Row: {
          classification: Database["public"]["Enums"]["classification"]
          conference_id: number | null
          season_id: number
          team_id: number
        }
        Insert: {
          classification: Database["public"]["Enums"]["classification"]
          conference_id?: number | null
          season_id: number
          team_id: number
        }
        Update: {
          classification?: Database["public"]["Enums"]["classification"]
          conference_id?: number | null
          season_id?: number
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_seasons_conference_id_fkey"
            columns: ["conference_id"]
            isOneToOne: false
            referencedRelation: "conferences"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_seasons_season_id_fkey"
            columns: ["season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_seasons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          abbreviation: string | null
          cfbd_id: number
          created_at: string
          id: number
          logo_url: string | null
          mascot: string | null
          school: string
          updated_at: string
        }
        Insert: {
          abbreviation?: string | null
          cfbd_id: number
          created_at?: string
          id?: never
          logo_url?: string | null
          mascot?: string | null
          school: string
          updated_at?: string
        }
        Update: {
          abbreviation?: string | null
          cfbd_id?: number
          created_at?: string
          id?: never
          logo_url?: string | null
          mascot?: string | null
          school?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      game_lock_at: {
        Args: { kickoff: string; time_tbd: boolean }
        Returns: string
      }
      import_picks: { Args: { p_picks: Json }; Returns: Json }
      is_game_locked: { Args: { p_game_id: number }; Returns: boolean }
    }
    Enums: {
      classification: "fbs" | "fcs" | "ii" | "iii"
      data_source: "cfbd" | "manual"
      member_role: "owner" | "member"
      pick_slot: "QB" | "RB" | "WRTE"
      pick_status: "pending" | "locked" | "final" | "dnp"
      season_type: "regular" | "postseason"
      week_rule: "standard" | "conference" | "underdog"
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
      classification: ["fbs", "fcs", "ii", "iii"],
      data_source: ["cfbd", "manual"],
      member_role: ["owner", "member"],
      pick_slot: ["QB", "RB", "WRTE"],
      pick_status: ["pending", "locked", "final", "dnp"],
      season_type: ["regular", "postseason"],
      week_rule: ["standard", "conference", "underdog"],
    },
  },
} as const
