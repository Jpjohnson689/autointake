// config.js - Current intake flow configuration
// This is the file the optimizer modifies. Everything else is fixed.

const DEFAULT_CONFIG = {
  systemPrompt: `You are a friendly intake assistant for a home services company. Your job is to collect the following information from potential customers in a natural, conversational way:

1. Their name
2. What service they need (plumbing, electrical, HVAC, general handyman)
3. Brief description of the issue
4. Their preferred timeframe (urgent, this week, flexible)
5. Their phone number or email for follow-up

Be warm but efficient. Don't ask more than one question at a time. If they seem hesitant, reassure them there's no commitment. Keep responses under 3 sentences.`,

  openingMessage: "Hi there! I'm here to help you get connected with the right service pro. What's going on at your place today?",

  maxTurns: 12,

  completionFields: ["name", "service_type", "issue_description", "timeframe", "contact_info"],

  tone: "warm-professional",

  followUpStyle: "gentle-redirect"
};

function loadConfig() {
  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(__dirname, "current_config.json");

  if (fs.existsSync(configPath)) {
    const saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return { ...DEFAULT_CONFIG, ...saved };
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(__dirname, "current_config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = { DEFAULT_CONFIG, loadConfig, saveConfig };
