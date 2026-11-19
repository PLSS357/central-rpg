# Arquitetura

O mesmo processo serve o HTML, CSS, JavaScript e a API JSON. O navegador recebe um cookie de sessão e consulta a API com a identidade associada a essa sessão. O servidor resolve campanha e papel por vínculo ativo em cada chamada.

A transação SQLite de escrita abrange conteúdo, destinatários, arquivos, registro de auditoria e chave de envio. O servidor usa paginação por horário e identificador. Os eventos SSE são sinais sem conteúdo. Cada conexão revalida sessão e vínculo e compara o estado autorizado do próprio usuário. Ao receber sinal, o navegador consulta novamente a API. Um intervalo de segurança atualiza a lista de missões, o histórico e os contadores quando a página está visível.

O mestre publica missões imediatamente. A transação valida os jogadores ativos, registra a audiência e grava o evento de publicação. O histórico mostra publicações e atualizações conforme as permissões do usuário.

Para uma instalação pequena, use um processo ativo e disco persistente. O custo dos sinais SSE cresce com a quantidade de registros por campanha e conexões ativas. Este projeto não inclui cluster, push, serviço SMTP ou monitoramento externo.

