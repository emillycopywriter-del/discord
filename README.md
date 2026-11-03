# WorkCall

Chats individuais, grupos e reuniões com câmera, microfone e apresentação de tela. Interface em português, responsiva para computador e celular. Node.js 22 ou superior, sem dependências externas.

## Usar o aplicativo

```sh
npm start
```

O servidor escuta na porta 3000, configurável com `PORT`. Abra a aplicação em um navegador, informe seu nome e clique em **Nova reunião**. Escolha câmera e microfone antes de entrar. Use **Convidar** para copiar o link ou código. Outra pessoa abre esse link ou usa **Entrar com código**. Canais e mensagens diretas continuam disponíveis na barra lateral.

Todos podem usar câmera e microfone simultaneamente. A apresentação tem uma faixa de vídeo própria: compartilhar a tela não substitui a câmera. O servidor concede o compartilhamento a uma pessoa por vez e libera a vez quando ela para, sai da chamada ou perde a conexão. O botão de compartilhamento fica desativado para os demais enquanto há uma apresentação.

Câmera, microfone e tela precisam de permissão do navegador e HTTPS em acesso remoto. Localhost também funciona para desenvolvimento. Em dispositivos sem câmera/microfone, desmarque os dispositivos indisponíveis antes de entrar. Compartilhamento de tela depende do suporte do navegador; use um computador compatível para apresentar. Não há gravação nem compartilhamento de áudio do sistema.

## Publicar com HTTPS, sem domínio próprio

A configuração de publicação no Render está em `render.yaml`. É preciso criar uma conta no serviço e conectar o repositório GitHub que contém estes arquivos. No Render, escolha **New → Blueprint**, selecione o repositório e aplique a configuração. Ele instala a aplicação e fornece um endereço HTTPS, usado nos convites. O endpoint de prontidão é `/health`.

O plano gratuito configurado pode suspender a aplicação após inatividade. Seu armazenamento é temporário: reuniões, histórico e sessões podem ser perdidos em reinicializações ou publicações. Para uso contínuo com dados duráveis, configure armazenamento persistente e a variável `DATA_DIR` apontando para esse volume. Não foi criado serviço externo nem gerado endereço público nesta tarefa; publicação requer a conta de hospedagem do usuário.

Também há um `Dockerfile` para hospedar em um servidor próprio atrás de um proxy HTTPS. Monte um volume gravável em `/app/data` para preservar os dados e a chave das sessões. O contêiner usa um usuário sem privilégios.

## Redes e acesso

As chamadas usam WebRTC entre pares e são indicadas para grupos pequenos. O servidor mantém chat, presença e sinalização por HTTP/SSE; o proxy da hospedagem deve permitir respostas SSE longas e não armazená-las em buffer.

STUN do Google está configurado por padrão. Para conectar participantes em redes restritivas, configure um serviço TURN real nas variáveis do servidor. Não há TURN fornecido nem testado na internet nesta versão. Os testes locais não comprovam acesso em todas as redes.

| Variável | Uso |
| --- | --- |
| `PORT` | Porta HTTP (padrão 3000) |
| `NODE_ENV=production` | Cookies de sessão enviados somente por HTTPS |
| `PUBLIC_URL` | URL pública, opcional para validar a origem das requisições |
| `DATA_DIR` | Diretório persistente de dados (padrão `data/`) |
| `STUN_URL` | Servidor STUN alternativo, opcional |
| `TURN_URL` | URL TURN ou lista separada por vírgulas |
| `TURN_USERNAME` | Usuário do serviço TURN |
| `TURN_CREDENTIAL` | Credencial do serviço TURN, configurar de forma segura na hospedagem |

O aplicativo funciona com sessões de convidados assinadas, em cookie HttpOnly válido por 24 horas. As identidades são vinculadas à sessão e à aba do navegador. Não há contas, senhas nem recuperação da identidade ao abrir outro navegador ou após a expiração. Os grupos são públicos dentro da instância. Reuniões são acessadas por convite; quem possui o código pode entrar. Não há sala de espera ou moderação. Esta versão serve a pequenos grupos convidados; para uma comunidade aberta, são necessários contas, moderação e limites de uso.

Mensagens e reuniões ficam em `data/state.json`; a chave de assinatura em `data/session.key`. Ambos são ignorados pelo Git. Não compartilhe esses arquivos nem inclua dados reais em arquivos de demonstração. Quando o processo reinicia, os participantes precisam entrar de novo na chamada; processos de mídia não são persistidos.

## Ver apenas o design

Abra **workcall.html** no navegador. Esse arquivo contém CSS e JavaScript e não precisa de servidor. É uma prévia identificada, com pessoas e conversas ilustrativas e mensagens locais não salvas. Chamadas reais usam o aplicativo servido, não o arquivo de prévia.

```sh
npm run build:preview
```

Esse comando atualiza a prévia a partir de `public/`. Com o servidor iniciado, `/workcall.html` abre a prévia e `/?preview=1` abre o mesmo modo nos arquivos de desenvolvimento. `/` é a aplicação real. `docs/workcall-meeting.png` mostra a reunião renderizada durante o teste.

## Validação

```sh
npm test
```

Os testes cobrem acesso das sessões, chats e privacidade, criação e entrada por convite, exclusão mútua de apresentação, liberação ao sair/desconectar e recuperação dos dados após reiniciar o servidor. Usam processos reais, SSE e diretórios temporários.

Também foram testadas três páginas do Chromium com câmera e microfone sintéticos: entrada por convite, obtenção dos dispositivos, negociação SDP com três canais distintos e controles de apresentação. A política corporativa do navegador deste ambiente (`WebRtcIPHandling=disable_non_proxied_udp`) impede a geração de candidatos ICE diretos. Por isso a transmissão de áudio/vídeo entre pares não pôde ser validada aqui; câmeras remotas permanecem em “Conectando”. O seletor de tela do sistema e dispositivos físicos também não foram automatizados. Valide a mídia entre redes diferentes depois de publicar por HTTPS e configure TURN quando necessário.
