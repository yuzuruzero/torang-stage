#!/usr/bin/env bash
# Smoke test headless (dipakai di sandbox/CI — bukan di mesin Hadi):
# cloud + app teacher di Xvfb, verifikasi jalur cue lewat ACK di /api/state,
# plus screenshot untuk mata manusia.
set -euo pipefail
cd "$(dirname "$0")/.."

API="http://127.0.0.1:8787"
KEY="dev-room-key"
DISP=":99"
OUT="/tmp/torang-smoke"
mkdir -p "$OUT"

intent() {
  curl -s -X POST "$API/api/intent" -H 'content-type: application/json' \
    -d "{\"room_key\":\"$KEY\",\"intent\":$1}"
}

state() { curl -s "$API/api/state"; }

shot() {
  ffmpeg -y -loglevel error -f x11grab -video_size 1920x1080 -i "$DISP" \
    -frames:v 1 "$OUT/$1.png" || true
}

cleanup() {
  kill "${PID_APP:-0}" "${PID_CLOUD:-0}" "${PID_XVFB:-0}" 2>/dev/null || true
  pkill -f "apps/cloud/src/index.ts" 2>/dev/null || true
  pkill -f "electron --no-sandbox" 2>/dev/null || true
}
trap cleanup EXIT

echo "== 1. cloud =="
# --import tsx = satu proses node (kill langsung mengenai server, tanpa wrapper)
node --import tsx apps/cloud/src/index.ts >"$OUT/cloud.log" 2>&1 &
PID_CLOUD=$!
for i in $(seq 1 30); do curl -s "$API/api/state" >/dev/null && break; sleep 0.5; done
state | head -c 200; echo

echo "== 2. Xvfb + app teacher =="
Xvfb "$DISP" -screen 0 1920x1080x24 >/dev/null 2>&1 &
PID_XVFB=$!
sleep 1
DISPLAY="$DISP" ./node_modules/.bin/electron --no-sandbox --disable-gpu apps/theater \
  >"$OUT/theater.log" 2>&1 &
PID_APP=$!

echo "-- tunggu endpoint teacher-1 online --"
ONLINE=""
for i in $(seq 1 60); do
  if state | grep -q '"teacher-1"'; then ONLINE=ya; break; fi
  sleep 0.5
done
[ -n "$ONLINE" ] || { echo "GAGAL: endpoint tidak pernah online"; tail -20 "$OUT/theater.log"; exit 1; }
echo "endpoint online ✔"
sleep 1
shot 01-idle

echo "== 3. GO (PLAY materi tes di TV1) =="
intent '{"intent":"GO"}'; echo
sleep 3   # lead 1.5s + 1.5s ke tengah materi
shot 02-materi-tv1
sleep 4   # materi 4s selesai → played
state > "$OUT/state-after-play.json"

echo "== 4. GO (MOVE ke TV3) =="
intent '{"intent":"GO"}'; echo
sleep 3   # exit di tv1 + enter mulai di tv3
shot 03-move-exit-enter
sleep 3
shot 04-idle-loop-tv3
state > "$OUT/state-after-move.json"

echo "== 5. STOP =="
intent '{"intent":"STOP"}'; echo
sleep 1
shot 05-stop-idle
state > "$OUT/state-after-stop.json"

echo "== RINGKASAN ACK =="
node -e '
const fs = require("fs");
for (const f of ["state-after-play","state-after-move","state-after-stop"]) {
  const s = JSON.parse(fs.readFileSync("/tmp/torang-smoke/"+f+".json","utf8"));
  console.log("\n### "+f, "| show.screen =", s.show.screen);
  for (const c of s.recent_cues.slice(0,4).reverse()) {
    console.log(` ${c.cue_id} ${c.type} → [${c.targets}] aset=${c.asset ?? "-"} ` +
      c.acks.map(a=>`${a.endpoint_id}:${a.status}${a.detail?" ("+a.detail+")":""}`).join(", "));
  }
}
'
echo
echo "Smoke selesai — screenshot & log di $OUT"
