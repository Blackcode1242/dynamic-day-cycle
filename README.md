# Dynamic Day Cycle (v0.3.0)

Extensão para Owlbear Rodeo 2.0: relógio de dia e noite dentro do mapa, com filtro de cor e integração com o **Dynamic Auras & Lights 1.5+**.

## O que faz
- **Perfis de cenário**: deserto, floresta, neve e pântano, cada um com paleta própria para amanhecer, dia, entardecer e noite.
- **Fases da lua**: ciclo lunar de aproximadamente 29,5 dias; lua cheia reduz a intensidade do escurecimento noturno e lua nova mantém a noite mais escura.
- **Aba Ambiente** (efeitos ambientais, cada um liga/desliga e tem seu controle de intensidade):
  - **Neblina**: camada branca suave que flutua devagar; surge antes do nascer do sol, fica densa no amanhecer e some até o meio da manhã (~3,5 h depois).
  - **Raios de luz**: perto do nascer e do pôr do sol, gradiente quente e feixes suaves vindos do lado do sol (você escolhe de que lado o sol nasce; o pôr vem do lado oposto).
  - **Estrelas**: à noite surgem pontinhos cintilantes, fixos no mapa. Na lua cheia ficam um pouco mais apagadas.
  - **Lua**: mostra fase e % iluminada, permite escolher a fase atual (ela avança sozinha com os dias do jogo) e ajustar a influência no filtro: à noite, lua cheia clareia o filtro e lua nova o deixa mais escuro.
  - Cada efeito é criado só quando tem intensidade > 0 e removido depois, para não gastar GPU.
- **Avanço rápido**: botões de +1h, +8h, até amanhecer e até anoitecer. O relógio continua rodando após o salto caso já estivesse em movimento.
- **Relógio** da cena, controlado pelo GM: iniciar/pausar, definir a hora e escolher a velocidade (×0,25 até ×720 ou valor livre). ×1 = tempo real; ×64 = um dia em ~22 min.
- **Filtro de cor** que segue a hora: amanhecer alaranjado, dia limpo, entardecer avermelhado, noite azul escura, com transição suave. Usa um efeito local com mistura *Multiply* (cada pessoa desenha o seu), cobrindo o mapa. De dia (cor branca) o efeito é removido para não gastar GPU.
- **Luzes por horário**: no Dynamic Auras & Lights 1.5, cada aura tem *Quando acende* (sempre / só à noite / só de dia). Ao anoitecer ela liga (incluindo a luz do Dynamic Fog), com variação de alguns minutos por luz.
- Pausar o relógio congela a hora; todo mundo vê a mesma hora (calculada localmente a partir de uma âncora salva na cena, sem ficar enviando mensagens).
