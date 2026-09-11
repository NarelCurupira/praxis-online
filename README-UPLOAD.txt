PRÁXIS — PACOTE FINAL DE ÍCONES

Este pacote usa a versão do ícone aprovada na conversa.

SUBSTITUA estes arquivos no GitHub:
public/icons/icon-192.png
public/icons/icon-512.png
public/icons/maskable-192.png
public/icons/maskable-512.png
public/icons/apple-touch-icon-180.png
public/icons/favicon-32.png
public/icons/favicon-16.png
public/favicon.ico
public/sw.js

NÃO é necessário alterar index.html nem manifest.webmanifest:
os nomes/caminhos atuais já apontam para esses arquivos.

O sw.js incluído é idêntico ao atual, exceto pela versão do cache:
praxis-shell-1.0.0-push-1 -> praxis-shell-1.0.0-push-2
Isso força o PWA a abandonar os ícones antigos que estavam no cache.

A pasta SOURCE é apenas referência e NÃO precisa ser enviada ao repositório.

Após o deploy:
1. No iPhone, remova o Práxis já instalado da Tela de Início.
2. Abra novamente o site no Safari.
3. Use Compartilhar > Adicionar à Tela de Início.
O iOS costuma manter o ícone de instalação em cache, por isso reinstalar é importante.
