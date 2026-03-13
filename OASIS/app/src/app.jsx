import { useState } from "react";
import {
  FluentProvider,
  webLightTheme,
  Text,
  Checkbox,
  Button,
  Link,
  makeStyles,
  mergeClasses,
  tokens,
} from "@fluentui/react-components";
import ConvertPage from "./convert.jsx";

const useStyles = makeStyles({
  container: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    minHeight: "100vh",
    width: "100%",
    maxWidth: "640px",
    marginLeft: "auto",
    marginRight: "auto",
    rowGap: "28px",
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    boxSizing: "border-box",
  },
  heading: {
    fontSize: "32px",
    lineHeight: "40px",
    fontWeight: tokens.fontWeightBold,
    letterSpacing: "-0.02em",
    textAlign: "center",
  },
  description: {
    fontSize: "16px",
    lineHeight: "24px",
    color: tokens.colorNeutralForeground2,
    textAlign: "center",
    marginTop: "-12px",
  },
  demo: {
    alignSelf: "stretch",
    borderRadius: "8px",
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    overflow: "hidden",
    maxHeight: "360px",
    objectFit: "cover",
    width: "100%",
  },
  checkbox: {
    alignSelf: "stretch",
    "& .fui-Checkbox__indicator": {
      borderColor: "#000000",
    },
    '& input:checked + .fui-Checkbox__indicator': {
      backgroundColor: "#000000",
      borderColor: "#000000",
      color: "#ffffff",
    },
  },
  buttonBase: {
    alignSelf: "stretch",
    fontWeight: tokens.fontWeightSemibold,
    fontSize: "16px",
    paddingTop: "14px",
    paddingBottom: "14px",
    borderRadius: "6px",
    borderColor: "transparent",
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
});

function LandingPage({ onGetStarted }) {
  const styles = useStyles();
  const [accepted, setAccepted] = useState(false);

  return (
    <div className={styles.container}>
        <Text as="h1" className={styles.heading}>
          SAP ODATA to OpenAPI Converter
        </Text>

        <Text as="p" className={styles.description}>
          Bridging the gap between OData and OpenAPI. Convert CSDL / EDMX metadata (v2, v3, v4) to fully compliant OpenAPI 3.x specifications that seamlessly integrate as fully functional APIs into Azure API Management.
        </Text>

        {/* Replace src with your actual demo GIF or video */}
        <img
          className={styles.demo}
          src="/demo.gif"
          alt="Demo of OData to OpenAPI conversion"
        />

        <Checkbox
          className={styles.checkbox}
          checked={accepted}
          onChange={(_, data) => setAccepted(data.checked)}
          label={
            <>
              I agree to send non-personal application data.{" "}
              <Link
                href="https://github.com/Azure-Samples/odata-openapi-converter/blob/main/README.md#telemetry"
                target="_blank"
                inline
              >
                Learn more
              </Link>
            </>
          }
        />

        <Button
          appearance="primary"
          className={mergeClasses(
            styles.buttonBase,
            accepted ? styles.buttonEnabled : styles.buttonDisabled
          )}
          disabled={!accepted}
          onClick={onGetStarted}
        >
          Get Started
        </Button>
    </div>
  );
}

function App() {
  const [page, setPage] = useState("landing");

  return (
    <FluentProvider theme={webLightTheme}>
      {page === "landing" ? (
        <LandingPage onGetStarted={() => setPage("convert")} />
      ) : (
        <ConvertPage />
      )}
    </FluentProvider>
  );
}

export default App;