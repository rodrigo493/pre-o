#!/usr/bin/env bash
set -e

SSH_KEY="$HOME/.ssh/squad_vps"
VPS_USER="root"
VPS_HOST="103.199.187.99"

echo "→ Build de produção..."
npm run build

echo "→ Enviando dist para VPS..."
scp -i "$SSH_KEY" -r dist "$VPS_USER@$VPS_HOST:/opt/precos/"

echo "✓ Deploy: https://precos.liveuni.com.br"
