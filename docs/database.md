# Dados

Em `DATA_DIR/central.sqlite`, o esquema usa chaves UUID, referências, índices de campanha, publicação e entrega, e timestamps Unix em milissegundos. `schema.sql` é aplicado na inicialização e cria a tabela adicional de idempotência em bancos da primeira versão. A validação de escopo entre campanhas é feita na API. O navegador não se conecta diretamente ao banco.

Mensagens e missões são recursos. A tabela de entregas registra destinatários e leitura. Cada cópia de uma transmissão privada tem recurso e conversa próprios, com identificador interno de lote. Objetivos e progresso individual são armazenados como JSON no recurso e atualizados em transação. Anexos ficam como BLOB para persistir atomicamente com o recurso.

Faça backup com a ferramenta de backup do SQLite ou pare o processo antes de copiar o diretório de dados, incluindo arquivos auxiliares presentes. Teste a restauração em uma instância separada.

