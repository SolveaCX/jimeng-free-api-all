import type { VideoTaskRecord, VideoTaskStatus } from '@/lib/database.ts';
import Response from '@/lib/response/Response.ts';

export interface VideoTaskResponse {
  id: string;
  object: 'video.generation';
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  progress: string;
  model: string;
  created_at?: string;
  updated_at?: string;
  finished_at?: string | null;
  url?: string | null;
  error: string | null;
}

function mapStatus(status: VideoTaskStatus): VideoTaskResponse['status'] {
  switch (status) {
    case 'QUEUED':
      return 'queued';
    case 'IN_PROGRESS':
      return 'in_progress';
    case 'SUCCESS':
      return 'completed';
    case 'FAILURE':
      return 'failed';
    default:
      return 'failed';
  }
}

function mapProgress(status: VideoTaskStatus): string {
  switch (status) {
    case 'QUEUED':
      return '0%';
    case 'IN_PROGRESS':
      return '50%';
    case 'SUCCESS':
    case 'FAILURE':
      return '100%';
    default:
      return '100%';
  }
}

export function toVideoTaskResponse(task: VideoTaskRecord): VideoTaskResponse {
  return {
    id: task.task_id,
    object: 'video.generation',
    status: mapStatus(task.status),
    progress: mapProgress(task.status),
    model: task.model,
    created_at: task.created_at,
    updated_at: task.updated_at,
    finished_at: task.finished_at,
    url: task.result_url || null,
    error: task.error || null,
  };
}

export function toVideoContentRedirectResponse(url: string) {
  return new Response('', { statusCode: 302, redirect: url });
}
