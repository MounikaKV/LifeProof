/**
 * Jev decision-evaluation boundary.
 * TODO: Connect the official Jev API/SDK once endpoint and credentials are available.
 * This adapter deliberately returns an unavailable status; it does not fabricate a Jev result.
 */
async function evaluateDecisionWithJev(factors) {
  return {
    provider: "jev",
    status: "not_configured",
    evaluations: {
      assumptionRisk: null,
      downsideRisk: null,
      informationSufficiency: null,
      furtherInvestigationNeeded: null,
      decisionUncertainty: null
    },
    inputFactorCount: Array.isArray(factors) ? factors.length : 0
  };
}

module.exports = { evaluateDecisionWithJev };
