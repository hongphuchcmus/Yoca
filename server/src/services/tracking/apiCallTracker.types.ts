export type TrackedProvider = "birdeye" | "helius" | "moralis" | "unknown";

export interface ApiKeyMetadata {
    source: string;
    masked: string;
    fingerprint: string;
}

export interface ApiCallOrigin {
    route: string;
    serviceFile: string;
    functionName: string;
    firstCaller: string;
    requestId: string;
}

export interface ApiCallRecord {
    id: string;
    timestampStartMs: number;
    timestampEndMs: number;
    durationMs: number;
    provider: TrackedProvider;
    request: {
        url: string;
        method: string;
        headers: Record<string, string>;
        bodyPreview: unknown;
    };
    apiKey: ApiKeyMetadata | null;
    origin: ApiCallOrigin;
    response: {
        status: number;
        ok: boolean;
        headers: Record<string, string>;
        data: unknown;
        truncated: boolean;
    };
    error?: {
        message: string;
        name: string;
        stackPreview?: string;
    };
}

export interface TrackApiCallInput {
    provider?: TrackedProvider;
    url: string;
    method: string;
    requestHeaders?: RequestInit["headers"];
    requestBody?: unknown;
    apiKey?: ApiKeyMetadata | null;
    serviceFile: string;
    functionName: string;
    routeHint?: string;
}
