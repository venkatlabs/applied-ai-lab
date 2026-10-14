# Applied AI Portfolio Roadmap

Each project is designed for a 3-6 hour first version. Later weekends can add polish, tests, screenshots, deployment, or deeper integrations.

| # | Project | Build | AI Concept | Resume/Demo Signal | First-Version Scope |
|---|---|---|---|---|---|
| 01 | Personal Chief of Staff | A local app that turns a messy goal into priorities, risks, next actions, and questions. | Provider abstraction, structured outputs, local tool use, eval harness | Shows end-to-end agent product thinking. | One-page UI, OpenAI/Anthropic providers, one scoring tool, JSON output schema. |
| 02 | Deep Research Briefing Agent | A researcher that plans, gathers sources, summarizes evidence, and critiques confidence. | Agent planning, web research, citations, self-critique | Useful demo for strategy, career, or market questions. | Manual source input first, then optional web connector. |
| 03 | Ask My Documents | Upload a few local notes or PDFs and ask grounded questions. | RAG, embeddings, chunking, retrieval evaluation | Demonstrates the most common applied AI architecture. | Local folder ingestion, simple vector search, citations to chunks. |
| 04 | Personal Context MCP Server | A small local context server exposing profile, goals, resume facts, and project notes as tools/resources. | MCP-style tool design, reusable context, boundaries | Very current and differentiated in interviews. | JSON-backed context resources and two callable tools. |
| 05 | LLM Eval Arena | Compare GPT and Claude on the same prompts with lightweight scoring. | Evals, model routing, regression testing | Strong engineering maturity signal. | Test case format, runner, scorer prompt, result table. |
| 06 | AI Engineering Manager Copilot | Analyze a pasted issue list and produce risks, tradeoffs, milestones, and stakeholder updates. | Structured synthesis, prioritization, task decomposition | Connects AI to engineering leadership. | Paste-in workflow with decision matrix output. |
| 07 | Meeting-to-Decisions Assistant | Turn meeting notes or transcripts into decisions, action items, owners, and unresolved questions. | Information extraction, structured outputs, quality checks | Immediately useful at work. | Text input, JSON extraction, exportable summary. |
| 08 | Browser Workflow Agent | A constrained assistant that navigates a small web workflow and reports what it did. | Browser agents, action planning, state tracking | Shows hands-on agent automation. | Use a local demo site before touching real sites. |
| 09 | Multimodal Product Analyst | Upload screenshots and get UX issues, severity, and suggested fixes. | Vision models, design critique, structured feedback | Great visual demo for portfolio reviews. | Screenshot upload, issue cards, exportable report. |
| 10 | AI Data Cleaning Copilot | Inspect CSVs, infer schema problems, and suggest transformations. | Code generation, data profiling, human-in-the-loop transforms | Practical data/AI tooling. | CSV upload, profile summary, safe transform preview. |
| 11 | Voice Journal Memory Coach | Record or paste reflections and receive themes, goals, and follow-up prompts. | Speech/text pipeline, memory, personalization | Human-centered AI product signal. | Text-first version, memory JSON file, weekly summary. |
| 12 | Agent Reliability Dashboard | Track prompts, model responses, latency, failures, eval scores, and regressions across lab projects. | Observability, traces, reliability engineering | Excellent senior-engineering signal. | Local JSONL logs, dashboard, eval trend chart. |
| 13 | Equity Research Lab | Research any public ticker, preserve the thesis, and grade predictions against realized returns. | Source-grounded agents, provider abstraction, financial data, evals, immutable snapshots | Demonstrates applied AI + finance product thinking and self-evaluating research workflows. | Demo-mode Next.js portal, SEC/analyst adapters, 12-factor scorecard, archive, retrospective grading. |
| 14 | Shorts Studio | Prompts in, publish-ready AI Shorts out: Veo prompts, platform metadata, captions, schedule. | Text-to-video prompting, structured copy, deterministic quality gates, human-in-the-loop publishing | Shows applied AI + content-ops product thinking. | Mock-mode planner, lint, captions, dry-run publish; Veo and YouTube adapters opt-in. |

## Suggested Order

Start with Project 01, then build Projects 03 and 05 early. The RAG and eval projects become reusable infrastructure for the rest of the lab.

## Monthly Iteration Template

```text
Weekend 1: Build the smallest working version.
Weekend 2: Add evals, screenshots, and README polish.
Weekend 3: Add one real integration or advanced feature.
Weekend 4: Refactor shared patterns into reusable lab utilities.
```

Every project must apply the shared [cost and prompt caching standard](docs/COST_OPTIMIZATION.md): stable prompt prefixes, usage telemetry, bounded inputs and outputs, inexpensive model defaults, and deterministic work outside the model.

## Resume Positioning

Use project bullets that combine product value and engineering concept:

```text
Built a local Personal Chief of Staff agent that uses provider-agnostic LLM calls, structured JSON outputs, and a deterministic prioritization tool to convert ambiguous goals into ranked actions and risks.
```
