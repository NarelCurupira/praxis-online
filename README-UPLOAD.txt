PRÁXIS 1.0 — correções mobile

Substitua/crie exatamente estes arquivos no repositório:

1. src/main.tsx
   - SUBSTITUI o arquivo existente.
   - Única alteração funcional: importa praxis1-mobile-fixes.css por último.

2. src/components/InformationCenter.tsx
   - SUBSTITUI o arquivo existente.
   - A Central passa a usar React Portal, evitando ficar presa ao stacking context da topbar no Safari/PWA.

3. src/praxis1-mobile-fixes.css
   - NOVO arquivo.
   - Corrige:
     • botão + sobreposto;
     • cards de Processos/Minha fila herdando largura desktop;
     • drawer/menu ficando atrás da topbar;
     • dimensões fixas residuais das colunas no mobile.

Sugestão de commit:
fix: stabilize mobile shell, process cards and information center
