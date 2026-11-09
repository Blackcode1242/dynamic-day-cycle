# Dynamic Day Cycle (base, v0.1)

Extensão para Owlbear Rodeo 2.0: relógio de dia e noite dentro do mapa, com filtro de cor e integração com o **Dynamic Auras & Lights 1.5+**.

## O que faz
- **Relógio** da cena, controlado pelo GM: iniciar/pausar, definir a hora e escolher a velocidade (×0,25 até ×720 ou valor livre). ×1 = tempo real; ×64 = um dia em ~22 min.
- **Filtro de cor** que segue a hora: amanhecer alaranjado, dia limpo, entardecer avermelhado, noite azul escura, com transição suave. Usa um efeito local com mistura *Multiply* (cada pessoa desenha o seu), cobrindo o mapa. De dia (cor branca) o efeito é removido para não gastar GPU.
- **Luzes por horário**: no Dynamic Auras & Lights 1.5, cada aura tem *Quando acende* (sempre / só à noite / só de dia). Ao anoitecer ela liga (incluindo a luz do Dynamic Fog), com variação de alguns minutos por luz.
- Pausar o relógio congela a hora; todo mundo vê a mesma hora (calculada localmente a partir de uma âncora salva na cena, sem ficar enviando mensagens).
