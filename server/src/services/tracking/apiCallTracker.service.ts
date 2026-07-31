import {
    API_CALL_TRACKER_ENABLED,
    API_CALL_TRACKER_PROVIDER_ALLOWLIST,
} from "@sv/config/constants.js";
import { mergeOutboundFetchTimeout } from "@sv/util/outbound-fetch.js";
import {
    getRequestContext,
    setFirstCallerIfUnset,
} from "@sv/middlewares/request-context.js";
import { queueApiTrackerRecord } from "@sv/services/tracking/apiCallTracker.exporter.js";
import {
    parseAndCapResponseData,
    sanitizeHeaders,
    toBodyPreview,
} from "@sv/services/tracking/apiCallTracker.redaction.js";
import type {
    ApiCallRecord,
    ApiKeyMetadata,
    TrackApiCallInput,
    TrackedProvider,
} from "@sv/services/tracking/apiCallTracker.types.js";
import { randomUUID } from "node:crypto";

function detectProvider(url: string): TrackedProvider {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("birdeye")) {
        return "birdeye";
    }
    if (host.includes("helius")) {
        return "helius";
    }
    if (host.includes("moralis")) {
        return "moralis";
    }
    return "unknown";
}

function isProviderAllowed(provider: TrackedProvider): boolean {
    if (API_CALL_TRACKER_PROVIDER_ALLOWLIST.length === 0) {
        return true;
    }

    return API_CALL_TRACKER_PROVIDER_ALLOWLIST.includes(provider);
}

function getOrigin(input: TrackApiCallInput): ApiCallRecord["origin"] {
    const context = getRequestContext();
    const firstCaller = setFirstCallerIfUnset(input.serviceFile, input.functionName);

    return {
        route: context?.route ?? input.routeHint ?? "system/background",
        serviceFile: input.serviceFile,
        functionName: input.functionName,
        firstCaller,
        requestId: context?.requestId ?? "system",
    };
}

function baseRecord(input: TrackApiCallInput, provider: TrackedProvider, startMs: number): Omit<ApiCallRecord, "response"> {
    return {
        id: randomUUID(),
        timestampStartMs: startMs,
        timestampEndMs: startMs,
        durationMs: 0,
        provider,
        request: {
            url: input.url,
            method: input.method,
            headers: sanitizeHeaders(input.requestHeaders),
            bodyPreview: toBodyPreview(input.requestBody),
        },
        apiKey: input.apiKey ?? null,
        origin: getOrigin(input),
    };
}

export async function trackApiCallResponse(
    input: TrackApiCallInput,
    execute: () => Promise<Response>,
): Promise<Response> {
    if (!API_CALL_TRACKER_ENABLED) {
        return execute();
    }

    const provider = input.provider ?? detectProvider(input.url);
    if (!isProviderAllowed(provider)) {
        return execute();
    }

    const startMs = Date.now();
    const base = baseRecord(input, provider, startMs);

    try {
        const response = await execute();
        const cloned = response.clone();
        const responseData = await parseAndCapResponseData(cloned);
        const endMs = Date.now();

        queueApiTrackerRecord({
            ...base,
            timestampEndMs: endMs,
            durationMs: endMs - startMs,
            response: {
                status: response.status,
                ok: response.ok,
                headers: sanitizeHeaders(response.headers),
                data: responseData.data,
                truncated: responseData.truncated,
            },
        });

        return response;
    } catch (error) {
        const endMs = Date.now();
        const err = error instanceof Error ? error : new Error(String(error));

        queueApiTrackerRecord({
            ...base,
            timestampEndMs: endMs,
            durationMs: endMs - startMs,
            response: {
                status: 0,
                ok: false,
                headers: {},
                data: null,
                truncated: false,
            },
            error: {
                message: err.message,
                name: err.name,
                stackPreview: err.stack?.slice(0, 1200),
            },
        });

        throw error;
    }
}

export interface TrackedFetchInput {
    provider?: TrackedProvider;
    url: string | URL;
    init?: RequestInit;
    apiKey?: ApiKeyMetadata | null;
    serviceFile: string;
    functionName: string;
    routeHint?: string;
}

export async function trackedFetch(input: TrackedFetchInput): Promise<Response> {
    const urlString = input.url instanceof URL ? input.url.toString() : input.url;
    const method = input.init?.method ?? "GET";
    const init = mergeOutboundFetchTimeout(input.init);

    return trackApiCallResponse(
        {
            provider: input.provider,
            url: urlString,
            method,
            requestHeaders: init.headers,
            requestBody: init.body,
            apiKey: input.apiKey,
            serviceFile: input.serviceFile,
            functionName: input.functionName,
            routeHint: input.routeHint,
        },
        () => fetch(urlString, init),
    );
}
