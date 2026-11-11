#!/usr/bin/env bash
# Automatická aktualizace serveru kroužku: spouští ji louka-update.timer každou minutu (jako root).
# Aktualizuje jen na otestovanou verzi (dist-<větev> sestavenou z poslední verze kódu, plní ji ci.yml),
# a to hned, i když se hraje: hráči dostanou ['restart'], server uloží svět a prohlížeče se samy připojí zpátky
# (Richard 11.11.2026: nová verze má být ve hře co nejdřív).
# Ručně hned: sudo bash /opt/louka/deploy/update.sh
set -euo pipefail
cd /opt/louka
# Časovač a služba aktualizace se nainstalují samy, když se v repozitáři změní (např. interval).
for u in louka-update.service louka-update.timer; do
  cmp -s "deploy/$u" "/etc/systemd/system/$u" || { cp "deploy/$u" /etc/systemd/system/; changed=1; }
done
[ -z "${changed:-}" ] || { systemctl daemon-reload; systemctl restart louka-update.timer; }
as_louka() { sudo -u louka "$@"; }
as_louka git fetch -q origin
as_louka git -C dist fetch -q origin
code_new=$(as_louka git rev-parse '@{u}')
built=$(as_louka git -C dist show '@{u}:VERSION' | tr -d '[:space:]')
# Testy ještě běží, nebo neprošly: počkej, až CI sestaví přesně tuhle verzi kódu.
[ "$built" = "$code_new" ] || { echo "čekám na sestavení ${code_new::7} (dist-větev má ${built::7})"; exit 0; }
[ "$(as_louka git rev-parse HEAD)" != "$code_new" ] || [ "$(as_louka git -C dist rev-parse HEAD)" != "$(as_louka git -C dist rev-parse '@{u}')" ] || exit 0
players=$(curl -fsS --max-time 5 "http://127.0.0.1:${PORT:-8787}/health" | grep -o '"players":[0-9]*' | cut -d: -f2 || true)
echo "aktualizuji na ${code_new::7} (hraje ${players:-0})"
# update.sh si při git pull přepíše sám sebe, proto běží z kopie.
cp deploy/update.sh /run/louka-update.sh
exec bash /run/louka-update.sh
