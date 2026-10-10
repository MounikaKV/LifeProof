const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

// Load a local .env without a dependency; process environment always takes precedence.
try {
  const envFile = fs.readFileSync(path.join(__dirname, ".env"), "utf8");
  for (const line of envFile.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || Object.hasOwn(process.env, match[1])) continue;
    let value = match[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    process.env[match[1]] = value.replace(/\s+#.*$/, "");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, "public");
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const { evaluateDecisionWithJev } = require("./src/jev-adapter");

const demoAnalysis = {
  decisionSummary: "You are weighing the stability and known trajectory of your current role against the learning, ownership, and uncertainty of joining an early-stage startup.",
  assumptions: [
    { assumption: "The startup’s runway is long enough for you to build meaningful experience.", whyItMatters: "A short runway could end the role before the promised learning or equity has time to matter.", howToTest: "Ask for current cash runway, burn rate, funding milestones, and the hiring plan in writing." },
    { assumption: "The role will give you genuine ownership and room to grow.", whyItMatters: "A startup title can sound expansive while day-to-day work remains narrow or reactive.", howToTest: "Meet the people you will work with and request examples of decisions this role will own in the first six months." },
    { assumption: "You can absorb the financial and personal volatility.", whyItMatters: "Stress outside work can reduce the upside of an otherwise attractive opportunity.", howToTest: "Model several months without income and discuss the change with anyone who shares the financial impact." },
    { assumption: "Your current role has limited remaining growth.", whyItMatters: "You may be comparing a concrete current job with an idealized version of the startup role.", howToTest: "Explore a role change, project, or compensation review with your current manager before deciding." }
  ],
  risks: [
    { risk: "The company misses a financing or revenue milestone.", potentialImpact: "Hiring freezes, reduced scope, or layoffs could arrive sooner than expected.", mitigation: "Review runway and milestones, and maintain a financial buffer and an active network." },
    { risk: "The actual work differs from the pitch.", potentialImpact: "You could trade stability for responsibilities that do not match your goals.", mitigation: "Agree on first-quarter outcomes, reporting lines, and decision authority before accepting." },
    { risk: "Equity value is uncertain and may never become liquid.", potentialImpact: "The headline package may overstate total compensation.", mitigation: "Compare cash compensation independently and get equity terms reviewed by a qualified adviser." },
    { risk: "The transition increases stress for you or your household.", potentialImpact: "Personal strain may outweigh professional growth.", mitigation: "Set practical boundaries, discuss timing, and define a check-in point after joining." }
  ],
  argumentsFor: [
    "The role may accelerate learning through broader ownership and closer exposure to company-building.",
    "Joining early can put you nearer to important product and business decisions.",
    "If your current role has plateaued, the move could create momentum and expand your network."
  ],
  argumentsAgainst: [
    "The startup’s future, management quality, and role scope are less predictable than your current position.",
    "A lower cash salary or uncertain equity could constrain financial goals.",
    "You may be able to get some of the desired growth through a lower-risk change where you are."
  ],
  alternatives: [
    { option: "Negotiate a later start or a short consulting project", tradeoff: "Lets you learn more about the team before making a full commitment, if the company can accommodate it." },
    { option: "Seek a stretch role or internal transfer", tradeoff: "Could offer growth with more continuity, though it may not address every frustration." },
    { option: "Continue the search while clarifying your criteria", tradeoff: "Preserves optionality but may mean passing on a time-sensitive opportunity." }
  ],
  scenarios: [
    { type: "Best Case", outcome: "The company finds traction, your scope grows, and you gain skills and responsibility quickly.", uncertainty: "Whether product-market fit and funding milestones arrive on schedule." },
    { type: "Likely Case", outcome: "You learn a great deal while navigating changing priorities, with both energizing and frustrating periods.", uncertainty: "How leadership responds when plans and resources change." },
    { type: "Downside Case", outcome: "The company reduces headcount or pivots, and you need to find another role sooner than planned.", uncertainty: "Your ability to recover financially and professionally depends on runway, savings, and market conditions." }
  ],
  questions: [
    "What specific work and decisions will you own in your first six months?",
    "What are the company’s current runway and next funding or revenue milestones?",
    "What minimum cash compensation and savings buffer make this move workable?",
    "What would make you reconsider during the first three to six months?",
    "Have you compared this opportunity with realistic ways to improve your current role?"
  ],
  missingInformation: [
    "The startup’s cash runway, burn rate, and next funding or revenue milestones.",
    "The practical value and terms of the equity, including vesting and dilution.",
    "The role’s actual scope, manager expectations, and success measures for the first six months.",
    "Your personal financial buffer and minimum cash compensation for feeling secure."
  ],
  readiness: { level: "More information needed", rationale: "The choice could be reasonable, but company runway, role scope, and your personal financial threshold need clearer answers first." },
  uncertainty: "This is a structured set of possibilities, not a forecast. The assessment is limited by the details provided and should change as you verify company and personal facts.",
  professionalAdvice: false
};

const schema = {
  type: "object",
  additionalProperties: false,
  properties: {
    decisionSummary: { type: "string" },
    assumptions: { type: "array", minItems: 3, maxItems: 5, items: { type: "object", additionalProperties: false, properties: { assumption: { type: "string" }, whyItMatters: { type: "string" }, howToTest: { type: "string" } }, required: ["assumption", "whyItMatters", "howToTest"] } },
    risks: { type: "array", minItems: 3, maxItems: 5, items: { type: "object", additionalProperties: false, properties: { risk: { type: "string" }, potentialImpact: { type: "string" }, mitigation: { type: "string" } }, required: ["risk", "potentialImpact", "mitigation"] } },
    argumentsFor: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    argumentsAgainst: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    alternatives: { type: "array", minItems: 2, maxItems: 4, items: { type: "object", additionalProperties: false, properties: { option: { type: "string" }, tradeoff: { type: "string" } }, required: ["option", "tradeoff"] } },
    scenarios: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", additionalProperties: false, properties: { type: { type: "string", enum: ["Best Case", "Likely Case", "Downside Case"] }, outcome: { type: "string" }, uncertainty: { type: "string" } }, required: ["type", "outcome", "uncertainty"] } },
    missingInformation: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    questions: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    readiness: { type: "object", additionalProperties: false, properties: { level: { type: "string", enum: ["More information needed", "Reasonably informed", "Well stress-tested"] }, rationale: { type: "string" } }, required: ["level", "rationale"] },
    uncertainty: { type: "string" },
    professionalAdvice: { type: "boolean" }
  },
  required: ["decisionSummary", "assumptions", "risks", "argumentsFor", "argumentsAgainst", "alternatives", "scenarios", "missingInformation", "questions", "readiness", "uncertainty", "professionalAdvice"]
};

const systemPrompt = `You are LifeProof, a careful decision stress-testing assistant. Help the user examine their reasoning; never tell them which choice to make. Use the provided context, distinguish facts from assumptions, offer balanced perspectives and practical alternatives that fit the constraints given, and do not claim certainty about future outcomes. Do not invent facts, evidence, statistics, or external research. Phrase each key assumption as an unverified belief and explain how it could be checked. If information is missing, identify material facts to verify. Use a calm, concise, nonjudgmental tone. Do not provide a diagnosis, legal interpretation, or personalized financial advice. For medical, legal, financial, or other high-impact professional matters, clearly explain this limitation, encourage consultation with an appropriately qualified professional when appropriate, and set professionalAdvice to true. For scenarios, return exactly one item of each type: Best Case, Likely Case, Downside Case. Make missingInformation a distinct list of material facts not provided. Make uncertainty explicit and do not present readiness as a prediction. Return only JSON matching the requested schema.`;

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) {
      const error = new Error("Request too large");
      error.status = 413;
      throw error;
    }
  }
  try {
    return JSON.parse(body || "{}");
  } catch {
    const error = new Error("Invalid JSON request");
    error.status = 400;
    throw error;
  }
}

function validateDecision(decision) {
  if (!decision) return "Describe the decision you’re considering.";
  if (decision.length > 5_000) return "Please keep your decision under 5,000 characters.";
  const wordCount = decision.split(/\s+/).filter(Boolean).length;
  const vague = /^(help me decide|i need advice|what should i do|should i do it|i have a decision|i don't know what to do)[.!?]*$/i.test(decision);
  if (decision.length < 25 || wordCount < 5 || vague) {
    return "Add a little context: describe the options you’re weighing and what makes the choice difficult.";
  }
  return null;
}

function urgentMedicalGuidance(context) {
  const sentences = context.toLowerCase().split(/[\n.!?;]+/).map(sentence => sentence.trim()).filter(Boolean);
  const emergencySymptoms = /\b(can't breathe|cannot breathe|not breathing|severe shortness of breath|severe difficulty breathing|face (?:is )?drooping|slurred speech|sudden (?:one[- ]sided )?weakness|uncontrolled bleeding)\b/;
  if (sentences.some(sentence => emergencySymptoms.test(sentence) && (!/\b(no|not|never)\b/.test(sentence) || /\bnot breathing\b/.test(sentence)))) {
    return {
      type: "urgent_medical",
      title: "Seek emergency medical help now",
      message: "These symptoms could be an emergency. Call your local emergency number now (911 in the U.S. and Canada), or go to the nearest emergency department. Do not wait for a routine decision analysis. If possible, ask someone nearby to help and do not drive yourself. LifeProof cannot assess symptoms or determine the cause."
    };
  }
  const chestTerms = /\b(chest pain|chest pressure|chest tightness|tightness in (my|the) chest)\b/;
  const negatedChest = /\b(no|not|never|without)\b.{0,24}\b(chest pain|chest pressure|chest tightness)\b/;
  const severeTerms = /\b(severe|sudden|crushing|persistent|unexplained)\b/;
  const currentPerson = /\b(i have|i'm having|i am having|i feel|i'm experiencing|i am experiencing|my chest|my (?:friend|partner|parent|child|family member) has|someone has)\b/;
  const delayOrEmergency = /\b(wait|tomorrow|later|hospital|emergency|\ber\b|urgent care)\b/;
  const chestSentences = sentences.filter(sentence => chestTerms.test(sentence) && !negatedChest.test(sentence));
  if (!chestSentences.length) return null;
  const severeCurrent = chestSentences.some(sentence => severeTerms.test(sentence) && currentPerson.test(sentence));
  const weighingDelay = chestSentences.some(sentence => currentPerson.test(sentence)) && delayOrEmergency.test(context);
  if (!severeCurrent && !weighingDelay) return null;
  return {
    type: "urgent_medical",
    title: "Seek emergency medical help now",
    message: "Severe or concerning chest pain can be an emergency. Call your local emergency number now (911 in the U.S. and Canada), or go to the nearest emergency department. Do not wait until tomorrow. If possible, ask someone nearby to help and do not drive yourself. LifeProof cannot assess symptoms or determine the cause."
  };
}

function professionalGuidance(context, modelFlag) {
  if (/\b(legal|lawsuit|court|custody|immigration|criminal charge|attorney|lawyer|contract dispute)\b/i.test(context)) {
    return "This may have legal consequences. LifeProof is not a legal professional; consider speaking with a qualified attorney or legal aid service before acting.";
  }
  if (/\b(medical|diagnos(?:is|e)|medication|surgery|treatment|symptom|health condition)\b/i.test(context)) {
    return "This may affect your health. LifeProof cannot diagnose or provide medical care; discuss this with a qualified clinician. Seek urgent or emergency care for urgent symptoms.";
  }
  if (/\b(no savings|no emergency fund|life savings|retirement savings|bankrupt(?:cy)?|foreclos(?:ure|ed)|can't pay rent|cannot pay rent|unable to pay|all my savings|invest(?:ing)? (?:everything|all of it))\b/i.test(context)) {
    return "This could materially affect your financial security. LifeProof is not a financial professional; consider speaking with a qualified financial counselor or adviser before taking an irreversible step.";
  }
  if (modelFlag) return "This decision may benefit from qualified professional guidance. LifeProof provides decision support, not professional advice.";
  return null;
}

function hasText(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidAnalysis(value) {
  if (!value || typeof value !== "object" || !hasText(value.decisionSummary) || !hasText(value.uncertainty)) return false;
  const arrays = [
    [value.assumptions, 3, 5], [value.risks, 3, 5], [value.argumentsFor, 3, 5],
    [value.argumentsAgainst, 3, 5], [value.alternatives, 2, 4], [value.scenarios, 3, 3],
    [value.missingInformation, 3, 5], [value.questions, 3, 5]
  ];
  if (arrays.some(([items, min, max]) => !Array.isArray(items) || items.length < min || items.length > max)) return false;
  if (!value.assumptions.every(item => hasText(item.assumption) && hasText(item.whyItMatters) && hasText(item.howToTest))) return false;
  if (!value.risks.every(item => hasText(item.risk) && hasText(item.potentialImpact) && hasText(item.mitigation))) return false;
  if (!value.argumentsFor.every(hasText) || !value.argumentsAgainst.every(hasText) || !value.missingInformation.every(hasText) || !value.questions.every(hasText)) return false;
  if (!value.alternatives.every(item => hasText(item.option) && hasText(item.tradeoff))) return false;
  const scenarioTypes = value.scenarios.map(item => item?.type).sort();
  if (JSON.stringify(scenarioTypes) !== JSON.stringify(["Best Case", "Downside Case", "Likely Case"])) return false;
  if (!value.scenarios.every(item => hasText(item.outcome) && hasText(item.uncertainty))) return false;
  return hasText(value.readiness?.level) && hasText(value.readiness?.rationale) && typeof value.professionalAdvice === "boolean";
}

function sendJson(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(data));
}

async function analyze(decision, priorities, worry) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      temperature: 0.5,
      response_format: { type: "json_schema", json_schema: { name: "lifeproof_analysis", strict: true, schema } },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify({ decision, priorities, worry, instruction: "Stress-test this decision and return the complete structured analysis." }) }
      ]
    }),
    signal: AbortSignal.timeout(45_000)
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error("The analysis service could not complete the request.");
    error.status = response.status;
    error.detail = detail.slice(0, 500);
    throw error;
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    const error = new Error("The analysis service returned an unreadable response.");
    error.status = 502;
    throw error;
  }
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    const error = new Error("The analysis service returned an empty response.");
    error.status = 502;
    throw error;
  }
  let analysis;
  try {
    analysis = JSON.parse(content);
  } catch {
    const error = new Error("The analysis service returned malformed analysis.");
    error.status = 502;
    throw error;
  }
  if (!isValidAnalysis(analysis)) {
    const error = new Error("The analysis service returned incomplete analysis.");
    error.status = 502;
    throw error;
  }
  return analysis;
}

const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
function createServer() {
  return http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, { ok: true });
  if (req.method === "GET" && url.pathname === "/api/config") return sendJson(res, 200, { demoMode: !process.env.OPENAI_API_KEY, model: process.env.OPENAI_API_KEY ? MODEL : null });
  if (req.method === "GET" && url.pathname === "/api/demo") return sendJson(res, 200, { mode: "demo", analysis: demoAnalysis });
  if (req.method === "POST" && url.pathname === "/api/analyze") {
    try {
      const input = await readJson(req);
      if (!input || typeof input !== "object" || Array.isArray(input)) {
        return sendJson(res, 400, { error: "Send your decision as a form entry, then try again.", code: "invalid_request" });
      }
      const decision = typeof input.decision === "string" ? input.decision.trim() : "";
      const priorities = typeof input.priorities === "string" ? input.priorities.trim() : "";
      const worry = typeof input.worry === "string" ? input.worry.trim() : "";
      const validationMessage = validateDecision(decision);
      if (validationMessage) return sendJson(res, 400, { error: validationMessage, code: "invalid_decision" });
      if (priorities.length > 2_000 || worry.length > 2_000) return sendJson(res, 400, { error: "Please keep priorities and concerns under 2,000 characters each.", code: "input_too_long" });
      const context = [decision, priorities, worry].filter(Boolean).join("\n");
      const safety = urgentMedicalGuidance(context);
      if (safety) return sendJson(res, 200, { mode: "safety", safety });
      if (!process.env.OPENAI_API_KEY) return sendJson(res, 503, { error: "Demo Mode is active. Choose “View example” to see a clearly labeled sample, or add OPENAI_API_KEY on the server for live analysis.", code: "demo_mode" });
      const analysis = await analyze(decision, priorities, worry);
      const guidance = professionalGuidance(context, analysis.professionalAdvice);
      if (guidance) {
        analysis.professionalAdvice = true;
        analysis.professionalAdviceMessage = guidance;
      }
      const jev = await evaluateDecisionWithJev({ assumptions: analysis.assumptions, risks: analysis.risks, questions: analysis.questions, readiness: analysis.readiness });
      return sendJson(res, 200, { mode: "openai", analysis, jev });
    } catch (error) {
      console.error("Analysis request failed:", error.message, error.status || "");
      const timeout = error.name === "TimeoutError" || error.name === "AbortError";
      const status = error.status === 413 ? 413 : error.status === 400 ? 400 : error.status === 429 ? 429 : error.status && error.status < 500 ? 502 : timeout ? 504 : 502;
      const message = status === 413 ? "That request is too large. Shorten your entries and try again." : status === 400 ? "The request could not be read. Please check your entries and try again." : status === 429 ? "The analysis service is busy. Wait a moment and try again." : timeout ? "The analysis took too long. Your decision is still here; try again in a moment." : "We couldn’t complete the stress test. Please try again in a moment.";
      return sendJson(res, status, { error: message, code: timeout ? "analysis_timeout" : "analysis_failed" });
    }
  }
  if (req.method !== "GET" && req.method !== "HEAD") return sendJson(res, 405, { error: "Method not allowed." });
  const requested = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = path.resolve(PUBLIC, `.${requested}`);
  if (!file.startsWith(`${PUBLIC}${path.sep}`)) return sendJson(res, 403, { error: "Forbidden." });
  fs.readFile(file, (err, data) => {
    if (err) return sendJson(res, 404, { error: "Not found." });
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "strict-origin-when-cross-origin", "Content-Security-Policy": "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src 'self'; base-uri 'none'; frame-ancestors 'none'" });
    res.end(req.method === "HEAD" ? undefined : data);
  });
  });
}

if (require.main === module) {
  createServer().listen(PORT, HOST, () => console.log(`LifeProof listening on ${HOST}:${PORT}`));
}

module.exports = { createServer };
