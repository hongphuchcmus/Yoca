import appLogo from "@/assets/app-logo.png";
import { useUserTheme } from "@/contexts";
import { useAuth } from "@/contexts/AuthContext";
import { useLocalization } from "@/contexts/LocalizationContext";
import { headerNotificationsMockData } from "@/services/notifications/headerNotificationsMock";
import type { AlertNotification } from "@/types/profile";
import { cds } from "@/util/carbon-theme";
import {
  Asleep,
  ErrorFilled,
  FireFill,
  InformationFilled,
  Light,
  WarningAltFilled,
} from "@carbon/icons-react";
import {
  Content,
  Header,
  HeaderGlobalAction,
  HeaderGlobalBar,
  HeaderMenuButton,
  HeaderMenuItem,
  HeaderName,
  HeaderNavigation,
  HeaderPanel,
  HeaderSideNavItems,
  SideNav,
  SideNavItems,
  Stack,
  Switcher,
} from "@carbon/react";
import {
  Checkmark,
  Logout,
  Notification,
  Search,
  User,
  Wikis,
} from "@carbon/react/icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SignInModal } from "../auth/SignInModal";
import MarketTicker from "../MarketTicker";
import { SearchBar } from "../search/SearchBar";
import styles from "./PageWrapper.module.scss";
import { useLocation, useNavigate } from "react-router";

function ThemeToggleGlobalAction({ className }: { className?: string }) {
  const { theme, toggleTheme } = useUserTheme();
  const { tr } = useLocalization();

  return (
    <HeaderGlobalAction
      className={className}
      aria-label={
        theme == "dark"
          ? tr("nav.switchToDarkTheme")
          : tr("nav.switchToLightTheme")
      }
      tooltipAlignment="end"
      onClick={toggleTheme}
    >
      {theme == "dark" ? <Light size={20} /> : <Asleep size={20} />}
    </HeaderGlobalAction>
  );
}

type PageWrapperProps = {
  children: ReactNode;
  extraHeaderPanel?: {
    isOpen: boolean;
    content: ReactNode;
    size?: "md" | "lg";
    onClose: () => void;
  };
  onHeaderPanelOpenChange?: (isOpen: boolean) => void;
  noMarketTickers?: boolean;
  wideContent?: boolean;
  authPopup?: {
    isOpen: boolean;
    onClose: () => void;
    redirectUrl?: string;
  };
};

function getNotificationSeverityLabel(severity: AlertNotification["severity"]) {
  if (severity == "critical") return "CRITICAL";
  if (severity == "warning") return "WARNING";
  return "INFORMATION";
}

function getNotificationSeverityClass(
  severity: AlertNotification["severity"],
  stylesModule: typeof styles,
) {
  if (severity == "critical") return stylesModule.notificationSeverityCritical;
  if (severity == "warning") return stylesModule.notificationSeverityWarning;
  return stylesModule.notificationSeverityInfo;
}

function NotificationSeverityIcon({
  severity,
}: {
  severity: AlertNotification["severity"];
}) {
  if (severity == "critical") return <ErrorFilled size={16} />;
  if (severity == "warning") return <WarningAltFilled size={16} />;
  return <InformationFilled size={16} />;
}

export function PageWrapper({
  children,
  extraHeaderPanel,
  noMarketTickers = true,
  wideContent = false,
  authPopup,
}: PageWrapperProps) {
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false);
  const { tr, lang, setLang } = useLocalization();
  const { user, signOut, isSignInOpen, openAuthModal, closeAuthModal } = useAuth();
  const navigate = useNavigate();
  const languageMenuRef = useRef<HTMLDivElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const [openPanel, setOpenPanel] = useState<
    "lang" | "account" | "notifications" | null
  >(null);
  const location = useLocation();
  const [isExtraPanelOpen, setIsExtraHeaderPanelOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const isHeaderNotificationPanelOpen = openPanel == "notifications";
  const isAnyExtraPanelOpen = isExtraPanelOpen || isHeaderNotificationPanelOpen;

  // Open the shared sign-in modal when the caller asks for it. Closing is
  // handled directly by the modal's onClose below (see render) instead of a
  // second effect watching isSignInOpen — that used to fight this effect:
  // both fired in the same render, so the modal opened and was immediately
  // closed again before it could ever show.
  useEffect(() => {
    if (authPopup?.isOpen) openAuthModal("login");
  }, [authPopup?.isOpen, openAuthModal]);

  // Ctrl+K / Cmd+K to open search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key == "k") {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Open extra panel when extraHeaderPanel.isOpen becomes true
  useEffect(() => {
    if (extraHeaderPanel?.isOpen) {
      setOpenPanel(null);
      setTimeout(() => setIsExtraHeaderPanelOpen(true), 0);
    }
  }, [extraHeaderPanel?.isOpen]);

  // Reset scroll position on route change
  useEffect(() => {
    const content = document.getElementById("main-content");
    if (content) {
      content.scrollTop = 0;
    }
  }, [location.pathname]);

  useEffect(() => {
    if (openPanel != "lang" && openPanel != "account") return;

    const activeMenuRef =
      openPanel == "lang" ? languageMenuRef : accountMenuRef;

    const handleMouseDown = (event: MouseEvent) => {
      if (
        activeMenuRef.current &&
        !activeMenuRef.current.contains(event.target as Node)
      ) {
        setOpenPanel(null);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key == "Escape") {
        setOpenPanel(null);
      }
    };

    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [openPanel]);

  const toggleSideNav = () => {
    setIsSideNavExpanded((prev) => !prev);
  };

  const togglePanel = (panel: "lang" | "account" | "notifications") => {
    // Close header panel extension if it's open
    if (isExtraPanelOpen) {
      setIsExtraHeaderPanelOpen(false);
      extraHeaderPanel?.onClose();
    }
    setOpenPanel((prev) => (prev == panel ? null : panel));
  };

  const handleLanguageSelect = (nextLang: "en" | "vi") => {
    setLang(nextLang);
    setOpenPanel(null);
  };

  function NavHeaderItems() {
    return (
      <>
        <HeaderMenuItem
          className={
            location.pathname == "/market" ? styles.headerNavItemActive : undefined
          }
          aria-current={location.pathname == "/market" ? "page" : undefined}
          href="/market"
        >
          {tr("nav.market")}
        </HeaderMenuItem>
        <HeaderMenuItem
          className={
            location.pathname == "/alerts" ? styles.headerNavItemActive : undefined
          }
          aria-current={location.pathname == "/alerts" ? "page" : undefined}
          href="/alerts"
        >
          {tr("nav.alerts")}
        </HeaderMenuItem>
      </>
    );
  }

  function HeaderNotificationsPanel({
    notifications,
  }: {
    notifications: AlertNotification[];
  }) {
    return (
      <section className={styles.notificationsPanel}>
        <h3>{tr("nav.notification")}</h3>
        {notifications.map((item) => (
          <article key={item.id} className={styles.notificationItem}>
            <strong
              className={`${styles.notificationSeverityLabel} ${getNotificationSeverityClass(
                item.severity,
                styles,
              )}`}
            >
              <NotificationSeverityIcon severity={item.severity} />
              {getNotificationSeverityLabel(item.severity)}
            </strong>
            <p>{item.message}</p>
            <small>{new Date(item.timestamp).toLocaleString()}</small>
          </article>
        ))}
      </section>
    );
  }

  return (
    <>
      <Header className={styles.appHeader}>
        <HeaderMenuButton
          className={styles.headerMenuButton}
          aria-label={isSideNavExpanded ? "Close menu" : "Open menu"}
          isActive={isSideNavExpanded}
          aria-expanded={isSideNavExpanded}
          onClick={toggleSideNav}
        />

        <HeaderName
          className={styles.headerName}
          href="/market"
          prefix=""
          style={{ textDecoration: "none" }}
        >
          <Stack
            className={styles.headerBrand}
            gap={3}
            orientation="horizontal"
            style={{ alignItems: "center", fontWeight: "bold" }}
          >
            <img src={appLogo} alt="Logo" style={{ height: 36 }} />
            <strong style={{ fontSize: 21 }}>YOCA</strong>
          </Stack>
        </HeaderName>

        <HeaderNavigation className={styles.headerNavigation}>
          <NavHeaderItems />
        </HeaderNavigation>

        <HeaderGlobalBar className={styles.headerGlobalBar}>
          <HeaderGlobalAction
            className={styles.headerGlobalAction}
            aria-label={tr("nav.search")}
            onClick={() => setIsSearchOpen(true)}
          >
            <Search size={20} />
          </HeaderGlobalAction>

          <div className={styles.languageMenuAnchor} ref={languageMenuRef}>
            <HeaderGlobalAction
              className={styles.headerGlobalAction}
              aria-label={tr("nav.language")}
              aria-haspopup="menu"
              aria-expanded={openPanel == "lang"}
              isActive={openPanel == "lang"}
              onClick={() => togglePanel("lang")}
            >
              <Wikis size={20} />
            </HeaderGlobalAction>

            {openPanel == "lang" && (
              <div
                className={styles.languageMenu}
                role="menu"
                aria-label={tr("nav.language")}
              >
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={lang == "vi"}
                  className={`${styles.languageMenuOption} ${lang == "vi" ? styles.languageMenuOptionActive : ""
                    }`}
                  onClick={() => handleLanguageSelect("vi")}
                >
                  <span className={styles.languageMenuLocale}>
                    {tr("lang.vi")}
                  </span>
                  {lang == "vi" && <Checkmark size={16} />}
                </button>

                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={lang == "en"}
                  className={`${styles.languageMenuOption} ${lang == "en" ? styles.languageMenuOptionActive : ""
                    }`}
                  onClick={() => handleLanguageSelect("en")}
                >
                  <span className={styles.languageMenuLocale}>{tr("lang.en")}</span>
                  {lang == "en" && <Checkmark size={16} />}
                </button>
              </div>
            )}
          </div>

          {/* <HeaderGlobalAction
            className={styles.headerGlobalAction}
            aria-label={tr("nav.notification")}
            isActive={isHeaderNotificationPanelOpen}
            onClick={() => togglePanel("notifications")}
          >
            <Notification size={20} />
          </HeaderGlobalAction> */}

          <div className={styles.accountMenuAnchor} ref={accountMenuRef}>
            <HeaderGlobalAction
              className={styles.headerGlobalAction}
              aria-label={tr("nav.account")}
              aria-haspopup="menu"
              aria-expanded={openPanel == "account"}
              isActive={openPanel == "account"}
              onClick={() => {
                if (!user) {
                  setOpenPanel(null);
                  openAuthModal("login");
                  return;
                }

                togglePanel("account");
              }}
            >
              {user?.avatarUrl ? (
                <img src={user.avatarUrl} style={{ width: 20, height: 20, borderRadius: "50%" }} alt="" />
              ) : (
                <User size={20} />
              )}
            </HeaderGlobalAction>

            {openPanel == "account" && user && (
              <div
                className={styles.accountMenu}
                role="menu"
                aria-label={tr("nav.account")}
              >
                <button
                  type="button"
                  role="menuitem"
                  className={styles.accountPanelUser}
                  onClick={() => {
                    setOpenPanel(null);
                    navigate("/profile");
                  }}
                >
                  <span className={styles.accountPanelAvatar}>
                    {user.avatarUrl ? (
                      <img
                        src={user.avatarUrl}
                        style={{ width: 16, height: 16, borderRadius: "50%" }}
                        alt=""
                      />
                    ) : (
                      <User size={16} />
                    )}
                  </span>
                  <span className={styles.accountPanelIdentity}>
                    <strong>
                      {user.displayName || `${user.userId.slice(0, 8)}...`}
                    </strong>
                    <small>{tr("nav.profile")}</small>
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  className={styles.accountPanelAction}
                  onClick={async () => {
                    setOpenPanel(null);
                    await signOut();
                  }}
                >
                  <Logout size={16} />
                  <span>{tr("auth.signOut")}</span>
                </button>
              </div>
            )}
          </div>

          <ThemeToggleGlobalAction className={styles.headerGlobalAction} />
        </HeaderGlobalBar>

        <HeaderPanel
          className={styles.headerPanel}
          expanded={false}
          addFocusListeners={false}
          onHeaderPanelFocus={() => setOpenPanel(null)}
        >
          <section
            className={styles.languagePanelContent}
            aria-label={tr("nav.language")}
          >
            <div className={styles.languagePanelHeader}>
              <strong>{tr("nav.language")}</strong>
              <span>{tr(lang == "en" ? "lang.en" : "lang.vi")}</span>
            </div>

            <div
              className={styles.languageOptions}
              role="radiogroup"
              aria-label={tr("nav.language")}
            >
              <button
                type="button"
                role="radio"
                aria-checked={lang == "en"}
                className={`${styles.languageOption} ${lang == "en" ? styles.languageOptionActive : ""
                  }`}
                onClick={() => handleLanguageSelect("en")}
              >
                <span className={styles.languageOptionLabel}>{tr("lang.en")}</span>
                <span className={styles.languageOptionMeta}>
                  {lang == "en" ? (
                    <>
                      <Checkmark size={16} />
                      <span>{tr("nav.currentLanguage")}</span>
                    </>
                  ) : (
                    <span>{tr("nav.switchLanguage")}</span>
                  )}
                </span>
              </button>

              <button
                type="button"
                role="radio"
                aria-checked={lang == "vi"}
                className={`${styles.languageOption} ${lang == "vi" ? styles.languageOptionActive : ""
                  }`}
                onClick={() => handleLanguageSelect("vi")}
              >
                <span className={styles.languageOptionLabel}>{tr("lang.vi")}</span>
                <span className={styles.languageOptionMeta}>
                  {lang == "vi" ? (
                    <>
                      <Checkmark size={16} />
                      <span>{tr("nav.currentLanguage")}</span>
                    </>
                  ) : (
                    <span>{tr("nav.switchLanguage")}</span>
                  )}
                </span>
              </button>
            </div>
          </section>
        </HeaderPanel>

        <HeaderPanel
          className={styles.headerPanel}
          expanded={false}
          onHeaderPanelFocus={() => setOpenPanel(null)}
        >
          <section className={styles.accountPanel} aria-label={tr("nav.account")}>
            <button
              type="button"
              className={styles.accountPanelUser}
              onClick={() => {
                setOpenPanel(null);
                navigate("/profile");
              }}
            >
              <span className={styles.accountPanelAvatar}>
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} style={{ width: 16, height: 16, borderRadius: "50%" }} alt="" />
                ) : (
                  <User size={16} />
                )}
              </span>
              <span className={styles.accountPanelIdentity}>
                <strong>
                  {user
                    ? user.displayName || `${user.userId.slice(0, 8)}…`
                    : ""}
                </strong>
                <small>{tr("nav.profile")}</small>
              </span>
            </button>
            <button
              type="button"
              className={styles.accountPanelAction}
              onClick={async () => {
                setOpenPanel(null);
                await signOut();
              }}
            >
              <Logout size={16} />
              <span>{tr("auth.signOut")}</span>
            </button>
          </section>
        </HeaderPanel>

        <HeaderPanel
          className={styles.headerPanel}
          expanded={isHeaderNotificationPanelOpen}
          onHeaderPanelFocus={() => setOpenPanel(null)}
        >
          <Switcher
            aria-label="Notifications"
            expanded={isHeaderNotificationPanelOpen}
          >
            <HeaderNotificationsPanel
              notifications={headerNotificationsMockData}
            />
          </Switcher>
        </HeaderPanel>

        {extraHeaderPanel && (
          <HeaderPanel
            className={
              extraHeaderPanel.size == "lg"
                ? styles.headerPanelLarge
                : styles.headerPanel
            }
            expanded={isExtraPanelOpen}
            onHeaderPanelFocus={() => {
              setIsExtraHeaderPanelOpen(false);
              extraHeaderPanel.onClose();
            }}
          >
            <Switcher aria-label="Extra" expanded={isExtraPanelOpen}>
              <div className={styles.extraHeaderPanelContent}>
                {extraHeaderPanel.content}
              </div>
            </Switcher>
          </HeaderPanel>
        )}

        <SideNav
          className={styles.appSideNav}
          aria-label="Side navigation"
          expanded={isSideNavExpanded}
          isPersistent={false}
          onSideNavBlur={() => setIsSideNavExpanded(false)}
        >
          <SideNavItems>
            <HeaderSideNavItems hasDivider>
              <NavHeaderItems />
            </HeaderSideNavItems>
          </SideNavItems>
        </SideNav>
      </Header>

      {!noMarketTickers && (
        <MarketTicker
          className={styles.marketTicker}
          label={tr("marketPage.trending")}
          icon={<FireFill size={16} fill={cds.supportError} />}
        />
      )}

      <SignInModal
        open={isSignInOpen}
        onClose={() => {
          closeAuthModal();
          authPopup?.onClose();
        }}
        redirectUrl={authPopup?.redirectUrl}
      />
      {isSearchOpen && <SearchBar onClose={() => setIsSearchOpen(false)} />}

      <Content
        id="main-content"
        className={
          isAnyExtraPanelOpen
            ? `${styles.appContent} ${styles.contentDimmed}`
            : wideContent
              ? `${styles.appContent} ${styles.wideContent}`
              : styles.appContent
        }
        style={
          {
            "--page-content-top-offset": noMarketTickers ? "0rem" : "3.5rem",
          } as React.CSSProperties
        }
        onClick={
          isAnyExtraPanelOpen
            ? () => {
              if (openPanel == "notifications") {
                setOpenPanel(null);
              }

              if (isExtraPanelOpen) {
                setIsExtraHeaderPanelOpen(false);
                extraHeaderPanel?.onClose();
              }
            }
            : undefined
        }
      >
        {children}
      </Content>
    </>
  );
}
