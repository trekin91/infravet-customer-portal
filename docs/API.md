# API Infravet — Espace Client

`https://{clinique}.infravet.fr/api/v1`

Session par cookie httpOnly. Routes 🔒 = session requise, sinon `401`.

---

## Clinique

### `GET /clinic/info`
Infos publiques (splash + header).
```json
{ "name": "...", "phone": "...", "address": "...", "openingHours": "...", "logoUrl": null }
```

---

## Auth

### `POST /auth/send-otp`
```json
{ "phone": "+33600000000" }
```
`200` → `{ "message": "OTP envoyé", "expires_in": 300 }`
`404` → numéro inconnu

### `POST /auth/verify-otp`
```json
{ "phone": "+33600000000", "code": "123456" }
```
`200` → `{ "client": { id, firstName, lastName, phone, email, clinic } }`
`400` → code invalide

### `GET /auth/me` 🔒
`200` → `{ id, firstName, lastName, phone, email, address, clinic }`
`401` → session expirée

### `POST /auth/logout` 🔒
`200` → `{ "message": "Déconnexion réussie" }`

---

## Profil

### `GET /client/profile` 🔒
Même structure que `/auth/me`.

### `PUT /client/profile` 🔒
Body : `{ email?, address? { street, zipCode, city } }`
`200` → profil complet mis à jour

### `GET /client/notifications/settings` 🔒
```json
{ "appointmentReminders": true, "vaccineReminders": true, "documentNotifications": true, "smsEnabled": true, "pushEnabled": true }
```

### `PUT /client/notifications/settings` 🔒
Body : mêmes champs (partiels). `200` → settings complets.

---

## Dashboard

### `GET /dashboard/summary` 🔒
```json
{
  "clientName": "Marie",
  "clinicName": "Clinique Vétérinaire des Lilas",
  "nextAppointment": { id, animalName, dateTime, type, veterinarian } | null,
  "animals": [{ id, name, species, ... }],
  "notifications": [{ id, type, title, message, date, read }],
  "upcomingAppointments": [...]
}
```

---

## Animaux

### `GET /animals` 🔒
```json
{ "animals": [{ id, name, species, breed, sex, birthDate, weight, color, microchipNumber, sterilized, photoUrl }] }
```

### `GET /animals/:id` 🔒
`200` → `{ "animal": { ... } }` | `404`

### `GET /animals/:id/consultations` 🔒
Tri : date décroissante.
```json
{ "consultations": [{ id, animalId, date, type, veterinarian, reason, diagnosis, notes, weight, temperature }] }
```
Types : Consultation, Vaccination, Urgence, Contrôle

### `GET /animals/:id/vaccinations` 🔒
```json
{ "vaccinations": [{ id, animalId, name, date, nextDueDate, veterinarian, batchNumber, status }] }
```
Status : `valid` | `overdue` | `upcoming`

### `GET /animals/:id/treatments` 🔒
Tri : date décroissante.
```json
{ "treatments": [{ id, animalId, name, type, prescribedDate, duration, dosage, instructions, veterinarian, status }] }
```
Status : `active` | `completed`

---

## Rendez-vous

### `GET /appointments` 🔒
Query : `?status=upcoming` (défaut) ou `?status=past`
Tri : upcoming → croissant, past → décroissant.
```json
{ "appointments": [{ id, animalId, animalName, dateTime, duration, type, reason, veterinarian, status, clinicAddress }] }
```
Status : `pending` | `confirmed` | `completed` | `cancelled`

### `GET /appointments/:id` 🔒
`200` → `{ "appointment": { ... } }` | `404`

### `POST /appointments/:id/cancel` 🔒
Body : `{ "reason": "..." }`
`200` → `{ "message": "RDV annulé" }` | `404`

---

## Documents

### `GET /documents` 🔒
Query : `?type=lab|prescription|certificate|report` (optionnel)
Tri : date décroissante.
```json
{ "documents": [{ id, animalId, animalName, title, type, date, fileType, fileSize }] }
```

### `GET /documents/:id/download` 🔒
`200` → `{ "downloadUrl": "https://..." }`

---

## Push

### `POST /push/subscribe` 🔒
Body : `PushSubscription.toJSON()` → `200`

### `POST /push/unsubscribe` 🔒
Body : `{ "endpoint": "..." }` → `200`

---

## Erreurs

| Status | Description |
|--------|-------------|
| 400 | Requête invalide |
| 401 | Non authentifié |
| 404 | Non trouvé |
| 500 | Erreur serveur |

Format : `{ "message": "..." }`

---

## Notes

- **1 instance = 1 clinique** (`{clinique}.infravet.fr/client`), contexte implicite
- **Session** : cookie httpOnly + secure + sameSite=strict, front envoie `credentials: 'include'`
- **Dates** : ISO 8601 — `YYYY-MM-DD` ou `YYYY-MM-DDTHH:MM:SS`
- **Tri** : serveur retourne les listes triées
- **Pagination** : v2 (`?page=1&limit=20`)
