# Central RPG

Central de comunicações em português para campanhas de RPG. O servidor Node.js usa um banco SQLite local para contas, campanhas, conversas, missões e anexos. A instalação funciona sem serviços externos, dependências npm ou cadastro público.

## Executar no Windows

Requer Node.js 22.13 ou posterior. Em PowerShell, abra a pasta que contém `package.json`.

```powershell
Copy-Item .env.example .env
npm.cmd start
```

Abra http://127.0.0.1:3000 e escolha **Criar conta**. Informe o nome do personagem e uma senha de pelo menos 12 caracteres. Use esse mesmo nome para entrar na conta. Quem cria uma sala se torna mestre dela. Quem entra pelo código informa o nome do personagem e se torna jogador naquela sala. A mesma conta pode exercer papéis diferentes em salas diferentes. O mestre encontra o código no painel da sala e pode trocá-lo sem remover os participantes atuais. Em salas já existentes, o botão **Gerar código** habilita a entrada por código.

Para recuperar uma conta, o operador executa `node --env-file=.env server.mjs recover "Nome do Personagem"`. Depois de confirmar a identidade do titular, entregue o código junto com o endereço http://127.0.0.1:3000/login?ativar=1 (ou o endereço equivalente da instalação). O comando encerra as sessões anteriores.

## Verificar

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

O comando de lint verifica a sintaxe JavaScript. Os testes iniciam o servidor em porta temporária e requerem tráfego local em loopback. O build empacota o servidor, as páginas e a documentação em `dist/`. JavaScript neste projeto não passa por compilação TypeScript.

## Hospedar para o grupo

Use um host com Node.js e volume persistente. Coloque HTTPS em um proxy reverso, mantenha `HOST=127.0.0.1` quando o proxy estiver no mesmo host, ponha `SECURE_COOKIE=1`, e aponte `DATA_DIR` para o volume persistente. Use um supervisor para manter o processo ativo e reiniciar após falha. Desative buffering e compressão no proxy para `/api/c/*/events` e preserve o cabeçalho Host externo. Permita corpos de até 8,5 MB nas rotas da API.

Para usar o artefato de build, abra `dist/` e execute `node --env-file-if-exists=.env server.mjs`. A configuração local e os dados de produção devem ficar fora do código-fonte. Veja [arquitetura](docs/architecture.md), [segurança](docs/security.md), [dados](docs/database.md) e [uso](docs/usage.md).

