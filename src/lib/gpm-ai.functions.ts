import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const num = z.number().nullable();
const inputSchema = z.object({
  type: z.string().max(10), site: z.string().max(200), equipment: z.string().max(200).nullable(),
  hourMeter: num, fuelPct: num, batteryV: num,
  checklist: z.array(z.object({ item: z.string().max(200), done: z.boolean() })).max(30),
  notes: z.string().max(4000),
  previous: z.array(z.object({ at: z.string(), hourMeter: num, fuelPct: num, batteryV: num })).max(5),
  photos: z.array(z.string().startsWith("data:image/")).max(4),
});

export const analyzeFieldReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => inputSchema.parse(d))
  .handler(async ({ data }) => {
    const { analyzeGpm } = await import("./gpm-ai.server");
    return analyzeGpm(data);
  });
