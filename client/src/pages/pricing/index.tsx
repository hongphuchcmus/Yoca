import "@/styles/landing-tailwind.css";
import { useState, useEffect } from "react";
import { Check, Zap } from "lucide-react";
import { LandingFooter, LandingNavbar } from "@/components/landing";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useUserTheme } from "@/contexts/ThemeContext";
import { createLandingThemeStyles } from "@/components/landing/tokens";
import { AuthReminderModal, PaymentModalWrapper, PaymentSuccessModal } from "@/components/payment";

// ─── Data ─────────────────────────────────────────────────────────────────────

const LITE_DATA = {
  name: "Lite",
  monthlyPrice: 39,
};

const STANDARD_DATA = {
  name: "Standard",
};

const PLUS_TIER = {
  name: "Plus",
  monthlyPrice: 79,
  isMostPopular: true,
  accentColor: "#7C3AED" as const,
};

const PRO_TIER = {
  name: "Pro",
  monthlyPrice: 149,
  isMostPopular: false,
  accentColor: "#7C3AED" as const,
};

type FeatureEntry = { text: string };

// ─── Main Component ────────────────────────────────────────────────────────────

const pricingCardClass =
  "flex h-full flex-col !p-9 lg:!p-10 !rounded-3xl border border-[var(--landing-card-border)] bg-[var(--landing-card-bg)] backdrop-blur-xl shadow-[var(--landing-card-shadow)] transition-all duration-300 hover:-translate-y-1 hover:border-[#7C3AED]/45 hover:shadow-[0_22px_70px_-44px_rgba(124,58,237,0.65)]";

const pricingCtaClass =
  "w-full min-h-11 py-3 !rounded-full text-xs font-bold uppercase tracking-[0.18em] bg-gradient-to-r from-[#7C3AED] to-[#2563EB] border border-transparent shadow-[0_10px_28px_-10px_rgba(124,58,237,0.7)] hover:from-[#8B5CF6] hover:to-[#3B82F6] hover:shadow-[0_14px_32px_-8px_rgba(124,58,237,0.85)] transition-all duration-300 text-white";

// Softer, less saturated purple for repeated small accents (labels/icons) — the
// full-strength #7C3AED is reserved for the CTA button and toggle so it reads
// as emphasis rather than being smeared across every line.
const pricingAccentSoft = "#A78BFA";

function PricingFeatures({
  label,
  intro,
  features,
}: {
  label: string;
  intro?: string;
  features: FeatureEntry[];
}) {
  return (
    <div className="space-y-7">
      <p className="text-xs font-bold uppercase tracking-[0.16em]" style={{ color: pricingAccentSoft }}>
        {label}
      </p>
      {intro && (
        <p className="text-sm font-semibold text-[var(--landing-foreground)]">
          {intro}
        </p>
      )}
      <ul className="flex flex-col gap-5">
        {features.map((feature) => (
          <li
            key={feature.text}
            className="flex items-start gap-3.5 text-sm leading-relaxed text-[var(--landing-muted)]"
          >
            <Check
              className="mt-0.5 h-4 w-4 shrink-0"
              style={{ color: pricingAccentSoft }}
              aria-hidden="true"
            />
            <span>{feature.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function PricingPage() {
  const { user, refreshUser } = useAuth();
  const { tr } = useLocalization();
  const { theme } = useUserTheme();
  const [isStandard, setIsStandard] = useState(false);
  const [billingInterval, setBillingInterval] = useState<"monthly" | "yearly">("monthly");
  const featureLabel = String(tr("pricing.features.label"));
  const isYearly = billingInterval === "yearly";
  const priceForInterval = (monthly: number) => (isYearly ? monthly * 10 : monthly);
  const originalYearlyPrice = (monthly: number) => (isYearly ? `$${monthly * 12}` : undefined);
  const periodLabel = isYearly ? tr("pricing.period.year") : tr("pricing.period.month");
  const aiFeature = (
    key:
      | "pricing.features.askYoca"
      | "pricing.features.volatilitySummary"
      | "pricing.features.generalAiChat"
      | "pricing.features.tokenChartNewsSummary"
      | "pricing.features.walletAiAnalysis"
      | "pricing.features.washTradingAiAnalysis"
      | "pricing.features.washTradingAiChat",
    count: number,
  ): FeatureEntry => ({ text: String(tr(key, { $count: count })) });
  const plainFeature = (key: "pricing.features.dailyReset"): FeatureEntry => ({
    text: String(tr(key)),
  });
  const everythingIn = (tier: string) => String(tr("pricing.features.everythingIn", { $tier: tier }));

  const localizedLite = {
    ...LITE_DATA,
    price: `$${priceForInterval(LITE_DATA.monthlyPrice)}`,
    originalPrice: originalYearlyPrice(LITE_DATA.monthlyPrice),
    period: periodLabel,
    intro: everythingIn(STANDARD_DATA.name),
    features: [
      aiFeature("pricing.features.askYoca", 8),
      aiFeature("pricing.features.generalAiChat", 8),
      aiFeature("pricing.features.tokenChartNewsSummary", 8),
      aiFeature("pricing.features.volatilitySummary", 8),
      plainFeature("pricing.features.dailyReset"),
    ],
    cta: tr("pricing.cta.buyNow"),
  };
  const localizedStandard = {
    ...STANDARD_DATA,
    price: tr("pricing.free"),
    originalPrice: undefined as string | undefined,
    period: undefined as string | undefined,
    intro: undefined as string | undefined,
    features: [
      aiFeature("pricing.features.askYoca", 5),
      aiFeature("pricing.features.generalAiChat", 5),
      aiFeature("pricing.features.tokenChartNewsSummary", 5),
      aiFeature("pricing.features.volatilitySummary", 5),
      plainFeature("pricing.features.dailyReset"),
    ],
    cta: tr("pricing.cta.tryForFree"),
  };
  const localizedPlus = {
    ...PLUS_TIER,
    price: `$${priceForInterval(PLUS_TIER.monthlyPrice)}`,
    originalPrice: originalYearlyPrice(PLUS_TIER.monthlyPrice),
    period: periodLabel,
    intro: everythingIn(LITE_DATA.name),
    features: [
      aiFeature("pricing.features.askYoca", 12),
      aiFeature("pricing.features.generalAiChat", 12),
      aiFeature("pricing.features.tokenChartNewsSummary", 12),
      aiFeature("pricing.features.volatilitySummary", 12),
      aiFeature("pricing.features.washTradingAiAnalysis", 3),
      aiFeature("pricing.features.washTradingAiChat", 5),
      plainFeature("pricing.features.dailyReset"),
    ],
  };
  const localizedPro = {
    ...PRO_TIER,
    price: `$${priceForInterval(PRO_TIER.monthlyPrice)}`,
    originalPrice: originalYearlyPrice(PRO_TIER.monthlyPrice),
    period: periodLabel,
    intro: everythingIn(PLUS_TIER.name),
    features: [
      aiFeature("pricing.features.askYoca", 20),
      aiFeature("pricing.features.generalAiChat", 20),
      aiFeature("pricing.features.tokenChartNewsSummary", 20),
      aiFeature("pricing.features.volatilitySummary", 20),
      aiFeature("pricing.features.washTradingAiAnalysis", 5),
      aiFeature("pricing.features.washTradingAiChat", 10),
      plainFeature("pricing.features.dailyReset"),
    ],
  };
  const col1 = isStandard ? localizedStandard : localizedLite;
  const isLightTheme = theme === "light";
  const purpleOrb = isLightTheme ? "rgba(124,58,237,0.08)" : "rgba(124,58,237,0.2)";
  const accentOrb = isLightTheme ? "rgba(45,212,191,0.07)" : "rgba(45,212,191,0.10)";
  const centerGlow = isLightTheme ? "rgba(45,212,191,0.11)" : "rgba(45,212,191,0.24)";

  // Payment flow state
  const [isAuthReminderOpen, setIsAuthReminderOpen] = useState(false);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedTier, setSelectedTier] = useState<{ name: string; price: string } | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);

  // Check for success redirect from Stripe (return_url flow only)
  // Requires both ?success=true AND ?tier=<name> to prevent stale-URL false-positives.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const successParam = params.get("success");
    const tierParam = params.get("tier");
    if (successParam === "true" && tierParam) {
      setSelectedTier({ name: tierParam, price: "" });
      setPaymentSuccess(true);
      refreshUser();
      // Clean up URL without reloading
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [refreshUser]);

  /**
   * Called when a "Buy Now" CTA button is clicked.
   * Intercepts unauthenticated users; opens the payment modal for authenticated ones.
   */
  function handleBuyNow(tier: { name: string; price: string }) {
    if (!user) {
      setIsAuthReminderOpen(true);
      return;
    }
    setSelectedTier(tier);
    setIsPaymentModalOpen(true);
  }

  async function handlePaymentSuccess() {
    await refreshUser();
    setIsPaymentModalOpen(false);
    setPaymentSuccess(true);
  }

  return (
    <div
      id="pricing"
      className="landing-page relative h-screen w-full overflow-y-auto antialiased"
      style={createLandingThemeStyles(theme)}
    >
      <LandingNavbar />

      <main className="relative flex flex-col items-center pt-32 pb-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
        {/* ── Background Orbs ── */}
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            left: "-10rem",
            top: "4rem",
            width: 500,
            height: 500,
            background: purpleOrb,
            filter: "blur(110px)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            right: "-8rem",
            top: "8rem",
            width: 420,
            height: 420,
            background: accentOrb,
            filter: "blur(110px)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-full"
          style={{
            left: "50%",
            top: "55%",
            width: 700,
            height: 350,
            transform: "translate(-50%, -50%)",
            background: centerGlow,
            filter: "blur(90px)",
          }}
        />

        {/* ── Payment Success Modal ── */}
        <PaymentSuccessModal
          open={paymentSuccess}
          tierName={selectedTier?.name ?? ""}
          onClose={() => setPaymentSuccess(false)}
        />

        {/* ── Header ── */}
        <div className="relative z-10 flex flex-col items-center gap-5 text-center w-full max-w-3xl mx-auto">
          <h1 className="text-4xl sm:text-5xl font-semibold tracking-tight text-[var(--landing-foreground)]">
            {tr("pricing.title")}
          </h1>
          <p className="text-base sm:text-lg text-[var(--landing-muted)] leading-relaxed">
            {tr("pricing.subtitle")}
          </p>
        </div>

        {/* ── Monthly / Yearly toggle ── */}
        <div className="relative z-10 !mt-8 grid grid-cols-2 gap-1 rounded-full border border-[var(--landing-card-border)] bg-[var(--landing-card-bg)] p-1.5">
          <button
            type="button"
            onClick={() => setBillingInterval("monthly")}
            className={`whitespace-nowrap rounded-full px-6 py-2.5 text-xs font-bold uppercase tracking-wide transition-all duration-200 active:scale-[0.97] ${
              billingInterval === "monthly" ? "bg-[#7C3AED] text-white" : "text-[var(--landing-muted)] hover:text-[var(--landing-foreground)]"
            }`}
          >
            {tr("pricing.toggle.monthly")}
          </button>
          <button
            type="button"
            onClick={() => setBillingInterval("yearly")}
            className={`whitespace-nowrap rounded-full px-6 py-2.5 text-xs font-bold uppercase tracking-wide transition-all duration-200 active:scale-[0.97] ${
              billingInterval === "yearly" ? "bg-[#7C3AED] text-white" : "text-[var(--landing-muted)] hover:text-[var(--landing-foreground)]"
            }`}
          >
            {tr("pricing.toggle.yearly")}{" "}
            <span className={`normal-case font-semibold ${billingInterval === "yearly" ? "text-white/75" : "text-[var(--landing-muted)]/70"}`}>
              ({tr("pricing.toggle.yearlyBadge")})
            </span>
          </button>
        </div>

        {/* ── Cards Grid ── */}
        <div className="relative z-10 w-full max-w-6xl mx-auto !mt-14 sm:!mt-16 lg:!mt-20">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6">

            {/* ── Card 1: Dynamic Lite / Standard ── */}
            <div className={pricingCardClass}>
              <div className="flex flex-col flex-1 gap-8">

                {/* Tier name + price */}
                <div className="space-y-3 pb-6 border-b border-[var(--landing-border)]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#7C3AED]/25 bg-[#7C3AED]/10 text-[#7C3AED]">
                      <Zap className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <h3 className="text-xl font-semibold text-[var(--landing-foreground)]">{col1.name}</h3>
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {col1.originalPrice && (
                      <span className="text-lg font-medium text-[var(--landing-muted)] line-through">
                        {col1.originalPrice}
                      </span>
                    )}
                    <span className="text-4xl font-semibold text-[var(--landing-foreground)]">{col1.price}</span>
                    {col1.period && <span className="text-sm text-[var(--landing-muted)] font-medium">{col1.period}</span>}
                  </div>
                </div>

                {/* Metrics */}
                <div className="flex-1">
                  <PricingFeatures
                    label={featureLabel}
                    intro={col1.intro}
                    features={col1.features}
                  />
                </div>

                {/* Toggle + CTA */}
                <div className="space-y-4 pt-6 border-t border-[var(--landing-border)]">
                  {/* Pill toggle */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={isStandard}
                    onClick={() => setIsStandard((v) => !v)}
                    className="w-full flex items-center justify-between bg-[var(--landing-button-secondary-bg)] hover:bg-[var(--landing-button-secondary-hover-bg)] border border-[var(--landing-button-secondary-border)] !rounded-full px-4 py-2.5 transition-all duration-200 cursor-pointer"
                  >
                    <span className="text-xs font-bold uppercase tracking-widest text-[#94a3b8]">
                      {tr("pricing.tiers.standard.name")}
                    </span>
                    <span
                      className={`relative flex items-center justify-start h-6 w-11 shrink-0 !rounded-full transition-colors duration-300 p-0.5 ${
                        isStandard ? "bg-[#7C3AED]" : "bg-[var(--landing-card-border)]"
                      }`}
                    >
                      <span
                        className={`inline-block h-5 w-5 !rounded-full bg-[var(--landing-foreground)] shadow-md transition-transform duration-300 ${
                          isStandard ? "translate-x-5" : "translate-x-0"
                        }`}
                      />
                    </span>
                  </button>

                  {/* CTA: only show "Buy Now" for Lite (paid), not for Standard (free) */}
                  {!isStandard ? (
                    <button
                      id="pricing-lite-buy-btn"
                      type="button"
                      onClick={() => handleBuyNow({ name: col1.name, price: col1.price })}
                      className={pricingCtaClass}
                    >
                      {col1.cta}
                    </button>
                  ) : (
                    <button
                      id="pricing-standard-try-btn"
                      type="button"
                      className={pricingCtaClass}
                    >
                      {col1.cta}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Card 2: Plus ── */}
            <div className={`${pricingCardClass} relative border-[#7C3AED]/35 shadow-[0_22px_70px_-48px_rgba(124,58,237,0.8)]`}>
              <div className="flex flex-col flex-1 gap-8">
                {/* Tier name + price */}
                <div className="space-y-3 pb-6 border-b border-[var(--landing-border)]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#7C3AED]/25 bg-[#7C3AED]/10 text-[#7C3AED]">
                      <Zap className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <h3 className="text-xl font-semibold text-[var(--landing-foreground)]">{localizedPlus.name}</h3>
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {localizedPlus.originalPrice && (
                      <span className="text-lg font-medium text-[var(--landing-muted)] line-through">
                        {localizedPlus.originalPrice}
                      </span>
                    )}
                    <span className="text-4xl font-semibold text-[var(--landing-foreground)]">{localizedPlus.price}</span>
                    <span className="text-sm text-[var(--landing-muted)] font-medium">{localizedPlus.period}</span>
                  </div>
                </div>

                <div className="flex-1">
                  <PricingFeatures
                    label={featureLabel}
                    intro={localizedPlus.intro}
                    features={localizedPlus.features}
                  />
                </div>

                {/* CTA */}
                <div className="pt-4 border-t border-[var(--landing-border)]">
                  <button
                    id="pricing-plus-buy-btn"
                    type="button"
                    onClick={() => handleBuyNow({ name: localizedPlus.name, price: localizedPlus.price })}
                    className={pricingCtaClass}
                  >
                    {tr("pricing.cta.buyNow")}
                  </button>
                </div>
              </div>
            </div>

            {/* ── Card 3: Pro ── */}
            <div className={`${pricingCardClass} relative`}>
              <div className="flex flex-col flex-1 gap-8">
                {/* Tier name + price */}
                <div className="space-y-3 pb-6 border-b border-[var(--landing-border)]">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#7C3AED]/25 bg-[#7C3AED]/10 text-[#7C3AED]">
                      <Zap className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <h3 className="text-xl font-semibold text-[var(--landing-foreground)]">{localizedPro.name}</h3>
                  </div>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    {localizedPro.originalPrice && (
                      <span className="text-lg font-medium text-[var(--landing-muted)] line-through">
                        {localizedPro.originalPrice}
                      </span>
                    )}
                    <span className="text-4xl font-semibold text-[var(--landing-foreground)]">{localizedPro.price}</span>
                    <span className="text-sm text-[var(--landing-muted)] font-medium">{localizedPro.period}</span>
                  </div>
                </div>

                <div className="flex-1">
                  <PricingFeatures
                    label={featureLabel}
                    intro={localizedPro.intro}
                    features={localizedPro.features}
                  />
                </div>

                {/* CTA */}
                <div className="pt-4 border-t border-[var(--landing-border)]">
                  <button
                    id="pricing-pro-buy-btn"
                    type="button"
                    onClick={() => handleBuyNow({ name: localizedPro.name, price: localizedPro.price })}
                    className={pricingCtaClass}
                  >
                    {tr("pricing.cta.buyNow")}
                  </button>
                </div>
              </div>
            </div>

          </div>
        </div>
      </main>

      <LandingFooter />

      {/* ── Auth Reminder Modal (unauthenticated users) ── */}
      <AuthReminderModal
        open={isAuthReminderOpen}
        onClose={() => setIsAuthReminderOpen(false)}
      />

      {/* ── Payment Modal (authenticated users) ── */}
      <PaymentModalWrapper
        open={isPaymentModalOpen}
        tier={selectedTier}
        interval={billingInterval}
        onClose={() => setIsPaymentModalOpen(false)}
        onSuccess={handlePaymentSuccess}
      />
    </div>
  );
}
