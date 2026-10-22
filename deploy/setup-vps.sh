#!/usr/bin/env bash
# Jednorázová instalace serveru Říše na čistý VPS s Ubuntu 24.04 (spusť jako root). Stačí 1 GB RAM.
#   bash setup-vps.sh hry.example.cz 'heslo-pro-kroužek'
# Volitelně: BRANCH=v2 bash setup-vps.sh …   (výchozí větev je main)
# Co udělá: 2 GB swap, Node.js 22, Caddy (HTTPS), firewall, uživatel `louka`, kód v /opt/louka, služba `louka`.
# Hra se na VPS nesestavuje: hotovou složku dist/ stáhne z větve dist-<větev>, kterou plní GitHub Actions (ci.yml).
set -euo pipefail
DOMAIN="${1:?Použití: setup-vps.sh <doména> <heslo>}"
PASSWORD="${2:?Použití: setup-vps.sh <doména> <heslo>}"
REPO="${REPO:-https://github.com/Richard-Vesely/rise.git}"
BRANCH="${BRANCH:-main}"

echo "== Swap 2 GB (malý VPS: ať instalace ani server nezpadnou na nedostatek paměti)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "== Balíčky"
apt-get update
apt-get install -y curl git ufw gpg debian-keyring debian-archive-keyring apt-transport-https
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo "== Firewall (SSH, HTTP, HTTPS)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== Kód hry"
id louka >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/louka --shell /usr/sbin/nologin louka
mkdir -p /opt/louka
chown louka:louka /opt/louka
if [ ! -d /opt/louka/.git ]; then sudo -u louka git clone --branch "$BRANCH" "$REPO" /opt/louka; fi
cd /opt/louka
sudo -u louka npm ci --omit=dev          # jen knihovna ws (sestavovací nástroje nejsou potřeba)
if [ ! -d /opt/louka/dist/.git ]; then sudo -u louka git clone --depth 1 --branch "dist-$BRANCH" "$REPO" /opt/louka/dist; fi
sudo -u louka mkdir -p server/data

echo "== Nastavení (/etc/louka.env)"
if [ ! -f /etc/louka.env ]; then
  cat > /etc/louka.env <<ENV
PORT=8787
ROOM_PASSWORD=$PASSWORD
DATA_DIR=/opt/louka/server/data
STATIC_DIR=/opt/louka/dist
MAX_PLAYERS=8
ALLOW_CREATIVE=0
# Víc světů na jednom serveru (id:jméno[:creative][:pvp], oddělené čárkou; pvp = souboje hráčů). Bez WORLDS je jeden "Hlavní svět".
# Každý svět má složku DATA_DIR/<id>/ (world.json + backups/). Po změně: systemctl restart louka
#WORLDS="svet:Hlavní svět,kreativ:Kreativní svět:creative"
# Správa hráčů na https://<doména>/admin (seznam hráčů, reset PINu). Bez hesla je stránka vypnutá.
#ADMIN_PASSWORD=
ENV
  chmod 600 /etc/louka.env
fi

echo "== Služba louka"
cp deploy/louka.service /etc/systemd/system/louka.service
systemctl daemon-reload
systemctl enable --now louka

echo "== Automatická aktualizace (každých 5 minut, když nikdo nehraje)"
cp deploy/louka-update.service deploy/louka-update.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now louka-update.timer

echo "== Caddy pro $DOMAIN"
sed "s/hry.example.cz/$DOMAIN/" deploy/Caddyfile > /etc/caddy/Caddyfile
systemctl reload caddy

sleep 2
curl -fsS http://127.0.0.1:8787/health && echo
echo "Hotovo. Hra: https://$DOMAIN  ·  adresa pro Připojit se: $DOMAIN  ·  heslo: v /etc/louka.env"
