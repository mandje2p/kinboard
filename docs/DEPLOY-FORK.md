# Déployer ce fork (thème Verre) sur un serveur

Le `docker-compose.yml` par défaut tire l'image publiée par l'auteur : elle ne
contient PAS le thème Verre. Pour mettre en ligne ce fork, il faut construire
l'image depuis les sources (`docker-compose.build.yml`).

## Prérequis
- Un serveur Linux (VPS, mini-PC, NAS) avec Docker + Compose v2, git, openssl.
- HTTPS obligatoire pour une PWA iPad : un nom de domaine, ou Tailscale /
  Cloudflare Tunnel, ou un reverse proxy (Traefik, Caddy).

## Installation
```bash
git clone https://github.com/mandje2p/kinboard.git
cd kinboard
git checkout feature/glass-theme        # ou main une fois la branche fusionnée
./setup.sh --url https://kinboard.exemple.fr
cd webapp/docker
# construire depuis les sources au lieu de l'image upstream :
echo 'COMPOSE_FILES="-f docker-compose.yml -f docker-compose.build.yml"' >> .env
./start.sh up
```
Avec Traefik, ajoute `-f docker-compose.traefik.yml` à `COMPOSE_FILES` et
renseigne `DOMAIN` et `TRAEFIK_CERT_RESOLVER` dans `.env`.

## Sur l'iPad
1. Ouvre l'URL HTTPS dans Safari, crée la famille.
2. Partager > Sur l'écran d'accueil.
3. Réglages > Thème > Teinte neutre > Verre (+ mode sombre).
4. Optionnel : Accès guidé pour verrouiller l'iPad sur l'appli.

## Mises à jour
Après un `git pull`, relance `./start.sh restart` (reconstruit la webapp).
