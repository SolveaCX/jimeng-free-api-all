import _ from 'lodash';

import Request from '@/lib/request/Request.ts';
import Response from '@/lib/response/Response.ts';
import { tokenSplit } from '@/api/controllers/core.ts';
import { generateVideoWithRetry, submitVideoGeneration, DEFAULT_MODEL } from '@/api/controllers/videos.ts';
import { toVideoTaskResponse } from '@/api/controllers/video-tasks.ts';
import util from '@/lib/util.ts';
import db, { createVideoTask, getVideoTask } from '@/lib/database.ts';
import APIException from '@/lib/exceptions/APIException.ts';
import EX from '@/api/consts/exceptions.ts';

function validateVideoRequest(request: Request) {
    request
        .validate('body.model', v => _.isUndefined(v) || _.isString(v))
        .validate('body.prompt', _.isString)
        .validate('body.ratio', v => _.isUndefined(v) || _.isString(v))
        .validate('body.resolution', v => _.isUndefined(v) || _.isString(v))
        .validate('body.duration', v => _.isUndefined(v) || _.isFinite(v))
        .validate('body.file_paths', v => _.isUndefined(v) || _.isArray(v))
        .validate('headers.authorization', _.isString);
}

function getToken(request: Request) {
    const tokens = tokenSplit(request.headers.authorization);
    if (tokens.length === 0) {
        throw new APIException(EX.API_REQUEST_PARAMS_INVALID, "Authorization token is empty");
    }
    return _.sample(tokens);
}

function getVideoPayload(request: Request) {
    const {
        model = DEFAULT_MODEL,
        prompt,
        ratio,
        resolution,
        duration = 10,
        file_paths = [],
        response_format = "url"
    } = request.body;

    let filePaths = [...file_paths];
    // @ts-ignore
    const files = request.files || {};
    if (!_.isEmpty(files)) {
        _.forEach(files, (file) => {
            if (file) {
                const path = file.filepath || file.path;
                if (path) filePaths.push(path);
            }
        });
    }

    return { model, prompt, ratio, resolution, duration, filePaths, response_format };
}

function notFoundResponse() {
    return new Response({
        error: {
            message: "video task not found",
            code: "task_not_found"
        }
    }, { statusCode: 404 });
}

export default {

    prefix: '/v1/videos',

    get: {

        '/:task_id': async (request: Request) => {
            const task = getVideoTask(request.params.task_id);
            if (!task) return notFoundResponse();
            return toVideoTaskResponse(task);
        },

        '/:task_id/content': async (request: Request) => {
            const task = getVideoTask(request.params.task_id);
            if (!task) return notFoundResponse();
            if (task.status !== 'SUCCESS' || !task.result_url) {
                return new Response(toVideoTaskResponse(task), { statusCode: 409 });
            }
            return new Response(null, { redirect: task.result_url });
        }

    },

    post: {

        '': async (request: Request) => {
            validateVideoRequest(request);
            const token = getToken(request);
            const { model, prompt, ratio, resolution, duration, filePaths } = getVideoPayload(request);

            const submitted = await submitVideoGeneration(
                model,
                prompt,
                {
                    ratio,
                    resolution,
                    duration,
                    filePaths
                },
                token
            );

            const task = createVideoTask({
                taskId: `task_${util.uuid(false)}`,
                historyId: submitted.historyId,
                status: 'QUEUED',
                model,
                prompt,
                token,
                request: submitted.request
            });

            try {
                db.recordCall(token, model, 0);
            } catch (e) {
                // Ignore dashboard/stat persistence failures.
            }

            return new Response(toVideoTaskResponse(task), { statusCode: 202 });
        },

        '/generations': async (request: Request) => {
            validateVideoRequest(request);
            request.validate('body.response_format', v => _.isUndefined(v) || _.isString(v));
            const token = getToken(request);
            const { model, prompt, ratio, resolution, duration, filePaths, response_format } = getVideoPayload(request);

            const videoUrl = await generateVideoWithRetry(
                model,
                prompt,
                {
                    ratio,
                    resolution,
                    duration,
                    filePaths
                },
                token
            );

            try {
                db.recordCall(token, model, 0);
                if (videoUrl) db.saveMedia('video', videoUrl, model, prompt, token);
            } catch (e) {
                // Ignore dashboard/stat persistence failures.
            }

            if (response_format === "b64_json") {
                const videoBase64 = await util.fetchFileBASE64(videoUrl);
                return {
                    created: util.unixTimestamp(),
                    data: [{
                        b64_json: videoBase64,
                        revised_prompt: prompt
                    }]
                };
            }

            return {
                created: util.unixTimestamp(),
                data: [{
                    url: videoUrl,
                    revised_prompt: prompt
                }]
            };
        }

    }

}
