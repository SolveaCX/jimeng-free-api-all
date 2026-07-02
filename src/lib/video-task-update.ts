import type { UpdateVideoTaskInput } from '@/lib/database.ts';
import type { VideoPollResult } from '@/api/controllers/video-poll.ts';

export function toVideoTaskUpdate(result: VideoPollResult): UpdateVideoTaskInput {
  switch (result.status) {
    case 'SUCCESS':
      return {
        status: 'SUCCESS',
        resultUrl: result.url || null,
        error: null,
        finished: true,
      };
    case 'FAILURE':
      return {
        status: 'FAILURE',
        resultUrl: null,
        error: result.error || 'video generation failed',
        finished: true,
      };
    case 'IN_PROGRESS':
    default:
      return {
        status: 'IN_PROGRESS',
        finished: false,
      };
  }
}
