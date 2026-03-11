// evaluator.js — Scores conversations on completion and quality (v2.0)
// This is the "fixed evaluation harness" (like prepare.py's evaluate_bpb)
// v2.0: Updated to handle phone-OR-email as valid contact, improved eval prompt

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

  const contactRule = config.contactInfoRule === "phone_or_email"
    ? "For contact_info: either a phone number OR an email address counts as complete. The lead does NOT need to provide both."
    : "The lead must provide contact information (phone or email).";

  const evalPrompt = `You are an objective evaluator of sales intake conversations.
Score this conversation on the following criteria.

REQUIRED FIELDS TO CAPTURE: ${config.completionFields.join(", ")}

IMPORTANT CONTACT INFO RULE: ${contactRule}

TRANSCRIPT:
${transcript}

Score each dimension from 0.0 to 1.0:

1. **completion_rate**: What fraction of the ${config.completionFields.length} required fields were actually captured? Count each field that was clearly provided. For contact_info, count it as captured if the lead gave EITHER a phone number OR an email address (they don't need both). Score = fields_captured / ${config.completionFields.length}

2. **lead_satisfaction**: How satisfied would this lead likely be? Consider: Were their concerns addressed? Did the bot feel human and empathetic? Was the pace right? Did the bot acknowledge the lead's emotions? (0.0 = terrible experience, 1.0 = excellent)

3. **efficiency**: How efficiently did the bot collect info? Consider: Did it avoid re-asking questions the lead already answered? Did it pick up on contextual clues (like "ASAP" implying urgency)? (0.0 = took way too many turns or lost control, 1.0 = minimal turns, no wasted exchanges)

4. **objection_handling**: How well did the bot handle pushback, hesitation, or complaints? Did it acknowledge frustration before pushing forward? Was it honest about being AI when asked? Did it provide specific company credentials when challenged? (0.0 = ignored or fumbled, 1.0 = acknowledged and resolved naturally). Score 0.5 if there were no objections.

5. **did_complete**: Did the lead provide ALL required information? Remember: for contact_info, either phone OR email is sufficient. (1 = yes, 0 = no)

6. **name_captured**: Was the lead's name specifically captured? (1 = yes, 0 = no). This is tracked separately because name capture is a known challenge.

Respond in EXACTLY this JSON format, nothing else:
{"completion_rate": 0.0, "lead_satisfaction": 0.0, "efficiency": 0.0, "objection_handling": 0.0, "did_complete": 0, "name_captured": 0, "fields_captured": ["list", "of", "captured", "fields"], "notes": "one sentence summary"}`;

  const response = await client.messages.create({
    model: "claude-haiku-3-5-20241022",
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
      scores: {
        composite: 0, completion_rate: 0, did_complete: 0,
        lead_satisfaction: 0, efficiency: 0, objection_handling: 0,
        name_captured: 0, notes: "eval_error"
      },
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
    name_captured: avg("name_captured"),
    n_personas: n,
    per_persona: evaluations.map(e => ({
      persona: e.persona,
      composite: e.scores.composite,
      did_complete: e.scores.did_complete,
      name_captured: e.scores.name_captured,
      notes: e.scores.notes
    }))
  };
}

module.exports = { evaluateConversation, aggregateScores };
