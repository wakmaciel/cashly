# Cashly — Finanças pessoais

App web (PWA) para organizar contas, cartões de crédito, transações e orçamentos. Funciona offline e pode ser instalado na tela de início do iPhone como se fosse um app nativo.

100% client-side: todos os dados ficam salvos no `localStorage` do navegador, neste dispositivo. Nada é enviado para nenhum servidor — não há backend.

## Funcionalidades

- **Principal**: saldo total em contas (anel visual receitas x despesas), lista de contas, lista de cartões com fatura do mês, despesas por categoria.
- **Transações**: histórico agrupado por dia, com receitas, despesas e transferências entre contas; balanço mensal.
- **Planejamento**: orçamentos por categoria com barra de progresso.
- **Mais**: gerenciar categorias, exportar/importar backup em JSON, apagar todos os dados.
- Navegação por mês (setas no topo).
- Botão de "olho" para ocultar valores na tela.

## Rodando localmente

Não precisa de build nem instalação de dependências. Basta servir os arquivos estáticos:

```bash
cd cashly
python3 -m http.server 8080
```

Depois acesse `http://localhost:8080` no navegador.

> Abrir o `index.html` direto com duplo clique (`file://`) também funciona para testar a interface, mas o Service Worker (cache offline) só é registrado quando servido via `http://` ou `https://`.

## Publicando no GitHub Pages (recomendado)

1. Crie um repositório no GitHub (ex: `cashly`) e suba todo o conteúdo desta pasta para a raiz dele.
2. No GitHub: **Settings → Pages → Source**, selecione a branch `main` e a pasta `/ (root)`. Salve.
3. Em alguns minutos o GitHub vai gerar uma URL do tipo `https://seu-usuario.github.io/cashly/`.
4. Abra essa URL no Safari do iPhone.

## Instalando no iOS (como app)

1. Abra a URL do app no **Safari** (precisa ser o Safari, não funciona pelo Chrome no iOS).
2. Toque no ícone de **compartilhar** (quadrado com seta para cima).
3. Escolha **"Adicionar à Tela de Início"**.
4. Pronto — o Cashly aparece com ícone próprio e abre em tela cheia, sem a barra do navegador.

## Estrutura de arquivos

```
cashly/
├── index.html        → estrutura das telas
├── manifest.json      → metadados do PWA (nome, ícone, cor)
├── sw.js               → service worker (cache offline)
├── css/style.css      → tema, tokens de design e componentes
├── js/app.js           → estado da aplicação, persistência e renderização
└── icons/               → ícones em vários tamanhos (incluindo maskable e Apple touch icon)
```

## Backup dos dados

Como tudo fica salvo localmente no navegador, é recomendável exportar um backup de tempos em tempos: **Mais → Exportar backup (JSON)**. Para restaurar (por exemplo, em outro dispositivo), use **Mais → Importar backup** e selecione o arquivo `.json` exportado.

## Próximos passos sugeridos

- Sincronização entre dispositivos via backend (ex: Supabase/Firebase) caso queira acessar os dados em mais de um aparelho.
- Cartões com parcelamento (compras parceladas lançadas automaticamente nos meses seguintes).
- Notificações de vencimento de fatura/contas (exigiria um service worker mais avançado + permissão de notificações).
