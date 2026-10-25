# Cloud Deployment Guide (Scale-to-Zero / $0 Idle Stack)

This project is configured for a secure, serverless production deployment across:
1. **Database:** **TiDB Cloud Starter** (Serverless MySQL-compatible, TLS 1.2/1.3 encrypted, $0/mo spending cap)
2. **Backend (`server/`):** **Google Cloud Run** + **Google Secret Manager** (Dockerized Express API, scales to zero when idle)
3. **Storefront (`client/`):** **Cloudflare Pages** (Global CDN, DDoS protection, automatic branch previews)
4. **Admin Portal (`admin/`):** **Local-Only** (Runs strictly on your local machine at `http://localhost:5174` / `5173` and connects to the live Cloud Run API)
5. **Object Storage:** **Cloudflare R2** (Integrated in `server/services/storageService.js`)

---

## Step 1: Set Up the Serverless MySQL Database (TiDB Cloud Starter)

1. Go to [tidbcloud.com](https://tidbcloud.com/) and sign in.
2. On the **My TiDB** dashboard, click **Create Resource**:
   * **Plan / Tier:** Select **Starter** (free up to 25 GiB storage and 50M Request Units/month, with a $0.00 spending limit).
   * **Instance / Cluster Name:** `provi-prints-db`
   * **Cloud Provider & Region:** Select **AWS** and **`eu-central-1` (Frankfurt)**.
   * Click **Create**.
3. **Create the `provi_prints` Database:**
   * Open **SQL Editor** (Chat2Query) in the left sidebar and run:
     ```sql
     CREATE DATABASE IF NOT EXISTS provi_prints;
     ```
4. **Grab Your Connection Parameters:**
   * Click **Connect** in the upper-right corner $\rightarrow$ **Generate Password** and save `DB_HOST`, `DB_PORT` (`4000`), `DB_USERNAME`, and `DB_PASSWORD`.

---

## Step 2: Deploy the Express Backend to Google Cloud Run

1. Go to [console.cloud.google.com](https://console.cloud.google.com/) and select your `provi-prints` project.
2. **Store Sensitive Secrets in Secret Manager:**
   * Create 3 secrets in **Secret Manager**: `JWT_SECRET`, `DB_PASSWORD`, and `R2_SECRET_ACCESS_KEY`.
   * In **IAM & Admin**, grant the **Compute Engine default service account** (`*-compute@developer.gserviceaccount.com`) the **Secret Manager Secret Accessor** role.
3. **Create the Cloud Run Service:**
   * Connect your GitHub repository (`JosephJW1/provi-prints`) using **Dockerfile** at `/server/Dockerfile`.
   * **Region:** `europe-west3` (Frankfurt)
   * **Authentication:** Allow public access / unauthenticated invocations.
   * **Autoscaling:** Minimum instances = `0`, Maximum instances = `2`.
   * **Variables & Secrets:** Configure `NODE_ENV=production`, `DB_HOST`, `DB_PORT=4000`, `DB_USERNAME`, `DB_DATABASE=provi_prints`, `DB_SSL=true`, your R2 bucket settings, and mount `JWT_SECRET`, `DB_PASSWORD`, and `R2_SECRET_ACCESS_KEY` from Secret Manager.

---

## Step 3: Deploy the Customer Storefront (`client`) to Cloudflare Pages

*(Note: Only `client` is deployed publicly. `admin` stays strictly on your local computer for security).*

1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com/).
2. In the left sidebar, click **Workers & Pages** $\rightarrow$ **Create** $\rightarrow$ select the **Pages** tab $\rightarrow$ click **Connect to Git**.
3. Select your **`provi-prints`** repository and click **Begin setup**:
   * **Project name:** `provi-prints`
   * **Production branch:** `feat/cloud-deployment` (switch to `main` after merging)
   * **Framework preset:** `Vite`
   * **Root directory (advanced):** `client`
   * **Build command:** `npm run build`
   * **Build output directory:** `dist`
   * **Environment variables (advanced):**
     * `VITE_API_URL` = `https://provi-prints-api-xxxxxx.europe-west3.run.app` (no trailing slash)
4. Click **Save and Deploy**.

---

## Step 4: Connect Your Local Admin Portal & Update `CORS_ORIGINS`

1. **In Google Cloud Run (`CORS_ORIGINS`):**
   * Edit your Cloud Run service and set `CORS_ORIGINS` to include your live Cloudflare storefront URL plus your local Vite ports so your local `admin` app is allowed to call the cloud API:
     ```text
     https://provi-prints.pages.dev,http://localhost:5174,http://localhost:5173
     ```
2. **In Your Local `admin/.env` File:**
   * Create `admin/.env` on your computer (ignored by Git) and point it at your Cloud Run URL whenever you want to manage your live store:
     ```dotenv
     VITE_API_URL=https://provi-prints-api-xxxxxx.europe-west3.run.app
     ```
   * Run `npm run dev` inside `admin/` to manage your live cloud products, designs, and towns from your own machine!
