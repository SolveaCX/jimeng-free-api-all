# Image Generations API

本文档只描述图片生成接口，供 NewAPI 或其他中转站单独对接使用。

## 部署信息

基础地址：

```text
http://23.173.152.247:8001
```

图片生成接口：

```http
POST /v1/images/generations
```

模型列表接口：

```http
GET /v1/models?type=image
```

## 鉴权

使用即梦官网 Cookie 里的 `sessionid` 值：

```http
Authorization: Bearer <jimeng-sessionid>
```

注意：只传 `sessionid` 的值，不要带 `sessionid=` 前缀。

多个 `sessionid` 可以用英文逗号分隔，服务端会随机选择一个：

```http
Authorization: Bearer <sessionid-1>,<sessionid-2>
```

## 推荐默认模型

默认模型：

```text
jimeng-image-5.0-lite
```

低成本或兼容性优先时也可使用：

```text
jimeng-image-3.0
jimeng-image-3.1
jimeng-image-2.0-pro
```

实际可用模型建议通过接口读取：

```bash
curl "http://23.173.152.247:8001/v1/models?type=image"
```

## 请求格式

```http
POST /v1/images/generations
Content-Type: application/json
Authorization: Bearer <jimeng-sessionid>
```

### 请求字段

| 字段 | 必填 | 类型 | 说明 |
| --- | --- | --- | --- |
| `prompt` | 是 | string | 图片生成提示词。 |
| `model` | 否 | string | 默认 `jimeng-image-5.0-lite`。 |
| `negative_prompt` | 否 | string | 负面提示词。 |
| `ratio` | 否 | string | 图片比例，默认 `1:1`。 |
| `resolution` | 否 | string | 分辨率，如 `1k`、`2k`、`4k`，最终以模型支持为准。 |
| `sample_strength` | 否 | number | 参考图影响强度，默认沿用服务端内部默认值。 |
| `response_format` | 否 | string | `url` 或 `b64_json`，默认 `url`。 |
| `filePath` | 否 | string | 参考图路径、URL 或 base64。传入后走参考图混合模式。 |

### 支持比例

```text
21:9
16:9
3:2
4:3
1:1
3:4
2:3
9:16
```

如果 `ratio` 不合法，服务端会回落到 `1:1`。

## 文生图示例

```bash
curl -X POST "http://23.173.152.247:8001/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jimeng-sessionid>" \
  -d '{
    "model": "jimeng-image-5.0-lite",
    "prompt": "一张白底电商产品图，柔和棚拍灯光，高清细节",
    "ratio": "1:1",
    "resolution": "2k",
    "response_format": "url"
  }'
```

## 参考图生成示例

```bash
curl -X POST "http://23.173.152.247:8001/v1/images/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <jimeng-sessionid>" \
  -d '{
    "model": "jimeng-image-5.0-lite",
    "prompt": "保持主体不变，改成白色电商棚拍背景",
    "filePath": "data:image/png;base64,...",
    "ratio": "1:1",
    "resolution": "2k",
    "response_format": "url"
  }'
```

也可以用 multipart 上传文件，服务端会取上传文件作为参考图：

```bash
curl -X POST "http://23.173.152.247:8001/v1/images/generations" \
  -H "Authorization: Bearer <jimeng-sessionid>" \
  -F "model=jimeng-image-5.0-lite" \
  -F "prompt=保持主体不变，改成白色电商棚拍背景" \
  -F "ratio=1:1" \
  -F "resolution=2k" \
  -F "image=@source.png"
```

## 成功响应

`response_format=url`：

```json
{
  "created": 1782990000,
  "data": [
    {
      "url": "https://..."
    }
  ]
}
```

`response_format=b64_json`：

```json
{
  "created": 1782990000,
  "data": [
    {
      "b64_json": "..."
    }
  ]
}
```

## 错误响应

项目统一使用 JSON 错误包装：

```json
{
  "code": -2000,
  "message": "Params body.prompt invalid",
  "data": null
}
```

常见错误：

| code | 说明 |
| --- | --- |
| `-2000` | 请求参数不合法。 |
| `-2001` | 上游即梦请求失败，常见于 sessionid 失效。 |
| `-2006` | 内容触发审核拦截。 |
| `-2007` | 图片生成失败或超时。 |
| `-2009` | 即梦积分不足。 |

## 中转站对接建议

```text
upstream_base_url = http://23.173.152.247:8001
endpoint          = /v1/images/generations
auth_header       = Authorization: Bearer <jimeng-sessionid>
default_model     = jimeng-image-5.0-lite
response_format   = url
```

如果中转站已有 OpenAI 图片生成格式，可以直接把 `prompt`、`model`、`response_format` 透传；`size` 需要由中转站转换为本接口的 `ratio` 和 `resolution`，或者改走图片编辑文档里的 `/v1/images/edits` 适配入口。
