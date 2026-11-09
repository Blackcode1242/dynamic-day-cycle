# Dynamic Day Cycle (base, v0.1)

Extensão para Owlbear Rodeo 2.0: relógio de dia e noite dentro do mapa, com filtro de cor e integração com o **Dynamic Auras & Lights 1.5+**.

## O que faz
- **Relógio** da cena, controlado pelo GM: iniciar/pausar, definir a hora e escolher a velocidade (×0,25 até ×720 ou valor livre). ×1 = tempo real; ×64 = um dia em ~22 min.
- **Filtro de cor** que segue a hora: amanhecer alaranjado, dia limpo, entardecer avermelhado, noite azul escura, com transição suave. Usa um efeito local com mistura *Multiply* (cada pessoa desenha o seu), cobrindo o mapa. De dia (cor branca) o efeito é removido para não gastar GPU.
- **Luzes por horário**: no Dynamic Auras & Lights 1.5, cada aura tem *Quando acende* (sempre / só à noite / só de dia). Ao anoitecer ela liga (incluindo a luz do Dynamic Fog), com variação de alguns minutos por luz.
- Pausar o relógio congela a hora; todo mundo vê a mesma hora (calculada localmente a partir de uma âncora salva na cena, sem ficar enviando mensagens).

## Como instalar
Mesmo processo da outra extensão: `npm install`, `npm run build`, publicar `dist/` no GitHub Pages (workflow incluso) e adicionar `https://SEU-USUARIO.github.io/dynamic-day-cycle/manifest.json` no Owlbear. Ajuste as URLs do `public/manifest.json` para o seu usuário/repositório. Cada jogador precisa ter as duas extensões para ver o filtro e as luzes.

## Limitações conhecidas (base)
- Não foi testado dentro do Owlbear: validar em sala de teste. A parte de efeito/camadas pode precisar de ajuste.
- A hora depende do relógio do computador de cada pessoa (diferença de alguns segundos é normal).
- O filtro escurece o mapa; a visão dos tokens continua sendo do Dynamic Fog.
- Luzes acendem/apagam de uma vez (sem fade). Fade gradual é um próximo passo.

## Contrato entre as extensões
Chave de metadado da cena `com.example.dynamic-day-cycle/state`; a lógica compartilhada está em `src/clock.ts` (mesmo arquivo nos dois projetos).
