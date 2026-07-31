import React, { useRef, useState, useCallback } from "react";
import { useLocalization } from "@/contexts/LocalizationContext";
import { ChartSkeleton } from "./ChartSkeleton";
import { ChartEmptyState } from "./ChartEmptyState";
import { ChartErrorState } from "./ChartErrorState";
import { ExportMenu, type ExportFormat } from "./ExportMenu";
import { FullscreenView } from "./FullscreenView";
import { MiniPlayer } from "./MiniPlayer";
import type { ChartLoadingState } from "../../../types/chart.types";
import styles from "./ChartWrapper.module.scss";
import { Maximize, ShrinkScreen } from "@carbon/icons-react";

interface ChartWrapperProps {
  title: string;
  loadingState?: ChartLoadingState;
  children: React.ReactNode;
  actions?: React.ReactNode;
  showLegend?: boolean;
  onRetry?: () => void;
  emptyState?: {
    title?: string;
    message?: string;
    action?: {
      label: string;
      onClick: () => void;
    };
  };
  className?: string;
  isEmpty?: boolean;
  enableExport?: boolean;
  onExport?: (format: ExportFormat) => void;
  enableFullscreen?: boolean;
  enableMiniPlayer?: boolean;
  toolbarLayout?: "default" | "stacked";
  wrapperMinHeight?: number;
}

export function ChartWrapper({
  title,
  loadingState = {
    retryCount: 0,
    status: "success",
  },
  children,
  actions,
  onRetry,
  emptyState,
  className,
  isEmpty = false,
  enableExport = false,
  onExport,
  enableFullscreen = false,
  enableMiniPlayer = false,
  toolbarLayout = "default",
  wrapperMinHeight,
}: ChartWrapperProps) {
  const { tr } = useLocalization();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isMiniPlayer, setIsMiniPlayer] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = useCallback(
    async (format: ExportFormat) => {
      if (!onExport) return;

      setIsExporting(true);
      try {
        onExport(format);
      } catch (error) {
        console.error("Export failed:", error);
      } finally {
        setIsExporting(false);
      }
    },
    [onExport],
  );

  const enterFullscreen = useCallback(() => {
    setIsFullscreen(true);
    setIsMiniPlayer(false);
  }, []);

  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
  }, []);

  const enterMiniPlayer = useCallback(() => {
    setIsMiniPlayer(true);
    setIsFullscreen(false);
  }, []);

  const exitMiniPlayer = useCallback(() => {
    setIsMiniPlayer(false);
  }, []);

  const exportMenu =
    enableExport && onExport ? (
      <ExportMenu
        onExport={handleExport}
        isExporting={isExporting}
        disabled={loadingState.status === "loading" || isEmpty}
      />
    ) : null;

  const renderControls = () => {
    if (!enableFullscreen && !enableMiniPlayer) {
      return null;
    }
    return (
      <div
        className={styles.controls}
        role="toolbar"
        aria-label={tr("charts.chartViewingModes")}
        data-html2canvas-ignore="true"
      >
        {enableFullscreen && (
          <button
            className={styles.controlButton}
            onClick={enterFullscreen}
            aria-label={tr("charts.enterFullscreenMode")}
            title={tr("charts.fullscreen")}
            disabled={loadingState.status === "loading"}
            tabIndex={0}
          >
            <Maximize
              width={20}
              height={20}
              stroke="currentColor"
              strokeWidth="1"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </button>
        )}

        {enableMiniPlayer && (
          <button
            className={styles.controlButton}
            onClick={enterMiniPlayer}
            aria-label={tr("charts.openMiniPlayer")}
            title={tr("charts.miniPlayer")}
            disabled={loadingState.status === "loading"}
            tabIndex={0}
          >
            <ShrinkScreen
              width="20"
              height="20"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1"
            />
          </button>
        )}
      </div>
    );
  };

  /**
   * Render chart content area
   */
  const renderContent = () => (
    <>
      {loadingState.status === "loading" && (
        <ChartSkeleton height={wrapperMinHeight ?? 400} />
      )}

      {loadingState.status === "error" && loadingState.error && (
        <ChartErrorState error={loadingState.error} onRetry={onRetry} />
      )}

      {loadingState.status === "success" && isEmpty && (
        <ChartEmptyState
          title={emptyState?.title}
          message={emptyState?.message}
          action={emptyState?.action}
        />
      )}

      {(loadingState.status === "success" ||
        loadingState.status === "refreshing") &&
        !isEmpty && <div className={styles.chartContainer}>{children}</div>}
    </>
  );

  return (
    <>
      <div
        ref={containerRef}
        className={`${styles.wrapper} ${className || ""}`}
        style={wrapperMinHeight != null ? { minHeight: wrapperMinHeight } : undefined}
        data-testid="chart-wrapper"
        role="region"
        aria-label={`Chart: ${title}`}
        aria-busy={
          loadingState.status === "loading" ||
          loadingState.status === "refreshing"
        }
      >
        <div
          className="sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          {loadingState.status === "loading" &&
            tr("charts.loadingChartData", { title })}
          {loadingState.status === "refreshing" &&
            tr("charts.refreshingChartData", { title })}
          {loadingState.status === "success" &&
            !isEmpty &&
            tr("charts.chartLoadedSuccessfully", { title })}
          {loadingState.status === "error" &&
            tr("charts.errorLoadingChart", { title })}
          {isEmpty && tr("charts.noDataForChart", { title })}
        </div>

        <div
          className={`${styles.header} ${toolbarLayout === "stacked" ? styles.headerStacked : styles.headerDefault}`}
        >
          {toolbarLayout === "stacked" ? (
            <>
              <h2
                className={`${styles.title} hide-on-print-title`}
                id={`chart-title-${title.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {title}
              </h2>
              <div className={styles.headerToolbarRow}>
                <div className={styles.headerFilters}>{actions}</div>
                <div className={styles.headerToolbarRight}>
                  {renderControls()}
                  {exportMenu}
                </div>
              </div>
            </>
          ) : (
            <>
              <h2
                className={`${styles.title} hide-on-print-title`}
                id={`chart-title-${title.replace(/\s+/g, "-").toLowerCase()}`}
              >
                {title}
              </h2>
              <div className={styles.headerActions}>
                {actions}
                <div className={styles.headerToolbarColumn}>
                  {renderControls()}
                  {exportMenu && (
                    <div className={styles.exportMenuRow}>{exportMenu}</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div className={styles.content}>{renderContent()}</div>
      </div>

      {enableFullscreen && (
        <FullscreenView
          isActive={isFullscreen}
          onExit={exitFullscreen}
          title={title}
        >
          {renderContent()}
        </FullscreenView>
      )}

      {enableMiniPlayer && (
        <MiniPlayer
          isActive={isMiniPlayer}
          onClose={exitMiniPlayer}
          title={title}
        >
          {renderContent()}
        </MiniPlayer>
      )}
    </>
  );
}
