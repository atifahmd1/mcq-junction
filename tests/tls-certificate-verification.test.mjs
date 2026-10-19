// ============================================================================
// MCQ Junction — TLS Certificate & Target Safety Verification Test Suite
// File: tests/tls-certificate-verification.test.mjs
// ============================================================================

import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import tls from "node:tls";
import {
  loadTrustedRootCa,
  buildDatabaseClientConfig,
  validateTargetPreflight,
  extractProjectRef,
} from "../scripts/dev/admin-bootstrap-lib.mjs";

const SUPABASE_REMOTE_HOST = "aws-0-ap-northeast-1.pooler.supabase.com";
const SUPABASE_REMOTE_PORT = 5432;

// ----------------------------------------------------------------------------
// 1. Strict TLS Certificate Validation against Supabase Endpoint
// ----------------------------------------------------------------------------

test("TLS-01: Strict verification rejects remote Supabase certificate chain when trusted CA is missing", async (t) => {
  try {
    await new Promise((resolve, reject) => {
      const probe = net.connect({ host: SUPABASE_REMOTE_HOST, port: SUPABASE_REMOTE_PORT }, () => {
        probe.end();
        resolve(true);
      });
      probe.on("error", reject);
      probe.setTimeout(3000, () => {
        probe.destroy();
        reject(new Error("Timeout probing host"));
      });
    });
  } catch {
    t.skip("Remote Supabase endpoint unreachable from current network; skipping live network probe.");
    return;
  }

  // Attempt TLS handshake with rejectUnauthorized: true without custom CA
  const result = await new Promise((resolve) => {
    const socket = net.connect({ host: SUPABASE_REMOTE_HOST, port: SUPABASE_REMOTE_PORT }, () => {
      // Send PostgreSQL SSLRequest message
      socket.write(Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]));
    });

    socket.once("data", () => {
      const tlsSocket = tls.connect({
        socket,
        servername: SUPABASE_REMOTE_HOST,
        rejectUnauthorized: true, // STRICT VERIFICATION ENFORCED
      }, () => {
        resolve({ connected: true, authorized: tlsSocket.authorized });
        tlsSocket.end();
      });

      tlsSocket.on("error", (err) => {
        resolve({ connected: false, error: err.message, code: err.code });
      });
    });

    socket.on("error", (err) => resolve({ connected: false, error: err.message }));
  });

  assert.strictEqual(result.connected, false, "Connection must NOT succeed without trusted CA");
  assert.strictEqual(result.code, "SELF_SIGNED_CERT_IN_CHAIN", "Error code must be SELF_SIGNED_CERT_IN_CHAIN");
  assert.match(result.error, /self-signed certificate in certificate chain/i);
});

test("TLS-02: Strict verification succeeds when configured with official Supabase Root 2021 CA", async (t) => {
  try {
    await new Promise((resolve, reject) => {
      const probe = net.connect({ host: SUPABASE_REMOTE_HOST, port: SUPABASE_REMOTE_PORT }, () => {
        probe.end();
        resolve(true);
      });
      probe.on("error", reject);
      probe.setTimeout(3000, () => {
        probe.destroy();
        reject(new Error("Timeout probing host"));
      });
    });
  } catch {
    t.skip("Remote Supabase endpoint unreachable from current network; skipping live network probe.");
    return;
  }

  const trustedCa = loadTrustedRootCa();
  assert.ok(trustedCa.includes("BEGIN CERTIFICATE"), "Trusted CA must be a valid PEM");

  const result = await new Promise((resolve) => {
    const socket = net.connect({ host: SUPABASE_REMOTE_HOST, port: SUPABASE_REMOTE_PORT }, () => {
      socket.write(Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]));
    });

    socket.once("data", () => {
      const tlsSocket = tls.connect({
        socket,
        servername: SUPABASE_REMOTE_HOST,
        ca: [trustedCa],
        rejectUnauthorized: true, // STRICT VERIFICATION ENFORCED
      }, () => {
        resolve({
          connected: true,
          authorized: tlsSocket.authorized,
          error: tlsSocket.authorizationError,
        });
        tlsSocket.end();
      });

      tlsSocket.on("error", (err) => {
        resolve({ connected: false, error: err.message, code: err.code });
      });
    });

    socket.on("error", (err) => resolve({ connected: false, error: err.message }));
  });

  assert.strictEqual(result.connected, true, "Connection must succeed with trusted CA");
  assert.strictEqual(result.authorized, true, "TLS peer must be cryptographically authorized");
  assert.strictEqual(result.error, null, "There must be zero TLS authorization errors");
});

test("TLS-03: Strict verification fails closed when configured with an untrusted or foreign CA", async (t) => {
  try {
    await new Promise((resolve, reject) => {
      const probe = net.connect({ host: SUPABASE_REMOTE_HOST, port: SUPABASE_REMOTE_PORT }, () => {
        probe.end();
        resolve(true);
      });
      probe.on("error", reject);
      probe.setTimeout(3000, () => {
        probe.destroy();
        reject(new Error("Timeout probing host"));
      });
    });
  } catch {
    t.skip("Remote Supabase endpoint unreachable from current network; skipping live network probe.");
    return;
  }

  // Supply a real public root CA (e.g. Mozilla/DigiCert) that is NOT the Supabase private Root CA
  const foreignCaPem = tls.rootCertificates[0];

  const result = await new Promise((resolve) => {
    const socket = net.connect({ host: SUPABASE_REMOTE_HOST, port: SUPABASE_REMOTE_PORT }, () => {
      socket.write(Buffer.from([0, 0, 0, 8, 4, 210, 22, 47]));
    });

    socket.once("data", () => {
      const tlsSocket = tls.connect({
        socket,
        servername: SUPABASE_REMOTE_HOST,
        ca: [foreignCaPem],
        rejectUnauthorized: true, // STRICT VERIFICATION ENFORCED
      }, () => {
        resolve({ connected: true, authorized: tlsSocket.authorized });
        tlsSocket.end();
      });

      tlsSocket.on("error", (err) => {
        resolve({ connected: false, error: err.message, code: err.code });
      });
    });

    socket.on("error", (err) => resolve({ connected: false, error: err.message }));
  });

  assert.strictEqual(result.connected, false, "Connection must fail with untrusted CA");
  assert.ok(
    result.code === "SELF_SIGNED_CERT_IN_CHAIN" || result.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    `Expected certificate chain failure, got: ${result.code}`
  );
});

// ----------------------------------------------------------------------------
// 2. Client Configuration & Merging Safeguards
// ----------------------------------------------------------------------------

test("TLS-04: buildDatabaseClientConfig guarantees rejectUnauthorized: true and populates ca bundle", () => {
  const remoteUrl = "postgresql://postgres.ehapldwukenlptlbnzvi:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?sslmode=require";
  const config = buildDatabaseClientConfig(remoteUrl);

  assert.strictEqual(typeof config.ssl, "object", "SSL configuration must be an object");
  assert.strictEqual(config.ssl.rejectUnauthorized, true, "Strict verification must be strictly true");
  assert.ok(config.ssl.ca.includes("BEGIN CERTIFICATE"), "CA bundle must be included");
  assert.strictEqual(config.ssl.servername, "aws-0-ap-northeast-1.pooler.supabase.com", "Servername must match host");
});

test("TLS-05: buildDatabaseClientConfig disables SSL for local connections without sslmode", () => {
  const localUrl = "postgresql://postgres:secret@127.0.0.1:5433/mcq_junction_test";
  const config = buildDatabaseClientConfig(localUrl);

  assert.strictEqual(config.ssl, false, "Local database without sslmode must use ssl: false");
});

// ----------------------------------------------------------------------------
// 3. Preflight Safety & Target Validation
// ----------------------------------------------------------------------------

test("TLS-06: validateTargetPreflight refuses production environment", () => {
  const result = validateTargetPreflight({
    databaseUrl: "postgresql://postgres:secret@localhost:5432/postgres",
    env: { NODE_ENV: "production" },
  });

  assert.strictEqual(result.valid, false);
  assert.match(result.reason, /Refusing execution in production/);
});

test("TLS-07: validateTargetPreflight refuses project reference mismatch", () => {
  const dbUrl = "postgresql://postgres.projectA:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";
  const supabaseUrl = "https://projectB.supabase.co";

  const result = validateTargetPreflight({
    databaseUrl: dbUrl,
    supabaseUrl,
    env: { NODE_ENV: "development" },
  });

  assert.strictEqual(result.valid, false);
  assert.match(result.reason, /Project reference mismatch/);
});

test("TLS-08: validateTargetPreflight accepts matched remote development project", () => {
  const dbUrl = "postgresql://postgres.ehapldwukenlptlbnzvi:secret@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres";
  const supabaseUrl = "https://ehapldwukenlptlbnzvi.supabase.co";

  const result = validateTargetPreflight({
    databaseUrl: dbUrl,
    supabaseUrl,
    env: { NODE_ENV: "development" },
  });

  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.isLocal, false);
  assert.strictEqual(result.effectiveRef, "ehapldwukenlptlbnzvi");
});

test("TLS-09: extractProjectRef correctly extracts ref from various URL patterns", () => {
  const ref1 = extractProjectRef(
    "postgresql://postgres.testref123:secret@pooler.supabase.com:5432/postgres",
    "https://testref123.supabase.co"
  );
  assert.strictEqual(ref1.effectiveRef, "testref123");

  const ref2 = extractProjectRef(
    "postgresql://postgres:secret@db.directref456.supabase.co:5432/postgres"
  );
  assert.strictEqual(ref2.effectiveRef, "directref456");

  const ref3 = extractProjectRef(
    "postgresql://postgres:secret@127.0.0.1:5433/postgres",
    "https://urlref789.supabase.co"
  );
  assert.strictEqual(ref3.effectiveRef, "urlref789");
});
