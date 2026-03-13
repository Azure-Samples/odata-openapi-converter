import { useState, useRef, useCallback } from "react";
import JSZip from "jszip";
import {
  Text,
  Button,
  ProgressBar,
  Accordion,
  AccordionItem,
  AccordionHeader,
  AccordionPanel,
  MessageBar,
  MessageBarBody,
  Link,
  makeStyles,
  tokens,
  mergeClasses,
} from "@fluentui/react-components";
import {
  ArrowDownloadRegular,
  CheckmarkCircleRegular,
  DismissCircleRegular,
  DismissRegular,
  DocumentRegular,
  FolderRegular,
  WarningRegular,
  ConvertRangeRegular,
} from "@fluentui/react-icons";
import { trackConvert, trackDownload, trackSkipped } from "./telemetry.js";
import DropZone from "./components/DropZone.jsx";

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MiB

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */
const useStyles = makeStyles({
  /* layout */
  page: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    minHeight: "100vh",
    width: "90%",
    maxWidth: "900px",
    marginLeft: "auto",
    marginRight: "auto",
    rowGap: "20px",
    paddingTop: "48px",
    paddingBottom: "48px",
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    boxSizing: "border-box",
  },

  /* heading */
  heading: {
    fontSize: "28px",
    lineHeight: "36px",
    fontWeight: tokens.fontWeightBold,
    letterSpacing: "-0.02em",
    textAlign: "center",
  },
  description: {
    fontSize: "14px",
    lineHeight: "20px",
    color: tokens.colorNeutralForeground2,
    textAlign: "center",
    marginTop: "-8px",
  },

  /* buttons */
  fullWidth: {
    alignSelf: "stretch",
  },
  buttonBase: {
    alignSelf: "stretch",
    fontWeight: tokens.fontWeightSemibold,
    fontSize: "15px",
    paddingTop: "12px",
    paddingBottom: "12px",
    borderRadius: "6px",
    borderColor: "transparent",
  },
  buttonEnabled: {
    backgroundColor: "#000000",
    color: "#ffffff",
    ":hover": {
      backgroundColor: "#1a1a1a",
      color: "#ffffff",
      borderColor: "transparent",
    },
    ":hover:active": {
      backgroundColor: "#333333",
      color: "#ffffff",
      borderColor: "transparent",
    },
  },
  buttonDisabled: {
    backgroundColor: "#e5e5e5",
    color: "#a3a3a3",
    cursor: "not-allowed",
    ":hover": {
      backgroundColor: "#e5e5e5",
      color: "#a3a3a3",
      borderColor: "transparent",
    },
  },

  /* progress */
  progressWrap: {
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    rowGap: "4px",
  },
  progressLabel: {
    fontSize: "12px",
    color: tokens.colorNeutralForeground2,
  },

  /* accordion tweaks */
  accordionWrap: {
    alignSelf: "stretch",
  },
  accordionHeading: {
    "& button": {
      fontWeight: tokens.fontWeightSemibold,
      fontSize: "14px",
    },
  },

  /* list inside accordion */
  list: {
    listStyleType: "none",
    margin: 0,
    paddingLeft: 0,
    display: "flex",
    flexDirection: "column",
    rowGap: "6px",
  },
  listItem: {
    display: "flex",
    alignItems: "center",
    columnGap: "8px",
    fontSize: "13px",
    lineHeight: "18px",
    wordBreak: "break-word",
  },
  successIcon: {
    fontSize: "16px",
    color: tokens.colorPaletteGreenForeground1,
    flexShrink: 0,
  },
  errorIcon: {
    fontSize: "16px",
    color: tokens.colorPaletteRedForeground1,
    flexShrink: 0,
  },
  warningIcon: {
    fontSize: "16px",
    color: tokens.colorPaletteYellowForeground1,
    flexShrink: 0,
  },
  fileIcon: {
    fontSize: "16px",
    color: tokens.colorNeutralForeground3,
    flexShrink: 0,
  },

  /* warnings */
  warningsSection: {
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    rowGap: "10px",
  },
  warningFile: {
    fontWeight: tokens.fontWeightSemibold,
    fontSize: "13px",
    marginTop: "6px",
    marginBottom: "2px",
  },
  warningText: {
    fontSize: "12px",
    color: tokens.colorNeutralForeground2,
    paddingLeft: "8px",
  },


});

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

function ConvertPage() {
  const styles = useStyles();

  /* ---- state ---- */
  const [files, setFiles] = useState([]);           // { name, content }[]
  const [skippedFiles, setSkippedFiles] = useState([]);
  const [converting, setConverting] = useState(false);
  const [converted, setConverted] = useState(0);
  const [totalToConvert, setTotalToConvert] = useState(0);
  const [results, setResults] = useState(null);     // { success[], failed[], warnings{} } | null
  const runIdRef = useRef("");

  /* ---- drop zone callback ---- */
  const onFilesSelected = useCallback(
    (validFiles, skippedNames) => {
      setSkippedFiles(skippedNames);
      if (skippedNames.length > 0) {
        trackSkipped(skippedNames, validFiles.length + skippedNames.length);
      }
      if (validFiles.length === 0) return;
      setFiles(validFiles);
      setResults(null);
      setConverted(0);
      setTotalToConvert(0);
    },
    [],
  );

  /* ---- convert ---- */
  const handleConvert = async () => {
    if (files.length === 0) return;

    const rid = crypto.randomUUID().slice(0, 12);
    runIdRef.current = rid;
    setConverting(true);
    setConverted(0);
    setTotalToConvert(files.length);
    setResults(null);

    const startTime = performance.now();
    const outcomes = await Promise.all(
      files.map(async (f) => {
        // Client-side size guard (mirrors backend 4 MiB limit)
        const contentBytes = new Blob([f.content]).size;
        if (contentBytes > MAX_FILE_SIZE_BYTES) {
          setConverted((n) => n + 1);
          return {
            name: f.name,
            success: false,
            error: `File size (${(contentBytes / (1024 * 1024)).toFixed(2)} MiB) exceeds the 4 MiB limit.`,
            errorType: "FileTooLargeError",
            code: "FILE_TOO_LARGE",
          };
        }
        try {
          const res = await fetch("/api/convert", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fileName: f.name, content: f.content }),
          });
          const body = await res.json();
          setConverted((n) => n + 1);

          if (!res.ok) {
            return {
              name: f.name,
              success: false,
              error: body.error,
              errorType: body.errorType,
              code: body.code,
            };
          }
          return {
            name: f.name,
            outputName: body.fileName,
            success: true,
            data: body.data,
            warnings: body.warnings || [],
          };
        } catch (err) {
          setConverted((n) => n + 1);
          return {
            name: f.name,
            success: false,
            error: err.message || "Network error",
            errorType: "NetworkError",
            code: "NETWORK_ERROR",
          };
        }
      }),
    );

    const durationMs = performance.now() - startTime;

    const success = outcomes.filter((o) => o.success);
    const failed = outcomes.filter((o) => !o.success);

    // Collect warnings grouped by file name
    const warnings = {};
    for (const r of success) {
      if (r.warnings && r.warnings.length > 0) {
        warnings[r.outputName || r.name] = r.warnings;
      }
    }

    setResults({ success, failed, warnings });
    setConverting(false);

    // Telemetry — deferred until download or page unload
    trackConvert({
      rid,
      total: outcomes.length,
      ok: success.length,
      fail: failed.length,
      warn: Object.keys(warnings).length,
      errors: failed,
      warnings,
      ms: durationMs,
    });
  };

  /* ---- download ---- */
  const handleDownload = async () => {
    if (!results || results.success.length === 0) return;
    trackDownload(runIdRef.current);

    const a = document.createElement("a");

    if (results.success.length === 1) {
      // Single file — download directly as JSON
      const r = results.success[0];
      const content =
        typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = r.outputName;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      // Multiple files — bundle into a ZIP
      const zip = new JSZip();
      for (const r of results.success) {
        const content =
          typeof r.data === "string" ? r.data : JSON.stringify(r.data, null, 2);
        zip.file(r.outputName, content);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      a.href = url;
      a.download = "openapi-specs.zip";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  /* ---- clear / reset ---- */
  const handleClear = () => {
    setFiles([]);
    setResults(null);
    setConverted(0);
  };

  /* ---- derived state ---- */
  const hasFiles = files.length > 0;
  const canConvert = hasFiles && !converting;
  const canDownload =
    results !== null && results.success.length > 0 && !converting;
  const hasWarnings =
    results !== null && Object.keys(results.warnings).length > 0;
  const progressValue = converting && totalToConvert > 0
    ? converted / totalToConvert
    : results
      ? 1
      : 0;

  /* ---- render ---- */
  return (
    <div className={styles.page}>
      {/* Title */}
      <Text as="h1" className={styles.heading}>
        Convert Files
      </Text>
      <Text as="p" className={styles.description}>
        Upload OData CSDL / EDMX files (.xml, .edmx, .json) — individually or as
        a folder — and convert them to OpenAPI 3.x specifications.
      </Text>

      {/* Skipped files warning */}
      {skippedFiles.length > 0 && (
        <MessageBar intent="error" aria-label="Unsupported files skipped">
          <MessageBarBody>
            {skippedFiles.length} file{skippedFiles.length === 1 ? '' : 's'} skipped:
            {' '}{skippedFiles.join(', ')}.
            Please upload valid OData CSDL / EDMX files with .xml, .edmx, or .json extensions.
          </MessageBarBody>
        </MessageBar>
      )}

      {/* Drop zone */}
      <DropZone onFilesSelected={onFilesSelected} disabled={converting} />

      {/* Loaded files accordion */}
      {hasFiles && (
        <Accordion className={styles.accordionWrap} collapsible>
          <AccordionItem value="loaded-files">
            <AccordionHeader
              className={styles.accordionHeading}
              icon={<FolderRegular />}
              expandIconPosition="end"
            >
              Loaded files ({files.length})
            </AccordionHeader>
            <AccordionPanel>
              <ul className={styles.list} role="list">
                {files.map((f) => (
                  <li key={f.name} className={styles.listItem}>
                    <DocumentRegular className={styles.fileIcon} />
                    <Text style={{ flex: 1 }}>{f.name}</Text>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<DismissRegular style={{ fontSize: "16px" }} />}
                      aria-label={`Remove ${f.name}`}
                      onClick={() =>
                        setFiles((prev) => prev.filter((p) => p.name !== f.name))
                      }
                    />
                  </li>
                ))}
              </ul>
              <Button
                appearance="subtle"
                size="small"
                style={{ marginTop: 8 }}
                onClick={handleClear}
              >
                Clear all
              </Button>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}

      {/* Convert / Download button */}
      {canDownload ? (
        <Button
          appearance="primary"
          icon={<ArrowDownloadRegular />}
          className={mergeClasses(styles.buttonBase, styles.buttonEnabled)}
          onClick={handleDownload}
          aria-label={
            results.success.length === 1
              ? "Download converted file"
              : "Download converted files as ZIP"
          }
        >
          {results.success.length === 1
            ? `Download ${results.success[0].outputName}`
            : `Download ZIP (${results.success.length} files)`}
        </Button>
      ) : (
        <Button
          appearance="primary"
          icon={<ConvertRangeRegular />}
          className={mergeClasses(
            styles.buttonBase,
            canConvert ? styles.buttonEnabled : styles.buttonDisabled,
          )}
          disabled={!canConvert}
          onClick={handleConvert}
          aria-label="Convert all loaded files"
        >
          {converting ? "Converting…" : "Convert"}
        </Button>
      )}

      {/* Progress bar (visible only during conversion) */}
      {converting && (
        <div className={styles.progressWrap}>
          <ProgressBar
            value={progressValue}
            max={1}
            thickness="large"
            aria-label="Conversion progress"
          />
          <Text className={styles.progressLabel}>
            Converting {converted} of {totalToConvert} files…
          </Text>
        </div>
      )}

      {/* Successful / Failed results accordion */}
      {results && (
        <Accordion className={styles.accordionWrap} collapsible multiple>
          {/* Successful */}
          {results.success.length > 0 && (
            <AccordionItem value="successful">
              <AccordionHeader
                className={styles.accordionHeading}
                icon={
                  <CheckmarkCircleRegular className={styles.successIcon} />
                }
                expandIconPosition="end"
              >
                Successful ({results.success.length})
              </AccordionHeader>
              <AccordionPanel>
                <ul className={styles.list} role="list">
                  {results.success.map((r) => (
                    <li key={r.outputName} className={styles.listItem}>
                      <CheckmarkCircleRegular className={styles.successIcon} />
                      <Text>{r.outputName}</Text>
                    </li>
                  ))}
                </ul>
              </AccordionPanel>
            </AccordionItem>
          )}

          {/* Failed */}
          {results.failed.length > 0 && (
            <AccordionItem value="failed">
              <AccordionHeader
                className={styles.accordionHeading}
                icon={
                  <DismissCircleRegular className={styles.errorIcon} />
                }
                expandIconPosition="end"
              >
                Failed ({results.failed.length})
              </AccordionHeader>
              <AccordionPanel>
                <ul className={styles.list} role="list">
                  {results.failed.map((r) => (
                    <li key={r.name} className={styles.listItem}>
                      <DismissCircleRegular className={styles.errorIcon} />
                      <Text>
                        {r.name} — {r.error}{" "}
                        <Link
                          href={`https://github.com/thanmayee75/odata-openapi-converter/issues/new?title=${encodeURIComponent(`Conversion error: ${r.name}`)}&body=${encodeURIComponent(`**File:** ${r.name}\n**Error:** ${r.error}\n**Error Type:** ${r.errorType || "Unknown"}\n**Code:** ${r.code || "N/A"}`)}`}
                          target="_blank"
                          inline
                        >
                          Report a bug
                        </Link>
                      </Text>
                    </li>
                  ))}
                </ul>
              </AccordionPanel>
            </AccordionItem>
          )}
        </Accordion>
      )}

      {/* Warnings section */}
      {hasWarnings && (
        <div className={styles.warningsSection}>
          <MessageBar intent="warning" aria-label="Conversion warnings">
            <MessageBarBody>
              Warnings indicate known limitations in the source metadata and do
              not affect the converted output.{" "}
              <Link
                href="https://github.com/thanmayee75/odata-openapi-converter/blob/main/README.md#warnings"
                target="_blank"
                inline
              >
                Learn more
              </Link>
            </MessageBarBody>
          </MessageBar>

          <Accordion className={styles.accordionWrap} collapsible>
            <AccordionItem value="warnings-list">
              <AccordionHeader
                className={styles.accordionHeading}
                icon={<WarningRegular className={styles.warningIcon} />}
                expandIconPosition="end"
              >
                View warnings ({Object.keys(results.warnings).length} file
                {Object.keys(results.warnings).length === 1 ? "" : "s"})
              </AccordionHeader>
              <AccordionPanel>
                <Accordion collapsible>
                  {Object.entries(results.warnings).map(
                    ([fileName, msgs]) => (
                      <AccordionItem key={fileName} value={fileName}>
                        <AccordionHeader
                          icon={<DocumentRegular className={styles.fileIcon} />}
                          expandIconPosition="end"
                          size="small"
                        >
                          {fileName} ({msgs.length})
                        </AccordionHeader>
                        <AccordionPanel>
                          <ul className={styles.list} role="list">
                            {msgs.map((msg, i) => (
                              <li key={i} className={styles.listItem}>
                                <WarningRegular className={styles.warningIcon} />
                                <Text className={styles.warningText}>{msg}</Text>
                              </li>
                            ))}
                          </ul>
                        </AccordionPanel>
                      </AccordionItem>
                    ),
                  )}
                </Accordion>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </div>
      )}
    </div>
  );
}

export default ConvertPage;
