# Dynamic Day Cycle (base, v0.2.0)

Extensão para Owlbear Rodeo 2.0: relógio de dia e noite dentro do mapa, com filtro de cor e integração com o **Dynamic Auras & Lights 1.5+**.

## O que faz
- **Perfis de cenário**: deserto, floresta, neve e pântano, cada um com paleta própria para amanhecer, dia, entardecer e noite.
- **Fases da lua**: ciclo lunar de aproximadamente 29,5 dias; lua cheia reduz a intensidade do escurecimento noturno e lua nova mantém a noite mais escura.
- **Atmosfera**: camada sutil de neblina no amanhecer, raios direcionais estilizados próximos ao nascer/pôr do sol e estrelas cintilantes à noite. Pode ser desligada separadamente.
- **Avanço rápido**: botões de +1h, +8h, até amanhecer e até anoitecer. O relógio continua rodando após o salto caso já estivesse em movimento.
- **Relógio** da cena, controlado pelo GM: iniciar/pausar, definir a hora e escolher a velocidade (×0,25 até ×720 ou valor livre). ×1 = tempo real; ×64 = um dia em ~22 min.
- **Filtro de cor** que segue a hora: amanhecer alaranjado, dia limpo, entardecer avermelhado, noite azul escura, com transição suave. Usa um efeito local com mistura *Multiply* (cada pessoa desenha o seu), cobrindo o mapa. De dia (cor branca) o efeito é removido para não gastar GPU.
- **Luzes por horário**: no Dynamic Auras & Lights 1.5, cada aura tem *Quando acende* (sempre / só à noite / só de dia). Ao anoitecer ela liga (incluindo a luz do Dynamic Fog), com variação de alguns minutos por luz.
- Pausar o relógio congela a hora; todo mundo vê a mesma hora (calculada localmente a partir de uma âncora salva na cena, sem ficar enviando mensagens).
