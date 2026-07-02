import logger from '@/lib/logger.ts';
import {
  listUnfinishedVideoTasks,
  saveMedia,
  updateVideoTask,
  type VideoTaskRecord,
} from '@/lib/database.ts';
import type { VideoPollResult } from '@/api/controllers/video-poll.ts';
import { toVideoTaskUpdate } from '@/lib/video-task-update.ts';

const DEFAULT_INTERVAL_MS = 5000;
const DEFAULT_BATCH_SIZE = 5;

let workerTimer: NodeJS.Timeout | null = null;
let workerRunning = false;

export async function updateVideoTaskFromUpstream(task: VideoTaskRecord) {
  if (!task.history_id) {
    updateVideoTask(task.task_id, {
      status: 'FAILURE',
      error: 'missing upstream history id',
      finished: true,
    });
    return;
  }

  const { pollVideoGeneration } = await import('@/api/controllers/videos.ts');
  const result = await pollVideoGeneration(task.history_id, task.token);
  updateVideoTask(task.task_id, toVideoTaskUpdate(result));
  if (result.status === 'SUCCESS' && result.url) {
    saveMedia('video', result.url, task.model, task.prompt, task.token);
  }
}

export async function runVideoTaskWorkerTick(batchSize = DEFAULT_BATCH_SIZE) {
  if (workerRunning) return;
  workerRunning = true;
  try {
    const tasks = listUnfinishedVideoTasks(batchSize);
    for (const task of tasks) {
      try {
        await updateVideoTaskFromUpstream(task);
      } catch (error) {
        logger.error(`video task worker failed for ${task.task_id}: ${error.message}`);
      }
    }
  } finally {
    workerRunning = false;
  }
}

export function startVideoTaskWorker(intervalMs = DEFAULT_INTERVAL_MS) {
  if (workerTimer) return workerTimer;
  workerTimer = setInterval(() => {
    runVideoTaskWorkerTick().catch((error) => {
      logger.error(`video task worker tick failed: ${error.message}`);
    });
  }, intervalMs);
  workerTimer.unref?.();
  logger.info(`Video task worker started, interval=${intervalMs}ms`);
  return workerTimer;
}
