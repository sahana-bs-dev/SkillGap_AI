# Phase 3 — Supervisor Agent & Routing (Backend)

Status: **Done, tested**

## Scope (per roadmap)
- Supervisor logic: decide resume-only vs. resume+JD pipeline
- Shared Pydantic schemas every agent will use
- Orchestration function chaining agent calls

## What was built

### 1. `app/llm/schemas.py`
Shared Pydantic schemas used by every agent and the orchestration layer:
- `AgentName`, `RouteType` enums
- `AgentResult[T]` — generic wrapper every agent call returns (`success`, `data`, `error`, `latency_ms`)
- Input/output schemas for all six agents: ATS, JD Analysis, Matching, Skill Gap, Learning, Resume Rewrite
- `PipelinePlan`, `LoopIteration`, `LoopState` for the routing and improvement-loop layers

### 2. `app/agents/base_agent.py`
`BaseAgent` — the interface every specialist agent (Phases 4–7) subclasses:
- Concrete agents only need to implement `build_prompt(input_data)`
- `run()` handles calling the LLM, timing, validating the response against the agent's output schema, and catching any error so it never raises into the pipeline

### 3. `app/agents/supervisor.py`
`SupervisorAgent` — pure routing logic, no LLM call:
- `decide_route(jd_text)` → resume-only or resume+JD
- `build_pipeline(route)` → ordered list of agents to run
- `should_continue_loop(remaining_gaps, iteration)` → whether the improvement loop keeps going, with a 5-iteration safety cap
- `next_loop_step()` → always re-enters at Skill Gap (per the roadmap's loop diagram)

### 4. `app/orchestration/pipeline.py`
`PipelineOrchestrator` — chains the intake pass:
- Resume-only → ATS
- Resume+JD → JD Analysis → Matching → Skill Gap → Learning, each agent's output feeding the next agent's input
- Agents are looked up from a registry (`dict[AgentName, BaseAgent]`) rather than imported directly, so swapping a model/provider later doesn't touch this file
- Returns a `PipelineReport` with per-agent results and where it failed, if anywhere

### 5. `app/orchestration/improvement_loop.py`
`ImprovementLoopController` — runs the dashed "repeat" edge from the roadmap diagram:
- Resume Rewrite → re-run Matching → log score for that iteration → ask Supervisor whether to continue → if yes, re-run Skill Gap and loop again

### 6. `tests/test_phase3_routing.py`
Smoke tests using stub agents (no real LLM calls) — verifies:
- Routing picks the correct pipeline for resume-only vs. resume+JD input
- The orchestrator chains agent outputs into the next agent's input correctly
- Loop stop conditions (no remaining gaps, safety cap) behave as expected

All 5 tests pass.

