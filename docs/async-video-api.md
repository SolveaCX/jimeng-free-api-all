# 异步视频任务接口文档

本文档描述当前部署在 23 服务器上的即梦异步视频任务接口，供后续 NewAPI 104 渠道适配使用。

## 部署信息

基础地址：

```text
http://23.173.152.247:8001
```

当前部署分支：

```text
feature/async-video-tasks
```

当前部署提交：

```text
e64b3bae3a87c3b09c0f1e7498eb64a06d3f2b04
```

鉴权方式使用即梦官网 Cookie 里的 `sessionid` 值：

```http
Authorization: Bearer <jimeng_sessionid>
```

注意：只传 `sessionid` 的值，不要带 `sessionid=` 前缀。

## 推荐低成本模型

低成本测试和默认视频生成建议使用：

```text
jimeng-video-seedance-2.0-mini
```

推荐低成本参数：

```json
{
  "model": "jimeng-video-seedance-2.0-mini",
  "ratio": "16:9",
  "resolution": "720p",
  "duration": 5
}
```

## 1. 提交异步视频任务

```http
POST /v1/videos
```

用途：提交即梦视频生成任务，接口立即返回本地 `task_id`，不阻塞等待视频完成。服务端会保存即梦上游 `history_id`，后台 worker 每 5 秒轮询一次上游任务状态。

### 请求示例

```bash
curl -X POST http://23.173.152.247:8001/v1/videos \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jimeng_sessionid>" \
  -d '{
    "model": "jimeng-video-seedance-2.0-mini",
    "prompt": "A small white cube slowly rotating on a plain gray background.",
    "ratio": "16:9",
    "resolution": "720p",
    "duration": 5
  }'
```

### 请求字段

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `model` | 否 | string | 默认 `jimeng-video-seedance-2.0-mini`。 |
| `prompt` | 是 | string | 提交给即梦的视频提示词。 |
| `ratio` | 否 | string | 常用值：`16:9`、`9:16`、`1:1`、`4:3`、`3:4`、`21:9`。 |
| `resolution` | 否 | string | 低成本测试建议 `720p`。 |
| `duration` | 否 | number | 低成本测试建议 `5`。 |
| `file_paths` | 否 | string[] | 可选，首帧/尾帧图片路径、URL 或 base64。 |

### 成功响应

HTTP 状态：

```text
202 Accepted
```

响应体：

```json
{
  "id": "task_xxx",
  "object": "video.generation",
  "status": "queued",
  "progress": "0%",
  "model": "jimeng-video-seedance-2.0-mini",
  "created_at": "2026-07-02 06:05:49",
  "updated_at": "2026-07-02 06:05:49",
  "finished_at": null,
  "url": null,
  "error": null
}
```

### 错误响应

即梦上游失败会以 JSON 返回 `code` 和 `message`。例如 `sessionid` 无效或过期：

```json
{
  "code": -2001,
  "message": "[请求失败]: check login error (错误码: 1015)",
  "data": null
}
```

## 2. 查询任务状态

```http
GET /v1/videos/:task_id
```

用途：查询本地异步任务状态。

### 请求示例

```bash
curl http://23.173.152.247:8001/v1/videos/task_xxx
```

### 处理中响应

```json
{
  "id": "task_xxx",
  "object": "video.generation",
  "status": "in_progress",
  "progress": "50%",
  "model": "jimeng-video-seedance-2.0-mini",
  "created_at": "2026-07-02 06:05:49",
  "updated_at": "2026-07-02 06:06:22",
  "finished_at": null,
  "url": null,
  "error": null
}
```

### 完成响应

```json
{
  "id": "task_xxx",
  "object": "video.generation",
  "status": "completed",
  "progress": "100%",
  "model": "jimeng-video-seedance-2.0-mini",
  "created_at": "2026-07-02 06:05:49",
  "updated_at": "2026-07-02 06:09:24",
  "finished_at": "2026-07-02 06:09:24",
  "url": "https://v9-artist.vlabvod.com/.../video.mp4",
  "error": null
}
```

### 失败响应

```json
{
  "id": "task_xxx",
  "object": "video.generation",
  "status": "failed",
  "progress": "100%",
  "model": "jimeng-video-seedance-2.0-mini",
  "finished_at": "2026-07-02 06:09:24",
  "url": null,
  "error": "视频生成失败: raw_failed"
}
```

### 状态枚举

| 状态 | 含义 |
| --- | --- |
| `queued` | 本地任务已创建，等待后台 worker 轮询。 |
| `in_progress` | 即梦正在生成视频。 |
| `completed` | 视频生成完成，`url` 可用。 |
| `failed` | 视频生成失败，查看 `error`。 |

### 任务不存在

未知 `task_id` 返回：

```text
HTTP 404
```

```json
{
  "error": {
    "message": "video task not found",
    "code": "task_not_found"
  }
}
```

## 3. 获取视频内容

```http
GET /v1/videos/:task_id/content
```

用途：任务完成后跳转到真实即梦视频 URL。

### 任务已完成

```text
HTTP/1.1 302 Found
Location: https://v9-artist.vlabvod.com/.../video.mp4
```

### 任务未完成

如果任务仍是 `queued` 或 `in_progress`：

```text
HTTP 409
```

响应体为当前任务状态 JSON，与 `GET /v1/videos/:task_id` 一致。

### 任务不存在

未知 `task_id` 返回 `HTTP 404`。

## 4. 原同步接口

原同步接口仍保留：

```http
POST /v1/videos/generations
```

用途：同步等待即梦视频生成完成后返回结果。

NewAPI 104 新适配不建议走该接口，因为视频生成通常需要数分钟，同步 relay 路径容易超时。推荐使用 `POST /v1/videos` + `GET /v1/videos/:task_id` 的异步任务模式。

## NewAPI 104 推荐对接流程

1. NewAPI 收到用户视频生成请求。
2. 调用 `POST /v1/videos`。
3. 保存返回的 `id`，作为 provider task id。
4. 定时轮询 `GET /v1/videos/:task_id`，建议 5 到 15 秒一次。
5. 如果状态是 `queued` 或 `in_progress`，继续轮询。
6. 如果状态是 `completed`，读取 `url`，将 NewAPI 任务标记为成功。
7. 如果状态是 `failed`，读取 `error`，将 NewAPI 任务标记为失败。
8. 如需下载或跳转，可暴露 `GET /v1/videos/:task_id/content`。

流程图：

```text
Client/NewAPI
  -> POST /v1/videos
  <- 202 { id: "task_xxx", status: "queued" }

NewAPI scheduler
  -> GET /v1/videos/task_xxx
  <- { status: "in_progress" }

NewAPI scheduler
  -> GET /v1/videos/task_xxx
  <- { status: "completed", url: "https://..." }

Client/NewAPI
  -> GET /v1/videos/task_xxx/content
  <- 302 Location: https://...
```

## 实测记录

测试日期：

```text
2026-07-02
```

测试请求：

```json
{
  "model": "jimeng-video-seedance-2.0-mini",
  "prompt": "A small white cube slowly rotating on a plain gray background, simple studio lighting.",
  "ratio": "16:9",
  "resolution": "720p",
  "duration": 5
}
```

测试结果：

| 项目 | 值 |
| --- | --- |
| 提交接口 | `POST /v1/videos` |
| 提交状态 | `HTTP 202` |
| 任务 ID | `task_12e8fd3075dc11f1a51661367cc8e337` |
| 最终状态 | `completed` |
| 状态流转 | `queued -> in_progress -> completed` |
| 约耗时 | 3 分 35 秒 |
| 内容接口 | `GET /v1/videos/task_12e8fd3075dc11f1a51661367cc8e337/content` |
| 内容响应 | `HTTP 302 Found` |

本次测试使用的 `sessionid` 没有写入本文档；测试完成后也已从完成任务记录中的 `token` 字段脱敏。
