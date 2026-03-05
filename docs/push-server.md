# Serveur Push Infravet

Serveur de notifications push centralise pour toutes les PWA cliniques.
Heberge sur OVH, sert toutes les instances `*.infravet.com`.

## Stack

- Node.js 20+
- Express
- `web-push` (npm)
- SQLite (simple) ou MySQL/PostgreSQL (si volume important)

## Installation

```bash
mkdir infravet-push && cd infravet-push
npm init -y
npm install express web-push better-sqlite3 cors helmet
```

## Generer les cles VAPID (une seule fois)

```bash
npx web-push generate-vapid-keys
```

Resultat :
```
Public Key:  BEl62iUYgU...
Private Key: 4k8Rq3Gj...
```

Stocker dans `.env` :
```env
VAPID_PUBLIC_KEY=BEl62iUYgU...
VAPID_PRIVATE_KEY=4k8Rq3Gj...
VAPID_SUBJECT=mailto:contact@infravet.com
PORT=3200
```

## Structure du projet

```
infravet-push/
  .env
  server.js
  db.js
  package.json
```

## db.js — Base SQLite

```javascript
var Database = require('better-sqlite3');
var db = new Database('./push-subscriptions.db');

db.exec(
  'CREATE TABLE IF NOT EXISTS subscriptions (' +
  '  id INTEGER PRIMARY KEY AUTOINCREMENT,' +
  '  clinic_id TEXT NOT NULL,' +
  '  user_id TEXT NOT NULL,' +
  '  endpoint TEXT NOT NULL UNIQUE,' +
  '  keys_p256dh TEXT NOT NULL,' +
  '  keys_auth TEXT NOT NULL,' +
  '  created_at TEXT DEFAULT CURRENT_TIMESTAMP' +
  ')'
);

db.exec(
  'CREATE INDEX IF NOT EXISTS idx_clinic_user ON subscriptions(clinic_id, user_id)'
);

module.exports = {
  addSubscription: function (clinicId, userId, subscription) {
    var stmt = db.prepare(
      'INSERT OR REPLACE INTO subscriptions (clinic_id, user_id, endpoint, keys_p256dh, keys_auth) ' +
      'VALUES (?, ?, ?, ?, ?)'
    );
    stmt.run(clinicId, userId, subscription.endpoint, subscription.keys.p256dh, subscription.keys.auth);
  },

  removeSubscription: function (endpoint) {
    db.prepare('DELETE FROM subscriptions WHERE endpoint = ?').run(endpoint);
  },

  getSubscriptions: function (clinicId, userId) {
    return db.prepare(
      'SELECT endpoint, keys_p256dh, keys_auth FROM subscriptions WHERE clinic_id = ? AND user_id = ?'
    ).all(clinicId, userId);
  },

  getClinicSubscriptions: function (clinicId) {
    return db.prepare(
      'SELECT endpoint, keys_p256dh, keys_auth FROM subscriptions WHERE clinic_id = ?'
    ).all(clinicId);
  }
};
```

## server.js — Serveur Express

```javascript
require('dotenv').config();
var express = require('express');
var webpush = require('web-push');
var cors = require('cors');
var helmet = require('helmet');
var db = require('./db');

var app = express();

app.use(helmet());
app.use(cors({ origin: /\.infravet\.com$/ }));
app.use(express.json());

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// Cle API simple pour securiser les appels depuis le backend metier
var API_KEY = process.env.API_KEY || 'changeme';

function requireApiKey(req, res, next) {
  var key = req.headers['x-api-key'];
  if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
  next();
}

// --- Routes publiques (appelees par les PWA) ---

// Enregistrer un abonnement push
app.post('/subscribe', function (req, res) {
  var clinicId = req.body.clinicId;
  var userId = req.body.userId;
  var subscription = req.body.subscription;

  if (!clinicId || !userId || !subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'clinicId, userId et subscription requis' });
  }

  db.addSubscription(clinicId, userId, subscription);
  res.json({ success: true });
});

// Supprimer un abonnement
app.delete('/unsubscribe', function (req, res) {
  var endpoint = req.body.endpoint;
  if (!endpoint) return res.status(400).json({ error: 'endpoint requis' });

  db.removeSubscription(endpoint);
  res.json({ success: true });
});

// --- Routes protegees (appelees par le backend metier) ---

// Envoyer une notification a un utilisateur
app.post('/send', requireApiKey, function (req, res) {
  var clinicId = req.body.clinicId;
  var userId = req.body.userId;
  var payload = req.body.payload;

  if (!clinicId || !userId || !payload) {
    return res.status(400).json({ error: 'clinicId, userId et payload requis' });
  }

  var subs = db.getSubscriptions(clinicId, userId);
  var payloadStr = JSON.stringify(payload);
  var results = { sent: 0, failed: 0 };

  var promises = subs.map(function (sub) {
    var pushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth }
    };

    return webpush.sendNotification(pushSub, payloadStr)
      .then(function () { results.sent++; })
      .catch(function (err) {
        results.failed++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          db.removeSubscription(sub.endpoint);
        }
      });
  });

  Promise.all(promises).then(function () {
    res.json(results);
  });
});

// Broadcast a toute une clinique
app.post('/broadcast', requireApiKey, function (req, res) {
  var clinicId = req.body.clinicId;
  var payload = req.body.payload;

  if (!clinicId || !payload) {
    return res.status(400).json({ error: 'clinicId et payload requis' });
  }

  var subs = db.getClinicSubscriptions(clinicId);
  var payloadStr = JSON.stringify(payload);
  var results = { sent: 0, failed: 0 };

  var promises = subs.map(function (sub) {
    var pushSub = {
      endpoint: sub.endpoint,
      keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth }
    };

    return webpush.sendNotification(pushSub, payloadStr)
      .then(function () { results.sent++; })
      .catch(function (err) {
        results.failed++;
        if (err.statusCode === 410 || err.statusCode === 404) {
          db.removeSubscription(sub.endpoint);
        }
      });
  });

  Promise.all(promises).then(function () {
    res.json(results);
  });
});

// Health check
app.get('/health', function (req, res) {
  res.json({ status: 'ok' });
});

var PORT = process.env.PORT || 3200;
app.listen(PORT, function () {
  console.log('[Push] Serveur push actif sur le port ' + PORT);
});
```

## Deploiement OVH

### Option A : VPS (recommande)

```bash
# Sur le VPS OVH
sudo apt update && sudo apt install -y nodejs npm
git clone <repo> /opt/infravet-push
cd /opt/infravet-push
npm install --production
cp .env.example .env
# Editer .env avec les cles VAPID
```

Service systemd `/etc/systemd/system/infravet-push.service` :
```ini
[Unit]
Description=Infravet Push Server
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/infravet-push
ExecStart=/usr/bin/node server.js
Restart=on-failure
EnvironmentFile=/opt/infravet-push/.env

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable infravet-push
sudo systemctl start infravet-push
```

### Nginx reverse proxy

```nginx
server {
    listen 443 ssl;
    server_name push.infravet.com;

    ssl_certificate /etc/letsencrypt/live/push.infravet.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/push.infravet.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3200;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

```bash
sudo certbot --nginx -d push.infravet.com
```

## Utilisation depuis le backend metier

```bash
# Notifier un utilisateur
curl -X POST https://push.infravet.com/send \
  -H "Content-Type: application/json" \
  -H "X-API-Key: votre-cle-api" \
  -d '{
    "clinicId": "clinique-des-lilas",
    "userId": "user-123",
    "payload": {
      "title": "Rappel RDV",
      "body": "RDV pour Rex demain a 14h30",
      "url": "/appointments"
    }
  }'

# Broadcast a toute la clinique
curl -X POST https://push.infravet.com/broadcast \
  -H "Content-Type: application/json" \
  -H "X-API-Key: votre-cle-api" \
  -d '{
    "clinicId": "clinique-des-lilas",
    "payload": {
      "title": "Fermeture exceptionnelle",
      "body": "La clinique sera fermee le 25 decembre"
    }
  }'
```

## Cote PWA — integration

La cle publique VAPID est servie par `/clinic/info` dans la reponse API.
Le fichier `js/notifications.js` gere deja l'abonnement push.
Il suffit de configurer `VAPID_PUBLIC_KEY` et `PUSH_ENDPOINT` dans `js/config.js`.

## Securite

- `X-API-Key` sur les routes `/send` et `/broadcast` (backend → push uniquement)
- CORS restreint a `*.infravet.com`
- HTTPS obligatoire (Let's Encrypt)
- Les subscriptions expirees (410/404) sont nettoyees automatiquement
- Pas de donnees sensibles stockees (seulement les endpoints push)
