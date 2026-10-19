// ============================================================================
// MCQ Junction — Development Administrator Bootstrap Library
// File: scripts/dev/admin-bootstrap-lib.mjs
// ============================================================================

import fs from "node:fs";
import path from "node:path";
import { parse as parseConnectionString } from "pg-connection-string";

export const OFFICIAL_SUPABASE_ROOT_CA = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----`;

/**
 * Safely masks credentials in database connection URLs.
 */
export function maskUrl(urlString) {
  if (!urlString) return "[Not configured]";
  try {
    const isPg = urlString.startsWith("postgres");
    const parsed = new URL(isPg ? urlString.replace(/^postgresql/, "http") : urlString);
    const maskedUser = parsed.username ? "***" : "";
    const maskedPass = parsed.password ? ":***@" : parsed.username ? "@" : "";
    const portStr = parsed.port ? `:${parsed.port}` : "";
    return `${parsed.protocol.replace("http", "postgresql")}//${maskedUser}${maskedPass}${parsed.hostname}${portStr}${parsed.pathname}`;
  } catch {
    return "[URL unparseable / hidden]";
  }
}

/**
 * Loads the trusted Root CA certificate for Supabase.
 * Checks:
 * 1. process.env.SUPABASE_SSL_ROOT_CERT (path or raw PEM)
 * 2. certs/supabase-prod-ca-2021.crt (relative to project root)
 * 3. Fallback to OFFICIAL_SUPABASE_ROOT_CA constant
 */
export function loadTrustedRootCa(customPathOrPem = null) {
  if (customPathOrPem) {
    if (customPathOrPem.includes("BEGIN CERTIFICATE")) {
      return customPathOrPem.trim();
    }
    if (fs.existsSync(customPathOrPem)) {
      return fs.readFileSync(customPathOrPem, "utf-8").trim();
    }
  }

  const envCert = process.env.SUPABASE_SSL_ROOT_CERT;
  if (envCert) {
    if (envCert.includes("BEGIN CERTIFICATE")) {
      return envCert.trim();
    }
    const resolvedPath = path.resolve(process.cwd(), envCert);
    if (fs.existsSync(resolvedPath)) {
      return fs.readFileSync(resolvedPath, "utf-8").trim();
    }
  }

  const localCertPath = path.resolve(process.cwd(), "certs/supabase-prod-ca-2021.crt");
  if (fs.existsSync(localCertPath)) {
    return fs.readFileSync(localCertPath, "utf-8").trim();
  }

  return OFFICIAL_SUPABASE_ROOT_CA;
}

/**
 * Extracts the Supabase project reference from the database connection URL or Supabase URL.
 */
export function extractProjectRef(databaseUrl, supabaseUrl = null) {
  let dbProjectRef = null;
  if (databaseUrl) {
    try {
      const isPg = databaseUrl.startsWith("postgres");
      const parsed = new URL(isPg ? databaseUrl.replace(/^postgresql/, "http") : databaseUrl);
      
      // Pattern 1: username is postgres.<project_ref>
      if (parsed.username && parsed.username.includes(".")) {
        const parts = parsed.username.split(".");
        if (parts[0] === "postgres" && parts[1]) {
          dbProjectRef = parts[1];
        }
      }

      // Pattern 2: host is db.<project_ref>.supabase.co
      if (!dbProjectRef && parsed.hostname && parsed.hostname.endsWith(".supabase.co")) {
        const parts = parsed.hostname.split(".");
        if (parts[0] === "db" && parts[1]) {
          dbProjectRef = parts[1];
        }
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  let urlProjectRef = null;
  if (supabaseUrl) {
    try {
      const parsed = new URL(supabaseUrl);
      if (parsed.hostname.endsWith(".supabase.co")) {
        urlProjectRef = parsed.hostname.split(".")[0];
      }
    } catch {
      // Ignore URL parsing errors
    }
  }

  return {
    dbProjectRef,
    urlProjectRef,
    effectiveRef: dbProjectRef || urlProjectRef || null,
  };
}

/**
 * Validates target environment preflight safety.
 * Strictly blocks unintended remote targets.
 */
export function validateTargetPreflight({
  databaseUrl,
  supabaseUrl = null,
  env = process.env,
  allowRemoteProject = null,
}) {
  // 1. Refuse production environment
  if (env.NODE_ENV === "production" || env.VERCEL_ENV === "production") {
    return {
      valid: false,
      reason: "Refusing execution in production environment (NODE_ENV=production or VERCEL_ENV=production).",
    };
  }

  if (!databaseUrl) {
    return {
      valid: false,
      reason: "Missing database connection string.",
    };
  }

  let parsed = null;
  try {
    const isPg = databaseUrl.startsWith("postgres");
    parsed = new URL(isPg ? databaseUrl.replace(/^postgresql/, "http") : databaseUrl);
  } catch {
    return {
      valid: false,
      reason: "Unparseable database connection string.",
    };
  }

  const hostname = parsed.hostname.toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";

  const { dbProjectRef, urlProjectRef, effectiveRef } = extractProjectRef(databaseUrl, supabaseUrl);

  // If targeting remote database:
  if (!isLocal) {
    // Check for project reference mismatch between DATABASE_URL and NEXT_PUBLIC_SUPABASE_URL
    if (dbProjectRef && urlProjectRef && dbProjectRef !== urlProjectRef) {
      if (allowRemoteProject !== dbProjectRef) {
        return {
          valid: false,
          isLocal: false,
          effectiveRef,
          reason: `Project reference mismatch: Database targets project '${dbProjectRef}', but Supabase URL targets '${urlProjectRef}'. Refusing unconfirmed target mismatch.`,
        };
      }
    }

    // If explicit allowed project is specified, ensure it matches
    if (allowRemoteProject && effectiveRef && allowRemoteProject !== effectiveRef) {
      return {
        valid: false,
        isLocal: false,
        effectiveRef,
        reason: `Target project '${effectiveRef}' does not match explicitly allowed project '${allowRemoteProject}'.`,
      };
    }
  }

  return {
    valid: true,
    isLocal,
    effectiveRef,
    hostname,
    port: parsed.port || "5432",
    database: parsed.pathname.replace(/^\//, "") || "postgres",
  };
}

/**
 * Builds the pg Client configuration with strict TLS certificate verification.
 * Guarantees rejectUnauthorized: true and injects trusted CA bundle.
 */
export function buildDatabaseClientConfig(databaseUrl, customCa = null) {
  const parsed = parseConnectionString(databaseUrl);
  
  const hostname = (parsed.host || "").toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0";

  // Crucial: remove parsed.ssl so pg ConnectionParameters doesn't clobber explicit SSL
  delete parsed.ssl;

  if (isLocal && !databaseUrl.includes("sslmode")) {
    return {
      ...parsed,
      ssl: false,
    };
  }

  // Remote or SSL-enabled connection: enforce strict TLS with trusted CA bundle
  const caBundle = loadTrustedRootCa(customCa);

  return {
    ...parsed,
    ssl: {
      rejectUnauthorized: true, // STRICT CERTIFICATE VERIFICATION ENFORCED
      ca: caBundle,
      servername: parsed.host,
    },
  };
}
