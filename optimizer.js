// optimizer.js — Uses Claude to analyze results and propose config changes (v2.0)
// This is the "researcher brain" that drives the optimization loop
// v2.0: Aware of company identity, phone-OR-email, name_captured metric

const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic();

async function proposeChange(currentConfig, experimentLog, aggregatedScores) {
  const recentHistory = experimentLog.slice(-10).map((entry, i) => {
    return `Experiment ${entry.id}: composite=${entry.scores.composite.toFixed(3)}, completion=${entry.scores.completion_rate.toFixed(3)}, status=${entry.status}
  Change: ${entry.description}
  Per-persona: ${entry.scores.per_persona?.map(p => `${p.persona}:${p.did_complete}(name:${p.name_captured || "?"})`).join(", ") || "n/a"}`;
  }).join("\n\n");

  const prompt = `You are an optimization agent for a conversational lead intake system.
Your goal is to maximize the composite score (primarily completion rate) by modifying the intake configuration.

CURRENT CONFIG:
${JSON.stringify(currentConfig, null, 2)}

RECENT EXPERIMENT HISTORY:
${recentHistory || "No experiments yet — this will be the first change after baseline."}

LATEST SCORES:
${JSON.stringify(aggregatedScores, null, 2)}

IMPORTANT CONTEXT:
- The bot works for a real company (see companyInfo in config). Use the company name and credentials when appropriate.
- Contact info rule: ${currentConfig.contactInfoRule || "phone_or_email"} — the lead only needs to provide EITHER phone or email, not both.
- The name_captured metric tracks whether the lead's name was captured. This is a known challenge with some personas.
- Key failure patterns from v1: (1) phone-vs-email ambiguity, (2) name capture from info-dumpers, (3) skeptic company credibility

RULES:
- Change ONLY ONE variable at a time. This is critical for isolating what works.
- Variables you can modify: systemPrompt, openingMessage, maxTurns, tone, followUpStyle
- Do NOT modify: companyInfo, completionFields, contactInfoRule (these are structural)
- Think about which personas are failing and why.
- If completion_rate is below 0.6, focus on the fundamentals (clarity, directness).
- If completion_rate is above 0.8, focus on edge cases (skeptics, tire kickers, angry leads).
- Pay special attention to name_captured metrics — if names aren't being captured, adjust the prompt to prioritize asking for name first.
- Be specific and surgical. Don't rewrite the whole prompt — tweak one aspect.

Respond in EXACTLY this JSON format:
{
  "hypothesis": "One sentence: what you think will improve and why",
  "variable": "which config key to change",
  "new_value": "the new value (string for prompts, number for maxTurns)",
  "reasoning": "2-3 sentences explaining your thinking based on the data"
}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1000,
    messages: [{ role: "user", content: prompt }]
  });

  try {
    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in optimizer response");
    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error("⚠ Optimizer parse error:", err.message);
    return null;
  }
}

function applyChange(config, proposal) {
  const newConfig = { ...config };
  newConfig[proposal.variable] = proposal.new_value;
  return newConfig;
}

module.exports = { proposeChange, applyChange };
