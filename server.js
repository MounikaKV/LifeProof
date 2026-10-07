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
    { type: "Best case", outcome: "The company finds traction, your scope grows, and you gain skills and responsibility quickly.", uncertainty: "Whether product-market fit and funding milestones arrive on schedule." },
    { type: "Most likely case", outcome: "You learn a great deal while navigating changing priorities, with both energizing and frustrating periods.", uncertainty: "How leadership responds when plans and resources change." },
    { type: "Downside case", outcome: "The company reduces headcount or pivots, and you need to find another role sooner than planned.", uncertainty: "Your ability to recover financially and professionally depends on runway, savings, and market conditions." }
  ],
  questions: [
    "What specific work and decisions will you own in your first six months?",
    "What are the company’s current runway and next funding or revenue milestones?",
    "What minimum cash compensation and savings buffer make this move workable?",
    "What would make you reconsider during the first three to six months?",
    "Have you compared this opportunity with realistic ways to improve your current role?"
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
    scenarios: { type: "array", minItems: 3, maxItems: 3, items: { type: "object", additionalProperties: false, properties: { type: { type: "string", enum: ["Best case", "Most likely case", "Downside case"] }, outcome: { type: "string" }, uncertainty: { type: "string" } }, required: ["type", "outcome", "uncertainty"] } },
    questions: { type: "array", minItems: 3, maxItems: 5, items: { type: "string" } },
    readiness: { type: "object", additionalProperties: false, properties: { level: { type: "string", enum: ["More information needed", "Reasonably informed", "Well stress-tested"] }, rationale: { type: "string" } }, required: ["level", "rationale"] },
    uncertainty: { type: "string" },
    professionalAdvice: { type: "boolean" }
  },
  required: ["decisionSummary", "assumptions", "risks", "argumentsFor", "argumentsAgainst", "alternatives", "scenarios", "questions", "readiness", "uncertainty", "professionalAdvice"]
};

const systemPrompt = `You are LifeProof, a careful decision stress-testing assistant. Help the user examine their reasoning; never tell them which choice to make. Use the provided context, distinguish facts from assumptions, offer balanced perspectives and plausible alternatives, and do not claim certainty about future outcomes. Do not invent facts. If information is missing, say what should be verified. Use a calm, concise, nonjudgmental tone. For medical, legal, financial, or other high-impact professional matters, clearly encourage consultation with an appropriately qualified professional and set professionalAdvice to true. For scenarios, return exactly one item of each type: Best case, Most likely case, Downside case. Return only JSON matching the requested schema.`;

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 20_000) throw new Error("Request too large");
  }
  return JSON.parse(body || "{}");
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
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content;
  if (!content) throw new Error("The analysis service returned an empty response.");
  return JSON.parse(content);
}

const mimeTypes = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".svg": "image/svg+xml" };
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  if (req.method === "GET" && url.pathname === "/api/health") return sendJson(res, 200, { ok: true });
  if (req.method === "GET" && url.pathname === "/api/config") return sendJson(res, 200, { demoMode: !process.env.OPENAI_API_KEY, model: process.env.OPENAI_API_KEY ? MODEL : null });
  if (req.method === "GET" && url.pathname === "/api/demo") return sendJson(res, 200, { mode: "demo", analysis: demoAnalysis });
  if (req.method === "POST" && url.pathname === "/api/analyze") {
    if (!process.env.OPENAI_API_KEY) return sendJson(res, 503, { error: "OpenAI is not configured. Use the clearly labeled demo analysis or add OPENAI_API_KEY to the server environment." });
    try {
      const input = await readJson(req);
      const decision = String(input.decision || "").trim();
      const priorities = String(input.priorities || "").trim();
      const worry = String(input.worry || "").trim();
      if (decision.length < 12) return sendJson(res, 400, { error: "Please describe the decision in at least 12 characters." });
      if (decision.length > 5_000 || priorities.length > 2_000 || worry.length > 2_000) return sendJson(res, 400, { error: "One of your entries is too long. Please shorten it and try again." });
      const analysis = await analyze(decision, priorities, worry);
      const jev = await evaluateDecisionWithJev({ assumptions: analysis.assumptions, risks: analysis.risks, questions: analysis.questions, readiness: analysis.readiness });
      return sendJson(res, 200, { mode: "openai", analysis, jev });
    } catch (error) {
      console.error("Analysis request failed:", error.message, error.status || "");
      const status = error.status === 429 ? 429 : error.status && error.status < 500 ? 502 : 500;
      return sendJson(res, status, { error: error.status === 429 ? "The analysis service is busy. Please wait a moment and try again." : "We couldn’t complete the stress test. Please try again in a moment." });
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

server.listen(PORT, HOST, () => console.log(`LifeProof listening on ${HOST}:${PORT}`));
