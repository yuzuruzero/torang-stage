#!/usr/bin/env bash
# Smoke test headless (sandbox/CI — bukan di mesin Hadi):
# cloud + app teacher + app student (auto-login) di Xvfb.
# Verifikasi jalur cue lewat ACK di /api/state + screenshot untuk mata manusia.
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
  kill "${PID_STU:-0}" "${PID_APP:-0}" "${PID_CLOUD:-0}" "${PID_XVFB:-0}" 2>/dev/null || true
  pkill -f "electron --no-sandbox" 2>/dev/null || true
}
trap cleanup EXIT

echo "== 1. cloud =="
rm -f apps/cloud/logs/bindings-*.json   # mulai bersih tiap smoke
# --import tsx = satu proses node (kill langsung mengenai server, tanpa wrapper)
node --import tsx apps/cloud/src/index.ts >"$OUT/cloud.log" 2>&1 &
PID_CLOUD=$!
for i in $(seq 1 30); do curl -s "$API/api/state" >/dev/null && break; sleep 0.5; done

echo "== 2. Xvfb + teacher + student (auto-login Andi→komp1) =="
Xvfb "$DISP" -screen 0 1920x1080x24 >/dev/null 2>&1 &
PID_XVFB=$!
sleep 1
DISPLAY="$DISP" ./node_modules/.bin/electron --no-sandbox --disable-gpu apps/theater \
  >"$OUT/theater.log" 2>&1 &
PID_APP=$!

cat > "$OUT/student.config.json" <<CFG
{
  "mode": "student",
  "cloud_ws": "ws://127.0.0.1:8787/ws",
  "cloud_api": "http://127.0.0.1:8787",
  "room_key": "$KEY",
  "branch": "dev",
  "room": "r1",
  "seat": "komp1",
  "auto_login": { "student_id": "s01" }
}
CFG
DISPLAY="$DISP" ./node_modules/.bin/electron --no-sandbox --disable-gpu apps/theater \
  --config="$OUT/student.config.json" >"$OUT/student.log" 2>&1 &
PID_STU=$!

echo "-- tunggu teacher-1 & komp1 online --"
for i in $(seq 1 60); do
  if state | grep -q '"teacher-1"' && state | grep -q '"komp1"'; then break; fi
  sleep 0.5
done
state | grep -q '"teacher-1"' || { echo "GAGAL: teacher offline"; tail -20 "$OUT/theater.log"; exit 1; }
state | grep -q '"komp1"' || { echo "GAGAL: student offline"; tail -30 "$OUT/student.log"; exit 1; }
echo "kedua endpoint online ✔"
state | grep -q '"nama":"Andi"' && echo "binding Andi→komp1 ✔"
sleep 1
shot 01-idle

echo "== 3. GO: materi TV1 =="
intent '{"intent":"GO"}'; echo
sleep 3; shot 02-materi-tv1; sleep 4

echo "== 4. GO: pindah TV3 =="
intent '{"intent":"GO"}'; echo
sleep 3; shot 03-move-exit-enter; sleep 3

echo "== 5. GO: sapa komp1 =="
intent '{"intent":"GO"}'; echo
sleep 2.5; shot 04-sapa-overlay; sleep 4

echo "== 6. GO: glow semua =="
intent '{"intent":"GO"}'; echo
sleep 2.5; shot 05-glow; sleep 3

echo "== 7. GO: ketuk komp1 (materi via jendela sopan) =="
intent '{"intent":"GO"}'; echo
sleep 2.5; shot 06-knock; sleep 1

echo "== 8. GO: balik TV1, lalu GO: STOP =="
intent '{"intent":"GO"}'; echo
sleep 4
intent '{"intent":"GO"}'; echo
sleep 1; shot 07-stop-idle
state > "$OUT/state-final.json"

echo "== RINGKASAN ACK =="
node -e '
const s = JSON.parse(require("fs").readFileSync("/tmp/torang-smoke/state-final.json","utf8"));
console.log("show.screen =", s.show.screen, "| bindings =", JSON.stringify(s.bindings));
for (const c of [...s.recent_cues].reverse()) {
  console.log(` ${c.cue_id} ${c.type} → [${c.targets}] ` +
    c.acks.map(a=>`${a.endpoint_id}:${a.status}${a.detail?" ("+a.detail+")":""}`).join(", "));
}
'
echo
echo "Smoke selesai — screenshot & log di $OUT"
