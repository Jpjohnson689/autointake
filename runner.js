#!/usr/bin/env node
// runner.js — Main experiment loop
// Maps to Karpathy's autoresearch experiment loop:
// Propose change → Run against personas → Evaluate → Keep or discard → Log → Repeat

const { loadConfig, saveConfig } = require("./config");
const { getPersonas } = require("./personas");
const { simulateConversation } = require("./simulator");
const { evaluateConversation, aggregateScores } = require("./evaluator");
const { proposeChange, applyChange } = require("./optimizer");
const fs = require("fs");
const path = require("path");

// Parse CLI args
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, val] = arg.replace("--", "").split("=");
  acc[key] = val;
  return acc;
}, {});

const NUM_EXPERIMENTS = parseInt(args.experiments || "5", 10);
const NUM_PERSONAS = parseInt(args.personas || "8", 10);
const LOG_FILE = path.join(__dirname, "experiment_log.json");
const RESULTS_FILE = path.join(__dirname, "results.tsv");

function loadLog() {
  if (fs.existsSync(LOG_FILE)) {
    return JSON.parse(fs.readFileSync(LOG_FILE, "utf-8"));
  }
  return [];
}

function saveLog(log) {
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

function appendTsv(entry) {
  const header = "id\tcomposite\tcompletion_rate\tstatus\tdescription\n";
  const line = `${entry.id}\t${entry.scores.composite.toFixed(4)}\t${entry.scores.completion_rate.toFixed(4)}\t${entry.status}\t${entry.description}\n`;

  if (!fs.existsSync(RESULTS_FILE)) {
    fs.writeFileSync(RESULTS_FILE, header + line);
  } else {
    fs.appendFileSync(RESULTS_FILE, line);
  }
}

function saveTranscripts(experimentId, conversations) {
  const dir = path.join(__dirname, "transcripts");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `experiment_${experimentId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(conversations, null, 2));
}

async function runExperiment(config, personas, experimentId) {
  console.log(`\n  Running ${personas.length} simulated conversations...`);
  const conversations = [];

  for (const persona of personas) {
    process.stdout.write(`    ${persona.name} (${persona.id})... `);
    try {
      const result = await simulateConversation(config, persona);
      conversations.push(result);
      const lastSystem = result.transcript.filter(t => t.role === "system").pop();
      console.log(lastSystem?.content || "done");
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      conversations.push({
        persona: persona.id,
        personaName: persona.name,
        transcript: [{ role: "system", content: `Error: ${err.message}` }],
        turnCount: 0,
        timestamp: new Date().toISOString()
      });
    }
  }

  // Evaluate each conversation
  console.log(`  Evaluating ${conversations.length} conversations...`);
  const evaluations = [];
  for (const convo of conversations) {
    const evalResult = await evaluateConversation(config, convo);
    evaluations.push(evalResult);
    process.stdout.write(`    ${convo.persona}: ${evalResult.scores.composite.toFixed(3)} `);
    console.log(evalResult.scores.did_complete ? "✓" : "✗");
  }

  const aggregated = aggregateScores(evaluations);
  saveTranscripts(experimentId, conversations);

  return aggregated;
}

async function main() {
  console.log("╔══════════════════════════════════════════╗");
  console.log("║         AutoIntake Optimizer v1.0        ║");
  console.log("║   Autoresearch pattern for lead capture  ║");
  console.log("╚══════════════════════════════════════════╝");
  console.log(`\nRunning ${NUM_EXPERIMENTS} experiments with ${NUM_PERSONAS} personas each\n`);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ERROR: Set ANTHROPIC_API_KEY environment variable");
    process.exit(1);
  }

  let config = loadConfig();
  let log = loadLog();
  let bestScore = log.length > 0
    ? Math.max(...log.filter(e => e.status === "keep").map(e => e.scores.composite), 0)
    : 0;

  for (let i = 0; i < NUM_EXPERIMENTS; i++) {
    const experimentId = log.length + 1;
    const personas = getPersonas(NUM_PERSONAS);
    let proposal = null;
    let description = "baseline";
    let experimentConfig = { ...config };

    // First experiment is always baseline (no changes)
    if (log.length === 0 && i === 0) {
      console.log(`\n━━━ Experiment ${experimentId}: BASELINE ━━━`);
      console.log("  Running current config as-is to establish baseline...");
    } else {
      // Optimizer proposes a change
      console.log(`\n━━━ Experiment ${experimentId} ━━━`);
      console.log("  Optimizer thinking...");

      const latestScores = log.length > 0 ? log[log.length - 1].scores : null;
      proposal = await proposeChange(config, log, latestScores);

      if (!proposal) {
        console.log("  ⚠ Optimizer failed to propose. Running baseline again.");
      } else {
        description = `${proposal.variable}: ${proposal.hypothesis}`;
        console.log(`  Hypothesis: ${proposal.hypothesis}`);
        console.log(`  Changing: ${proposal.variable}`);
        experimentConfig = applyChange(config, proposal);
      }
    }

    // Run the experiment
    const scores = await runExperiment(experimentConfig, personas, experimentId);

    console.log(`\n  ┌─ Results ──────────────────────────┐`);
    console.log(`  │ Composite:   ${scores.composite.toFixed(4).padStart(8)}             │`);
    console.log(`  │ Completion:  ${scores.completion_rate.toFixed(4).padStart(8)}             │`);
    console.log(`  │ Satisfaction:${scores.lead_satisfaction.toFixed(4).padStart(8)}             │`);
    console.log(`  │ Efficiency:  ${scores.efficiency.toFixed(4).padStart(8)}             │`);
    console.log(`  │ Objections:  ${scores.objection_handling.toFixed(4).padStart(8)}             │`);
    console.log(`  │ Best so far: ${bestScore.toFixed(4).padStart(8)}             │`);

    // Keep or discard
    let status;
    if (log.length === 0 && i === 0) {
      status = "keep";
      bestScore = scores.composite;
      saveConfig(experimentConfig);
      console.log(`  │ Status:      KEEP (baseline)        │`);
    } else if (scores.composite > bestScore) {
      status = "keep";
      bestScore = scores.composite;
      config = experimentConfig;
      saveConfig(experimentConfig);
      console.log(`  │ Status:      KEEP ✓                 │`);
    } else {
      status = "discard";
      console.log(`  │ Status:      DISCARD ✗              │`);
    }
    console.log(`  └────────────────────────────────────┘`);

    // Log the result
    const entry = {
      id: experimentId,
      timestamp: new Date().toISOString(),
      description,
      proposal,
      scores,
      status,
      config_snapshot: proposal ? { [proposal.variable]: proposal.new_value } : "baseline"
    };

    log.push(entry);
    saveLog(log);
    appendTsv(entry);
  }

  // Summary
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║              Run Complete                ║");
  console.log("╚══════════════════════════════════════════╝");
  const kept = log.filter(e => e.status === "keep").length;
  const discarded = log.filter(e => e.status === "discard").length;
  console.log(`Total experiments: ${log.length}`);
  console.log(`Kept: ${kept} | Discarded: ${discarded}`);
  console.log(`Best composite score: ${bestScore.toFixed(4)}`);
  console.log(`\nResults: ${RESULTS_FILE}`);
  console.log(`Full log: ${LOG_FILE}`);
  console.log(`Transcripts: ./transcripts/`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
