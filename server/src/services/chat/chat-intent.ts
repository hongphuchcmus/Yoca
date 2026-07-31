import type { WalletChatEvidence } from "./chat.types.js";

export type WalletChatIntent =
  | "overview"
  | "pnl"
  | "trades"
  | "risk_analysis"
  | "portfolio"
  | "balance_trend"
  | "volume_trend"
  | "audit"
  | "comparison"
  | "custom";

export function classifyWalletChatIntent(question: string): WalletChatIntent {
  const q = question.toLowerCase();

  if (/\b(t?ng quan|t?ng|k?t qu?|portfolio)\b/.test(q)) return "overview";
  if (/\b(l?i nhu?n|l?i l?|pnl|win rate|th?ng.*thua)\b/.test(q)) return "pnl";
  if (/\b(giao d?ch|l?nh|swap|mua|bán|trade)\b/.test(q)) return "trades";
  if (/\b(r?i ro|ki?m toán|audit|hành vi|persona|d? tin c?y)\b/.test(q)) return "risk_analysis";
  if (/\b(n?m gi?|hold|token|tài s?n|danh m?c)\b/.test(q)) return "portfolio";
  if (/\b(s? d?|balance|bi?n ??ng.*s? d?)\b/.test(q)) return "balance_trend";
  if (/\b(kh?i lư?ng|volume|kh?p l?nh)\b/.test(q)) return "volume_trend";
  if (/\b(forensic|ki?m.*toán|ánh.*giá|phân.*tích)\b/.test(q)) return "audit";

  if (/\b(overview|summary|portfolio)\b/.test(q)) return "overview";
  if (/\b(pnl|profit|loss|win rate|winning)\b/.test(q)) return "pnl";
  if (/\b(trade|swap|buy|sell|transaction)\b/.test(q)) return "trades";
  if (/\b(risk|audit|scam|safe|trust|persona|behavior|forensic)\b/.test(q)) return "risk_analysis";
  if (/\b(holdings?|token|asset|position)\b/.test(q)) return "portfolio";
  if (/\b(balance|trend|history.*balance)\b/.test(q)) return "balance_trend";
  if (/\b(volume|trading.*volume)\b/.test(q)) return "volume_trend";

  if (/compare|vs\b|versus|difference|which (is|has|performed)|so sánh|khác nhau|hơn/i.test(q)) return "comparison";

  return "custom";
}

export function inferWalletChatLanguage(
  question: string,
  language?: string,
): "en" | "vi" {
  if (language === "vi" || language === "en") return language;
  const q = question.toLowerCase();
  if (
    /[ăđêôơưáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i.test(q) ||
    /\b(token này|r?i ro|không|tin t?c|gi?i thích|nên mua|bán|gi?|t?ng quan|l?i nhu?n|giao d?ch|s? dư|kh?i lư?ng)\b/.test(q)
  ) return "vi";
  return "en";
}

export function toolNameToEvidenceType(name: string): WalletChatEvidence["type"] {
  const map: Record<string, WalletChatEvidence["type"]> = {
    get_wallet_overview: "overview",
    get_wallet_swaps: "swap",
    get_wallet_transfers: "transfer",
    get_wallet_realized_pnl_desc_breakdown: "pnl",
    get_wallet_pnl_history: "pnl",
    get_balance_history: "balance",
    get_trading_volume: "volume",
    get_wallet_portfolio: "portfolio",
    get_token_price: "market",
  };
  return map[name] ?? "overview";
}
