// simulator.js — Conversation simulator using Claude API
// Runs one persona through the intake flow and returns the transcript

const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic();

async function simulateConversation(config, persona) {
  const transcript = [];
  let turnCount = 0;

  // Bot sends opening message
  transcript.push({ role: "bot", content: config.openingMessage });

  // Build the persona's system prompt
  const personaSystem = `${persona.behavior}

RULES:
- Stay in character at all times.
- Respond naturally as this person would — typos, short messages, emoticons are all fine.
- If at any point you would realistically abandon the conversation, just say "[LEFT]" and nothing else.
- If you've provided all the requested info, say "[DONE]" at the end of your last message.
- Never break character or mention you are an AI.`;

  // Conversation history for the persona (to generate lead responses)
  const personaMessages = [
    { role: "user", content: `The intake bot says: "${config.openingMessage}"\n\nRespond in character.` }
  ];

  // Conversation history for the bot (to generate bot responses)
  const botMessages = [];

  while (turnCount < config.maxTurns) {
    // 1. Persona responds
    const personaResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 300,
      system: personaSystem,
      messages: personaMessages
    });

    const personaText = personaResponse.content[0].text.trim();
    transcript.push({ role: "lead", content: personaText, persona: persona.id });

    // Check if persona left or completed
    if (personaText.includes("[LEFT]")) {
      transcript.push({ role: "system", content: "Lead abandoned conversation" });
      break;
    }

    const isDone = personaText.includes("[DONE]");
    const cleanPersonaText = personaText.replace("[DONE]", "").trim();

    if (isDone) {
      transcript.push({ role: "system", content: "Lead completed intake" });
      break;
    }

    turnCount++;
    if (turnCount >= config.maxTurns) {
      transcript.push({ role: "system", content: "Max turns reached" });
      break;
    }

    // 2. Bot responds
    botMessages.push({ role: "user", content: cleanPersonaText });

    const botResponse = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: config.systemPrompt,
      messages: botMessages
    });

    const botText = botResponse.content[0].text.trim();
    transcript.push({ role: "bot", content: botText });
    botMessages.push({ role: "assistant", content: botText });

    // Update persona context
    personaMessages.push({ role: "assistant", content: personaText });
    personaMessages.push({ role: "user", content: `The intake bot says: "${botText}"\n\nRespond in character.` });

    turnCount++;
  }

  return {
    persona: persona.id,
    personaName: persona.name,
    transcript,
    turnCount,
    timestamp: new Date().toISOString()
  };
}

module.exports = { simulateConversation };
