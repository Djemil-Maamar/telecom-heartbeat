import { createOpenAI } from "@ai-sdk/openai";
import { NoObjectGeneratedError, Output, streamText } from "ai";
import { z } from "zod";

export const analysisSchema = z.object({
  severity: z.enum(["ok", "warning", "critical"]),
  summary: z.string(),
  anomalies: z.array(z.object({ title: z.string(), detail: z.string(), severity: z.enum(["warning", "critical"]) })),
  actions: z.array(z.object({ action: z.string(), priority: z.enum(["immediate", "soon", "routine"]) })),
});
export type GpmAnalysis = z.infer<typeof analysisSchema>;

export type GpmInput = {
  type: string; site: string; equipment: string | null;
  hourMeter: number | null; fuelPct: number | null; batteryV: number | null;
  checklist: { item: string; done: boolean }[]; notes: string;
  previous: { at: string; hourMeter: number | null; fuelPct: number | null; batteryV: number | null }[];
  photos: string[];
};

const SYSTEM = `Tu es un ingénieur O&M télécom expert en groupes électrogènes de sites GSM (Nigeria, systèmes -48 V DC).
Analyse la fiche d'intervention terrain : relevés, check-list, notes et photos. Repère les anomalies (ex. tension batterie hors 48–56 V pour un parc -48 V, carburant < 25 %, écart de compteur horaire incohérent avec l'historique, points de check-list non faits, fuites/corrosion/saleté visibles sur photo) et recommande les prochaines actions concrètes.
Réponds en français, de façon concise : 0 à 5 anomalies, 1 à 5 actions. N'invente pas de mesures absentes ; signale-les si elles sont nécessaires.`;

export async function analyzeGpm(input: GpmInput, signal?: AbortSignal): Promise<GpmAnalysis> {
  const apiKey = process.env.LOVABLE_API_KEY;
  if (!apiKey) throw new Error("Analyse IA non configurée");
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
  });
  const { photos, ...data } = input;
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system: SYSTEM,
    output: Output.object({ schema: analysisSchema }),
    abortSignal: signal,
    maxRetries: 0,
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `Fiche terrain :\n${JSON.stringify(data, null, 2)}` },
        ...photos.slice(0, 4).map((p) => ({ type: "image" as const, image: p })),
      ],
    }],
    providerOptions: {
      openai: { forceReasoning: true, reasoningEffort: "low", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] },
    },
  });
  try {
    return await result.output;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new Error("L'IA n'a pas renvoyé d'analyse exploitable");
    const status = (e as { statusCode?: number })?.statusCode;
    if (status === 402) throw new Error("Crédits IA épuisés — ajoutez des crédits pour continuer l'analyse.");
    if (status === 429) throw new Error("Trop de demandes IA, réessayez dans un instant.");
    if (status === 403) throw new Error("Accès à l'analyse IA refusé pour cet espace de travail.");
    throw e;
  }
}
