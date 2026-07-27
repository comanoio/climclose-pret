#!/usr/bin/env bash
# ============================================================================
# ClimClose — Installation de l'APK sur ton téléphone
#
# Deux méthodes :
#   A) Automatique via câble USB (ce script, avec adb)
#   B) Manuelle (sans câble) — instructions affichées si adb n'est pas dispo
# ============================================================================
set -e

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APK_PATH="${1:-$ROOT_DIR/android-build/app-release-signed.apk}"

if [ ! -f "$APK_PATH" ]; then
  echo "❌ APK introuvable à : $APK_PATH"
  echo "   Lance d'abord ./scripts/build-apk.sh, ou précise le chemin :"
  echo "   ./scripts/install-on-phone.sh /chemin/vers/app-release-signed.apk"
  exit 1
fi

echo "=== ClimClose — Installation sur le téléphone ==="
echo ""

if command -v adb >/dev/null 2>&1; then
  echo "Méthode A : câble USB (adb détecté)"
  echo ""
  echo "1. Branche ton téléphone Android en USB"
  echo "2. Sur le téléphone : Paramètres > À propos > tape 7 fois sur 'Numéro de build'"
  echo "   pour activer le mode développeur, puis Paramètres > Options développeur >"
  echo "   active 'Débogage USB'"
  echo "3. Une fenêtre va apparaître SUR TON TÉLÉPHONE demandant d'autoriser ce PC"
  echo "   → accepte-la"
  echo ""
  read -p "Appuie sur Entrée une fois le téléphone branché et le débogage USB activé…" _
  adb devices
  echo ""
  echo ">> Installation en cours…"
  adb install -r "$APK_PATH"
  echo ""
  echo "✅ Installation lancée. Si Android affiche une demande 'Autoriser l'installation ?'"
  echo "   directement sur le téléphone, accepte-la. L'icône ClimClose apparaîtra ensuite"
  echo "   dans le tiroir d'applications."
else
  echo "adb n'est pas installé sur cet ordinateur — méthode B (transfert manuel) :"
  echo ""
  echo "1. Envoie-toi le fichier suivant par e-mail, Drive, ou câble USB (glisser-déposer) :"
  echo "   $APK_PATH"
  echo "2. Sur le téléphone, ouvre le fichier depuis l'app Fichiers / Téléchargements"
  echo "3. Android va demander d'autoriser l'installation depuis cette source"
  echo "   (réglage de sécurité 'Sources inconnues') → accepte"
  echo "4. Appuie sur 'Installer'"
  echo ""
  echo "Astuce : pour activer adb et utiliser la méthode A la prochaine fois, installe"
  echo "'Android Platform Tools' : https://developer.android.com/tools/releases/platform-tools"
fi
