#!/usr/bin/env bash
# Pasang jembatan OpenClaw guru → Panggung Torang (dijalankan DI WSL PC guru):
#   cd /mnt/d/projects/torang-stage && bash tools/openclaw/pasang-jembatan-openclaw.sh [kunci-ruangan]
#
# Yang dilakukan:
#   1. Cari alamat cloud yang bisa dijangkau dari WSL (gateway WSL→Windows,
#      lalu IP LAN, lalu 127.0.0.1 — untuk mode mirrored).
#   2. Tulis ~/.torang-stage/config.json (api + room_key).
#   3. Pasang skill "panggung-torang" ke ~/.openclaw/workspace/skills/.
#   4. Uji --state end-to-end.
set -euo pipefail
cd "$(dirname "$0")"

KEY="${1:-dev-room-key}"

command -v node >/dev/null || { echo "❌ node tidak ada di WSL ini"; exit 1; }

echo "== 1. Cari alamat cloud dari WSL =="
KANDIDAT=()
GW=$(ip route show default 2>/dev/null | awk '{print $3; exit}') || true
[ -n "${GW:-}" ] && KANDIDAT+=("http://$GW:8787")
# IP LAN Windows (kalau WSL bisa hairpin) — ambil dari resolv/route sering sama dgn GW; tambah manual umum:
KANDIDAT+=("http://127.0.0.1:8787")

API=""
for k in "${KANDIDAT[@]}"; do
  if curl -s -m 3 "$k/api/state" | grep -q '"server_now"'; then API="$k"; break; fi
done
if [ -z "$API" ]; then
  echo "❌ Cloud tidak terjangkau dari WSL. Dicoba: ${KANDIDAT[*]}"
  echo "   Pastikan di Windows: jalankan-cloud-lan.bat hidup."
  echo "   Kalau firewall memblok jalur WSL, jalankan di PowerShell (admin):"
  echo "     netsh advfirewall firewall add rule name=\"Torang Stage 8787\" dir=in action=allow protocol=TCP localport=8787"
  echo "   Atau paksa alamat: TORANG_STAGE_API=http://<ip>:8787 bash $0"
  exit 1
fi
[ -n "${TORANG_STAGE_API:-}" ] && API="$TORANG_STAGE_API"
echo "   cloud ditemukan: $API"

echo "== 2. Tulis config =="
mkdir -p "$HOME/.torang-stage"
printf '{ "api": "%s", "room_key": "%s" }\n' "$API" "$KEY" > "$HOME/.torang-stage/config.json"
echo "   $HOME/.torang-stage/config.json"

echo "== 3. Pasang skill panggung-torang =="
SKILL_DIR="$HOME/.openclaw/workspace/skills/panggung-torang"
mkdir -p "$SKILL_DIR"
cp SKILL.md torang-cue.mjs "$SKILL_DIR/"
echo "   $SKILL_DIR"

echo "== 4. Uji =="
node "$SKILL_DIR/torang-cue.mjs" --state
echo
node "$SKILL_DIR/torang-cue.mjs" --dry "Torang, puter video tes di TV satu"
echo
echo "=== SELESAI ==="
echo "Coba dari OpenClaw (ketik ke agent guru):"
echo "  \"Torang, sapa komp dua\"   ·   \"Torang, puter video tes di TV satu\""
echo "  \"Torang, pindah ke TV tiga\"  ·  \"Torang, stop\"  ·  tanya: \"siapa yang online?\""
echo "Kalau agent belum memakai skill-nya, restart sesi/gateway OpenClaw dulu."
