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
[ -n "${TORANG_STAGE_API:-}" ] && KANDIDAT+=("$TORANG_STAGE_API")

# a. Gateway WSL→Windows (mode NAT)
GW=$(ip route show default 2>/dev/null | awk '{print $3; exit}') || true
[ -n "${GW:-}" ] && KANDIDAT+=("http://$GW:8787")

# b. IP LAN Windows — tanya PowerShell langsung (WSL bisa memanggil exe Windows)
LANIP=$(powershell.exe -NoProfile -Command \
  "(Get-NetIPConfiguration | Where-Object IPv4DefaultGateway | Select-Object -First 1).IPv4Address.IPAddress" \
  2>/dev/null | tr -d '\r' | tail -1) || true
[ -n "${LANIP:-}" ] && KANDIDAT+=("http://$LANIP:8787")

# c. Nameserver WSL (di NAT sering = host) + loopback (mode mirrored)
NS=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf 2>/dev/null) || true
[ -n "${NS:-}" ] && KANDIDAT+=("http://$NS:8787")
KANDIDAT+=("http://127.0.0.1:8787")

API=""
DICOBA=""
for k in "${KANDIDAT[@]}"; do
  case " $DICOBA " in *" $k "*) continue ;; esac
  DICOBA="$DICOBA $k"
  printf '   coba %s ... ' "$k"
  if curl -s -m 3 "$k/api/state" | grep -q '"server_now"'; then
    echo "TEMBUS ✔"
    API="$k"
    break
  fi
  echo "gagal"
done

if [ -z "$API" ]; then
  echo
  echo "❌ Cloud tidak terjangkau dari WSL. Dua penyebab paling umum:"
  echo "   1. Cloud belum hidup → di Windows jalankan: jalankan-cloud-lan.bat"
  echo "   2. FIREWALL: adapter vEthernet (WSL) dihitung profil PUBLIC oleh"
  echo "      Windows, jadi Allow yang lama (Private) tidak berlaku."
  echo "      Fix sekali, di PowerShell **Run as Administrator**:"
  echo "        netsh advfirewall firewall add rule name=\"Torang Stage 8787\" dir=in action=allow protocol=TCP localport=8787"
  echo "      (aturan ini berlaku semua profil, termasuk jalur WSL)"
  echo "   Lalu jalankan skrip ini lagi. Paksa alamat kalau perlu:"
  echo "     TORANG_STAGE_API=http://<ip>:8787 bash tools/openclaw/pasang-jembatan-openclaw.sh"
  exit 1
fi
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
