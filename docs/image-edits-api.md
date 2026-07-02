# Image Edits Adapter API

部署地址：

```text
http://23.173.152.247:8001
```

## 目标

新增一个给 NewAPI 或其他中转站对接的图片编辑兼容入口：

```text
POST /v1/images/edits
```

原来的接口继续保留：

```text
POST /v1/images/generations
```

`/v1/images/edits` 不重新实现即梦图片逻辑，只做 OpenAI/NewAPI 参数适配，然后复用项目已有的参考图混合能力。

## 鉴权

和原项目一致，`Authorization` 里放即梦 `sessionid`：

```http
Authorization: Bearer <jimeng-sessionid>
```

多个 sessionid 可用英文逗号分隔，服务端会随机取一个：

```http
Authorization: Bearer <sessionid-1>,<sessionid-2>
```

## 图片编辑接口

```http
POST /v1/images/edits
Content-Type: multipart/form-data
Authorization: Bearer <jimeng-sessionid>
```

### multipart/form-data 参数

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `image` | 是 | 原图文件。也支持 JSON/base64 方式传入，见下文。 |
| `prompt` | 是 | 编辑提示词。 |
| `model` | 否 | 即梦图片模型，默认 `jimeng-image-5.0-lite`。 |
| `size` | 否 | OpenAI 风格尺寸，如 `1024x1024`、`1536x1024`、`1024x1536`、`auto`。会映射为即梦 `ratio` 和 `resolution`。 |
| `response_format` | 否 | `url` 或 `b64_json`，默认 `url`。 |
| `negative_prompt` | 否 | 负面提示词，透传给内部生成逻辑。 |
| `sample_strength` | 否 | 参考图影响强度，默认沿用项目内部默认值。 |
| `n` | 否 | 目前只支持 `1`。大于 1 会返回参数错误。 |
| `mask` | 否 | 不支持。即梦当前复用的是 blend/byte_edit，不是局部 mask inpainting。传入会返回参数错误。 |

### JSON/base64 参数

也可以用 JSON 调用：

```json
{
  "model": "jimeng-image-5.0-lite",
  "prompt": "把背景改成白色电商棚拍",
  "image": "data:image/png;base64,...",
  "size": "1024x1024",
  "response_format": "url"
}
```

`image` 支持：

```text
data:image/png;base64,...
裸 base64 字符串
http/https 图片 URL
服务器本地文件路径
```

## 返回格式

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

## size 映射规则

`size` 会自动映射到最接近的即梦比例：

```text
21:9, 16:9, 3:2, 4:3, 1:1, 3:4, 2:3, 9:16
```

分辨率按最长边映射：

```text
<= 1664 -> 1k
<= 2560 -> 2k
> 2560  -> 4k
```

例如：

```text
1024x1024 -> ratio 1:1, resolution 1k
1536x1024 -> ratio 3:2, resolution 1k
1024x1536 -> ratio 2:3, resolution 1k
1792x1024 -> ratio 16:9, resolution 2k
```

## curl 示例

multipart：

```bash
curl -X POST "http://23.173.152.247:8001/v1/images/edits" \
  -H "Authorization: Bearer <jimeng-sessionid>" \
  -F "model=jimeng-image-5.0-lite" \
  -F "prompt=把背景改成白色电商棚拍" \
  -F "size=1024x1024" \
  -F "image=@source.png"
```

JSON/base64：

```bash
curl -X POST "http://23.173.152.247:8001/v1/images/edits" \
  -H "Authorization: Bearer <jimeng-sessionid>" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "jimeng-image-5.0-lite",
    "prompt": "把背景改成白色电商棚拍",
    "image": "data:image/png;base64,...",
    "size": "1024x1024"
  }'
```

## NewAPI / 中转站对接建议

渠道类型按图片编辑能力接入：

```text
upstream_base_url = http://23.173.152.247:8001
edit_endpoint     = /v1/images/edits
generation_endpoint = /v1/images/generations
auth_header       = Authorization: Bearer <jimeng-sessionid>
```

对接侧不要传 `mask`，`n` 固定传 `1` 或不传。
