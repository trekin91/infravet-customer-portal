# Infravet - PWA Espace Client

PWA permettant aux clients d'une clinique veterinaire de suivre le dossier sante de leurs animaux, rendez-vous, documents et vaccinations. Se connecte a l'API REST du logiciel Infravet.

**Stack :** HTML / CSS / JavaScript vanilla — aucun build tool, aucun framework.

---

## Installation et lancement

```bash
# Cloner le projet
git clone <repo-url>
cd infravet-pwa

# Lancer un serveur local (au choix)
python -m http.server 8000
# ou
npx serve .
# ou utiliser Live Server dans VSCode
```

Ouvrir `http://localhost:8000`

### Identifiants mock (dev)

| Champ | Valeur |
|-------|--------|
| Telephone | `0600000000` |
| Code OTP | `123456` |

---

## Configuration

Fichier : `js/config.js`

| Parametre | Description | Defaut dev | Defaut prod |
|-----------|-------------|------------|-------------|
| `API_BASE_URL` | URL de base de l'API REST | `http://localhost:8080/api/v1` | `https://api.infravet.com/v1` |
| `OTP_LENGTH` | Nombre de chiffres du code OTP | 6 | 6 |
| `OTP_RESEND_DELAY_SECONDS` | Delai avant renvoi OTP (secondes) | 60 | 60 |
| `VAPID_PUBLIC_KEY` | Cle publique VAPID pour push notifications | `''` (desactive) | A configurer |
| `TOAST_DURATION_MS` | Duree d'affichage des toasts (ms) | 4000 | 4000 |
| `FEATURES.MOCK_API` | Active le serveur mock | `true` | `false` |
| `FEATURES.PUSH_NOTIFICATIONS` | Active les notifications push | `false` | `true` |
| `FEATURES.DEBUG_LOG` | Active les logs console | `true` | `false` |

### Override runtime

Ajouter avant les scripts dans `index.html` :

```html
<script>
    window.INFRAVET_CONFIG = {
        API_BASE_URL: 'https://custom-api.example.com/v1'
    };
</script>
```

---

## Architecture

### Structure des fichiers

```
infravet-pwa/
├── index.html              # SPA shell unique (toutes les sections)
├── manifest.json           # Manifest PWA
├── sw.js                   # Service worker
├── assets/                 # Images, icones, logo
├── css/
│   ├── variables.css       # Design tokens (couleurs, typo, spacing)
│   ├── reset.css           # CSS reset
│   ├── base.css            # Styles globaux
│   ├── layout.css          # Shell (header, content, navbar)
│   ├── components.css      # Composants reutilisables
│   └── [page].css          # Styles par page
├── js/
│   ├── config.js           # Configuration
│   ├── utils.js            # Helpers (DOM, dates, validation)
│   ├── api.js              # Couche API (fetch wrapper)
│   ├── auth.js             # Authentification
│   ├── router.js           # Navigation par tabs
│   ├── notifications.js    # Push notifications
│   ├── app.js              # Boot sequence
│   └── pages/              # Un fichier IIFE par page
├── docs/                   # Documentation
└── mocks/                  # Serveur mock + donnees
```

### Pattern IIFE

Chaque module JS est une IIFE (Immediately Invoked Function Expression) qui expose un objet global :

```javascript
var MonModule = (function () {
    'use strict';
    // Code prive
    function init() { /* ... */ }
    return { init: init }; // API publique
})();
```

### Ordre de chargement (critique)

Les scripts sont charges dans cet ordre dans `index.html` :

1. `mocks/mock-server.js` (intercepte fetch avant tout)
2. `js/config.js`
3. `js/utils.js`
4. `js/api.js` (depend de config)
5. `js/auth.js` (depend de api, utils)
6. `js/router.js` (depend de utils)
7. `js/notifications.js`
8. `js/pages/*.js` (dependent de api, utils, router)
9. `js/app.js` (orchestrateur, charge en dernier)

### Cycle de vie des pages

```
Router.onPageInit('pageName', function(params) {
    // Appele chaque fois que la page devient active
    // Charger les donnees ici
});

Router.onPageDestroy('pageName', function() {
    // Appele quand la page est masquee
    // Nettoyage (intervals, etc.)
});
```

### Navigation

- **5 onglets principaux** : Accueil, Animaux, RDV, Documents, Profil
- **Drill-down** : `Router.pushPage('animal-detail', { animalId: '...' })` → bouton retour → `Router.goBack()`
- Les onglets de la navbar font un `Router.navigate()` (reset de la pile)

---

## Authentification et session

### Cookie httpOnly

La session est geree par un cookie `httpOnly` set par l'API. Le front **n'a jamais acces au token**.

### Flow

```
Ouverture app
    ↓
GET /auth/me (credentials: include)
    ├─ 200 → Afficher app
    └─ 401 → Ecran auth
                ↓
         Saisie telephone
                ↓
         POST /auth/send-otp { phone }
            ├─ 404 → "Aucun compte trouve"
            └─ 200 → Ecran OTP
                        ↓
                  POST /auth/verify-otp { phone, code }
                     ├─ 400 → "Code incorrect"
                     └─ 200 + Set-Cookie → Afficher app

Logout : POST /auth/logout → Cookie supprime → Ecran auth
```

### Configuration API requise

L'API doit :

1. **Set-Cookie** sur la reponse de `/auth/verify-otp` :
```
Set-Cookie: session=<jwt>; HttpOnly; Secure; SameSite=Strict; Max-Age=86400; Path=/
```

2. **CORS** (si domaines differents) :
```
Access-Control-Allow-Origin: https://app.infravet.com (explicite, pas *)
Access-Control-Allow-Credentials: true
Access-Control-Allow-Headers: Content-Type, Accept
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
```

3. **Domaine** (recommande) : meme domaine parent (`app.infravet.com` + `api.infravet.com`)

---

## API — Contrat d'interface

Toutes les requetes utilisent `credentials: 'include'` pour envoyer le cookie de session.

### Authentification

| Methode | Endpoint | Body | Reponse 200 |
|---------|----------|------|-------------|
| POST | `/auth/send-otp` | `{ "phone": "+33612345678" }` | `{ "message": "OTP envoye", "expires_in": 300 }` |
| POST | `/auth/verify-otp` | `{ "phone": "+33612345678", "code": "123456" }` | `{ "client": { ... } }` + Set-Cookie |
| GET | `/auth/me` | — | `{ "id", "firstName", "lastName", "phone", "email", "address", "clinic" }` |
| POST | `/auth/logout` | — | `{ "message": "OK" }` + Clear-Cookie |

### Client

| Methode | Endpoint | Reponse 200 |
|---------|----------|-------------|
| GET | `/client/profile` | `{ "id", "firstName", "lastName", "phone", "email", "address": {...}, "clinic": {...} }` |
| PUT | `/client/profile` | Meme format |

### Dashboard

| Methode | Endpoint | Reponse 200 |
|---------|----------|-------------|
| GET | `/dashboard/summary` | `{ "clientName", "nextAppointment": {...}, "animals": [...], "notifications": [...] }` |

### Animaux

| Methode | Endpoint | Reponse 200 |
|---------|----------|-------------|
| GET | `/animals` | `{ "animals": [{ "id", "name", "species", "breed", "sex", "birthDate", "weight", "color", "microchipNumber", "sterilized", "photoUrl" }] }` |
| GET | `/animals/:id` | `{ "animal": {...} }` |
| GET | `/animals/:id/consultations` | `{ "consultations": [{ "id", "date", "type", "veterinarian", "reason", "diagnosis", "notes", "weight", "temperature" }] }` |
| GET | `/animals/:id/vaccinations` | `{ "vaccinations": [{ "id", "name", "date", "nextDueDate", "veterinarian", "batchNumber", "status" }] }` |
| GET | `/animals/:id/treatments` | `{ "treatments": [{ "id", "name", "type", "prescribedDate", "duration", "dosage", "instructions", "veterinarian", "status" }] }` |

### Rendez-vous

| Methode | Endpoint | Params | Reponse 200 |
|---------|----------|--------|-------------|
| GET | `/appointments` | `?status=upcoming\|past` | `{ "appointments": [{ "id", "animalId", "animalName", "dateTime", "duration", "type", "reason", "veterinarian", "status", "clinicAddress" }] }` |
| GET | `/appointments/:id` | — | `{ "appointment": {...} }` |
| POST | `/appointments/:id/cancel` | `{ "reason": "..." }` | `{ "message": "OK" }` |

### Documents

| Methode | Endpoint | Params | Reponse 200 |
|---------|----------|--------|-------------|
| GET | `/documents` | `?type=lab\|prescription\|certificate\|report` | `{ "documents": [{ "id", "animalId", "animalName", "title", "type", "date", "fileType", "fileSize" }] }` |
| GET | `/documents/:id/download` | — | `{ "downloadUrl": "https://..." }` |

### Push Notifications

| Methode | Endpoint | Body | Reponse 200 |
|---------|----------|------|-------------|
| POST | `/push/subscribe` | Objet PushSubscription | `{ "message": "OK" }` |
| POST | `/push/unsubscribe` | `{ "endpoint": "..." }` | `{ "message": "OK" }` |

### Codes d'erreur

| Code | Signification |
|------|---------------|
| 400 | Requete invalide (ex: code OTP incorrect) |
| 401 | Non authentifie / session expiree |
| 404 | Ressource non trouvee (ex: pas de compte pour ce telephone) |
| 500 | Erreur serveur |

Format erreur : `{ "message": "Description lisible", "error": "code_erreur" }`

---

## Mock server

### Activer / desactiver

Le mock server est charge via `<script src="mocks/mock-server.js">` dans `index.html`. Pour le desactiver, supprimer ou commenter cette ligne.

Il est automatiquement actif quand `InfravetConfig.FEATURES.MOCK_API` est `true` (par defaut en dev).

### Donnees mock

Fichiers JSON dans `mocks/data/` :
- `client.json` — Profil client
- `animals.json` — 3 animaux (chat, chien, lapin)
- `consultations.json` — Historique consultations
- `vaccinations.json` — Vaccinations (valides + en retard)
- `treatments.json` — Traitements termines
- `appointments.json` — RDV a venir + passes
- `documents.json` — Documents varies
- `notifications.json` — Notifications

### Ajouter une route mock

Dans `mocks/mock-server.js`, dans la fonction `_setupRoutes()` :

```javascript
_addRoute('GET', '/my-endpoint/:id', function (params, body, searchParams) {
    // params[0] = valeur de :id
    // body = corps JSON de la requete (POST/PUT)
    // searchParams = URLSearchParams
    return _respond({ data: '...' }, 200);
});
```

---

## PWA

### manifest.json

Champs principaux a personnaliser :
- `name` / `short_name` : Nom affiche
- `theme_color` : Couleur barre de statut
- `start_url` : URL de demarrage
- `icons` : Remplacer les placeholders par les vraies icones

### Service worker

**Strategie :** Cache-first pour les assets statiques, network-only pour les appels API.

**Mise a jour :** Incrementer `CACHE_NAME` dans `sw.js` (ex: `infravet-shell-v2`). L'ancien cache est automatiquement purge.

### Push notifications

1. Configurer `VAPID_PUBLIC_KEY` dans `config.js`
2. Activer `FEATURES.PUSH_NOTIFICATIONS`
3. L'API doit envoyer les push avec le format :
```json
{
    "title": "Rappel RDV",
    "body": "RDV pour Rex demain a 14h30",
    "tag": "appointment-reminder",
    "url": "/appointments"
}
```

### Icones requises

| Taille | Fichier |
|--------|---------|
| 72x72 | `assets/icons/icon-72x72.png` |
| 96x96 | `assets/icons/icon-96x96.png` |
| 128x128 | `assets/icons/icon-128x128.png` |
| 144x144 | `assets/icons/icon-144x144.png` |
| 192x192 | `assets/icons/icon-192x192.png` |
| 384x384 | `assets/icons/icon-384x384.png` |
| 512x512 | `assets/icons/icon-512x512.png` |
| 180x180 | `assets/icons/apple-touch-icon.png` |

---

## Deploiement

Copier l'integralite du dossier sur un serveur statique (Nginx, Apache, S3, Netlify, Vercel, etc.).

### Checklist deploiement

- [ ] HTTPS obligatoire (requis pour le service worker et les cookies Secure)
- [ ] Configurer `API_BASE_URL` en prod dans `config.js`
- [ ] Desactiver `FEATURES.MOCK_API`
- [ ] Activer `FEATURES.PUSH_NOTIFICATIONS` et configurer `VAPID_PUBLIC_KEY`
- [ ] Configurer CORS sur l'API (`Allow-Credentials`, `Allow-Origin` explicite)
- [ ] Remplacer les icones placeholder par les vraies icones
- [ ] Remplacer le logo SVG placeholder
- [ ] Supprimer ou commenter la balise `<script src="mocks/mock-server.js">` dans `index.html`

---

## Personnalisation

### Couleurs

Modifier `css/variables.css` :

```css
:root {
    --color-primary: #1B3A4B;       /* Texte principal, headers */
    --color-accent: #5BC0BE;        /* Boutons, elements actifs */
    --color-bg: #F5F7FA;            /* Fond de page */
    --color-surface: #FFFFFF;       /* Fond des cards */
}
```

### Logo

Remplacer les fichiers dans `assets/logo/` par le logo reel. Le SVG est utilise dans le header et l'ecran d'auth.

### Ajouter une page

1. Ajouter une `<section id="page-mapage" class="page" data-page="mapage">` dans `index.html`
2. Creer `css/mapage.css` et l'inclure dans `index.html`
3. Creer `js/pages/mapage.js` avec une IIFE qui expose `{ init }`
4. Dans `init()`, appeler `Router.onPageInit('mapage', callback)`
5. Ajouter le script dans `index.html` (avant `app.js`)
6. Appeler `MaPage.init()` dans `App._initAllPages()`
7. Ajouter le chemin dans `SHELL_FILES` de `sw.js`

### Ajouter un endpoint API

1. Ajouter la methode dans `js/api.js` dans le namespace approprie
2. Ajouter la route mock dans `mocks/mock-server.js` → `_setupRoutes()`
3. Utiliser dans la page : `API.namespace.method().then(...)`
