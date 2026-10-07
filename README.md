# LifeProof

An AI-powered Decision Stress Test that challenges assumptions, uncovers risks, and explores alternative scenarios.

## Problem

Important decisions are often made with incomplete information and untested assumptions. A quick opinion or generic chatbot answer can reinforce a user's first instinct instead of helping them think more clearly.

## Solution

LifeProof gives people a structured way to examine a decision from multiple angles: assumptions, risks, arguments on both sides, alternatives, scenarios, missing information, and questions to resolve. It supports reflection without making the decision for the user.

## How it works

1. The user describes a decision and, optionally, their priorities and concern.
2. The browser sends the information to the app's server endpoint over HTTPS in deployment.
3. The server calls the OpenAI Chat Completions API using a JSON Schema response format.
4. The browser renders the structured analysis. LifeProof does not persist decision content.
5. Without an OpenAI key, the user can explicitly open a representative sample in Demo Mode. It is labeled as an example and is never represented as a live AI response.

## Architecture

- `public/`: responsive, accessible, dependency-free frontend.
- `server.js`: Node.js HTTP server, static hosting, validation, demo endpoint, and server-side OpenAI endpoint.
- `src/jev-adapter.js`: isolated `evaluateDecisionWithJev(factors)` integration boundary. It returns `not_configured` and null evaluations until an official Jev endpoint and credentials are available.
- `render.yaml`: Render Blueprint for a Node web service, health check, build/start commands, and secret environment variable.

OpenAI keys are read only by `server.js` from the process environment. They are never returned by `/api/config` or embedded in browser assets. User submissions are sent to OpenAI when live analysis is requested, but LifeProof itself does not store them. Server logs omit request content.

## Models/tools used

- OpenAI Chat Completions API with strict JSON Schema output.
- Default model: `gpt-4o-mini`, configurable with `OPENAI_MODEL`.
- Node.js 18 or newer. The app has no third-party runtime dependencies.
- Jev is not connected or used in this MVP.

## Responsible AI considerations

- The analysis explores multiple perspectives and does not tell the user which option to choose.
- Future outcomes are described as scenarios with explicit uncertainty, not predictions or guarantees.
- Medical, legal, financial, and other high-impact situations are flagged for qualified professional consultation.
- Users are asked only for decision context, priorities, and an optional concern. They should omit identifying or sensitive details they do not need to share.
- The app does not store decision content. OpenAI processes content for live requests; consult the provider's current privacy terms before using the service with sensitive information.
- The output may be wrong, incomplete, or biased and should be reviewed critically.

## Local setup

Requirements: Node.js 18+ and npm.

```sh
git clone <your-repository-url>
cd LifeProof
cp .env.example .env
```

Add an OpenAI key to `.env` for live analysis. If it is left blank, run the app in clearly labeled Demo Mode.

```sh
npm install
npm run build
npm start
```

Open <http://localhost:3000>. To check server health, open <http://localhost:3000/api/health>. `npm run build` performs JavaScript syntax checks; the project uses no compile step or runtime dependencies.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `OPENAI_API_KEY` | For live analysis | Secret API key. Keep it in the server environment; do not use a `VITE_`, `NEXT_PUBLIC_`, or other client-exposed variable. Without it, Demo Mode is available. |
| `OPENAI_MODEL` | No | OpenAI model name; defaults to `gpt-4o-mini`. |
| `PORT` | No | HTTP port; defaults to `3000` locally. Render provides its own `PORT`. |
| `HOST` | No | Bind address; defaults to `0.0.0.0` for Render. Set to `127.0.0.1` for loopback-only local use if desired. |

## Deployment

The repository includes `render.yaml`. To deploy:

1. Push this repository to GitHub, GitLab, or another Git provider supported by Render.
2. In the [Render Dashboard](https://dashboard.render.com/), choose **New → Blueprint**, connect the repository, and review the `lifeproof` web service defined in `render.yaml`.
3. Set the `OPENAI_API_KEY` secret when prompted. To deploy in Demo Mode, leave it unset if the Blueprint flow allows it, or remove that environment variable from the service after creation. The model defaults to `gpt-4o-mini`.
4. Deploy the Blueprint. Render runs `npm install && npm run build`, then `npm start`. The server binds to `0.0.0.0` on Render's `PORT`, and `/api/health` is its health check.
5. When the first deployment is live, open the service's `https://<service-name>.onrender.com` URL. In the service settings, confirm the `OPENAI_API_KEY` and `OPENAI_MODEL` environment values. Future commits to the connected branch deploy automatically according to the service settings.

Alternatively, create a **New → Web Service**, connect the repository, set build command to `npm install && npm run build`, start command to `npm start`, add `OPENAI_API_KEY` and optional `OPENAI_MODEL`, then create the service. Render provides a public `onrender.com` subdomain and supports custom domains. See [Render's Node deployment guide](https://render.com/docs/deploy-node-express-app) and [Blueprint documentation](https://render.com/docs/infrastructure-as-code).

## Known limitations

- The model can miss relevant context or produce plausible but incorrect analysis. There is no human review.
- Results depend on the quality and completeness of the user's description and do not use external research.
- Demo Mode always displays the same illustrative startup-job example.
- Rate limiting and abuse controls are not implemented; configure service-level protections before broad public exposure.
- The Jev adapter is an interface only. It returns no substantive Jev evaluation until a supported API/SDK and credentials are available.
- Live analysis requires network access to OpenAI and a valid key with available API quota.

## Future Jev integration

Implement the official Jev API call inside `evaluateDecisionWithJev()` in `src/jev-adapter.js` when the endpoint, SDK, credentials, and response contract are known. Keep its input limited to normalized decision factors, validate its output, and preserve a truthful provider status. The current adapter explicitly reports `not_configured`; OpenAI alone powers all live analysis in this version.
