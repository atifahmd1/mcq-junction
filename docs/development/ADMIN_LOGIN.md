# MCQ Junction — Local Development Administrator Authentication Guide

**Document ID:** `MCQJ-DEV-ADMIN-LOGIN`  
**Classification:** Internal Development & QA Runbook  
**Target Environment:** Local Development & Staging Sandbox  

---

## 1. Prerequisites and Environment Configuration

To run MCQ Junction locally and authenticate as an administrator, your environment must be configured with:

1. **Node.js:** v20.x or higher (Node v24 supported).
2. **PostgreSQL Database:**
   - **Local Development / Staging:** Supabase Hosted Project or Local PostgreSQL instance.
   - **Connection Poolers:**
     - `DATABASE_URL`: Transaction pooler (port 6543) or direct connection with `pgbouncer=true`.
     - `DIRECT_URL`: Session pooler (port 5432) for migrations and administrative tooling.
3. **Supabase Auth Project:**
   - `NEXT_PUBLIC_SUPABASE_URL`: e.g. `https://<project-ref>.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Public publishable key used by the browser and Server Components.
   - `NEXT_PUBLIC_SITE_URL`: `http://localhost:3000`
4. **Environment File:**
   - Ensure `.env.local` exists in the repository root (derived from `.env.example`).
   - *Security Rule:* Never put `SUPABASE_SERVICE_ROLE_KEY` in `NEXT_PUBLIC_*`. Service-role keys must remain server-only and should only be supplied ephemerally when performing administrative bootstrapping.

---

## 2. How to Start the Required Local Services

### Step 2.1: Verify Prisma Schema and Client
```bash
npx prisma validate
npx prisma generate
```

### Step 2.2: Start Next.js Development Server
```bash
npm run dev
```
The application will start on `http://localhost:3000`.

---

## 3. How to Create or Identify the Development Admin

There are two supported methods for establishing a development admin identity:

### Method A: Self-Registration via Local Application (Recommended for hosted Supabase without service role key)
1. Start the application: `npm run dev`
2. Open your browser and navigate to `http://localhost:3000/auth/signin`
3. Click **"Sign up"** at the bottom of the form.
4. Enter your intended development admin email (e.g. `dev-admin@mcq.local`) and a secure password ($\ge 8$ characters).
5. Submit the registration form.
   - The application automatically creates the user in Supabase Auth.
   - The user synchronization hook (`src/lib/auth/sync.ts`) automatically inserts a record into `public.users` with the default role `STUDENT`.
6. Proceed to Section 4 to promote this account to `ADMIN`.

### Method B: Automated Bootstrap Script (When `SUPABASE_SERVICE_ROLE_KEY` is available)
If you have access to the development project's `SUPABASE_SERVICE_ROLE_KEY`:
```bash
SUPABASE_SERVICE_ROLE_KEY="<service-role-key>" npm run dev:admin -- --email dev-admin@mcq.local --confirm
```
The script will prompt for a password, create the identity in Supabase Auth with auto-confirmed email, create the matching `public.users` record, and assign the `ADMIN` role in one step.

---

## 4. How to Grant and Verify the Role Safely

### Granting the Role via Bootstrap Script
Run the automated bootstrap tool:
```bash
node scripts/dev/create-admin.mjs --email dev-admin@mcq.local --confirm
```

The script performs the following safety checks:
1. Verifies that `NODE_ENV !== 'production'`.
2. Connects to PostgreSQL using `DIRECT_URL` or `DATABASE_URL`.
3. Validates that the database `Role` enum contains `ADMIN`.
4. Idempotently sets `role = 'ADMIN'` in `public.users`.
5. Masks all connection passwords and secrets in terminal output.

### Verifying Role Assignment Directly in PostgreSQL
To independently verify the role assignment via SQL:
```sql
SELECT id, email, role, created_at, updated_at
FROM public.users
WHERE email = 'dev-admin@mcq.local';
```
Expected output:
| id | email | role |
| :--- | :--- | :--- |
| `<uuid>` | `dev-admin@mcq.local` | `ADMIN` |

---

## 5. Sign-In and Local Dashboard URLs

| Resource | URL | Access Requirements |
| :--- | :--- | :--- |
| **Authentication Portal** | `http://localhost:3000/auth/signin` | Public |
| **Candidate Dashboard** | `http://localhost:3000/dashboard` | Any authenticated user (`STUDENT`, `ADMIN`) |
| **Administrator Overview** | `http://localhost:3000/admin` | Authenticated user with `role = 'ADMIN'` in `public.users` |
| **Exam Papers Management** | `http://localhost:3000/admin/papers` | Authenticated user with `role = 'ADMIN'` in `public.users` |

### Step-by-Step Sign-In:
1. Navigate to `http://localhost:3000/auth/signin`.
2. Enter your development admin credentials.
3. Upon authentication, you will be redirected to the intended destination (or `/dashboard`).
4. Navigate to `http://localhost:3000/admin` to access the administrator command center.

---

## 6. How to Verify a Student Account is Denied Access

To prove that the authorization boundaries are strictly enforced:

1. Register or sign in with a regular candidate account (e.g. `student@mcq.local`).
2. Verify in `public.users` that `role = 'STUDENT'`.
3. Attempt to access `http://localhost:3000/admin`.
4. **Expected Result:**
   - The server-side guard `assertAdminSession()` in `src/app/admin/layout.tsx` throws `ForbiddenError(403)`.
   - The user is presented with the **"Administrative Access Denied"** 403 screen.
   - The user CANNOT view operational metrics, papers, or sequence controls.
5. Attempt to invoke a Server Action directly:
   - Calling `publishExamPaperAction()` or `swapQuestionSequenceAction()` fails with `MCQJ-ERR-5015: Unauthorized: Caller does not possess ADMIN role`.

---

## 7. How to Remove the Development Account or Revoke Privileges

### Option A: Demote Admin to Student
To revoke administrator privileges while preserving candidate test history:
```bash
node scripts/dev/create-admin.mjs --email dev-admin@mcq.local --role STUDENT --confirm
```
Or via SQL:
```sql
UPDATE public.users SET role = 'STUDENT', updated_at = clock_timestamp() WHERE email = 'dev-admin@mcq.local';
```

### Option B: Suspend the Account
In Supabase Dashboard $\rightarrow$ Authentication $\rightarrow$ Users $\rightarrow$ select user $\rightarrow$ "Ban user", or set `banned_until`:
The `assertAdminSession()` function immediately detects `banned_until` and rejects the session.

### Option C: Complete Account Deletion
In Supabase Dashboard $\rightarrow$ Authentication $\rightarrow$ Users $\rightarrow$ "Delete user".
Due to PostgreSQL foreign key `fk_users_auth` (`ON DELETE CASCADE`), deleting the user in `auth.users` automatically removes the matching record in `public.users`.

---

## 8. Common Login Failures and Diagnostics

| Symptom / Error | Root Cause | Resolution |
| :--- | :--- | :--- |
| **"Invalid login credentials"** | Incorrect email or password in Supabase Auth. | Re-enter credentials or reset password via Supabase Auth. |
| **"Email not confirmed"** | Supabase project requires email confirmation before login. | In Supabase Dashboard $\rightarrow$ Auth $\rightarrow$ Users, manually confirm the user, or set `email_confirm: true` during bootstrap. |
| **"Caller does not possess administrator privileges (current role: STUDENT)"** | User authenticated successfully in Supabase Auth, but `public.users.role` is still `STUDENT`. | Run `node scripts/dev/create-admin.mjs --email <email> --confirm` to elevate role to `ADMIN`. |
| **"Application user record not found for authenticated identity"** | User exists in `auth.users`, but synchronization into `public.users` failed. | Sign in through `/auth/signin` to trigger `syncUserRecord()`, or run the bootstrap script. |
| **"Account is currently suspended"** | `banned_until` timestamp is set in the future on the Supabase Auth identity. | Unban user in Supabase Auth dashboard. |
| **"self-signed certificate in certificate chain"** | Node.js default CA store does not include Supabase's private Root CA (`Supabase Root 2021 CA`). | `scripts/dev/create-admin.mjs` automatically loads `certs/supabase-prod-ca-2021.crt` and enforces strict verification (`rejectUnauthorized: true`). Ensure `certs/supabase-prod-ca-2021.crt` exists in the repository root. |
| **Infinite redirect loop on `/admin`** | Expired session cookies or proxy mismatch. | Clear browser cookies for `localhost:3000` and sign in again. |

---

## 9. SSL / TLS Certificate Authority Configuration

### The Supabase Private Root CA Architecture

Supabase databases and poolers (`*.pooler.supabase.com`) serve TLS certificates signed by Supabase's private Root CA:
- **End-entity Certificate:** `CN=*.pooler.supabase.com`
- **Intermediate CA:** `CN=Supabase Intermediate 2021 CA`
- **Root CA:** `CN=Supabase Root 2021 CA`

Because `Supabase Root 2021 CA` is an internal infrastructure Certificate Authority and not present in Mozilla's standard Web PKI trust store, standard Node.js connections running with `sslmode=require` fail with:
```
FATAL: Bootstrap error: self-signed certificate in certificate chain (SELF_SIGNED_CERT_IN_CHAIN)
```

### Strict Verification Policy (No `rejectUnauthorized: false`)

To avoid Man-in-the-Middle (AiTM) exposure, **we do not disable certificate verification**. The project enforces:
1. `rejectUnauthorized: true` at all times.
2. The official Supabase Root 2021 CA is checked in at [`certs/supabase-prod-ca-2021.crt`](file:///d:/mcq-junction/certs/supabase-prod-ca-2021.crt).
3. `scripts/dev/create-admin.mjs` configures the `pg` client explicitly with `ssl: { rejectUnauthorized: true, ca: <trusted_ca>, servername: host }`, completely eliminating `SELF_SIGNED_CERT_IN_CHAIN` while guaranteeing strict cryptographic verification.
4. An optional `SUPABASE_SSL_ROOT_CERT` environment variable allows operators to supply a custom CA path if deploying against custom self-hosted Supabase installations.

