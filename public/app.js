const formScreen = document.querySelector("#form-screen");
const loadingScreen = document.querySelector("#loading-screen");
const resultsScreen = document.querySelector("#results-screen");
const safetyScreen = document.querySelector("#safety-screen");
const form = document.querySelector("#decision-form");
const errorBox = document.querySelector("#form-error");
const submitButton = document.querySelector("#submit-button");
const demoBanner = document.querySelector("#demo-banner");
const modeLabel = document.querySelector("#mode-label");
const demoDecision = "I have a stable job at a large company, but I've been offered a role at a smaller startup. The startup role has more responsibility, potentially faster career growth, and some equity, but the salary is slightly lower and the company is less stable. Should I take it?";
const demoPriorities = "Career growth, financial stability, learning, and long-term opportunity.";
const demoWorry = "Leaving a stable job for a company that may not succeed.";

function validateDecision(decision) {
  if (!decision) return "Describe the decision you’re considering.";
  if (decision.length > 5000) return "Please keep your decision under 5,000 characters.";
  const wordCount = decision.split(/\s+/).filter(Boolean).length;
  const vague = /^(help me decide|i need advice|what should i do|should i do it|i have a decision|i don't know what to do)[.!?]*$/i.test(decision);
  if (decision.length < 25 || wordCount < 5 || vague) {
    return "Add a little context: describe the options you’re weighing and what makes the choice difficult.";
  }
  return null;
}

document.querySelector("#decision").addEventListener("input", event => {
  document.querySelector("#decision-counter").textContent = `${event.target.value.length} / 5000`;
  errorBox.hidden = true;
});

async function loadConfig() {
  try {
    const response = await fetch("/api/config", { signal: AbortSignal.timeout(5_000) });
    const config = await response.json();
    if (config.demoMode) {
      demoBanner.hidden = false;
      modeLabel.textContent = "Demo mode · no data stored";
    }
  } catch {
    modeLabel.textContent = "Private by design";
  }
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function textElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = text;
  return element;
}

function renderCards(target, items, type) {
  const root = document.querySelector(target);
  root.replaceChildren();
  items.forEach(item => {
    const card = document.createElement("article");
    card.className = "insight-card";
    if (type === "assumption") {
      card.append(textElement("span", "detail-label", "Assumption to test"));
      card.append(textElement("h3", "", item.assumption));
      card.append(textElement("span", "detail-label", "Why it matters"));
      card.append(textElement("p", "", item.whyItMatters));
      card.append(textElement("span", "detail-label", "How to test it"));
      card.append(textElement("p", "", item.howToTest));
    } else {
      card.append(textElement("h3", "", item.risk));
      card.append(textElement("span", "detail-label", "Potential impact"));
      card.append(textElement("p", "", item.potentialImpact));
      card.append(textElement("span", "detail-label", "What could reduce it"));
      card.append(textElement("p", "", item.mitigation));
    }
    root.append(card);
  });
}

function renderList(target, items, className) {
  const root = document.querySelector(target);
  root.replaceChildren();
  items.forEach(item => root.append(textElement("li", className || "", item)));
}

function renderAnalysis(analysis, mode) {
  safetyScreen.hidden = true;
  document.querySelector("#decision-summary").textContent = analysis.decisionSummary;
  document.querySelector("#readiness-level").textContent = analysis.readiness.level;
  document.querySelector("#readiness-rationale").textContent = analysis.readiness.rationale;
  document.querySelector("#uncertainty-copy").textContent = analysis.uncertainty;
  document.querySelector("#advice-banner").hidden = !analysis.professionalAdvice;
  document.querySelector("#advice-message").textContent = analysis.professionalAdviceMessage || "This decision may benefit from qualified professional guidance. LifeProof provides decision support, not professional advice.";
  document.querySelector("#result-mode").textContent = mode === "demo" ? "DEMO EXAMPLE · NOT LIVE AI" : "OPENAI ANALYSIS";
  renderCards("#assumptions-list", analysis.assumptions, "assumption");
  renderCards("#risks-list", analysis.risks, "risk");
  renderList("#for-list", analysis.argumentsFor);
  renderList("#against-list", analysis.argumentsAgainst);
  const alternatives = document.querySelector("#alternatives-list");
  alternatives.replaceChildren();
  analysis.alternatives.forEach(item => {
    const card = document.createElement("article"); card.className = "alternative-card";
    card.append(textElement("h3", "", item.option), textElement("p", "", item.tradeoff)); alternatives.append(card);
  });
  const scenarios = document.querySelector("#scenarios-list");
  scenarios.replaceChildren();
  analysis.scenarios.forEach(item => {
    const card = document.createElement("article"); card.className = "scenario-card"; card.dataset.type = item.type;
    card.append(textElement("span", "scenario-type", item.type), textElement("h3", "", item.outcome), textElement("span", "detail-label", "Key uncertainty"), textElement("p", "", item.uncertainty)); scenarios.append(card);
  });
  renderList("#missing-list", analysis.missingInformation);
  renderList("#questions-list", analysis.questions);
  loadingScreen.hidden = true;
  formScreen.hidden = true;
  resultsScreen.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelector("#results-heading").focus({ preventScroll: true });
}

function renderSafety(safety) {
  loadingScreen.hidden = true;
  formScreen.hidden = true;
  resultsScreen.hidden = true;
  safetyScreen.hidden = false;
  document.querySelector("#safety-message").textContent = safety.message;
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelector("#safety-heading").focus({ preventScroll: true });
}

async function startDemo() {
  document.querySelector("#decision").value = demoDecision;
  document.querySelector("#priorities").value = demoPriorities;
  document.querySelector("#worry").value = demoWorry;
  document.querySelector("#decision-counter").textContent = `${demoDecision.length} / 5000`;
  formScreen.hidden = true; resultsScreen.hidden = true; loadingScreen.hidden = false;
  loadingScreen.querySelector("h2").innerHTML = "A sample decision,<br>thought through.";
  loadingScreen.querySelector("p:last-child").textContent = "Loading the representative example. This is not a live AI response.";
  try {
    const response = await fetch("/api/demo", { signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error();
    const payload = await response.json();
    renderAnalysis(payload.analysis, "demo");
  } catch {
    loadingScreen.hidden = true; formScreen.hidden = false;
    showError("The example could not be loaded. Please refresh and try again.");
  }
}

form.addEventListener("submit", async event => {
  event.preventDefault(); errorBox.hidden = true;
  const data = new FormData(form);
  const decision = String(data.get("decision") || "").trim();
  const decisionError = validateDecision(decision);
  if (decisionError) { showError(decisionError); document.querySelector("#decision").focus(); return; }
  formScreen.hidden = true; resultsScreen.hidden = true; loadingScreen.hidden = false;
  loadingScreen.querySelector("h2").innerHTML = "Looking at this from<br>every angle.";
  loadingScreen.querySelector("p:last-child").textContent = "Finding assumptions, testing scenarios, and weighing what matters to you.";
  submitButton.disabled = true;
  try {
    const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, priorities: data.get("priorities"), worry: data.get("worry") }), signal: AbortSignal.timeout(50_000) });
    let payload;
    try { payload = await response.json(); }
    catch { throw new Error("LifeProof received an unreadable response. Your entries are still here; please try again."); }
    if (!response.ok) throw new Error(payload.error || "We couldn’t complete the stress test. Please try again.");
    if (payload.mode === "safety" && payload.safety) { renderSafety(payload.safety); return; }
    renderAnalysis(payload.analysis, payload.mode);
  } catch (error) {
    loadingScreen.hidden = true; formScreen.hidden = false;
    if (error.name === "TimeoutError" || error.name === "AbortError") showError("The request took too long. Your entries are still here; please try again.");
    else if (error instanceof TypeError) showError("We couldn’t reach LifeProof. Check your connection and try again.");
    else showError(error.message || "The analysis didn’t finish. Your entries are still here; please try again.");
  } finally { submitButton.disabled = false; }
});

function startOver() {
  form.reset();
  document.querySelector("#decision-counter").textContent = "0 / 5000";
  document.querySelector("#advice-banner").hidden = true;
  errorBox.hidden = true; loadingScreen.hidden = true; resultsScreen.hidden = true; safetyScreen.hidden = true; formScreen.hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  document.querySelector("#decision").focus({ preventScroll: true });
}

document.querySelector("#demo-button").addEventListener("click", startDemo);
document.querySelector("#back-button").addEventListener("click", startOver);
document.querySelector("#again-button").addEventListener("click", startOver);
document.querySelector("#start-over-button").addEventListener("click", startOver);
document.querySelector("#safety-start-over").addEventListener("click", startOver);
loadConfig();
