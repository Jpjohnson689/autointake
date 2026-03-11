// evaluator.js — Scores conversations on completion and quality
// This is the "fixed evaluation harness" (like prepare.py's evaluate_bpb)

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

async function evaluateConversation(config, conversationResult) {
  const transcript = conversationResult.transcript
    .map(t => {
      if (t.role === "bot") return `BOT: ${t.content}`;
      if (t.role === "lead") return `LEAD: ${t.content}`;
      if (t.role === "system") return `[${t.content}]`;
      return "";
    })
    .filter(Boolean)
    .join("\n");

  const evalPrompt = `You are an objective evaluator of sales intake conversations. Score this conversation on the following criteria.

REQUIRED FIELDS TO CAPTURE: ${config.completionFields.join(", ")}

TRANSCRIPT:
${transcript}

Score each dimension from 0.0 to 1.0:

1. **completion_rate**: What fraction of the ${config.completionFields.length} required fields were actually captured? Count each field that was clearly provided. Score = fields_captured / ${config.completionFields.length}

2. **lead_satisfaction**: How satisfied would this lead likely be? Consider: Were their concerns addressed? Did the bot feel human? Was the pace right? (0.0 = terrible experience, 1.0 = excellent)

3. **efficiency**: How efficiently did the bot collect info? (0.0 = took way too many turns or lost control, 1.0 = minimal turns, no wasted exchanges)

4. **objection_handling**: How well did the bot handle pushback, hesitation, or complaints? (0.0 = ignored or fumbled, 1.0 = acknowledged and resolved naturally). Score 0.5 if there were no objections.

5. **did_complete**: Did the lead provide all required information? (1 = yes, 0 = no)

Respond in EXACTLY this JSON format, nothing else:
{"completion_rate": 0.0, "lead_satisfaction": 0.0, "efficiency": 0.0, "objection_handling": 0.0, "did_complete": 0, "fields_captured": ["list", "of", "captured", "fields"], "notes": "one sentence summary"}`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 500,
    messages: [{ role: "user", content: evalPrompt }]
  });

  try {
    const text = response.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in eval response");
    const scores = JSON.parse(jsonMatch[0]);

    // Composite score (weighted average — completion is king)
    scores.composite = (
      scores.completion_rate * 0.40 +
      scores.did_complete * 0.25 +
      scores.lead_satisfaction * 0.15 +
      scores.efficiency * 0.10 +
      scores.objection_handling * 0.10
    );

    return {
      persona: conversationResult.persona,
      scores,
      turnCount: conversationResult.turnCount
    };
  } catch (err) {
    console.error(`  ⚠ Eval parse error for ${conversationResult.persona}:`, err.message);
    return {
      persona: conversationResult.persona,
      scores: { composite: 0, completion_rate: 0, did_complete: 0, lead_satisfaction: 0, efficiency: 0, objection_handling: 0, notes: "eval_error" },
      turnCount: conversationResult.turnCount
    };
  }
}

function aggregateScores(evaluations) {
  const n = evaluations.length;
  if (n === 0) return { composite: 0, completion_rate: 0, did_complete: 0 };

  const avg = (key) => evaluations.reduce((sum, e) => sum + (e.scores[key] || 0), 0) / n;

  return {
    composite: avg("composite"),
    completion_rate: avg("completion_rate"),
    did_complete: avg("did_complete"),
    lead_satisfaction: avg("lead_satisfaction"),
    efficiency: avg("efficiency"),
    objection_handling: avg("objection_handling"),
    n_personas: n,
    per_persona: evaluations.map(e => ({
      persona: e.persona,
      composite: e.scores.composite,
      did_complete: e.scores.did_complete,
      notes: e.scores.notes
    }))
  };
}

module.exports = { evaluateConversation, aggregateScores };
