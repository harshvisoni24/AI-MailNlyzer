#!/usr/bin/env bash
# One-shot local setup helper for AI-MailNlyzer.
# This does NOT start PostgreSQL for you — see docs/REMOTE_POSTGRESQL.md.
set -e

echo "== AI-MailNlyzer setup =="

echo "-- Backend: installing dependencies"
(cd backend && npm install)

echo "-- Frontend: installing dependencies"
(cd frontend && npm install)

echo "-- AI service: creating virtualenv and installing dependencies"
(cd ai-service && python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt)

for f in backend/.env.example ai-service/.env.example frontend/.env.example; do
  target="${f%.example}"
  if [ ! -f "$target" ]; then
    cp "$f" "$target"
    echo "Created $target from example (edit it before running!)"
  fi
done

echo ""
echo "Next steps:"
echo "1. Edit backend/.env and ai-service/.env with your DATABASE_URL and GEMINI_API_KEY."
echo "2. cd backend && npx prisma migrate dev --name init && npm run seed"
echo "3. Start services (3 terminals):"
echo "     cd backend && npm run dev"
echo "     cd ai-service && . venv/bin/activate && uvicorn app.main:app --reload --port 8000"
echo "     cd frontend && npm run dev"
