#!/usr/bin/env bash
# ============================================================================
# ClimClose — Génération de l'APK Android (TWA) via Bubblewrap
#
# À exécuter sur un ORDINATEUR, après ./scripts/deploy.sh
# Usage : ./scripts/build-apk.sh [https://ton-app.vercel.app]
#   (si omis, l'URL sauvegardée par deploy.sh dans .frontend-url est utilisée)
#
# Bubblewrap va te demander, la première fois :
#   - s'il peut télécharger le JDK et l'Android SDK (répondre "y" / Entrée)
#   - le nom du keystore et un mot de passe pour signer l'app (choisis-en un et
#     NOTE-LE : il te servira si tu dois régénérer l'APK plus tard)
# Ce sont les seules autorisations à donner ; tout le reste est automatique.
# ============================================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FRONTEND_URL="${1:-$(cat .frontend-url 2>/dev/null)}"

if [ -z "$FRONTEND_URL" ]; then
  echo "❌ URL du frontend introuvable."
  echo "   Lance d'abord ./scripts/deploy.sh, ou précise l'URL :"
  echo "   ./scripts/build-apk.sh https://ton-app.vercel.app"
  exit 1
fi

echo "=== ClimClose — Génération de l'APK ==="
echo "Site source : $FRONTEND_URL"
echo ""

command -v node >/dev/null 2>&1 || {
  echo "❌ Node.js n'est pas installé. Installe-le depuis https://nodejs.org"
  exit 1
}

if ! command -v bubblewrap >/dev/null 2>&1; then
  echo ">> Installation de Bubblewrap CLI (outil officiel Google pour les TWA)…"
  npm install -g @bubblewrap/cli
fi

mkdir -p android-build
cd android-build

if [ ! -f twa-manifest.json ]; then
  echo ""
  echo ">> Initialisation du projet Android à partir de ton manifest PWA."
  echo "   Bubblewrap peut proposer d'installer le JDK et l'Android SDK (~1-2 Go) :"
  echo "   accepte (touche Entrée / 'y') — c'est une opération unique."
  echo ""
  bubblewrap init --manifest="$FRONTEND_URL/manifest.json"
else
  echo ">> Projet Android déjà initialisé, mise à jour…"
  bubblewrap update
fi

echo ""
echo ">> Compilation et signature de l'APK…"
bubblewrap build

echo ""
echo "======================================================================"
if [ -f app-release-signed.apk ]; then
  echo "✅ APK généré : android-build/app-release-signed.apk"
else
  echo "✅ Build terminé — vérifie le nom du fichier .apk généré ci-dessus (android-build/)."
fi
echo "======================================================================"
echo ""
echo "Empreinte SHA256 de signature (nécessaire pour l'étape suivante) :"
bubblewrap fingerprint 2>/dev/null || echo "  → visible dans android-build/*.keystore info, ou relance: bubblewrap fingerprint"
echo ""
echo "Prochaine étape :"
echo "  1. Copie cette empreinte dans frontend/public/.well-known/assetlinks.json"
echo "  2. Redéploie le frontend (cd frontend && vercel --prod)"
echo "  3. Installe l'APK sur ton téléphone : ./scripts/install-on-phone.sh"
