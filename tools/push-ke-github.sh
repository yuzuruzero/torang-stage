#!/usr/bin/env bash
# Push repo torang-stage ke GitHub — dijalankan HADI dari WSL:
#   cd /mnt/d/projects/torang-stage && bash tools/push-ke-github.sh
# Opsi:
#   --kering          lihat apa yang akan terjadi tanpa push
#   --url <URL>       pakai URL remote lain (default repo yuzuruzero/torang-stage)
#
# PRASYARAT SEKALI SAJA: buat repo kosong di https://github.com/new
#   nama: torang-stage · Public (installer murid mengunduh zip tanpa login)
#   JANGAN centang "Add a README" (repo lokal sudah punya isi).
set -euo pipefail

URL="https://github.com/yuzuruzero/torang-stage.git"
URL_DARI_OPSI=0
KERING=0
while [ $# -gt 0 ]; do
  case "$1" in
    --kering) KERING=1 ;;
    --url) shift; URL="$1"; URL_DARI_OPSI=1 ;;
    *) echo "opsi tak dikenal: $1"; exit 1 ;;
  esac
  shift
done

cd "$(dirname "$0")/.."
git rev-parse --git-dir >/dev/null 2>&1 || { echo "❌ bukan folder repo git"; exit 1; }

# Lewat /mnt/d semua file tampak executable — matikan pelacakan mode
# supaya status bersih (pelajaran 11 Agu; di Windows git sudah otomatis false).
git config core.filemode false

if git remote get-url origin >/dev/null 2>&1; then
  ADA=$(git remote get-url origin)
  if [ "$URL_DARI_OPSI" -eq 1 ] && [ "$ADA" != "$URL" ]; then
    git remote set-url origin "$URL"
    echo "remote origin diganti: $ADA → $URL"
  else
    echo "remote origin: $ADA"
  fi
else
  git remote add origin "$URL"
  echo "remote origin ditambahkan: $URL"
fi

echo
echo "=== Commit yang akan dikirim (branch main) ==="
git log --oneline -8
echo
KOTOR=$(git status --short | grep -v '^??' || true)
if [ -n "$KOTOR" ]; then
  echo "⚠ Ada perubahan belum di-commit (TIDAK ikut ter-push):"
  echo "$KOTOR"
  echo
fi

if [ "$KERING" -eq 1 ]; then
  echo "(--kering) berhenti di sini. Perintah aslinya: git push -u origin main"
  exit 0
fi

printf 'Ketik "ya" untuk push ke %s : ' "$(git remote get-url origin)"
read -r JAWAB
[ "$JAWAB" = "ya" ] || { echo "batal."; exit 0; }

echo
if git push -u origin main; then
  echo
  echo "✅ Terkirim. Cek: ${URL%.git}"
  echo "   Installer murid akan mengunduh dari: ${URL%.git}/archive/refs/heads/main.zip"
else
  echo
  echo "❌ Push gagal. Kemungkinan besar autentikasi:"
  echo "   - username : yuzuruzero"
  echo "   - password : Personal Access Token (BUKAN password akun)"
  echo "     buat di https://github.com/settings/tokens → Generate new token (classic),"
  echo "     centang scope 'repo', lalu tempel sebagai password saat git bertanya."
  echo "   - pastikan repo-nya sudah dibuat di https://github.com/new (nama: torang-stage)"
  exit 1
fi
