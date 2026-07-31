import { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { AppWindow, ChevronDown, List, Minus, PanelLeft, PanelRight, Plus, Send, Trash2, X, Zap } from "lucide-react";
import { SegmentedControl } from "@/components/charts/shared/ChartControls";
import { WalletChatMessage } from "./WalletChatMessage";
import { PREDEFINED_QUESTIONS } from "./WalletChatConstants";
import { ChatPromptMenu } from "./ChatPromptMenu";
import { useLocalization } from "@/contexts/LocalizationContext";
import { useUserTheme } from "@/contexts/ThemeContext";
import type { LangKeys } from "@/config/localization";
import type { ChatSessionContextType } from "./useChatSessions";
import type { ChatMessageItem } from "./types";
import styles from "./WalletChat.module.scss";
import { useAuth } from "@/contexts/AuthContext";
import { AddressPill } from "@/components/common/AddressPill/AddressPill";
import { IconButton } from "@/components/common/IconButton/IconButton";
import { ChatContext, ChatContextProvider, MAX_INPUT_LENGTH, useChatContext } from "./ChatContext";

const MAX_QUICK_QUESTIONS = 5;
const SESSION_MENU_WIDTH = 320;
const SESSION_MENU_MAX_HEIGHT = 300;
const SESSION_MENU_OFFSET = 4;
const VIEWPORT_PADDING = 8;
const PLANS_POPUP_WIDTH = 360;
const PLANS_POPUP_ESTIMATED_HEIGHT = 430;
const PLANS_POPUP_OFFSET = 8;

const WALLET_CHAT_TIERS = [
  { key: "Free", label: "Standard", limit: 1 },
  { key: "Lite", label: "Lite", limit: 4 },
  { key: "Plus", label: "Plus", limit: 8 },
  { key: "Pro", label: "Pro", limit: 12 },
] as const;

interface Props {
  address?: string;
  addresses?: string[];
  lang?: LangKeys;
  variant?: "widget" | "sidebar";
  chatPosition: "right" | "left" | "fullscreen";
  onChatPositionChange: (position: "right" | "left" | "fullscreen") => void;
  contextType?: ChatSessionContextType;
  onRequestClose?: () => void;
}

function WalletChatInner({ variant, chatPosition, onChatPositionChange, walletAddresses, onRequestClose }: {
  variant: "widget" | "sidebar";
  chatPosition: "right" | "left" | "fullscreen";
  onChatPositionChange: (position: "right" | "left" | "fullscreen") => void;
  walletAddresses: string[];
  onRequestClose?: () => void;
}) {
  const { tr, fmt } = useLocalization();
  const { themeRef } = useUserTheme();
  const { user, isUserLoading } = useAuth();
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(variant === "sidebar");
  const [isMinimized, setIsMinimized] = useState(false);
  const [sessionDropdownStyle, setSessionDropdownStyle] = useState<CSSProperties>();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const sessionToggleRef = useRef<HTMLButtonElement>(null);
  const sessionMenuRef = useRef<HTMLDivElement>(null);
  const plansBtnRef = useRef<HTMLButtonElement>(null);
  const plansTriggerRef = useRef<HTMLButtonElement | null>(null);
  const plansPopupRef = useRef<HTMLDivElement>(null);
  const [activeMessageContext, setActiveMessageContext] = useState<ChatMessageItem["context"] | null>(null);
  const [isPlansOpen, setIsPlansOpen] = useState(false);
  const [plansDropdownStyle, setPlansDropdownStyle] = useState<CSSProperties>();

  const {
    messages,
    inputText,
    isLoading,
    error,
    usage,
    showPromptMenu,
    showSessionMenu,
    sessions,
    activeSessionId,
    activeSession,
    contextType,
    setInputText,
    setShowPromptMenu,
    setShowSessionMenu,
    sendQuery,
    handleRedo,
    handleRevert,
    handleNewChat,
    handleSessionSelect,
    handleDeleteSession,
  } = useChatContext();

  const quickQuestions = useMemo(
    () => PREDEFINED_QUESTIONS.filter(q => q.contextTypes?.includes(contextType)).slice(0, MAX_QUICK_QUESTIONS),
    [contextType]
  );

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, isMinimized]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 20;
    const maxHeight = lineHeight * 3 + 8;
    el.style.height = Math.min(el.scrollHeight, maxHeight) + "px";
  }, [inputText]);

  const updateSessionDropdownPosition = useCallback(() => {
    const toggle = sessionToggleRef.current;
    if (!toggle) return;

    const rect = toggle.getBoundingClientRect();
    const maxLeft = window.innerWidth - SESSION_MENU_WIDTH - VIEWPORT_PADDING;
    const maxTop = window.innerHeight - SESSION_MENU_MAX_HEIGHT - VIEWPORT_PADDING;

    setSessionDropdownStyle({
      left: Math.max(VIEWPORT_PADDING, Math.min(rect.right - SESSION_MENU_WIDTH, maxLeft)),
      top: Math.max(VIEWPORT_PADDING, Math.min(rect.bottom + SESSION_MENU_OFFSET, maxTop)),
      width: SESSION_MENU_WIDTH,
    });
  }, []);

  useLayoutEffect(() => {
    if (!showSessionMenu) return;
    updateSessionDropdownPosition();
  }, [showSessionMenu, chatPosition, updateSessionDropdownPosition]);

  useEffect(() => {
    if (!showSessionMenu) return;

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (sessionMenuRef.current?.contains(target) || sessionToggleRef.current?.contains(target)) {
        return;
      }
      setShowSessionMenu(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updateSessionDropdownPosition);
    window.addEventListener("scroll", updateSessionDropdownPosition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updateSessionDropdownPosition);
      window.removeEventListener("scroll", updateSessionDropdownPosition, true);
    };
  }, [showSessionMenu, setShowSessionMenu, updateSessionDropdownPosition]);

  const updatePlansDropdownPosition = useCallback(() => {
    const btn = plansTriggerRef.current ?? plansBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const popupHeight = plansPopupRef.current?.offsetHeight ?? PLANS_POPUP_ESTIMATED_HEIGHT;

    setPlansDropdownStyle({
      left: Math.max(
        VIEWPORT_PADDING,
        Math.min(rect.right - PLANS_POPUP_WIDTH, window.innerWidth - PLANS_POPUP_WIDTH - VIEWPORT_PADDING),
      ),
      top: Math.max(VIEWPORT_PADDING, rect.top - PLANS_POPUP_OFFSET - popupHeight),
    });
  }, []);

  useEffect(() => {
    if (!isPlansOpen) return;
    updatePlansDropdownPosition();

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (plansTriggerRef.current?.contains(target) || plansBtnRef.current?.contains(target)) return;
      if (e.defaultPrevented) return;
      const popup = document.querySelector('[data-plans-popup="true"]');
      if (popup?.contains(target)) return;
      setIsPlansOpen(false);
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updatePlansDropdownPosition);
    window.addEventListener("scroll", updatePlansDropdownPosition, true);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updatePlansDropdownPosition);
      window.removeEventListener("scroll", updatePlansDropdownPosition, true);
    };
  }, [isPlansOpen, updatePlansDropdownPosition]);

  const handlePlansToggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    plansTriggerRef.current = event.currentTarget;
    setIsPlansOpen((open) => !open);
  };

  const currentTierKey = usage?.tier ?? "Free";
  const currentTier = WALLET_CHAT_TIERS.find((tier) => tier.key === currentTierKey) ?? WALLET_CHAT_TIERS[0];

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendQuery(inputText);
    }
  };

  const handlePredefined = (query: string, promptId?: string) => {
    sendQuery(query, promptId ? { promptId } : undefined);
  };

  const resolveQuery = (q: typeof PREDEFINED_QUESTIONS[number]): string => {
    return q.queryKey ? tr(q.queryKey as "chat.prompt.overview.query") : q.query;
  };

  const handleToggle = () => {
    if (!isOpen) {
      setIsOpen(true);
      setIsMinimized(false);
    } else if (isMinimized) {
      setIsMinimized(false);
    } else {
      setIsMinimized(true);
    }
  };

  const trimmedInput = inputText.trim();
  const inputValidationError =
    trimmedInput.length === 0 ? null
      : trimmedInput.length > MAX_INPUT_LENGTH ? tr("chat.inputOverLimit", { max: MAX_INPUT_LENGTH })
        : null;
  const quotaExhausted = usage?.disabled ? false : usage?.remaining === 0;

  // ─── Auth gate ───────────────────────────────────────────────────────
  const getMessageContext = useCallback((msg?: ChatMessageItem): NonNullable<ChatMessageItem["context"]> => {
    if (msg?.context) return msg.context;
    if (activeSession) {
      return {
        contextType: activeSession.contextType,
        walletAddresses: activeSession.walletAddresses,
      };
    }
    return {
      contextType: contextType ?? (walletAddresses.length > 1 ? "wallet-comparison" : "wallet"),
      walletAddresses,
    };
  }, [activeSession, contextType, walletAddresses]);

  const formatContextAddresses = useCallback((addressesToFormat: string[]) => {
    if (addressesToFormat.length > 2) {
      return `${addressesToFormat.slice(0, 2).map((a) => fmt.text.address(a)).join(", ")}, +${addressesToFormat.length - 2}`;
    }
    return addressesToFormat.map((a) => fmt.text.address(a)).join(", ");
  }, [fmt.text]);

  const updateActiveMessageContext = useCallback(() => {
    const container = listRef.current;
    if (!container || messages.length === 0) {
      setActiveMessageContext(null);
      return;
    }

    const containerTop = container.getBoundingClientRect().top;
    const messageNodes = Array.from(container.querySelectorAll<HTMLElement>("[data-message-index]"));
    let activeIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    messageNodes.forEach((node) => {
      const rawIndex = Number(node.dataset.messageIndex);
      if (!Number.isFinite(rawIndex)) return;
      const distance = Math.abs(node.getBoundingClientRect().top - containerTop - 16);
      if (distance < bestDistance) {
        bestDistance = distance;
        activeIndex = rawIndex;
      }
    });

    setActiveMessageContext(getMessageContext(messages[activeIndex]));
  }, [getMessageContext, messages]);

  useEffect(() => {
    updateActiveMessageContext();
  }, [messages, activeSession, updateActiveMessageContext]);

  const renderSubheader = () => {
    const ctx = activeMessageContext ?? (messages.length > 0 ? getMessageContext(messages[messages.length - 1]) : null);
    if (!ctx || ctx.walletAddresses.length === 0) return null;

    return (
      <div className={styles.subheader} aria-label="Wallet context">
        <span className={styles.contextLabel}>{tr("chat.context")}:</span>
        {ctx.walletAddresses.map((addr) => (
          <AddressPill
            key={addr}
            address={addr}
            label={fmt.text.address(addr)}
            truncate={false}
            size="sm"
            className={styles.contextAddress}
            onClick={() => navigate("/wallets/" + encodeURIComponent(addr))}
          />
        ))}
      </div>
    );
  };

  const sameMessageContext = (a: ChatMessageItem["context"], b: ChatMessageItem["context"]) => {
    if (!a || !b) return a === b;
    if (a.contextType !== b.contextType) return false;
    if (a.walletAddresses.length !== b.walletAddresses.length) return false;
    return a.walletAddresses.every((address, index) => address === b.walletAddresses[index]);
  };

  const renderMessages = () => {
    let previousUserContext: ChatMessageItem["context"] | null = null;

    return (
      <div ref={listRef} className={styles.messagesArea} onScroll={updateActiveMessageContext}>
        {messages.map((msg, i) => {
          const ctx = getMessageContext(msg);
          const shouldShowContextShift = msg.role === "user" && !!previousUserContext && !sameMessageContext(previousUserContext, ctx);

          if (msg.role === "user") {
            previousUserContext = ctx;
          }

          return (
            <div key={i} data-message-index={i}>
              {shouldShowContextShift && (
                <div className={styles.contextChange}>
                  <span className={styles.contextChangeLabel}>{tr("chat.contextSwitchedTo")}</span>
                  <span className={styles.contextChangeAddresses}>{formatContextAddresses(ctx.walletAddresses)}</span>
                </div>
              )}
              <WalletChatMessage message={msg} index={i} onAction={sendQuery} onRedo={handleRedo} onRevert={handleRevert} />
            </div>
          );
        })}
        {isLoading && (
          <div className={styles.loadingDots}>
            {[0, 1, 2].map((i) => (
              <div key={i} className={styles.dot} style={{ animationDelay: `${i * 0.15}s` }} />
            ))}
            <span className={styles.loadingLabel}>{tr("chat.loadingLabel")}</span>
          </div>
        )}
        {error && (
          <div className={styles.errorMsg}>{error}</div>
        )}
      </div>
    );
  };


  if (!isUserLoading && !user) {
    if (variant === "widget" && (!isOpen || isMinimized)) {
      return (
        <button
          type="button"
          onClick={handleToggle}
          title={tr("chat.fabTitle")}
          className={styles.fab}
        >
          <span className={styles.fabText}>{tr("chat.fabLabel")}</span>
        </button>
      );
    }

    if (variant === "sidebar" && !isOpen) {
      return null;
    }

    return (
      <div className={variant === "sidebar" ? styles.sidebarContainer : styles.widgetContainer}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>{tr("chat.headerTitle")}</span>
          <div className={styles.headerActions}>
            {variant === "widget" && (
              <IconButton
                icon={X}
                label={tr("chat.close")}
                onClick={handleToggle}
                size="sm"
              />
            )}
          </div>
        </div>
        <div className={styles.authRequired}>
          <div className={styles.authRequiredTitle}>{tr("chat.signInRequired")}</div>
          <p className={styles.authRequiredDesc}>{tr("chat.signInRequiredDesc")}</p>
        </div>
      </div>
    );
  }

  if (isUserLoading) {
    if (variant === "widget" && (!isOpen || isMinimized)) {
      return (
        <button type="button" className={styles.fab}>
          <span className={styles.fabText}>{tr("chat.fabLabel")}</span>
        </button>
      );
    }
    return null;
  }

  if (variant === "widget" && (!isOpen || isMinimized)) {
    const unreadCount = messages.filter((m) => m.role === "assistant").length;
    return (
      <button
        type="button"
        onClick={handleToggle}
        title={tr("chat.fabTitle")}
        className={styles.fab}
      >
        <span className={styles.fabText}>{tr("chat.fabLabel")}</span>
        {unreadCount > 0 && (
          <span className={styles.fabBadge}>{unreadCount}</span>
        )}
      </button>
    );
  }

  if (variant === "sidebar" && !isOpen) {
    return null;
  }

  const renderPromptMenu = () => (
    <ChatPromptMenu
      walletAddress={walletAddresses[0]}
      contextType={contextType}
      onSelect={handlePredefined}
      onClose={() => setShowPromptMenu(false)}
    />
  );

  const renderGreeting = () => {
    const quickItems = quickQuestions;

    return (
      <div ref={listRef} className={styles.messagesArea}>
        <div className={styles.greetingBubble}>
          <div className={styles.greetingTitle}>{tr("chat.greetingTitle")}</div>
          <p className={styles.greetingDescription}>{tr("chat.greetingDescription")}</p>
          <div className={styles.greetingPromptLabel}>{tr("chat.greetingPrompt")}</div>
          <div className={styles.greetingList}>
            {quickItems.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => handlePredefined(resolveQuery(q))}
                className={styles.greetingItem}
              >
                {resolveQuery(q)}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  const renderSessionMenu = () => (
    <div ref={sessionMenuRef} className={styles.sessionDropdown} style={sessionDropdownStyle}>
      <div className={styles.sessionDropdownTitle}>{tr("chat.sessions")}</div>
      {sessions.length === 0 && (
        <div className={styles.sessionEmpty}>{tr("chat.noSessions")}</div>
      )}
      {sessions.map((s) => (
        <div
          key={s.id}
          className={`${styles.sessionItem} ${s.id === activeSessionId ? styles.sessionItemActive : ""}`}
          onClick={() => handleSessionSelect(s.id)}
        >
          <div className={styles.sessionItemContent}>
            <span className={styles.sessionItemTitle}>
              {s.title || tr("chat.newChat")}
            </span>
            <span className={styles.sessionItemTime}>
              {s.contextType === "wallet-comparison" ? tr("chat.contextTypeComparison") : tr("chat.contextTypeWallet")}
              {" · "}
              {s.walletAddresses.length > 2
                ? s.walletAddresses.slice(0, 2).map((a) => fmt.text.address(a)).join(", ") + `, +${s.walletAddresses.length - 2}`
                : s.walletAddresses.map((a) => fmt.text.address(a)).join(", ")}
              {" · "}
              {fmt.datetime.relative(s.updatedAt)}
            </span>
          </div>
          <button
            type="button"
            className={styles.sessionItemDelete}
            onClick={(e) => handleDeleteSession(e, s.id)}
            title={tr("chat.deleteSession")}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
    </div>
  );

  const wrapperClass = variant === "sidebar" ? styles.sidebarContainer : styles.widgetContainer;
  const sessionMenu = showSessionMenu
    ? themeRef.current ? createPortal(renderSessionMenu(), themeRef.current) : renderSessionMenu()
    : null;

  return (
    <div className={wrapperClass}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.headerTitle}>{tr("chat.headerTitle")}</span>
        </div>
        <div className={styles.headerActions}>
          <div className={styles.sessionSelector}>
            <button
              ref={sessionToggleRef}
              type="button"
              className={styles.sessionToggle}
              onClick={() => setShowSessionMenu((v) => !v)}
              disabled={isLoading}
            >
              <span className={styles.sessionToggleLabel}>
                {activeSession?.title ?? tr("chat.newChat")}
              </span>
              <ChevronDown size={12} />
            </button>
            {sessionMenu}
          </div>
          <SegmentedControl
            options={[
              { value: "left", icon: PanelLeft, label: tr("chat.leftSidebar") },
              { value: "fullscreen", icon: AppWindow, label: tr("chat.fullscreenMode") },
              { value: "right", icon: PanelRight, label: tr("chat.rightSidebar") },
            ]}
            value={chatPosition}
            onChange={onChatPositionChange}
            ariaLabel="Chat position"
            iconOnly
          />
          <button
            type="button"
            className={styles.circleBtn}
            onClick={handleNewChat}
            title={tr("chat.newChat")}
            disabled={isLoading}
          >
            <Plus size={15} />
          </button>
          {onRequestClose && (
            <button
              type="button"
              className={styles.circleBtn}
              onClick={onRequestClose}
              title={tr("chat.close")}
            >
              <X size={15} />
            </button>
          )}
          {variant === "widget" && (
            <>
              <IconButton
                icon={Minus}
                label={tr("chat.minimize")}
                onClick={() => setIsMinimized(true)}
                size="sm"
              />
              <IconButton
                icon={X}
                label={tr("chat.close")}
                onClick={handleToggle}
                size="sm"
              />
            </>
          )}
        </div>
      </div>
      {renderSubheader()}

      {showPromptMenu ? renderPromptMenu()
        : messages.length === 0 && !isLoading ? renderGreeting()
          : renderMessages()}

      {messages.length > 0 && !showPromptMenu && (
        <div className={styles.aiDisclaimer}>{tr("chat.aiDisclaimer")}</div>
      )}

      <div className={styles.inputBar}>
        <div className={styles.inputContainer}>
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={tr("chat.inputPlaceholder")}
            disabled={isLoading || quotaExhausted}
            className={styles.inputTextarea}
            rows={3}
          />
          <div className={styles.inputFooter}>
            <span className={styles.charCount}>
              {usage && !usage.disabled
                ? tr("chat.usageLabel", { remaining: String(usage.remaining), limit: String(usage.limit) })
                : tr("chat.inputCounter", { current: String(inputText.length), max: MAX_INPUT_LENGTH })}
            </span>
            <div className={styles.inputFooterRight}>
              <button
                ref={plansBtnRef}
                type="button"
                className={styles.viewPlansBtn}
                onClick={handlePlansToggle}
              >
                <Zap size={12} />
                {tr("chat.viewPlans")}
              </button>
              <div className={styles.inputActions}>
                <IconButton
                  icon={List}
                  label={tr("chat.promptMenuBtn")}
                  onClick={() => setShowPromptMenu((v) => !v)}
                  disabled={isLoading}
                  active={showPromptMenu}
                  size="sm"
                />
                <IconButton
                  icon={Send}
                  label={tr("chat.sendButtonTitle")}
                  onClick={() => sendQuery(inputText)}
                  disabled={isLoading || quotaExhausted || !inputText.trim() || inputText.length > MAX_INPUT_LENGTH}
                  size="sm"
                />
              </div>
            </div>
          </div>
          {inputText.length > 0 && inputValidationError && (
            <div className={styles.validationError}>{inputValidationError}</div>
          )}
          {quotaExhausted && (
            <div className={styles.limitNotice}>
              <span>{tr("chat.limitReachedTitle")}</span>
              <button type="button" className={styles.limitAction} onClick={handlePlansToggle}>
                {tr("chat.upgradeOptions")}
              </button>
            </div>
          )}
        </div>
        {isPlansOpen && themeRef.current && createPortal(
          <div ref={plansPopupRef} className={styles.plansPopup} style={plansDropdownStyle} data-plans-popup="true">
            <div className={styles.plansPopupHeader}>
              <span className={styles.plansPopupTitle}>{tr("chat.planBenefitsTitle")}</span>
              <button type="button" className={styles.plansPopupClose} onClick={() => setIsPlansOpen(false)}>
                <X size={12} />
              </button>
            </div>
            <p className={styles.plansPopupDesc}>
              {tr("chat.currentPlanSummary", {
                tier: currentTier.label,
                limit: String(usage?.limit ?? currentTier.limit),
              })}
            </p>
            <div className={styles.planTierGrid}>
              {WALLET_CHAT_TIERS.map((tier) => {
                const isCurrent = tier.key === currentTierKey;
                return (
                  <div
                    key={tier.key}
                    className={`${styles.planTierCard} ${isCurrent ? styles.planTierCardActive : ""}`}
                  >
                    <div className={styles.planTierCardTop}>
                      <span className={styles.planTierName}>{tier.label}</span>
                      {isCurrent && (
                        <span className={styles.planTierBadge}>{tr("chat.currentTierBadge")}</span>
                      )}
                    </div>
                    <div className={styles.planTierLimit}>
                      {tr("chat.walletChatLimitValue", { limit: String(tier.limit) })}
                    </div>
                    <div className={styles.planTierLimitLabel}>{tr("chat.walletChatLimitLabel")}</div>
                  </div>
                );
              })}
            </div>
            <div className={styles.plansPopupActions}>
              <button type="button" className={styles.plansPopupSecondary} onClick={() => setIsPlansOpen(false)}>
                {tr("chat.notNow")}
              </button>
              <button type="button" className={styles.plansPopupPrimary} onClick={() => navigate("/pricing")}>
                {tr("chat.goToPricing")}
              </button>
            </div>
          </div>,
          themeRef.current,
        )}
      </div>
    </div >
  );
}

export function WalletChat({ address, addresses, lang, variant = "widget", chatPosition, onChatPositionChange, contextType: contextTypeProp, onRequestClose }: Props) {
  const existingCtx = useContext(ChatContext);

  if (existingCtx) {
    return <WalletChatInner variant={variant} chatPosition={chatPosition} onChatPositionChange={onChatPositionChange} walletAddresses={existingCtx.addresses} onRequestClose={onRequestClose} />;
  }

  const activeAddresses = [address, ...(addresses ?? [])].filter(Boolean) as string[];
  const contextType = contextTypeProp ?? (activeAddresses.length > 1 ? "wallet-comparison" : "wallet");

  return (
    <ChatContextProvider addresses={activeAddresses} contextType={contextType} lang={lang}>
      <WalletChatInner variant={variant} chatPosition={chatPosition} onChatPositionChange={onChatPositionChange} walletAddresses={activeAddresses} onRequestClose={onRequestClose} />
    </ChatContextProvider>
  );
}
