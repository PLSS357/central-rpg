# Segurança

- Senhas com scrypt e salt. Sessões e códigos aleatórios têm somente o digest armazenado. Cookies são HttpOnly e SameSite Strict. Em ambiente HTTPS, use Secure.
- A API exige sessão e vínculo ativo por campanha. Somente os mestres publicam missões, alteram progresso ou editam o tema. O histórico de um jogador inclui atualizações compartilhadas e as atualizações individuais que lhe dizem respeito.
- Conteúdo é tratado como texto. O servidor controla a origem das escritas de navegador, limita tentativas de login e escrita e aplica políticas de conteúdo e cache.
- Códigos de uso único expiram em 24 horas. Entregue códigos por canal privado. O operador do host é responsável por confirmar a identidade na recuperação de contas ativadas.
- O processo e o operador do volume têm acesso ao banco. Restrinja permissões do volume e proteja os backups. Avalie cotas e antivírus antes de aceitar uploads de um público amplo.

