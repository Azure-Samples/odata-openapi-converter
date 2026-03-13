import { useState, useRef, useCallback } from "react";
import {
  Text,
  Link,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import { ArrowUploadRegular } from "@fluentui/react-icons";

/* ------------------------------------------------------------------ */
/*  Defaults                                                          */
/* ------------------------------------------------------------------ */
const DEFAULT_EXTENSIONS = new Set([".xml", ".edmx", ".json"]);
const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // 4 MiB

function hasValidExtension(name, accepted) {
  const dot = name.lastIndexOf(".");
  return dot !== -1 && accepted.has(name.slice(dot).toLowerCase());
}

/* ------------------------------------------------------------------ */
/*  Styles                                                            */
/* ------------------------------------------------------------------ */
const useStyles = makeStyles({
  dropZone: {
    alignSelf: "stretch",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    rowGap: "12px",
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: "8px",
    paddingTop: "32px",
    paddingBottom: "32px",
    paddingLeft: "16px",
    paddingRight: "16px",
    cursor: "pointer",
    transitionProperty: "border-color, background-color",
    transitionDuration: "150ms",
    ":hover": {
      borderColor: tokens.colorBrandStroke1,
    },
  },
  dropZoneActive: {
    borderColor: tokens.colorBrandStroke1,
    backgroundColor: tokens.colorBrandBackground2,
  },
  dropZoneDisabled: {
    opacity: 0.5,
    cursor: "not-allowed",
    pointerEvents: "none",
  },
  dropIcon: {
    fontSize: "24px",
    color: tokens.colorNeutralForeground3,
  },
  dropLabel: {
    fontSize: "14px",
    color: tokens.colorNeutralForeground2,
    textAlign: "center",
  },
});

/* ------------------------------------------------------------------ */
/*  File-reading helpers                                              */
/* ------------------------------------------------------------------ */

/** Read a single File object as text. Returns { name, content } or null. */
function readFile(file, accepted) {
  return new Promise((resolve) => {
    if (!hasValidExtension(file.name, accepted)) {
      resolve(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, content: reader.result });
    reader.onerror = () => resolve(null);
    reader.readAsText(file);
  });
}

/** Recursively collect all File handles from a dropped directory entry. */
function readEntry(entry) {
  return new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((f) => resolve([f]));
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const allFiles = [];
      const readBatch = () => {
        dirReader.readEntries(async (entries) => {
          if (entries.length === 0) {
            resolve(allFiles);
            return;
          }
          for (const e of entries) {
            const nested = await readEntry(e);
            allFiles.push(...nested);
          }
          readBatch();
        });
      };
      readBatch();
    } else {
      resolve([]);
    }
  });
}

/* ------------------------------------------------------------------ */
/*  DropZone component                                                */
/* ------------------------------------------------------------------ */

/**
 * A reusable drag-and-drop file zone.
 *
 * @param {Object}   props
 * @param {Function} props.onFilesSelected  - Called with (validFiles[], skippedNames[]).
 *                                            validFiles are { name, content } objects.
 * @param {boolean}  [props.disabled=false] - When true the zone is visually disabled.
 * @param {Set}      [props.acceptedExtensions] - Set of lowercase extensions (e.g. ".xml").
 *                                                Defaults to .xml, .edmx, .json.
 * @param {string}   [props.label]          - Override the instruction text.
 */
function DropZone({
  onFilesSelected,
  disabled = false,
  acceptedExtensions = DEFAULT_EXTENSIONS,
  label,
}) {
  const styles = useStyles();
  const fileInputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  /* ---- process raw File objects ---- */
  const processFiles = useCallback(
    async (rawFiles) => {
      const skipped = [];
      const eligible = [];

      for (const f of rawFiles) {
        if (!hasValidExtension(f.name, acceptedExtensions)) {
          skipped.push(f.name);
        } else if (f.size > MAX_FILE_SIZE_BYTES) {
          skipped.push(`${f.name} (exceeds 4 MiB limit)`);
        } else {
          eligible.push(f);
        }
      }

      const parsed = (
        await Promise.all(eligible.map((f) => readFile(f, acceptedExtensions)))
      ).filter(Boolean);

      onFilesSelected(parsed, skipped);
    },
    [onFilesSelected, acceptedExtensions],
  );

  /* ---- drag handlers ---- */
  const onDragOver = (e) => {
    e.preventDefault();
    setDragging(true);
  };
  const onDragLeave = () => setDragging(false);

  const onDrop = async (e) => {
    e.preventDefault();
    setDragging(false);

    const items = [...(e.dataTransfer.items || [])];
    const entries = items.map((i) => i.webkitGetAsEntry?.()).filter(Boolean);

    if (entries.length > 0) {
      const allFiles = [];
      for (const entry of entries) {
        allFiles.push(...(await readEntry(entry)));
      }
      await processFiles(allFiles);
    } else if (e.dataTransfer.files.length > 0) {
      await processFiles([...e.dataTransfer.files]);
    }
  };

  /* ---- file input handler ---- */
  const onFileInput = async (e) => {
    if (e.target.files?.length) {
      await processFiles([...e.target.files]);
      e.target.value = "";
    }
  };

  /* ---- accept string for <input> ---- */
  const acceptAttr = [...acceptedExtensions].join(",");

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Drop files or folders here, or click to browse"
      className={mergeClasses(
        styles.dropZone,
        dragging && styles.dropZoneActive,
        disabled && styles.dropZoneDisabled,
      )}
      onClick={() => !disabled && fileInputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          fileInputRef.current?.click();
        }
      }}
      onDragOver={!disabled ? onDragOver : undefined}
      onDragLeave={!disabled ? onDragLeave : undefined}
      onDrop={!disabled ? onDrop : undefined}
    >
      <ArrowUploadRegular className={styles.dropIcon} />
      <Text className={styles.dropLabel}>
        {label || (
          <>
            Drag &amp; drop files or folders here, or{" "}
            <Link as="span" inline>
              browse
            </Link>
            <br />
            Maximum file size: 4 MiB
          </>
        )}
      </Text>
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptAttr}
        multiple
        onChange={onFileInput}
        disabled={disabled}
        style={{ display: "none" }}
        aria-hidden="true"
      />
    </div>
  );
}

export default DropZone;
