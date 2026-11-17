# E-mail das liberações aprovadas (Google Apps Script)

O app manda o PDF da liberação para um Web App do Apps Script, que envia pelo Gmail
da conta @pattynet.com.br. Grátis (limite do Google Workspace: ~1.500 destinatários/dia).

1. Logado na conta da empresa, abra https://script.google.com → Novo projeto.
2. Cole o conteúdo de `enviar-email.gs` e troque `SEGREDO` por um texto longo aleatório.
3. Rode a função `testar` uma vez e autorize o acesso ao Gmail.
4. Implantar → Nova implantação → tipo "App da Web": Executar como **Eu**,
   Quem pode acessar **Qualquer pessoa**. Copie a URL (termina em `/exec`).
5. Na Cloudflare (worker patty-one → Configurações → Variáveis e segredos), crie os
   segredos `APPS_SCRIPT_URL` (a URL) e `APPS_SCRIPT_SECRET` (o mesmo segredo).
6. No app: Liberações → Editar listas → aba E-mails, cadastre quem recebe.

Ao mudar o código do script: Implantar → Gerenciar implantações → editar → Nova versão
(a URL continua a mesma).
