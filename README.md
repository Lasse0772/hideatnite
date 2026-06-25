# Hide @ Nite

GPS-basiertes Fahrrad-Fangen als PWA.

## Voraussetzungen
- Docker & Docker Compose
- Domain / Subdomain (z. B. `hideatnite.deinedomaein.de`)
- HTTPS (GPS im Browser braucht HTTPS!)

## Deployment

### 1. Projekt auf den Server kopieren
```bash
scp -r hideatnite/ user@deinserver:~/hideatnite
```

### 2. .env anlegen
```bash
cd hideatnite
cp .env.example .env
# SECRET_KEY auf einen langen zufälligen String setzen:
# openssl rand -hex 32
nano .env
```

### 3. nginx.conf anpassen
Trage deine Subdomain ein und aktiviere HTTPS wenn du ein Zertifikat hast.
Für Let's Encrypt mit Certbot:
```bash
certbot certonly --standalone -d hideatnite.deinedomaein.de
```
Dann in nginx.conf `listen 443 ssl` + Zertifikat-Pfade eintragen.

### 4. Starten
```bash
docker compose up -d --build
```

### 5. Fertig
Öffne `https://hideatnite.deinedomaein.de` auf dem Handy.
Beim ersten Öffnen: "Zum Homescreen hinzufügen" → läuft wie eine App.

## Struktur
```
hideatnite/
├── backend/          FastAPI Backend
│   └── app/
│       ├── main.py
│       ├── models/   Datenmodelle
│       ├── routers/  HTTP + WebSocket Endpunkte
│       └── services/ In-Memory Game State
├── frontend/         React PWA
│   └── src/
│       └── pages/    Home, Lobby, Game
├── docker-compose.yml
└── nginx.conf
```

## Wichtig: HTTPS
GPS (`navigator.geolocation`) funktioniert im Browser **nur über HTTPS**.
Lokal zum Testen geht auch `localhost` ohne HTTPS.

## Lokales Testen
```bash
# Backend
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload

# Frontend (neues Terminal)
cd frontend && npm install && npm run dev
```
Dann: http://localhost:5173
