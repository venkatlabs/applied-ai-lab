# applied-ai-lab

A GitHub-ready portfolio lab for Venkat to build small, useful AI products in 3-6 hour weekend sprints.

The goal is to learn modern AI engineering by shipping demoable projects: agents, RAG, structured outputs, evals, MCP-style tools, memory, multimodal workflows, and model routing. Each project should be simple enough to finish quickly, but polished enough to show on a resume.

## Portfolio Rules

Each project in this repo should:

- Be demoable in under 2 minutes.
- Teach one or two current AI engineering concepts.
- Include a `README.md`, architecture notes, example prompts, and a tiny eval.
- Run locally with minimal setup.
- Solve a recognizable user problem instead of feeling like coursework.
- Follow the shared [cost and prompt caching standard](docs/COST_OPTIMIZATION.md).

## Structure

```text
applied-ai-lab/
  ROADMAP.md
  docs/
    COST_OPTIMIZATION.md
  templates/
    PROJECT_CHECKLIST.md
  projects/
    01-personal-chief-of-staff/
      app/
      docs/
      evals/
      README.md
    02-deep-research-briefing/
      app/
      docs/
      evals/
      README.md
```

## Project Index

| # | Project | Concepts | Status |
|---|---|---|---|
| 01 | Personal Chief of Staff | provider abstraction, structured outputs, tool use, evals | deployed |
| 02 | Deep Research Briefing Agent | planning, citations, critique loops | local MVP |
| 03 | Ask My Documents | RAG, embeddings, retrieval quality | planned |
| 04 | Personal Context MCP Server | tools, resources, reusable context | planned |
| 05 | LLM Eval Arena | eval design, model comparison, scoring | planned |
| 06 | AI Engineering Manager Copilot | issue summarization, decision support | planned |
| 07 | Meeting-to-Decisions Assistant | transcription, extraction, action items | planned |
| 08 | Browser Workflow Agent | browser automation, task state | planned |
| 09 | Multimodal Product Analyst | image understanding, structured critique | planned |
| 10 | AI Data Cleaning Copilot | schema inference, transform suggestions | planned |
| 11 | Voice Journal Memory Coach | speech, memory, reflection loops | planned |
| 12 | Agent Reliability Dashboard | observability, traces, regression testing | planned |
| 13 | Equity Research Lab | source-grounded financial research, provider abstraction, immutable prediction snapshots, retrospective evals | MVP |
| 14 | Shorts Studio | text-to-video prompts, per-platform metadata, publish-readiness lint, scheduling | local MVP |

## Weekend Workflow

1. Pick one project from `ROADMAP.md`.
2. Keep the first version intentionally small.
3. Add one screenshot or short demo recording after it works.
4. Add 3-5 eval cases before calling it complete.
5. Write a resume bullet that explains the engineering concept and user value.
6. Complete the [project shipping checklist](templates/PROJECT_CHECKLIST.md), including cache and cost measurements.

## Getting Started With Project 01

```bash
cd projects/01-personal-chief-of-staff
python3 -m app.server
```

Then open `http://localhost:8000`.

The app works in mock mode with no API keys. Add `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` to use a real model.

## GitHub Profile

Designed for ongoing additions under [geeveeyes](https://github.com/geeveeyes).

## Project 02

```bash
cd projects/02-deep-research-briefing
python3 -m app.server
```

Open `http://127.0.0.1:8002` and choose **Load example**. See the [Project 02 README](projects/02-deep-research-briefing/README.md) for API key setup and scope.


## Project 13

```bash
cd projects/13-equity-research-lab
cp .env.example .env.local
npm install
npm run dev
```

Equity Research Lab runs in demo mode without API keys and is designed to add SEC, analyst, options, persistence, and retrospective-evaluation providers incrementally. See the [Project 13 README](projects/13-equity-research-lab/README.md).

## Project 14

```bash
cd projects/14-shorts-studio
python3 -m app plan
python3 evals/run_evals.py
```

Shorts Studio turns episode prompts into Veo prompts, YouTube/TikTok/Instagram metadata, captions and a posting schedule, with no API keys needed. See the [Project 14 README](projects/14-shorts-studio/README.md).
