// ============================================================================
// MCQ Junction — Mock Supabase Auth Server for Browser E2E Testing
// File: tests/mock-auth-server.mjs
// ============================================================================

import http from "node:http";

export function createMockAuthServer(options = {}) {
  const port = options.port || 54321;
  const accounts = options.accounts || new Map();

  const sessions = new Map();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    let bodyText = "";

    req.on("data", (chunk) => {
      bodyText += chunk;
    });

    req.on("end", () => {
      let body = {};
      try {
        if (bodyText) body = JSON.parse(bodyText);
      } catch {
        // Form encoded or unparseable
      }

      // Handle CORS
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Content-Type", "application/json");

      if (req.method === "OPTIONS") {
        res.writeHead(200);
        res.end();
        return;
      }

      console.log("[MockAuth]", req.method, url.pathname, url.search, body.email || "");

      // 1. Password Login: POST /auth/v1/token?grant_type=password
      if (req.method === "POST" && url.pathname === "/auth/v1/token") {
        const email = (body.email || "").toLowerCase().trim();
        const password = body.password || "";

        const account = accounts.get(email);
        if (!account || account.password !== password) {
          res.writeHead(400);
          res.end(
            JSON.stringify({
              error: "invalid_grant",
              error_description: "Invalid login credentials",
              message: "Invalid login credentials",
            })
          );
          return;
        }

        const accessToken = `token_${account.id}_${Date.now()}`;
        const refreshToken = `refresh_${account.id}_${Date.now()}`;

        const userObj = {
          id: account.id,
          aud: "authenticated",
          role: "authenticated",
          email: account.email,
          email_confirmed_at: new Date().toISOString(),
          phone: "",
          confirmed_at: new Date().toISOString(),
          last_sign_in_at: new Date().toISOString(),
          app_metadata: { provider: "email", providers: ["email"], ...account.app_metadata },
          user_metadata: { name: account.name, ...account.user_metadata },
          identities: [],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_anonymous: false,
        };

        sessions.set(accessToken, userObj);

        res.writeHead(200);
        res.end(
          JSON.stringify({
            access_token: accessToken,
            token_type: "bearer",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            refresh_token: refreshToken,
            user: userObj,
          })
        );
        return;
      }

      // 2. User info: GET /auth/v1/user
      if (req.method === "GET" && url.pathname === "/auth/v1/user") {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();

        const user = sessions.get(token);
        if (!user) {
          // Check if token matches pattern token_<id>_*
          const match = token.match(/^token_([^_]+)_/);
          if (match) {
            const foundAcc = Array.from(accounts.values()).find((a) => a.id === match[1]);
            if (foundAcc) {
              const restoredUser = {
                id: foundAcc.id,
                aud: "authenticated",
                role: "authenticated",
                email: foundAcc.email,
                app_metadata: { provider: "email", ...foundAcc.app_metadata },
                user_metadata: { name: foundAcc.name, ...foundAcc.user_metadata },
                is_anonymous: false,
              };
              sessions.set(token, restoredUser);
              res.writeHead(200);
              res.end(JSON.stringify(restoredUser));
              return;
            }
          }

          res.writeHead(401);
          res.end(JSON.stringify({ message: "Invalid or expired JWT token" }));
          return;
        }

        res.writeHead(200);
        res.end(JSON.stringify(user));
        return;
      }

      // 3. Logout: POST /auth/v1/logout
      if (req.method === "POST" && url.pathname === "/auth/v1/logout") {
        const authHeader = req.headers["authorization"] || "";
        const token = authHeader.replace(/^Bearer\s+/i, "").trim();
        sessions.delete(token);
        res.writeHead(200);
        res.end(JSON.stringify({}));
        return;
      }

      // Fallback
      res.writeHead(404);
      res.end(JSON.stringify({ message: "Not found in mock auth server" }));
    });
  });

  return {
    start: () =>
      new Promise((resolve, reject) => {
        server.listen(port, "127.0.0.1", (err) => {
          if (err) reject(err);
          else resolve(server);
        });
      }),
    stop: () =>
      new Promise((resolve) => {
        server.close(resolve);
      }),
    addAccount: (account) => {
      accounts.set(account.email.toLowerCase().trim(), account);
    },
  };
}
