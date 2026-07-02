import _ from "lodash";

import { ImageEditGenerationRequest, toImageEditGenerationRequest } from "@/api/adapters/image-edits.ts";
import EX from "@/api/consts/exceptions.ts";
import { DEFAULT_MODEL, generateImagesWithRetry } from "@/api/controllers/images.ts";
import { tokenSplit } from "@/api/controllers/core.ts";
import db from "@/lib/database.ts";
import APIException from "@/lib/exceptions/APIException.ts";
import Request from "@/lib/request/Request.ts";
import util from "@/lib/util.ts";

interface ImageGenerationRouteRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  ratio?: string;
  resolution?: string;
  sampleStrength?: number;
  responseFormat: string;
  filePath?: string;
}

function chooseToken(authorization: string) {
  const tokens = tokenSplit(authorization);
  if (tokens.length === 0) {
    throw new APIException(EX.API_REQUEST_PARAMS_INVALID, "Authorization token is empty");
  }
  return _.sample(tokens);
}

function firstUploadedFilePath(files: Record<string, any>) {
  const fileKey = Object.keys(files || {})[0];
  if (!fileKey) return undefined;

  const file = Array.isArray(files[fileKey]) ? files[fileKey][0] : files[fileKey];
  return file?.filepath || file?.path;
}

async function createImageGenerationResponse(
  {
    model,
    prompt,
    negativePrompt,
    ratio,
    resolution,
    sampleStrength,
    responseFormat,
    filePath,
  }: ImageGenerationRouteRequest | ImageEditGenerationRequest,
  token: string
) {
  const imageUrls = await generateImagesWithRetry(model, prompt, {
    ratio,
    resolution,
    sampleStrength,
    negativePrompt,
    filePath,
  }, token);

  try {
    db.recordCall(token, model, 0);
    imageUrls.forEach((url) => {
      if (url) db.saveMedia("image", url, model, prompt, token);
    });
  } catch (e) {
    // Statistics are best-effort and should not affect image generation.
  }

  const data = responseFormat === "b64_json"
    ? (await Promise.all(imageUrls.map((url) => util.fetchFileBASE64(url))))
      .map((b64) => ({ b64_json: b64 }))
    : imageUrls.map((url) => ({ url }));

  return {
    created: util.unixTimestamp(),
    data,
  };
}

export default {
  prefix: "/v1/images",

  post: {
    "/generations": async (request: Request) => {
      request
        .validate("body.model", v => _.isUndefined(v) || _.isString(v))
        .validate("body.prompt", _.isString)
        .validate("body.negative_prompt", v => _.isUndefined(v) || _.isString(v))
        .validate("body.ratio", v => _.isUndefined(v) || _.isString(v))
        .validate("body.resolution", v => _.isUndefined(v) || _.isString(v))
        .validate("body.sample_strength", v => _.isUndefined(v) || _.isFinite(v))
        .validate("body.response_format", v => _.isUndefined(v) || _.isString(v))
        .validate("body.filePath", v => _.isUndefined(v) || _.isString(v))
        .validate("headers.authorization", _.isString);

      const {
        model = DEFAULT_MODEL,
        prompt,
        negative_prompt: negativePrompt,
        ratio,
        resolution,
        sample_strength: sampleStrength,
        response_format,
        filePath: bodyFilePath,
      } = request.body;

      const files = request.files || {};
      const filePath = bodyFilePath || firstUploadedFilePath(files as any);

      return createImageGenerationResponse({
        model,
        prompt,
        negativePrompt,
        ratio,
        resolution,
        sampleStrength,
        responseFormat: _.defaultTo(response_format, "url"),
        filePath,
      }, chooseToken(request.headers.authorization));
    },

    "/edits": async (request: Request) => {
      request
        .validate("body.model", v => _.isUndefined(v) || _.isString(v))
        .validate("body.prompt", _.isString)
        .validate("body.negative_prompt", v => _.isUndefined(v) || _.isString(v))
        .validate("body.size", v => _.isUndefined(v) || _.isString(v))
        .validate("body.response_format", v => _.isUndefined(v) || _.isString(v))
        .validate("headers.authorization", _.isString);

      const generationRequest = toImageEditGenerationRequest({
        body: request.body,
        files: request.files || {},
      });

      return createImageGenerationResponse(
        generationRequest,
        chooseToken(request.headers.authorization)
      );
    },
  },
};
