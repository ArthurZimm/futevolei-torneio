# Publicar o Torneio Box Castelândia na Vercel

O site tem duas partes: as páginas (`index.html` para o público, `admin.html` para você) e três funções em `/api`
que guardam o torneio e conferem a senha. O torneio fica num banco Upstash Redis, então todos os celulares veem o mesmo estado.

## 1. Subir o código

1. Crie um repositório no GitHub e envie esta pasta (o `.gitignore` já deixa de fora `node_modules` e `.env`).
2. Na Vercel: **Add New → Project**, escolha o repositório e clique em **Deploy**.
   Não precisa de _build command_ nem de _output directory_ (Framework Preset: **Other**).

O primeiro deploy já abre o site, mas o admin ainda não funciona. Falta o passo 2.

## 2. Ligar o banco (Upstash Redis)

1. No projeto da Vercel: **Storage → Create Database** (ou **Marketplace → Upstash → Redis**), plano gratuito.
2. Conecte o banco ao projeto. A Vercel cria sozinha as variáveis `KV_REST_API_URL` e `KV_REST_API_TOKEN`
   (ou `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`; o código aceita os dois nomes).

## 3. Senha do admin

A senha está fixa no código, em `lib/auth.js`: **`Admin123`**. Não há variáveis de ambiente de senha para configurar.
Isso só serve para brincadeira: quem abrir o repositório vê a senha. Para trocar, edite `SENHA_ADMIN` nesse arquivo e publique de novo.

## 4. Publicar de novo e testar

Variáveis novas só valem em deploys novos: em **Deployments**, abra o último e clique em **Redeploy**. (Um `git push` já dispara um deploy novo sozinho.)

Teste com dois celulares (ou um celular e um computador):

1. Celular A: abra `https://SEU-PROJETO.vercel.app/admin`, entre com a senha `Admin123` e crie um torneio de teste.
2. Celular B: abra `https://SEU-PROJETO.vercel.app/` sem fazer login. Você deve ver o sorteio, a chave e o placar.
3. No celular A, marque pontos. No celular B, o placar muda sozinho em até 15 segundos.
4. Abra `/admin` numa aba anônima: tem que pedir senha.
5. Quando acabar, use **Manutenção → Zerar torneio** para limpar antes do dia do evento.

## Como funciona o acesso

- Se a API falhar (por exemplo, banco não ligado), o site mostra o erro e **não** abre o admin: o modo sem senha só existe no `localhost`.
- Visitantes só leem (`GET /api/estado`). Quem não tem o cookie de login recebe `401` ao tentar gravar.
- O login cria um cookie assinado (`httpOnly`, `SameSite=Strict`, `Secure`) que vale 12 horas.
- São permitidas 5 tentativas de senha por minuto por IP.
- Se dois aparelhos gravarem ao mesmo tempo, o segundo recebe um aviso, recarrega o estado mais novo e você refaz a última ação (não perde o resto).

## Rodar no computador

```bash
npm install
npm run dev     # http://localhost:3000  (senha do admin: Admin123)
npm test        # 94 testes: regras da chave, sorteio e API
```

Sem Upstash, o servidor local guarda o torneio na memória (some ao reiniciar). Se as páginas forem abertas sem a pasta `/api`
(por exemplo, um servidor estático em `localhost`), o site entra em **modo local**: sem senha, e os dados ficam só naquele navegador.
Esse modo serve para testar, não para o evento.

## Se algo der errado

- **"Upstash Redis não está ligado ao projeto"**: faltam as variáveis do passo 2, ou você ainda não fez o Redeploy.
- **Login sempre dá "Senha incorreta"**: a senha é `Admin123` (maiúscula no A, sem espaço no fim).
- **Tela velha ou dados que não atualizam**: use o botão **Limpar cache** (no fim do Início, na tela de login e em **Manutenção**).
- **"Muitas tentativas"**: espere um minuto.
- **Perdeu o torneio**: se você exportou o JSON em **Manutenção → Exportar**, use **Importar** para restaurar.
  Exporte um backup de vez em quando durante o evento.
