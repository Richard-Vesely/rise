#!/usr/bin/env bash
# Automatická aktualizace serveru kroužku: spouští ji louka-update.timer každých 5 minut (jako root).
# Aktualizuje jen na otestovanou verzi (dist-<větev> sestavenou z poslední verze kódu, plní ji ci.yml)
# a jen když nikdo nehraje. Mezi 4:00 a 4:59 (Praha) aktualizuje i s hráči, ať nová verze nečeká déle než do rána.
# Ručně hned: sudo bash /opt/louka/deploy/update.sh
set -euo pipefail
cd /opt/louka
as_louka() { sudo -u louka "$@"; }
as_louka git fetch -q origin
as_louka git -C dist fetch -q origin
code_new=$(as_louka git rev-parse '@{u}')
built=$(as_louka git -C dist show '@{u}:VERSION' | tr -d '[:space:]')
# Testy ještě běží, nebo neprošly: počkej, až CI sestaví přesně tuhle verzi kódu.
[ "$built" = "$code_new" ] || { echo "čekám na sestavení ${code_new::7} (dist-větev má ${built::7})"; exit 0; }
[ "$(as_louka git rev-parse HEAD)" != "$code_new" ] || [ "$(as_louka git -C dist rev-parse HEAD)" != "$(as_louka git -C dist rev-parse '@{u}')" ] || exit 0
players=$(curl -fsS --max-time 5 "http://127.0.0.1:${PORT:-8787}/health" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).players))' 2>/dev/null || echo 0)
if [ "${players:-0}" -gt 0 ] && [ "$(TZ=Europe/Prague date +%H)" != 04 ]; then
  echo "nová verze ${code_new::7} čeká, hraje $players"; exit 0
fi
echo "aktualizuji na ${code_new::7}"
# update.sh si při git pull přepíše sám sebe, proto běží z kopie.
cp deploy/update.sh /run/louka-update.sh
exec bash /run/louka-update.sh
