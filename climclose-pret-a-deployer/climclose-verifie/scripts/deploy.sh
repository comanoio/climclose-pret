#!/usr/bin/env bash
# ============================================================================
# ClimClose — Déploiement automatique (backend + frontend)
#
# À exécuter sur un ORDINATEUR (Mac/Linux/Windows+WSL), pas sur le téléphone.
# Prérequis : Node.js installé (https://nodejs.org).
#
# Ce script va :
#   1. Installer les CLI Vercel et Railway si absentes
#   2. Ouvrir ton navigateur pour te connecter (crée un compte gratuit si besoin)
#   3. Déployer le backend + une base Postgres sur Railway
#   4. Charger le schéma et les données de démo dans la base
#   5. Déployer le frontend sur Vercel, relié au backend
#
# Tu n'as qu'à valider les connexions qui s'ouvrent dans le navigateur.
# ============================================================================
set -e

echo "=== ClimClose — Déploiement automatique ==="
echo ""

command -v node >/dev/null 2>&1 || {
  echo "❌ Node.js n'est pas installé. Installe-le depuis https://nodejs.org puis relance ce script."
  exit 1
}

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# ---------- 1. Backend sur Railway ----------
if ! command -v railway >/dev/null 2>&1; then
  echo ">> Installation de la CLI Railway…"
  npm install -g @railway/cli
fi

echo ""
echo ">> Connexion à Railway — une page va s'ouvrir dans ton navigateur."
echo "   Connecte-toi ou crée un compte gratuit, puis reviens ici."
railway login

cd "$ROOT_DIR/backend"
echo ""
echo ">> Création du projet Railway (backend + base PostgreSQL/PostGIS)…"
railway init --name climclose-backend || true
railway add --plugin postgresql || echo "   (plugin PostgreSQL déjà ajouté ou à ajouter manuellement dans le dashboard Railway)"

echo ">> Déploiement du backend…"
railway up --detach

echo ">> Attribution d'un domaine public…"
railway domain || true
BACKEND_URL=$(railway domain 2>/dev/null | grep -Eo 'https?://[^ ]+' | head -1)

if [ -z "$BACKEND_URL" ]; then
  echo "⚠️  Impossible de récupérer l'URL automatiquement."
  echo "   Ouvre le dashboard Railway (railway open), copie l'URL du service backend,"
  echo "   puis relance ce script en collant l'URL : ./scripts/deploy.sh https://ton-backend.up.railway.app"
  exit 1
fi

echo "✅ Backend déployé : $BACKEND_URL"

# ---------- 2. Charger le schéma + données de démo ----------
echo ""
echo ">> Initialisation de la base de données (schéma PostGIS + données de démo)…"
railway run bash -c "psql \$DATABASE_URL -f ../db/init.sql" || {
  echo "⚠️  L'initialisation automatique a échoué. Fais-le manuellement :"
  echo "   railway run psql \$DATABASE_URL -f db/init.sql"
}

cd "$ROOT_DIR"

# ---------- 3. Frontend sur Vercel ----------
if ! command -v vercel >/dev/null 2>&1; then
  echo ">> Installation de la CLI Vercel…"
  npm install -g vercel
fi

echo ""
echo ">> Connexion à Vercel — une page va s'ouvrir dans ton navigateur."
vercel login

cd "$ROOT_DIR/frontend"
echo ""
echo ">> Déploiement du frontend, relié au backend ($BACKEND_URL)…"
vercel --prod --yes --build-env VITE_API_URL="$BACKEND_URL" > /tmp/vercel_deploy.log 2>&1 || cat /tmp/vercel_deploy.log
FRONTEND_URL=$(grep -Eo 'https://[a-zA-Z0-9.-]+\.vercel\.app' /tmp/vercel_deploy.log | tail -1)

cd "$ROOT_DIR"

echo ""
echo "======================================================================"
echo "✅ Déploiement terminé !"
echo "   Backend  : $BACKEND_URL"
echo "   Frontend : $FRONTEND_URL"
echo "======================================================================"
echo "$BACKEND_URL" > .backend-url
echo "$FRONTEND_URL" > .frontend-url
echo ""
echo "Prochaine étape : ./scripts/build-apk.sh"
