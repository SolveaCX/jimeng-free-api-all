import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jimeng-video-tasks-"));
process.env.DB_PATH = path.join(tempDir, "tasks.db");

test("video task storage persists task lifecycle fields", async () => {
  const db = await import("../lib/database.ts");

  const task = db.createVideoTask({
    taskId: "task_test_storage",
    historyId: "history_1",
    status: "QUEUED",
    model: "jimeng-video-3.0-fast",
    prompt: "a cat walking",
    token: "session-token-123456",
    request: { duration: 5, ratio: "16:9" },
  });

  assert.equal(task.task_id, "task_test_storage");
  assert.equal(task.status, "QUEUED");
  assert.equal(task.history_id, "history_1");
  assert.equal(task.token, "session-token-123456");
  assert.deepEqual(task.request, { duration: 5, ratio: "16:9" });

  const updated = db.updateVideoTask("task_test_storage", {
    status: "SUCCESS",
    resultUrl: "https://example.com/video.mp4",
    error: null,
    finished: true,
  });

  assert.equal(updated?.status, "SUCCESS");
  assert.equal(updated?.result_url, "https://example.com/video.mp4");
  assert.ok(updated?.finished_at);

  const loaded = db.getVideoTask("task_test_storage");
  assert.equal(loaded?.result_url, "https://example.com/video.mp4");
});

test("unfinished video task query excludes completed tasks", async () => {
  const db = await import("../lib/database.ts");

  db.createVideoTask({
    taskId: "task_pending",
    historyId: "history_pending",
    status: "IN_PROGRESS",
    model: "jimeng-video-3.0-fast",
    prompt: "pending",
    token: "session-token-123456",
    request: {},
  });

  const unfinished = db.listUnfinishedVideoTasks(10);

  assert.ok(unfinished.some((task) => task.task_id === "task_pending"));
  assert.ok(!unfinished.some((task) => task.task_id === "task_test_storage"));
});

test("video task response maps internal status to OpenAI-style object", async () => {
  const { toVideoTaskResponse } = await import("../api/controllers/video-tasks.ts");

  const response = toVideoTaskResponse({
    task_id: "task_response",
    history_id: "history_response",
    status: "SUCCESS",
    model: "jimeng-video-3.0-fast",
    prompt: "a finished task",
    token: "session-token-123456",
    token_hash: "hash",
    token_preview: "sess****3456",
    request: {},
    result_url: "https://example.com/video.mp4",
    error: null,
    created_at: "2026-07-02 12:00:00",
    updated_at: "2026-07-02 12:01:00",
    finished_at: "2026-07-02 12:01:00",
  });

  assert.equal(response.id, "task_response");
  assert.equal(response.object, "video.generation");
  assert.equal(response.status, "completed");
  assert.equal(response.progress, "100%");
  assert.equal(response.url, "https://example.com/video.mp4");
  assert.equal(response.error, null);
});

test("video poll result extracts completed video URL", async () => {
  const { normalizeVideoPollResult } = await import("../api/controllers/video-poll.ts");

  const result = normalizeVideoPollResult({
    history_list: [
      {
        status: 45,
        item_list: [
          {
            video: {
              play_url: "https://example.vlabvod.com/video.mp4",
            },
          },
        ],
      },
    ],
  });

  assert.equal(result.status, "SUCCESS");
  assert.equal(result.progress, "100%");
  assert.equal(result.url, "https://example.vlabvod.com/video.mp4");
});

test("video poll result maps processing and failure states", async () => {
  const { normalizeVideoPollResult } = await import("../api/controllers/video-poll.ts");

  assert.deepEqual(normalizeVideoPollResult({
    history_list: [{ status: 20, item_list: [] }],
  }), {
    status: "IN_PROGRESS",
    progress: "50%",
  });

  assert.deepEqual(normalizeVideoPollResult({
    history_records: [{ status: 30, fail_code: "quota_limited", item_list: [] }],
  }), {
    status: "FAILURE",
    progress: "100%",
    error: "视频生成失败: quota_limited",
  });
});

test("video worker maps poll results to database updates", async () => {
  const { toVideoTaskUpdate } = await import("../lib/video-task-update.ts");

  assert.deepEqual(toVideoTaskUpdate({
    status: "SUCCESS",
    progress: "100%",
    url: "https://example.com/video.mp4",
  }), {
    status: "SUCCESS",
    resultUrl: "https://example.com/video.mp4",
    error: null,
    finished: true,
  });

  assert.deepEqual(toVideoTaskUpdate({
    status: "FAILURE",
    progress: "100%",
    error: "failed",
  }), {
    status: "FAILURE",
    resultUrl: null,
    error: "failed",
    finished: true,
  });

  assert.deepEqual(toVideoTaskUpdate({
    status: "IN_PROGRESS",
    progress: "50%",
  }), {
    status: "IN_PROGRESS",
    finished: false,
  });
});
