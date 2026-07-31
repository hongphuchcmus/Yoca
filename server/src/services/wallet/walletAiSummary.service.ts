import { z } from "zod";
import { GoogleGenAI } from "@google/genai";

import { WalletBehaviorProfileSchema } from "../../modules/wallet-analysis/schemas/walletBehaviorProfile.schema.js";
import type { EvidenceBundle, WalletBehaviorProfile } from "../../modules/wallet-analysis/types/walletBehaviorProfile.js";
import {
    WALLET_AUDIT_MODEL,
} from "@sv/config/constants.js";
import env from "@sv/util/load-env.js";
import { trackGemini } from "@sv/services/tracking/gemini-metrics.js";

export type WalletAiEvidenceHighlight = {
    evidenceId: string;
    title: string;
    description: string;
    value?: number | string | null;
    threshold?: number | string | null;
    severity?: "LOW" | "MEDIUM" | "HIGH" | null;
    relatedSignatures?: string[];
    relatedTokenMints?: string[];
};

export type WalletAISummary = {
    shortSummary: string;
    walletPersona: string;
    riskSummary: string;
    pnlSummary: string;
    behaviorInsights: Array<{
        title: string;
        explanation: string;
        evidenceIds: string[];
    }>;
    suspiciousFindings: Array<{
        title: string;
        explanation: string;
        severity: "LOW" | "MEDIUM" | "HIGH";
        evidenceIds: string[];
        relatedSignatures: string[];
    }>;
    evidenceHighlights: Array<{
        evidenceId: string;
        title: string;
        description: string;
        value?: number | string | null;
        threshold?: number | string | null;
        severity?: "LOW" | "MEDIUM" | "HIGH" | null;
        relatedSignatures?: string[];
        relatedTokenMints?: string[];
    }>;
    cautionNotes: string[];
    confidenceNote: string;
};

export type WalletAIInput = {
    profile: WalletBehaviorProfile;
    evidenceHighlights: WalletAiEvidenceHighlight[];
};

export type WalletAiGeminiClientLike = {
    models: {
        generateContent: (input: {
            model: string;
            contents: string;
            config?: {
                systemInstruction?: string;
                temperature?: number;
                responseMimeType?: string;
            };
        }) => Promise<{
            text?: string | null;
            usageMetadata?: {
                promptTokenCount?: number;
                candidatesTokenCount?: number;
                cachedContentTokenCount?: number;
                thoughtsTokenCount?: number;
                totalTokenCount?: number;
            };
        }>;
    };
};

const severityRank: Record<NonNullable<WalletAiEvidenceHighlight["severity"]>, number> = {
    HIGH: 3,
    MEDIUM: 2,
    LOW: 1,
};

const walletAiEvidenceHighlightSchema: z.ZodType<WalletAiEvidenceHighlight> = z
    .object({
        evidenceId: z.string().trim().min(1),
        title: z.string().trim().min(1),
        description: z.string().trim().min(1),
        value: z.union([z.number(), z.string()]).nullable().optional(),
        threshold: z.union([z.number(), z.string()]).nullable().optional(),
        severity: z.enum(["LOW", "MEDIUM", "HIGH"]).nullable().optional(),
        relatedSignatures: z.array(z.string().trim().min(1)).optional(),
        relatedTokenMints: z.array(z.string().trim().min(1)).optional(),
    })
    .strict();

export const walletAiInputSchema: z.ZodType<WalletAIInput> = z
    .object({
        profile: WalletBehaviorProfileSchema,
        evidenceHighlights: z.array(walletAiEvidenceHighlightSchema).max(8),
    })
    .strict();

export const WalletAIInputSchema = walletAiInputSchema;

export const walletAiSummarySchema: z.ZodType<WalletAISummary> = z
    .object({
        shortSummary: z.string().trim().min(1),
        walletPersona: z.string().trim().min(1),
        riskSummary: z.string().trim().min(1),
        pnlSummary: z.string().trim().min(1),
        behaviorInsights: z
            .array(
                z.object({
                    title: z.string().trim().min(1),
                    explanation: z.string().trim().min(1),
                    evidenceIds: z.array(z.string().trim().min(1)),
                }).strict(),
            )
            .max(5),
        suspiciousFindings: z
            .array(
                z.object({
                    title: z.string().trim().min(1),
                    explanation: z.string().trim().min(1),
                    severity: z.enum(["LOW", "MEDIUM", "HIGH"]),
                    evidenceIds: z.array(z.string().trim().min(1)),
                    relatedSignatures: z.array(z.string().trim().min(1)),
                }).strict(),
            )
            .max(5),
        evidenceHighlights: z.array(walletAiEvidenceHighlightSchema).max(8),
        cautionNotes: z.array(z.string().trim().min(1)),
        confidenceNote: z.string().trim().min(1),
    })
    .strict();

export const WalletAISummarySchema = walletAiSummarySchema;

function uniqueStrings(values: string[]): string[] {
    return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function evidenceSeverityWeight(severity: WalletAiEvidenceHighlight["severity"]): number {
    if (severity == null) {
        return 0;
    }

    return severityRank[severity];
}

function compareEvidenceHighlights(left: WalletAiEvidenceHighlight, right: WalletAiEvidenceHighlight): number {
    const severityDelta = evidenceSeverityWeight(right.severity) - evidenceSeverityWeight(left.severity);
    if (severityDelta !== 0) {
        return severityDelta;
    }

    const leftHasSignatures = (left.relatedSignatures?.length ?? 0) > 0 ? 1 : 0;
    const rightHasSignatures = (right.relatedSignatures?.length ?? 0) > 0 ? 1 : 0;
    if (leftHasSignatures !== rightHasSignatures) {
        return rightHasSignatures - leftHasSignatures;
    }

    const leftSignatureCount = left.relatedSignatures?.length ?? 0;
    const rightSignatureCount = right.relatedSignatures?.length ?? 0;
    if (leftSignatureCount !== rightSignatureCount) {
        return rightSignatureCount - leftSignatureCount;
    }

    return left.evidenceId.localeCompare(right.evidenceId);
}

function normalizeEvidenceHighlights(evidenceHighlights: EvidenceBundle[]): WalletAiEvidenceHighlight[] {
    const mapped = evidenceHighlights.map((bundle) => ({
        evidenceId: bundle.id,
        title: bundle.title,
        description: bundle.description,
        value: bundle.value ?? null,
        threshold: bundle.threshold ?? null,
        severity: bundle.severity ?? null,
        relatedSignatures: bundle.relatedSignatures != null ? uniqueStrings(bundle.relatedSignatures).slice(0, 5) : undefined,
        relatedTokenMints: bundle.relatedTokenMints != null ? uniqueStrings(bundle.relatedTokenMints).slice(0, 8) : undefined,
    }));

    return mapped.sort(compareEvidenceHighlights).slice(0, 8);
}

function mapEvidenceById(evidenceHighlights: WalletAiEvidenceHighlight[]): Map<string, WalletAiEvidenceHighlight> {
    return new Map(evidenceHighlights.map((highlight) => [highlight.evidenceId, highlight]));
}

function formatRiskSummary(profile: WalletBehaviorProfile): string {
    return `Risk score ${profile.risk.riskScore}/100 (${profile.risk.riskLevel}); trust score ${profile.risk.trustScore}/100.`;
}

function formatPnlSummary(profile: WalletBehaviorProfile): string {
    if (profile.pnl.realizedPnlUsd == null) {
        return `Realized PnL was not calculable from the analyzed swap window.`;
    }

    return `Realized PnL is ${profile.pnl.realizedPnlUsd.toFixed(2)} USD across ${profile.pnl.closedPositionCount} closed positions.`;
}

function buildBehaviorInsights(input: WalletAIInput): WalletAISummary["behaviorInsights"] {
    return input.evidenceHighlights.slice(0, 5).map((highlight) => ({
        title: highlight.title,
        explanation: highlight.description,
        evidenceIds: [highlight.evidenceId],
    }));
}

function buildSuspiciousFindings(input: WalletAIInput): WalletAISummary["suspiciousFindings"] {
    const evidenceById = mapEvidenceById(input.evidenceHighlights);
    const findings: WalletAISummary["suspiciousFindings"] = [];

    for (const factor of [...input.profile.risk.riskFactors].sort((left, right) => right.scoreImpact - left.scoreImpact)) {
        const matchingEvidenceHighlights = uniqueStrings(factor.evidenceIds)
            .map((evidenceId) => evidenceById.get(evidenceId))
            .filter((highlight): highlight is WalletAiEvidenceHighlight => highlight != null);

        if (matchingEvidenceHighlights.length === 0) {
            continue;
        }

        const evidenceIds = uniqueStrings(matchingEvidenceHighlights.map((highlight) => highlight.evidenceId));
        const relatedSignatures = uniqueStrings(
            matchingEvidenceHighlights.flatMap((highlight) => highlight.relatedSignatures ?? []),
        ).slice(0, 5);

        findings.push({
            title: factor.code.replaceAll("_", " "),
            explanation: `${factor.description} Evidence IDs: ${evidenceIds.join(", ")}.`,
            severity: factor.severity,
            evidenceIds,
            relatedSignatures,
        });

        if (findings.length >= 5) {
            break;
        }
    }

    return findings;
}

function buildCautionNotes(profile: WalletBehaviorProfile): string[] {
    const notes = uniqueStrings([
        ...profile.dataQuality.warnings,
        profile.dataQuality.completenessScore < 70 ? "Interpret the summary cautiously because data completeness is below 70%." : "",
        "Risk score reflects observed behavior in the analyzed transaction window. It is not a legal, financial, or fraud verdict.",
        ...profile.aiContext.doNotInferBeyond,
    ]);

    return notes;
}

function buildConfidenceNote(profile: WalletBehaviorProfile, evidenceHighlights: WalletAiEvidenceHighlight[]): string {
    const signatureCount = evidenceHighlights.filter((highlight) => (highlight.relatedSignatures?.length ?? 0) > 0).length;
    const completeness = Math.round(profile.dataQuality.completenessScore);

    return `Confidence is based on ${evidenceHighlights.length} evidence items, ${signatureCount} of which include representative transaction signatures, with data completeness at ${completeness}%.`;
}

export function buildWalletAiInput(profile: WalletBehaviorProfile): WalletAIInput {
    const evidenceHighlights = normalizeEvidenceHighlights(profile.evidence);

    return walletAiInputSchema.parse({
        profile,
        evidenceHighlights,
    });
}

export function buildWalletAiSummaryFallback(profile: WalletBehaviorProfile): WalletAISummary {
    const input = buildWalletAiInput(profile);

    const behaviorInsights = buildBehaviorInsights(input);
    const suspiciousFindings = buildSuspiciousFindings(input);

    const summary: WalletAISummary = {
        shortSummary: `${profile.wallet.address} is classified as ${profile.persona.primaryPersona} with ${profile.risk.riskLevel} risk in the analyzed window.`,
        walletPersona: profile.persona.primaryPersona,
        riskSummary: formatRiskSummary(profile),
        pnlSummary: formatPnlSummary(profile),
        behaviorInsights,
        suspiciousFindings,
        evidenceHighlights: input.evidenceHighlights,
        cautionNotes: buildCautionNotes(profile),
        confidenceNote: buildConfidenceNote(profile, input.evidenceHighlights),
    };

    return walletAiSummarySchema.parse(summary);
}

export function buildWalletAnalystPrompt(input: WalletAIInput): string {
    const promptPayload = {
        wallet: {
            address: input.profile.wallet.address,
            persona: input.profile.persona.primaryPersona,
            riskLevel: input.profile.risk.riskLevel,
            riskScore: input.profile.risk.riskScore,
            trustScore: input.profile.risk.trustScore,
            pnlStatus: input.profile.pnl.pnlStatus,
            realizedPnlUsd: input.profile.pnl.realizedPnlUsd,
            dataQualityScore: input.profile.dataQuality.completenessScore,
            analysisWindow: input.profile.analysisWindow,
        },
        evidenceHighlights: input.evidenceHighlights,
    };

    return [
        "Role: On-chain Solana wallet analyst.",
        "Use only the supplied WalletBehaviorProfile data and evidenceHighlights.",
        "Do not inspect raw transactions.",
        "Do not create new evidence IDs.",
        "Do not invent transaction signatures.",
        "suspiciousFindings.relatedSignatures must be copied only from the provided evidenceHighlights.relatedSignatures.",
        "Do not claim fraud, scam, or confirmed wash trading.",
        "Explain and organize the evidence only.",
        "Return valid JSON only and follow the WalletAISummary structure exactly.",
        "",
        "Input JSON:",
        JSON.stringify(promptPayload, null, 2),
    ].join("\n");
}

function isSubset(values: string[], allowedValues: Set<string>): boolean {
    return values.every((value) => allowedValues.has(value));
}

function cleanInsights(
    insights: WalletAISummary["behaviorInsights"],
    allowedEvidenceIds: Set<string>,
): WalletAISummary["behaviorInsights"] {
    return insights
        .map((insight) => ({
            ...insight,
            evidenceIds: uniqueStrings(insight.evidenceIds).filter((evidenceId) => allowedEvidenceIds.has(evidenceId)),
        }))
        .filter((insight) => insight.evidenceIds.length > 0)
        .slice(0, 5);
}

function cleanSuspiciousFindings(
    findings: WalletAISummary["suspiciousFindings"],
    allowedEvidenceIds: Set<string>,
    allowedSignatures: Set<string>,
): WalletAISummary["suspiciousFindings"] {
    return findings
        .map((finding) => ({
            ...finding,
            evidenceIds: uniqueStrings(finding.evidenceIds).filter((evidenceId) => allowedEvidenceIds.has(evidenceId)),
            relatedSignatures: uniqueStrings(finding.relatedSignatures).filter((signature) => allowedSignatures.has(signature)),
        }))
        .filter((finding) => finding.evidenceIds.length > 0)
        .slice(0, 5);
}

export function sanitizeWalletAiSummaryResponse(
    response: unknown,
    input: WalletAIInput,
): WalletAISummary {
    const parsed = walletAiSummarySchema.safeParse(response);
    if (!parsed.success) {
        return buildWalletAiSummaryFallback(input.profile);
    }

    const allowedEvidenceIds = new Set(input.evidenceHighlights.map((highlight) => highlight.evidenceId));
    const allowedSignatures = new Set(
        input.evidenceHighlights.flatMap((highlight) => highlight.relatedSignatures ?? []),
    );

    const cleanedBehaviorInsights = cleanInsights(parsed.data.behaviorInsights, allowedEvidenceIds);
    const cleanedSuspiciousFindings = cleanSuspiciousFindings(parsed.data.suspiciousFindings, allowedEvidenceIds, allowedSignatures);

    if (cleanedBehaviorInsights.length === 0 && cleanedSuspiciousFindings.length === 0) {
        return buildWalletAiSummaryFallback(input.profile);
    }

    const cleanedSummary: WalletAISummary = {
        ...parsed.data,
        behaviorInsights: cleanedBehaviorInsights,
        suspiciousFindings: cleanedSuspiciousFindings,
        evidenceHighlights: input.evidenceHighlights,
        cautionNotes: uniqueStrings([...parsed.data.cautionNotes, ...buildCautionNotes(input.profile)]),
        confidenceNote: parsed.data.confidenceNote.trim(),
    };

    return walletAiSummarySchema.parse(cleanedSummary);
}

export function isEvidenceSubset(
    selectedEvidenceIds: string[],
    allowedEvidenceIds: string[],
): boolean {
    return isSubset(uniqueStrings(selectedEvidenceIds), new Set(uniqueStrings(allowedEvidenceIds)));
}

function createDefaultGeminiClient(): WalletAiGeminiClientLike | null {
    const apiKey = env.GOOGLE_AI_KEY;
    if (!apiKey) {
        return null;
    }

    return new GoogleGenAI({ apiKey }) as WalletAiGeminiClientLike;
}

function extractJsonObject(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed) {
        return null;
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) {
        return null;
    }

    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
        return JSON.parse(candidate);
    } catch {
        return null;
    }
}

export async function summarizeWalletWithGemini(params: {
    profile: WalletBehaviorProfile;
    geminiClient?: WalletAiGeminiClientLike | null;
}): Promise<WalletAISummary> {
    const input = buildWalletAiInput(params.profile);
    const prompt = buildWalletAnalystPrompt(input);
    const geminiClient = params.geminiClient ?? createDefaultGeminiClient();

    if (geminiClient == null) {
        return buildWalletAiSummaryFallback(params.profile);
    }

    try {
        const response = await trackGemini(
            "gemini.svc.wallet_ai_summary",
            WALLET_AUDIT_MODEL,
            () => geminiClient.models.generateContent({
                model: WALLET_AUDIT_MODEL,
                contents: prompt,
                config: {
                    temperature: 0.2,
                    responseMimeType: "application/json",
                    systemInstruction: [
                        "You are an on-chain Solana wallet analyst.",
                        "You must only explain the supplied evidence and never invent evidence IDs or signatures.",
                        "Return valid JSON only.",
                    ].join(" "),
                },
            }),
        );

        const parsed = extractJsonObject(response.text ?? "");
        return sanitizeWalletAiSummaryResponse(parsed, input);
    } catch {
        return buildWalletAiSummaryFallback(params.profile);
    }
}
