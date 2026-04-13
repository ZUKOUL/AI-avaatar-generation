# AI Avatar Generation - Horpen.ai

## Project Overview
SaaS platform for AI-powered avatar and video generation. Product name: **Horpen.ai**.

## Architecture

### Backend (Python / FastAPI)
- **Entry point:** `main.py` — FastAPI app with CORS, routes, JWT auth
- **API routes:** `app/api/` — avatar, video, auth, payments (Stripe), credits
- **Services:** `app/services/` — avatar_service, video_engine, auth_service, credit_service, email_service (Resend)
- **Models:** `app/models/` — user, avatar, media
- **Core:** `app/core/` — auth (JWT), config, supabase client, pricing
- **Image gen engine:** Gemini 3 Pro Image (Nano Banana Pro) + Replicate
- **Database:** Supabase (auth + storage + DB)
- **Payments:** Stripe (multi-tier plans, credit system)
- **Email:** Resend
- **Runs on:** `uvicorn main:app --host 0.0.0.0 --port 8000`

### Frontend (Next.js / TypeScript / Tailwind)
- Located in `frontend/`
- Has its own `AGENTS.md` with Next.js-specific rules — **read it before touching frontend code**
- Source code in `frontend/src/` (app/, components/, lib/)
- Deployed on Vercel at `https://saa-s-frontend-six.vercel.app` and `https://horpen.ai`

### Deployment
- Backend: AWS EC2 with GitHub Actions CI/CD (see `deploymentguide.md`)
- Frontend: Vercel
- CI/CD trigger: push to `main` branch

## Key Dependencies
- fastapi, uvicorn, python-dotenv
- supabase, google-genai, replicate
- stripe, PyJWT, bcrypt, pillow
- resend (email)
- python-multipart

## CORS Origins
- localhost:3000, localhost:5173
- https://saa-s-frontend-six.vercel.app
- https://horpen.ai, https://www.horpen.ai

## Git Conventions
- Commit messages: descriptive, lowercase (see git log for style)
- Main branch: `main`
- Dev workflow: feature branches → PR → merge to main

## Environment Variables Required
Check `.env` — keys needed for: Supabase, Gemini/Google GenAI, Replicate, Stripe, Resend, JWT secret.

## Common Tasks
- Run backend: `uvicorn main:app --host 0.0.0.0 --port 8000 --reload`
- Run frontend: `cd frontend && npm run dev`
- Install backend deps: `pip install -r requirements.txt`
- Install frontend deps: `cd frontend && npm install`
