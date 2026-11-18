# Mettre Kinboard en ligne sur un VPS Hostinger partagé (srv819563)

Ce VPS fait déjà tourner d'autres services (Nginx sur 80/443, MySQL sur 3306,
l'API Node `bnvce-api` sur 3001, SSH). Ce guide installe Kinboard **à côté**,
sans toucher à l'existant. Kinboard n'utilise pas MySQL : il embarque sa propre
base PostgreSQL dans ses conteneurs.

Ressources : le VPS est un KVM 1 (1 vCPU, 4 Go). Kinboard y tient, à condition
de **ne pas compiler l'image sur place** (on la télécharge) et d'ajouter du swap.

## 0. Avant de commencer
- Fais un **snapshot** du VPS (hPanel > VPS > Snapshots). Retour arrière en une minute.
- Choisis un sous-domaine, par ex. `cuisine.tondomaine.fr`.
- Ajoute un enregistrement DNS **A** : `cuisine` -> `168.231.84.170` (et AAAA -> `2a02:4780:28:f919::1`).

## 1. Construire l'image (sur GitHub, pas sur le VPS)
1. Sur ton fork `mandje2p/kinboard` : onglet **Actions** > activer les workflows.
2. Workflow **Docker image** > *Run workflow* > branche `feature/resizable-grid`.
   L'image est publiée sous `ghcr.io/mandje2p/kinboard:feature-resizable-grid`
   (compter 10 à 20 minutes, amd64 + arm64).
3. GitHub > ton profil > **Packages** > `kinboard` > *Package settings* >
   visibilité **Public** (sinon, il faut un `docker login ghcr.io` avec un jeton
   `read:packages` sur le VPS).

## 2. Préparer le VPS (SSH, utilisateur non-root avec sudo)
```bash
# 2 Go de swap : filet de sécurité pour la mémoire
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```
```bash
# Docker (dépôt officiel) : n'affecte pas Nginx, MySQL ni bnvce-api
sudo apt-get update && sudo apt-get install -y ca-certificates curl git openssl
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
docker compose version   # doit afficher v2.24 ou plus
```

## 3. Installer Kinboard
```bash
sudo mkdir -p /opt/kinboard && sudo chown "$USER" /opt/kinboard
git clone https://github.com/mandje2p/kinboard.git /opt/kinboard
cd /opt/kinboard && git checkout feature/resizable-grid
./setup.sh --non-interactive --url https://cuisine.tondomaine.fr
cd webapp/docker
# setup.sh a déjà écrit WEBAPP_PORT=3001 (pris par bnvce-api) : on remplace, on n'ajoute pas un doublon
set_env() { if grep -q "^$1=" .env; then sed -i "s|^$1=.*|$1=$2|" .env; else echo "$1=$2" >> .env; fi; }
set_env WEBAPP_PORT 3002
set_env KINBOARD_TAG feature-resizable-grid
set_env COMPOSE_FILES '"-f docker-compose.yml -f docker-compose.vps.yml"'
grep -E '^(WEBAPP_PORT|KINBOARD_TAG|COMPOSE_FILES|SITE_URL)=' .env
sudo docker compose -f docker-compose.yml -f docker-compose.vps.yml config >/dev/null && echo "config OK"
./start.sh up    # (ajoute sudo si ton utilisateur n'est pas dans le groupe docker)
./start.sh status
curl -sI http://127.0.0.1:3002 | head -1
```
Vérifie que Postgres n'est pas exposé : `sudo ss -ltnp | grep 5432` ne doit rien afficher.

## 4. HTTPS avec le Nginx existant
```bash
sudo cp /opt/kinboard/docs/nginx-kinboard.conf.example /etc/nginx/sites-available/kinboard
sudo sed -i 's/cuisine.example.fr/cuisine.tondomaine.fr/' /etc/nginx/sites-available/kinboard
sudo ln -s /etc/nginx/sites-available/kinboard /etc/nginx/sites-enabled/kinboard
sudo nginx -t && sudo systemctl reload nginx      # ne recharge que si le test passe
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d cuisine.tondomaine.fr
```
Vérifie ensuite que l'API existante répond toujours comme avant.

## 5. Sécurité (tentatives de connexion SSH observées le 18/11/2026)
- Clés SSH uniquement (`PasswordAuthentication no`) et `PermitRootLogin no`,
  **après** avoir testé ta connexion par clé avec l'utilisateur `ubuntu`.
- `sudo apt-get install -y fail2ban`.
- Pare-feu Hostinger (hPanel > VPS > Firewall) : autoriser 22, 80, 443, refuser le reste.
- Ne publie jamais le port 5432 ni 3002 sur internet.

## 6. Sur l'iPad
Ouvre `https://cuisine.tondomaine.fr` dans Safari, crée la famille, puis
Partager > Sur l'écran d'accueil. Réglages > Thème > Verre. Accès guidé pour verrouiller.

## Mises à jour
Relance le workflow *Docker image*, puis sur le VPS :
`cd /opt/kinboard/webapp/docker && ./start.sh up` (télécharge la nouvelle image).

## Retour arrière
`cd /opt/kinboard/webapp/docker && ./start.sh down`, retire le site Nginx
(`sudo rm /etc/nginx/sites-enabled/kinboard && sudo systemctl reload nginx`),
ou restaure le snapshot.
