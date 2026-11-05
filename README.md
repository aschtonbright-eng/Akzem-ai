# Akzem Intelligence

## Local development

Use Node.js 22.13 or newer. Copy `.env.example` to `.env`, set `AKZEM_ADMIN_EMAIL` and `AKZEM_ADMIN_PASSWORD` (at least 16 characters), then run `npm install` and `npm run dev`. Local development uses SQLite at `data/akzem.sqlite`; the Vite frontend proxies API requests to Express on port 3001.

The AI endpoint is `POST /api/akzem-intelligence/query`. To enable live responses, set `OPENAI_API_KEY` in the server environment. Without it, the endpoint returns an offline placeholder. The OpenAI key is never exposed to the browser.

## Deploy to Vercel

The app exports its Express server as a Vercel function. The build puts Vite's generated frontend files in `public/`, where Vercel serves them from its CDN. Agent invitation links use `APP_BASE_URL`.

1. Push this project to a Git repository and import it into Vercel, or deploy the project folder with the Vercel CLI.
2. In Vercel Marketplace, connect a PostgreSQL database (Neon is one option) to the project. Add the provider's connection string as `DATABASE_URL` in the Vercel project environment variables. The server creates the application tables and starter product list automatically on first startup.
3. Add these Production environment variables in Vercel:
   - `AKZEM_ADMIN_EMAIL`: the email you will use to sign in as administrator.
   - `AKZEM_ADMIN_PASSWORD`: a private password of at least 16 characters.
   - `APP_BASE_URL`: your deployed HTTPS origin, such as `https://your-project.vercel.app`.
   - `OPENAI_API_KEY`: optional; add it to enable live AI responses.
4. Deploy. Vercel's build command is `npm run build`; the project uses the root Express entry point and `vercel.json` for the collector page route.

Do not commit `.env` or paste database credentials into source files. Add the variables in Vercel's project settings for Production (and Preview if you want preview deployments to use a separate database). The production app refuses to start its API without `DATABASE_URL`, so its market reports will not silently fall back to temporary serverless storage.

Admin access is at `/`. Agents use the one-time invitation link to reach `/collect`. Set the correct production `APP_BASE_URL` before creating invitations.

## Market collection

Administrators can invite agents, maintain the active product list, suspend collector accounts, and review submitted prices. Invitations expire after seven days. The app does not send emails; copy the invitation link and send it using your preferred email service. Agents can report market, city, availability, price or price range, unit, and an optional comment. Agent accounts cannot access administrator pages or other agents' reports.

## Database behavior

When `DATABASE_URL` is set, the backend uses PostgreSQL. When it is not set locally, the app uses SQLite. PostgreSQL is required on Vercel because function instances do not provide a persistent local database file. The included in-memory rate limiter is per function instance; use a shared rate-limit store if the app needs a strict global limit at higher traffic.
