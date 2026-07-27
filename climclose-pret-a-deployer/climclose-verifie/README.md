# ClimClose — MVP local de test

Application web (PWA) pour trouver un climatiseur portable **en stock**, près de soi,
avec carte interactive, filtres, réservation click & collect, alertes stock et
signalement communautaire.

## ⚡ Installation rapide sur ton téléphone (3 scripts)

Si tu veux juste avoir l'app installée sur ton Android le plus vite possible, à lancer
**sur ton ordinateur** (Mac/Linux/Windows+WSL), dans l'ordre :

```bash
cd climclose
chmod +x scripts/*.sh

./scripts/deploy.sh          # met le site en ligne (Vercel + Railway)
./scripts/build-apk.sh       # génère le fichier .apk signé
./scripts/install-on-phone.sh # l'installe sur ton téléphone (câble USB) ou te guide
```

Chaque script s'arrête et te demande d'**autoriser** quand c'est nécessaire :
connexion Vercel/Railway dans le navigateur, installation du JDK/Android SDK par
Bubblewrap, autorisation du débogage USB puis de l'installation sur le téléphone.
En dehors de ces validations, tout s'enchaîne automatiquement.

**Prérequis sur l'ordinateur** : Node.js (https://nodejs.org). Comptez 15-20 minutes
la première fois (téléchargement du SDK Android inclus). Comptes gratuits nécessaires :
Vercel et Railway (créés à la volée lors du premier `deploy.sh`).

Le détail de chaque étape, ce que fait chaque script, et la procédure manuelle
(sans script) sont expliqués section par section ci-dessous.

---

## Sommaire — installation locale (Docker) pour tester avant de déployer

Ce dossier est un **MVP fonctionnel** pensé pour tourner en local via Docker, avec des
**données de stock fictives** (seed autour de Paris) — voir la section "Limites" plus bas.

---

## 1. Prérequis

- Docker + Docker Compose installés (`docker --version`, `docker compose version`)
- Ports libres sur la machine : `3000` (frontend), `4000` (backend API), `5432` (Postgres)

## 2. Démarrage

```bash
cd climclose
docker compose up --build
```

Premier lancement : le service `db` exécute automatiquement `db/init.sql`
(schéma PostGIS + données de démo). Comptez 30 à 90 secondes pour le premier build.

Une fois les logs stabilisés :

- **Frontend (PWA)** : http://localhost:3000
- **API backend** : http://localhost:4000/api/health

Ouvrez http://localhost:3000 sur votre téléphone (même réseau Wi-Fi que la machine,
remplacez `localhost` par l'IP locale de votre machine, ex: `http://192.168.1.20:3000`)
pour tester l'installation PWA ("Ajouter à l'écran d'accueil").

Autorisez la géolocalisation quand le navigateur le demande — sinon l'app retombe
sur une position par défaut (Paris) pour que la démo reste utilisable.

## 3. Arrêter / réinitialiser

```bash
docker compose down          # arrête les conteneurs
docker compose down -v       # arrête ET supprime les données de la base (reset complet)
```

## 4. Structure du projet

```
climclose/
├── docker-compose.yml
├── db/
│   └── init.sql          # schéma PostGIS + données de démo (stores, produits, stocks)
├── backend/               # API Node.js/Express
│   └── src/index.js       # endpoints /api/search, /api/reports, /api/alerts
└── frontend/               # PWA React (Vite)
    └── src/App.jsx         # UI complète (liste, carte, filtres, alertes)
```

## 5. Ce qui est réellement implémenté

- Recherche géospatiale par rayon (PostGIS `ST_DWithin`)
- Filtres : rayon, marque, tri (distance / prix / BTU / surface / marque)
- Score de confiance décroissant dans le temps selon la source (API vs scraping vs
  communauté) — les stocks trop anciens ou peu fiables sont automatiquement masqués
- Carte interactive (MapLibre GL, open-source, sans clé API)
- Boutons "M'y rendre" (Google Maps / Waze) et "Réserver" (deep-link vers le site du
  revendeur)
- Signalement communautaire (stock confirmé / dernière unité / rupture) qui ajuste le
  score de confiance en temps réel
- Formulaire d'alerte stock (enregistré en base ; l'envoi d'email réel n'est **pas**
  câblé dans ce MVP, voir limites)
- PWA installable : manifest, service worker (cache de l'app shell, jamais des données
  de stock, toujours fraîches)

## 6. Générer une vraie APK Android (installable directement sur ton téléphone)

> 💡 Les 4 étapes ci-dessous sont exactement ce que font `scripts/deploy.sh`,
> `scripts/build-apk.sh` et `scripts/install-on-phone.sh` automatiquement (voir tout
> en haut de ce fichier). Cette section détaille ce qui se passe si tu préfères le
> faire à la main, ou si un script échoue et que tu dois reprendre une étape toi-même.

Le frontend est déjà prêt pour ça : icônes PNG 192/512/maskable dans
`frontend/public/icons/`, manifest complet (`id`, `scope`, `display_override`),
et un template `frontend/public/.well-known/assetlinks.json`.

Ce que fait une APK générée ainsi : c'est une **TWA (Trusted Web Activity)**, un
conteneur Android natif et installable qui affiche ton PWA en plein écran, sans
barre de navigateur. Google utilise exactement cette technique pour la plupart
des PWA du Play Store.

**Étape A — Mettre le site en ligne publiquement (HTTPS obligatoire)**

L'outil de génération doit pouvoir accéder à ton site depuis Internet — `localhost`
ne suffit pas.

- **Backend** : déploie `backend/` sur [Railway](https://railway.app) ou
  [Render](https://render.com) (gratuit pour tester), avec une base Postgres/PostGIS
  managée (Railway propose un plugin Postgres, sinon utilise
  [Supabase](https://supabase.com) qui inclut PostGIS). Note l'URL publique obtenue,
  ex : `https://climclose-api.up.railway.app`.
- **Frontend** : déploie `frontend/` sur [Vercel](https://vercel.com) ou
  [Netlify](https://netlify.com) (glisser-déposer le dossier ou connecter un repo Git).
  Renseigne la variable de build `VITE_API_URL` avec l'URL de ton backend ci-dessus.
  Tu obtiens une URL du type `https://climclose.vercel.app`.

**Étape B — Générer l'APK sur PWABuilder**

1. Va sur **[pwabuilder.com](https://www.pwabuilder.com)**
2. Colle l'URL HTTPS de ton frontend déployé → clique "Start"
3. PWABuilder analyse le manifest et le service worker (déjà conformes) et affiche
   un score — vérifie qu'il n'y a pas d'erreur bloquante
4. Onglet **Android** → "Generate Package" → choisis **TWA (Trusted Web Activity)**
5. Télécharge le `.zip` généré : il contient le fichier **`.apk`** (ou `.aab`) ainsi
   qu'un fichier `signing-key-info.txt` contenant l'**empreinte SHA256** de la
   signature générée automatiquement pour toi

**Étape C — Relier l'APK à ton site (Digital Asset Links)**

Sans cette étape, l'APK s'installe et fonctionne quand même, mais affiche une fine
barre d'adresse en haut (mode "navigateur") au lieu du plein écran natif.

1. Ouvre `signing-key-info.txt` et copie la valeur `sha256_cert_fingerprints`
2. Remplace la valeur dans `frontend/public/.well-known/assetlinks.json` par cette
   empreinte, et `package_name` par celui indiqué par PWABuilder (visible dans le
   même fichier ou dans les options avancées de génération)
3. Redéploie le frontend (Vercel/Netlify redéploiera automatiquement au prochain push)
4. Vérifie que `https://ton-domaine.vercel.app/.well-known/assetlinks.json` répond
   bien en JSON dans un navigateur

**Étape D — Installer l'APK sur ton téléphone**

1. Transfère le fichier `.apk` sur ton téléphone (câble USB, e-mail à toi-même,
   Google Drive, etc.)
2. Ouvre le fichier depuis le gestionnaire de fichiers du téléphone
3. Android demandera d'autoriser l'installation depuis "cette source" (paramètre
   de sécurité "Sources inconnues") — accepte, puis installe
4. L'icône ClimClose apparaît dans le tiroir d'applications comme une app native

## 7. Limites de ce MVP (à ne pas oublier avant toute mise en prod)

- **Les données de stock sont fictives** (seed SQL). Aucune connexion réelle à
  Boulanger/Darty/Leroy Merlin n'est faite — il faudra brancher les vraies APIs
  partenaires ou un module de scraping (voir le plan d'architecture fourni séparément).
- **Les alertes ne partent pas réellement** (pas de service d'e-mail/push configuré) —
  seul l'enregistrement en base est fait, à brancher sur un fournisseur (Resend,
  SendGrid, Firebase Cloud Messaging…).
- **Aucune authentification** — les signalements communautaires sont anonymes, ce qui
  facilite les abus en production (prévoir un minimum de rate-limiting/captcha).
- Le fichier `.well-known/assetlinks.json` contient une empreinte SHA256 factice
  (`REMPLACER_PAR_...`) — tant qu'elle n'est pas remplacée par la vraie empreinte de
  ta clé de signature (étape C ci-dessus), l'APK fonctionne mais s'ouvre en mode
  "navigateur" plutôt qu'en plein écran natif.
- Publier sur le **Play Store** (par opposition à une simple installation manuelle)
  demanderait en plus : un compte développeur Google Play (25 $, paiement unique),
  une politique de confidentialité publique, et le remplissage des fiches de
  contenu — non nécessaire pour une installation directe comme demandé ici.
- Configuration Docker pensée pour le **test local**, pas pour la production
  (pas de HTTPS, pas de secrets management — voir le guide de déploiement fourni
  séparément pour la mise en ligne réelle sur Vercel/Railway/Supabase).
