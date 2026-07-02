export type VideoPollStatus = 'IN_PROGRESS' | 'SUCCESS' | 'FAILURE';

export interface VideoPollResult {
  status: VideoPollStatus;
  progress: string;
  url?: string;
  error?: string;
}

export const VIDEO_PROCESSING_STATES = [20, 42, 45];

export function extractVideoUrlFromItemList(itemList: any[] = []) {
  for (const item of itemList) {
    const url =
      item?.video?.transcoded_video?.origin?.video_url ||
      item?.video?.play_url ||
      item?.video?.download_url ||
      item?.video?.url;
    if (url) return url;
  }
}

export function extractVideoUrlFromResponse(result: any) {
  const historyRecords = [
    ...(result?.history_list || []),
    ...(result?.history_records || []),
  ];
  if (result?.data && typeof result.data === 'object') {
    historyRecords.push(...Object.values(result.data));
  }
  if (
    result &&
    typeof result === 'object' &&
    !Array.isArray(result) &&
    !result.history_list &&
    !result.history_records
  ) {
    historyRecords.push(...Object.values(result));
  }

  for (const record of historyRecords) {
    const itemList = (record as any)?.item_list || (record as any)?.origin_item_list || [];
    const url = extractVideoUrlFromItemList(itemList);
    if (url) return url;
  }

  const responseStr = JSON.stringify(result);
  return responseStr.match(/https:\/\/[^"\s]+(?:vlabvod|vod)[^"\s]+/)?.[0];
}

function getFirstHistoryRecord(result: any) {
  if (result?.history_list?.length) return result.history_list[0];
  if (result?.history_records?.length) return result.history_records[0];
  const data = result?.data;
  if (data && typeof data === 'object') {
    const values = Object.values(data);
    if (values.length > 0) return values[0];
  }
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const values = Object.values(result).filter((value: any) =>
      value &&
      typeof value === 'object' &&
      (value.history_record_id || value.item_list || value.origin_item_list || value.task)
    );
    if (values.length > 0) return values[0];
  }
  return null;
}

export function normalizeVideoPollResult(result: any): VideoPollResult {
  const url = extractVideoUrlFromResponse(result);
  if (url) {
    return {
      status: 'SUCCESS',
      progress: '100%',
      url,
    };
  }

  const historyData: any = getFirstHistoryRecord(result);
  if (!historyData) {
    return {
      status: 'IN_PROGRESS',
      progress: '50%',
    };
  }

  const status = historyData.status ?? historyData.task?.status;
  const failCode = historyData.fail_code ?? historyData.task?.fail_code;

  if (status === 30) {
    return {
      status: 'FAILURE',
      progress: '100%',
      error: `视频生成失败: ${failCode || 'unknown'}`,
    };
  }

  if (VIDEO_PROCESSING_STATES.includes(status)) {
    return {
      status: 'IN_PROGRESS',
      progress: '50%',
    };
  }

  return {
    status: 'FAILURE',
    progress: '100%',
    error: `视频生成结束但未返回可用URL，状态码: ${status}${failCode ? `，失败码: ${failCode}` : ''}`,
  };
}
