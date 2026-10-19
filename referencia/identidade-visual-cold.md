# Cold — Identidade Visual (referência para o Cursor)

## Cores
```css
--bg: #F5F7F9;        /* fundo geral */
--panel: #FFFFFF;     /* cartões/painéis */
--panel-2: #E8EDF2;   /* painéis secundários */
--accent: #253440;    /* cor principal — botões, destaque */
--text: #253440;      /* texto principal */
--text-muted: #5B6B7A;/* texto secundário */
--border: #D3DBE3;    /* bordas */
--steel: #4A6076;     /* acento secundário */
```
Tema claro ("The Learning Operating System" — tons de azul-ardósia e cinza frio).

## Tipografia
- Títulos: **Jost** (pesos 400/500/600/700) — via Google Fonts
- Corpo de texto: **Inter** (pesos 400/500/600) — via Google Fonts

## Logótipos
- `cold-logo-emblem.png` — símbolo/ícone, usado no cabeçalho fixo (nav)
- `cold-logo-wordmark.png` — nome completo "Cold", usado no hero/título principal

## Ficheiros de referência
- `pagina-vendas-referencia.html` — página de vendas já escrita (copy, estrutura, estilos)
- `app-chat-referencia.html` — interface do chat já estilizada

## Nota para a migração
O HTML/CSS destes ficheiros pode ser dado ao Cursor como referência visual direta — layout, cores e copy já estão prontos, não precisam de ser reinventados.
O que **não** pode ser reaproveitado tal como está: a lógica de conversa do `app-chat-referencia.html` depende do ambiente de Artifacts da Claude (chamada direta ao modelo); na versão própria, isto terá de ser substituído por chamadas ao teu backend/API, que por sua vez chama a Claude API com o prompt do Reitor + arquitetura da Academia.
