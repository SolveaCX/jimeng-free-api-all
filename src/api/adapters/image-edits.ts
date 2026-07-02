import _ from "lodash";

import EX from "@/api/consts/exceptions.ts";
import { DEFAULT_MODEL } from "@/api/controllers/images.ts";
import APIException from "@/lib/exceptions/APIException.ts";

const SUPPORTED_RATIOS = [
  "21:9",
  "16:9",
  "3:2",
  "4:3",
  "1:1",
  "3:4",
  "2:3",
  "9:16",
];

export interface ImageEditAdapterInput {
  body: Record<string, any>;
  files: Record<string, any>;
}

export interface ImageEditGenerationRequest {
  model: string;
  prompt: string;
  negativePrompt?: string;
  ratio?: string;
  resolution?: string;
  responseFormat: string;
  sampleStrength?: number;
  filePath: string;
}

function firstValue(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function uploadedFilePath(file: any): string | undefined {
  const value = firstValue(file);
  if (!value) return undefined;
  if (_.isString(value)) return value;
  return value.filepath || value.path;
}

function firstUploadedImagePath(files: Record<string, any>) {
  const direct = uploadedFilePath(files?.image);
  if (direct) return direct;

  const fallbackKey = Object.keys(files || {})[0];
  if (!fallbackKey) return undefined;
  return uploadedFilePath(files[fallbackKey]);
}

function isLikelyBareBase64(value: string) {
  return /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function normalizeImageInput(body: Record<string, any>, files: Record<string, any>) {
  const filePath = firstUploadedImagePath(files);
  if (filePath) return filePath;

  const image = firstValue(body.image);
  if (!image) {
    throw new APIException(
      EX.API_REQUEST_PARAMS_INVALID,
      "image is required for /v1/images/edits"
    );
  }

  if (!_.isString(image)) {
    const path = uploadedFilePath(image);
    if (path) return path;
    throw new APIException(EX.API_REQUEST_PARAMS_INVALID, "image must be a file path, URL, or base64 string");
  }

  const trimmed = image.trim();
  if (!trimmed) {
    throw new APIException(EX.API_REQUEST_PARAMS_INVALID, "image is required for /v1/images/edits");
  }

  if (/^data:/i.test(trimmed)) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[A-Za-z]:[\\/]/.test(trimmed) || /^[\\/]/.test(trimmed)) return trimmed;
  if (isLikelyBareBase64(trimmed)) return `data:image/png;base64,${trimmed}`;

  return trimmed;
}

function parseNumber(value: any): number | undefined {
  if (_.isUndefined(value) || value === "") return undefined;
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) {
    throw new APIException(EX.API_REQUEST_PARAMS_INVALID, "sample_strength must be a finite number");
  }
  return numberValue;
}

function closestRatio(width: number, height: number) {
  const target = width / height;
  return SUPPORTED_RATIOS.reduce((best, ratio) => {
    const [w, h] = ratio.split(":").map(Number);
    const [bestW, bestH] = best.split(":").map(Number);
    const bestDelta = Math.abs(Math.log(target / (bestW / bestH)));
    const delta = Math.abs(Math.log(target / (w / h)));
    return delta < bestDelta ? ratio : best;
  }, "1:1");
}

function sizeToGenerationOptions(size?: string) {
  if (!size || size === "auto") return {};

  const match = size.match(/^(\d+)x(\d+)$/);
  if (!match) {
    throw new APIException(EX.API_REQUEST_PARAMS_INVALID, "size must be auto or WIDTHxHEIGHT");
  }

  const width = Number(match[1]);
  const height = Number(match[2]);
  const largestSide = Math.max(width, height);
  const resolution = largestSide <= 1664 ? "1k" : largestSide <= 2560 ? "2k" : "4k";

  return {
    ratio: closestRatio(width, height),
    resolution,
  };
}

function rejectUnsupportedOptions(body: Record<string, any>, files: Record<string, any>) {
  if (!_.isUndefined(body.mask) || !_.isUndefined(files?.mask)) {
    throw new APIException(
      EX.API_REQUEST_PARAMS_INVALID,
      "mask is not supported by Jimeng blend edits"
    );
  }

  if (!_.isUndefined(body.n) && Number(body.n) !== 1) {
    throw new APIException(EX.API_REQUEST_PARAMS_INVALID, "n greater than 1 is not supported");
  }
}

export function toImageEditGenerationRequest({
  body,
  files,
}: ImageEditAdapterInput): ImageEditGenerationRequest {
  rejectUnsupportedOptions(body, files);
  const sizeOptions = sizeToGenerationOptions(body.size);

  return {
    model: body.model || DEFAULT_MODEL,
    prompt: body.prompt,
    negativePrompt: body.negative_prompt,
    ratio: sizeOptions.ratio,
    resolution: sizeOptions.resolution,
    responseFormat: body.response_format || "url",
    sampleStrength: parseNumber(body.sample_strength),
    filePath: normalizeImageInput(body, files),
  };
}
