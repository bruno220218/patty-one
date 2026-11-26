import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { dbError } from "./db-errors";
import type { DashboardResumo } from "./dashboard";

// dashboard_resumo() (migration 0037) is newer than the generated database types.
const db = supabase as unknown as SupabaseClient;

/** Dashboard numbers: one call to dashboard_resumo(), where the database's RLS applies. */
export const dashboardRepository = {
  /** Null when migration 0037 isn't applied yet. */
  async resumo(): Promise<DashboardResumo | null> {
    const { data, error } = await db.rpc("dashboard_resumo");
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") return null;
      throw dbError(error);
    }
    return data as DashboardResumo;
  },
};
