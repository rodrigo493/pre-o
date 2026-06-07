#!/usr/bin/env bash
set -e

SSH_KEY="$HOME/.ssh/squad_vps"
VPS_USER="root"
VPS_HOST="103.199.187.99"
REMOTE="$VPS_USER@$VPS_HOST"

echo "→ Build de produção..."
npm run build

echo "→ Enviando dist para o VPS (staging)..."
ssh -i "$SSH_KEY" "$REMOTE" "rm -rf /opt/precos/dist_new && mkdir -p /opt/precos/dist_new"
scp -i "$SSH_KEY" -r dist/* "$REMOTE:/opt/precos/dist_new/"

# Troca + força remontagem do bind mount no container em execução.
# (rm -rf na pasta montada de um container rodando quebra o mount; o --force
#  recria a task e remonta o /opt/precos/dist novo.)
echo "→ Trocando dist e remontando o container..."
ssh -i "$SSH_KEY" "$REMOTE" "rm -rf /opt/precos/dist && mv /opt/precos/dist_new /opt/precos/dist && docker service update --force precos_precos >/dev/null"

echo "✓ Deploy: https://precos.liveuni.com.br"
