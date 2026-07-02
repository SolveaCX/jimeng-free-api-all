import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jimeng-image-edits-"));
process.env.DB_PATH = path.join(tempDir, "images.db");
process.env.VERCEL = "1";

test("image edits adapter maps OpenAI size to Jimeng ratio and resolution", async () => {
  const { toImageEditGenerationRequest } = await import("../api/adapters/image-edits.ts");

  assert.deepEqual(
    toImageEditGenerationRequest({
      body: {
        prompt: "make it cinematic",
        image: "data:image/png;base64,AAAA",
        size: "1536x1024",
      },
      files: {},
    }),
    {
      model: "jimeng-image-5.0-lite",
      prompt: "make it cinematic",
      negativePrompt: undefined,
      ratio: "3:2",
      resolution: "1k",
      responseFormat: "url",
      sampleStrength: undefined,
      filePath: "data:image/png;base64,AAAA",
    }
  );
});

test("image edits adapter reads multipart image file from the image field", async () => {
  const { toImageEditGenerationRequest } = await import("../api/adapters/image-edits.ts");

  const request = toImageEditGenerationRequest({
    body: {
      prompt: "change the background",
      model: "jimeng-image-4.1",
      response_format: "b64_json",
    },
    files: {
      image: {
        filepath: "C:\\tmp\\source.png",
      },
    },
  });

  assert.equal(request.model, "jimeng-image-4.1");
  assert.equal(request.filePath, "C:\\tmp\\source.png");
  assert.equal(request.responseFormat, "b64_json");
});

test("image edits adapter accepts bare base64 image strings", async () => {
  const { toImageEditGenerationRequest } = await import("../api/adapters/image-edits.ts");

  const request = toImageEditGenerationRequest({
    body: {
      prompt: "turn it into a product shot",
      image: "QUJDRA==",
      sample_strength: 0.35,
    },
    files: {},
  });

  assert.equal(request.filePath, "data:image/png;base64,QUJDRA==");
  assert.equal(request.sampleStrength, 0.35);
});

test("image edits adapter rejects mask because Jimeng blend does not support inpainting masks", async () => {
  const { toImageEditGenerationRequest } = await import("../api/adapters/image-edits.ts");

  assert.throws(
    () =>
      toImageEditGenerationRequest({
        body: {
          prompt: "replace masked area",
          image: "data:image/png;base64,AAAA",
          mask: "data:image/png;base64,BBBB",
        },
        files: {},
      }),
    /mask is not supported/
  );
});

test("image edits route is added without removing image generations route", async () => {
  const route = (await import("../api/routes/images.ts")).default;

  assert.equal(typeof route.post["/generations"], "function");
  assert.equal(typeof route.post["/edits"], "function");
});
