# MANOIR DES CHEVEUX (Option 2) — Backend Node/Express

## Démarrage

1. Va dans le dossier serveur :
   - `cd server`
2. Crée ton fichier d'environnement :
   - soit copie `server/.env.example` vers `server/.env`
   - soit remplis directement `server/.env.example`
   - change au minimum `JWT_SECRET` + `ADMIN_PASSWORD` + `DATABASE_URL`
3. Installe les dépendances :
   - `npm install`
4. Lance le serveur :
   - `npm start`

Puis ouvre :

- Site : `http://localhost:3000/`
- Admin : `http://localhost:3000/admin.html`

## Notes

- PostgreSQL est requis (variable `DATABASE_URL`).
- Les clients/admin passent par le serveur (les réservations ne sont plus en `localStorage`).

## Déploiement Render (résumé)

- Crée un **PostgreSQL** sur Render et récupère la `DATABASE_URL`.
- Crée un **Web Service** :
  - Root Directory: `server`
  - Build Command: `npm install`
  - Start Command: `npm start`
- Variables d'env Render :
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD`
  - (optionnel) `PGSSL=true` si ton Postgres exige SSL
