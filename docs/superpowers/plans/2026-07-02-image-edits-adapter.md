# Image Edits Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an OpenAI/NewAPI-compatible `POST /v1/images/edits` endpoint without changing the existing `POST /v1/images/generations` contract.

**Architecture:** Keep the Jimeng image controller as the execution engine. Add a small adapter that maps edits-style multipart/json inputs into the existing `generateImagesWithRetry()` options, then refactor the image route to share response formatting and media accounting.

**Tech Stack:** Node 20, TypeScript, koa-body multipart files, node:test, tsup.

---

### Task 1: Adapter Unit

**Files:**
- Create: `src/api/adapters/image-edits.ts`
- Create: `src/__tests__/image-edits-adapter.test.ts`
- Modify: `package.json`

- [x] Write failing tests for `size` conversion, uploaded image extraction, JSON image extraction, and unsupported `mask` rejection.
- [x] Run `npm run test:image-edits-adapter` and confirm it fails because the adapter does not exist.
- [x] Implement `toImageEditGenerationRequest()` and related helpers.
- [x] Run `npm run test:image-edits-adapter` and confirm it passes.

### Task 2: Route Integration

**Files:**
- Modify: `src/api/routes/images.ts`
- Extend: `src/__tests__/image-edits-adapter.test.ts`

- [x] Write failing route shape tests proving `/edits` exists and `/generations` still exists.
- [x] Refactor shared image execution into a local helper that both endpoints call.
- [x] Wire `POST /v1/images/edits` through the adapter.
- [x] Run image adapter tests and async video tests.

### Task 3: Build, Commit, Push, Deploy

**Files:**
- Update runtime image on server `23.173.152.247`.

- [x] Run `npm run build`.
- [ ] Commit with Lore trailers.
- [ ] Push `feature/async-video-tasks` to `SolveaCX/jimeng-free-api-all`.
- [ ] Pull/build/restart on `/opt/jimeng-free-api-all-async`.
- [ ] Verify public `POST /v1/images/edits` no longer returns route-missing `code:-1000`.
- [ ] Verify public `GET /v1/models` still returns `200`.
