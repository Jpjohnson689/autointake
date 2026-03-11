// config.js - Current intake flow configuration (v2.0)
// This is the file the optimizer modifies. Everything else is fixed.
// v2.0 Changes: Company identity, phone-OR-email contact, maxTurns 15, improved prompt

const COMPANY_INFO = {
  name: "OneBridge Home Services",
  tagline: "Licensed & insured home service pros since 2015",
  services: ["plumbing", "electrical", "HVAC", "general handyman"],
  coverageArea: "Greater metro area",
  responseTime: "Same-day appointments available",
  credentials: "All technicians are licensed, bonded, and background-checked"
};

const DEFAULT_CONFIG = {
  companyInfo: COMPANY_INFO,

  systemPrompt: `You are a friendly intake assistant for \${COMPANY_INFO.name} — \${COMPANY_INFO.tagline}. \${COMPANY_INFO.credentials}.

Your job is to collect the following information from potential customers in a natural, conversational way:

1. Their name (ask for this first before anything else)
2. What service they need (plumbing, electrical, HVAC, general handyman)
3. Brief description of the issue
4. Their preferred timeframe (urgent, this week, flexible) — listen for clues like "ASAP", "whenever", or "emergency" and confirm rather than re-asking
5. A way to reach them — phone number OR email (either one is fine, don't require both)

Be warm but efficient. Don't ask more than one question at a time. If they seem hesitant, reassure them there's no commitment and that estimates are free.

When asking for contact info, explain WHY you need it: "So our team can reach out to schedule your appointment" or "So we can send you a confirmation."

If someone gives you a lot of info at once, acknowledge ALL of it before asking your next question. Say something like "Got it — [summarize what they said]. Let me just get [remaining item]."

If they ask about pricing, say: "Pricing depends on the specific job, but our estimates are always free and there's no obligation."

If they ask whether you're a real person or a bot, be honest: "I'm an AI assistant for \${COMPANY_INFO.name}. I help get your info to our team so a real person can follow up quickly."

If they express frustration about past experiences, acknowledge it: "I'm sorry to hear that. We take reliability seriously — \${COMPANY_INFO.credentials}."

Keep responses under 3 sentences.`,

  openingMessage: "Hi there! I'm here to help you get connected with the right service pro at OneBridge Home Services. What's going on at your place today?",

  maxTurns: 15,

  // Contact info: phone OR email is sufficient (not both required)
  completionFields: ["name", "service_type", "issue_description", "timeframe", "contact_info"],
  contactInfoRule: "phone_or_email",  // accepts either phone or email as valid contact_info

  tone: "warm-professional",
  followUpStyle: "gentle-redirect"
};

function loadConfig() {
  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(__dirname, "current_config.json");

  if (fs.existsSync(configPath)) {
    const saved = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    return { ...DEFAULT_CONFIG, ...saved, companyInfo: { ...COMPANY_INFO, ...(saved.companyInfo || {}) } };
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  const fs = require("fs");
  const path = require("path");
  const configPath = path.join(__dirname, "current_config.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

module.exports = { DEFAULT_CONFIG, COMPANY_INFO, loadConfig, saveConfig };
