const assert = require("node:assert/strict");
const { after, beforeEach, test } = require("node:test");
const { Readable } = require("node:stream");
const fs = require("node:fs");
const path = require("node:path");

const originalApiKey = process.env.OPENAI_API_KEY;
process.env.OPENAI_API_KEY = "unit-test-key-never-sent-to-network";
const { createServer } = require("../server");
const app = createServer();
const route = app.listeners("request")[0];
const originalFetch = global.fetch;
const decisionExamples = {
  typical: "Should I ask for a promotion or look for a new job?",
  difficult: "Should I quit tomorrow? I have no savings and no other offer.",
  urgent: "I have severe chest pain. Should I wait until tomorrow or go to the hospital?"
};

function makeAnalysis(summary, professionalAdvice = false) {
  return {
    decisionSummary: summary,
    assumptions: [
      { assumption: "The internal opportunity is still available.", whyItMatters: "If it is not, the comparison changes.", howToTest: "Ask your manager what a promotion path would require." },
      { assumption: "A new role would improve your growth.", whyItMatters: "A move can change responsibilities without improving development.", howToTest: "Compare actual scope and learning expectations." },
      { assumption: "Timing leaves room to explore both paths.", whyItMatters: "A rushed choice may close options unnecessarily.", howToTest: "Ask about timelines before making a commitment." }
    ],
    risks: [
      { risk: "The current employer may not offer advancement.", potentialImpact: "Waiting without a clear path may delay growth.", mitigation: "Ask for specific criteria and a review date." },
      { risk: "A new role may be a poor fit.", potentialImpact: "Changing jobs has transition and income uncertainty.", mitigation: "Verify role scope and talk with future teammates." },
      { risk: "Exploring both may take time.", potentialImpact: "The added workload could be stressful.", mitigation: "Set a limited search window and prioritize conversations." }
    ],
    argumentsFor: ["A promotion could expand scope with less disruption.", "A job search can reveal market opportunities.", "Having both paths open can improve negotiating information."],
    argumentsAgainst: ["The current promotion path may be uncertain.", "A new role may not deliver the growth it promises.", "Running both paths at once can take time and energy."],
    alternatives: [
      { option: "Ask for a promotion plan while quietly exploring roles.", tradeoff: "Preserves options but takes effort." },
      { option: "Request a stretch assignment first.", tradeoff: "Tests growth potential without changing employers." }
    ],
    scenarios: [
      { type: "Best Case", outcome: "A promotion path becomes concrete or an excellent external role appears.", uncertainty: "Whether either opportunity is available on workable terms." },
      { type: "Likely Case", outcome: "You gather more information and compare imperfect options.", uncertainty: "How quickly managers or hiring teams respond." },
      { type: "Downside Case", outcome: "The internal path stalls and the search takes longer than expected.", uncertainty: "Your available time and market conditions." }
    ],
    missingInformation: ["Promotion criteria and timeline.", "External compensation and role scope.", "Your own priority between stability and change."],
    questions: ["What measurable outcomes would qualify you for promotion?", "Which parts of a new role matter most?", "What is your timeline for deciding?"],
    readiness: { level: "More information needed", rationale: "Clarify promotion criteria and compare concrete roles before assessing readiness." },
    uncertainty: "This analysis uses only your description. It cannot predict what your employer or future hiring teams will do.",
    professionalAdvice
  };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

function mockOpenAI(result, onRequest = () => {}) {
  global.fetch = async (url, options) => {
    onRequest(url, options);
    return response(200, { choices: [{ message: { content: JSON.stringify(result) } }] });
  };
}

async function request(method, pathname, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
  const req = Readable.from(chunks);
  req.method = method;
  req.url = pathname;
  req.headers = { host: "localhost" };
  let finish;
  const finished = new Promise(resolve => { finish = resolve; });
  const res = {
    writeHead(status, headers) { this.statusCode = status; this.headers = headers; },
    end(output) { this.body = output; finish(); }
  };
  await Promise.all([route(req, res), finished]);
  return { status: res.statusCode, headers: res.headers, body: JSON.parse(res.body || "{}") };
}

beforeEach(() => { process.env.OPENAI_API_KEY = "unit-test-key-never-sent-to-network"; });
after(() => {
  global.fetch = originalFetch;
  if (originalApiKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = originalApiKey;
});

test("typical promotion-versus-job case reaches the analysis endpoint and returns balanced sections", async () => {
  const result = makeAnalysis("You are comparing an internal promotion path with a job search while keeping both options open.");
  let forwardedDecision = "";
  mockOpenAI(result, (url, options) => {
    assert.equal(url, "https://api.openai.com/v1/chat/completions");
    assert.equal(options.headers.Authorization, "Bearer unit-test-key-never-sent-to-network");
    const requestBody = JSON.parse(options.body);
    assert.equal(requestBody.response_format.type, "json_schema");
    forwardedDecision = JSON.parse(requestBody.messages[1].content).decision;
  });

  const res = await request("POST", "/api/analyze", { decision: decisionExamples.typical, priorities: "Growth and stability", worry: "Losing momentum" });
  assert.equal(res.status, 200);
  assert.equal(res.body.mode, "openai");
  assert.equal(forwardedDecision, decisionExamples.typical);
  assert.equal(res.body.analysis.assumptions.length, 3);
  assert.equal(res.body.analysis.argumentsFor.length, 3);
  assert.equal(res.body.analysis.argumentsAgainst.length, 3);
  assert.equal(res.body.analysis.scenarios.length, 3);
  assert.match(res.body.analysis.uncertainty, /cannot predict/i);
  assert.equal(res.body.analysis.professionalAdvice, false);
  assert.equal(res.headers["Cache-Control"], "no-store");
});

test("difficult no-savings case preserves multiple perspectives and adds financial guidance", async () => {
  const result = makeAnalysis("You are considering leaving immediately without savings or another offer; the financial downside deserves careful thought.");
  result.argumentsFor = ["Leaving immediately may feel like a way to address a serious work problem.", "A break could create room to recover if the job is harming your wellbeing.", "A firm boundary may be valuable if an unsafe condition is present."];
  result.argumentsAgainst = ["Without savings or another offer, income could stop immediately.", "Bills and housing costs may become harder to cover.", "An abrupt exit can reduce time to plan a transition."];
  result.alternatives = [
    { option: "Explore leave, reduced hours, or internal transfer.", tradeoff: "May buy time, depending on workplace conditions and eligibility." },
    { option: "Set a short job-search and cash-flow plan before resigning.", tradeoff: "Preserves income while postponing an immediate exit." }
  ];
  mockOpenAI(result);

  const res = await request("POST", "/api/analyze", { decision: decisionExamples.difficult, priorities: "Health and financial stability" });
  assert.equal(res.status, 200);
  assert.equal(res.body.mode, "openai");
  assert.equal(res.body.analysis.professionalAdvice, true);
  assert.match(res.body.analysis.professionalAdviceMessage, /financial counselor|adviser/i);
  assert.equal(res.body.analysis.alternatives.length, 2);
  assert.match(res.body.analysis.uncertainty, /cannot predict/i);
  assert.doesNotMatch(res.body.analysis.decisionSummary, /you should (quit|stay)/i);
});

test("severe chest pain takes the emergency path and never calls OpenAI", async () => {
  let modelCalled = false;
  global.fetch = async () => { modelCalled = true; throw new Error("Must not call model for emergency symptoms"); };
  delete process.env.OPENAI_API_KEY;

  const res = await request("POST", "/api/analyze", { decision: decisionExamples.urgent });
  assert.equal(res.status, 200);
  assert.equal(res.body.mode, "safety");
  assert.equal(modelCalled, false);
  assert.match(res.body.safety.message, /local emergency number/i);
  assert.match(res.body.safety.message, /do not wait until tomorrow/i);
  assert.match(res.body.safety.message, /cannot assess symptoms/i);
  assert.equal(res.body.analysis, undefined);

  const breathing = await request("POST", "/api/analyze", { decision: "I can't breathe. Should I wait until tomorrow or call emergency services?" });
  assert.equal(breathing.status, 200);
  assert.equal(breathing.body.mode, "safety");
  assert.equal(modelCalled, false);
});

test("empty, unclear, and excessively long decisions receive actionable validation", async () => {
  const empty = await request("POST", "/api/analyze", { decision: "" });
  const unclear = await request("POST", "/api/analyze", { decision: "Should I do it?" });
  const long = await request("POST", "/api/analyze", { decision: `I am weighing two choices carefully ${"with more detail ".repeat(400)}` });
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /describe the decision/i);
  assert.equal(unclear.status, 400);
  assert.match(unclear.body.error, /options you’re weighing/i);
  assert.equal(long.status, 400);
  assert.match(long.body.error, /5,000 characters/i);
});

test("Demo Mode remains labeled and usable when no server key is configured", async () => {
  delete process.env.OPENAI_API_KEY;
  const demo = await request("GET", "/api/demo");
  assert.equal(demo.status, 200);
  assert.equal(demo.body.mode, "demo");
  const config = await request("GET", "/api/config");
  assert.equal(config.body.demoMode, true);
  const submit = await request("POST", "/api/analyze", { decision: decisionExamples.typical });
  assert.equal(submit.status, 503);
  assert.equal(submit.body.code, "demo_mode");
});

test("malformed model output, upstream rate limits, and timeouts return controlled errors", async () => {
  const validRequest = { decision: decisionExamples.typical };
  mockOpenAI(null);
  global.fetch = async () => response(200, { choices: [{ message: { content: "{not valid JSON" } }] });
  const malformed = await request("POST", "/api/analyze", validRequest);
  assert.equal(malformed.status, 502);
  assert.match(malformed.body.error, /couldn’t complete/i);

  global.fetch = async () => response(429, { error: "rate limit" });
  const limited = await request("POST", "/api/analyze", validRequest);
  assert.equal(limited.status, 429);
  assert.match(limited.body.error, /busy/i);

  global.fetch = async () => { const error = new Error("timed out"); error.name = "TimeoutError"; throw error; };
  const timeout = await request("POST", "/api/analyze", validRequest);
  assert.equal(timeout.status, 504);
  assert.match(timeout.body.error, /too long/i);
});

test("review-facing UI keeps labels, keyboard focus, safety guidance, and readable text contrast", () => {
  const html = fs.readFileSync(path.join(__dirname, "../public/index.html"), "utf8");
  const appJs = fs.readFileSync(path.join(__dirname, "../public/app.js"), "utf8");
  const css = fs.readFileSync(path.join(__dirname, "../public/styles.css"), "utf8");
  for (const field of ["decision", "priorities", "worry"]) assert.match(html, new RegExp(`<label for="${field}"`));
  for (const section of ["scenarios-list", "missing-list", "questions-list", "readiness-level", "uncertainty-copy"]) assert.ok(html.includes(`id="${section}"`));
  assert.match(html, /Live analysis is sent to OpenAI.*Avoid names or details/i);
  assert.match(appJs, /Assumption to test/);
  assert.match(html, /role="alert"/);
  assert.match(html, /id="safety-heading" tabindex="-1"/);
  assert.match(appJs, /renderSafety\(payload\.safety\)/);
  assert.match(appJs, /\.focus\(\{ preventScroll: true \}\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /#results-heading:focus/);
  const luminance = hex => {
    const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255);
    const linear = channels.map(channel => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const contrast = (foreground, background) => {
    const first = luminance(foreground), second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  };
  for (const [foreground, background] of [
    ["#68766e", "#ffffff"], // textarea placeholder
    ["#66736b", "#f6f7f5"], // field hints and counters
    ["#58665d", "#ffffff"], // cards and section descriptions
    ["#5c6b63", "#f6f7f5"], // summary, loading copy, header meta
    ["#5b6a61", "#edf3ef"], // readiness card copy
    ["#606d65", "#f6f7f5"], // footer and supporting text
    ["#53645a", "#edf3ef"], // Demo Mode description
    ["#4d332d", "#ffffff"] // emergency guidance
  ]) assert.ok(contrast(foreground, background) >= 4.5, `${foreground} on ${background} is below 4.5:1`);
});
