import { useState, useRef, useCallback } from "react";
import JSZip from "jszip";
import {
  Text,
  Button,
  Input,
  Textarea,
  Field,
  Checkbox,
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
import { UI } from "./strings.js";

// Import from core engine — single source of truth for constants
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // Matches core/constants.js MAX_FILE_SIZE_BYTES

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
    textAlign: "left",
    alignSelf: "stretch",
    marginTop: "-8px",
  },

  /* inputs */
  fullWidth: {
    alignSelf: "stretch",
    "& .fui-Input::after": {
      borderBottomColor: tokens.colorNeutralForeground1,
    },
  },
  skippedNotice: {
    alignSelf: "stretch",
    display: "flex",
    gap: "8px",
    padding: "8px 12px",
    borderRadius: "4px",
    backgroundColor: tokens.colorNeutralBackground3,
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
  progressBar: {
    "& .fui-ProgressBar__bar": {
      backgroundColor: tokens.colorNeutralForeground1,
    },
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
  const [serverUrl, setServerUrl] = useState("");
  const [apiTitle, setApiTitle] = useState("");
  const [apiDescription, setApiDescription] = useState("");
  const [includeApply, setIncludeApply] = useState(false);
  const [requireTop, setRequireTop] = useState(false);
  const [includeBatch, setIncludeBatch] = useState(false);
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
            error: UI.errors.fileTooLargeDetail(
              (contentBytes / (1024 * 1024)).toFixed(2),
            ),
            errorType: "FileTooLargeError",
            code: "FILE_TOO_LARGE",
          };
        }
        try {
          const res = await fetch("/api/convert", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              fileName: f.name,
              content: f.content,
              ...(serverUrl.trim() && { serverUrl: serverUrl.trim() }),
              ...(apiTitle.trim() && { title: apiTitle.trim() }),
              ...(apiDescription.trim() && { description: apiDescription.trim() }),
              ...(includeApply && { apply: true }),
              ...(requireTop && { requireTop: true }),
              ...(includeBatch && { includeBatch: true }),
            }),
          });

          let body;
          try {
            body = await res.json();
          } catch {
            setConverted((n) => n + 1);
            return {
              name: f.name,
              success: false,
              error: `Server returned ${res.status} with no valid JSON body`,
              errorType: "ServerError",
              code: "EMPTY_RESPONSE",
            };
          }
          setConverted((n) => n + 1);

          if (!res.ok) {
            const isServerError = res.status >= 500;
            return {
              name: f.name,
              success: false,
              error: isServerError
                ? UI.errors.serverError
                : body.error,
              errorType: body.errorType || "ServerError",
              code: body.code || "SERVER_ERROR",
            };
          }
          return {
            name: f.name,
            outputName: body.fileName,
            success: true,
            data: body.data,
            warnings: body.warnings || [],
            apiType: body.apiType || null,
          };
        } catch (err) {
          setConverted((n) => n + 1);
          return {
            name: f.name,
            success: false,
            error: err.message || UI.errors.networkError,
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
    // Detect OData version from file content (structural metadata, not PII)
    const odataVersion = files.length > 0
      ? files[0].content.includes('Version="4.0"') ? "v4"
        : files[0].content.includes('Version="1.0"') ? "v2"
        : "unknown"
      : "unknown";

    // Use apiType from the first successful conversion (schema namespace)
    const apiType = success.length > 0 ? success[0].apiType : null;

    trackConvert({
      rid,
      total: outcomes.length,
      ok: success.length,
      fail: failed.length,
      warn: Object.keys(warnings).length,
      errors: failed,
      warnings,
      ms: durationMs,
      odataVersion,
      apiType,
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
    setSkippedFiles([]);
  };

  const handleReset = () => {
    setFiles([]);
    setSkippedFiles([]);
    setServerUrl("");
    setApiTitle("");
    setApiDescription("");
    setResults(null);
    setConverted(0);
    setTotalToConvert(0);
  };

  /* ---- derived state ---- */
  const hasFiles = files.length > 0;
  const isDone = results !== null && !converting;
  const canConvert = hasFiles && !converting && !isDone;
  const canDownload =
    results !== null && results.success.length > 0 && !converting;
  const hasWarnings =
    results !== null && Object.keys(results.warnings).length > 0;
  const inputsDisabled = converting || isDone;
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
        {UI.convert.heading}
      </Text>
      <Text as="p" className={styles.description}>
        {UI.convert.description}
      </Text>

      {/* Server URL input */}
      <Field
        label={UI.convert.serverUrlLabel}
        hint={UI.convert.serverUrlHint}
        className={styles.fullWidth}
      >
        <Input
          placeholder={UI.convert.serverUrlPlaceholder}
          value={serverUrl}
          onChange={(e, data) => setServerUrl(data.value)}
          disabled={inputsDisabled}
        />
      </Field>

      {/* API Title input — disabled for multi-file (each file uses its own namespace) */}
      <Field
        label={UI.convert.titleLabel}
        hint={files.length > 1 ? UI.convert.titleMultiFileHint : UI.convert.titleHint}
        className={styles.fullWidth}
      >
        <Input
          placeholder={UI.convert.titlePlaceholder}
          value={apiTitle}
          onChange={(e, data) => setApiTitle(data.value)}
          disabled={inputsDisabled || files.length > 1}
        />
      </Field>

      {/* API Description input — disabled for multi-file (each file uses its own default) */}
      <Field
        label={UI.convert.descriptionLabel}
        hint={files.length > 1 ? UI.convert.descriptionMultiFileHint : UI.convert.descriptionHint}
        className={styles.fullWidth}
      >
        <Textarea
          placeholder={UI.convert.descriptionPlaceholder}
          value={apiDescription}
          onChange={(e, data) => setApiDescription(data.value)}
          disabled={inputsDisabled || files.length > 1}
          resize="vertical"
        />
      </Field>

      {/* $apply (aggregation) toggle */}
      <Field
        hint={UI.convert.applyHint}
        className={styles.fullWidth}
      >
        <Checkbox
          label={UI.convert.applyLabel}
          checked={includeApply}
          onChange={(e, data) => setIncludeApply(!!data.checked)}
          disabled={inputsDisabled}
        />
      </Field>

      {/* $top guard toggle */}
      <Field
        hint={UI.convert.requireTopHint}
        className={styles.fullWidth}
      >
        <Checkbox
          label={UI.convert.requireTopLabel}
          checked={requireTop}
          onChange={(e, data) => setRequireTop(!!data.checked)}
          disabled={inputsDisabled}
        />
      </Field>

      {/* /$batch inclusion toggle */}
      <Field
        hint={UI.convert.includeBatchHint}
        className={styles.fullWidth}
      >
        <Checkbox
          label={UI.convert.includeBatchLabel}
          checked={includeBatch}
          onChange={(e, data) => setIncludeBatch(!!data.checked)}
          disabled={inputsDisabled}
        />
      </Field>

      {/* Drop zone */}
      <DropZone onFilesSelected={onFilesSelected} disabled={inputsDisabled} />

      {/* Skipped files notice */}
      {skippedFiles.length > 0 && (
        <div className={styles.skippedNotice}>
          <WarningRegular style={{ fontSize: "16px", color: tokens.colorPaletteYellowForeground2, flexShrink: 0 }} />
          <div>
            <Text size={200} weight="semibold">{UI.convert.skippedTitle(skippedFiles.length)}</Text>
            {skippedFiles.map((name, i) => (
              <Text key={i} size={200} block style={{ color: tokens.colorNeutralForeground2 }}>{name}</Text>
            ))}
            <Text size={100} style={{ color: tokens.colorNeutralForeground3, marginTop: "4px", display: "block" }}>
              {UI.convert.skippedFooter}
            </Text>
          </div>
        </div>
      )}

      {/* Loaded files accordion */}
      {hasFiles && (
        <Accordion className={styles.accordionWrap} collapsible>
          <AccordionItem value="loaded-files">
            <AccordionHeader
              className={styles.accordionHeading}
              icon={<FolderRegular />}
              expandIconPosition="end"
            >
              {UI.convert.filesLoaded(files.length)}
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
                      aria-label={UI.convert.removeFile(f.name)}
                      disabled={inputsDisabled}
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
                disabled={inputsDisabled}
              >
                {UI.convert.clearAll}
              </Button>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      )}

      {/* Progress bar (visible only during conversion) */}
      {converting && (
        <div className={styles.progressWrap}>
          <ProgressBar
            value={progressValue}
            max={1}
            thickness="large"
            className={styles.progressBar}
            aria-label={UI.convert.progressLabel}
          />
          <Text className={styles.progressLabel}>
            {UI.convert.progressText(converted, totalToConvert)}
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
                {UI.convert.successful(results.success.length)}
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
                {UI.convert.failed(results.failed.length)}
              </AccordionHeader>
              <AccordionPanel>
                <ul className={styles.list} role="list">
                  {results.failed.map((r) => (
                    <li key={r.name} className={styles.listItem}>
                      <DismissCircleRegular className={styles.errorIcon} />
                      <Text>
                        {r.name}: {r.error}{" "}
                        <Link
                          href={`https://github.com/Azure-Samples/odata-openapi-converter/issues/new?title=${encodeURIComponent(UI.convert.issueTitle(r.name))}&body=${encodeURIComponent(UI.convert.issueBody(r.name, r.error, r.errorType, r.code))}`}
                          target="_blank"
                          inline
                        >
                          {UI.convert.reportIssue}
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
          <MessageBar intent="warning" aria-label={UI.convert.warningsAriaLabel}>
            <MessageBarBody>
              {UI.convert.warningsIntro}{" "}
              <Link
                href="https://github.com/Azure-Samples/odata-openapi-converter/blob/main/README.md#warnings"
                target="_blank"
                inline
              >
                {UI.landing.consentLink}
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
                {UI.convert.viewWarnings(Object.keys(results.warnings).length)}
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

      {/* Convert / Download + Reset buttons */}
      {canDownload ? (
        <div style={{ display: "flex", gap: "12px", alignSelf: "stretch" }}>
          <Button
            appearance="primary"
            icon={<ArrowDownloadRegular />}
            className={mergeClasses(styles.buttonBase, styles.buttonEnabled)}
            style={{ flex: 1 }}
            onClick={handleDownload}
            aria-label={
              results.success.length === 1
                ? UI.convert.downloadSingle
                : UI.convert.downloadZip
            }
          >
            {results.success.length === 1
              ? UI.convert.downloadFile(results.success[0].outputName)
              : UI.convert.downloadZipLabel(results.success.length)}
          </Button>
          <Button
            appearance="secondary"
            className={styles.buttonBase}
            style={{ flex: 1 }}
            onClick={handleReset}
          >
            {UI.convert.resetBtn}
          </Button>
        </div>
      ) : isDone ? (
        <Button
          appearance="secondary"
          className={styles.buttonBase}
          onClick={handleReset}
        >
          {UI.convert.resetBtn}
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
          {converting ? UI.convert.convertingBtn : UI.convert.convertBtn}
        </Button>
      )}
    </div>
  );
}

export default ConvertPage;
