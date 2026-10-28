---
marp: true
theme: tcc
paginate: true
size: 16:9
---

<!-- _class: title -->
<!-- _paginate: false -->

# Projeto e Avaliação de um Middleware Inteligente para Detecção de Anomalias em APIs

### Uma abordagem desacoplada e agnóstica para arquiteturas de microserviços

<div class="question">
É possível detectar comportamentos anômalos em uma API sem alterar o código da aplicação protegida?
</div>

<div class="meta">

**Ruana Boeira Soares**  
Análise e Desenvolvimento de Sistemas — UNISINOS

</div>

---

## O problema

<div class="problem-flow">

**Arquiteturas de microserviços distribuem a aplicação entre múltiplos serviços**

<div class="problem-grid">

<div>

### Mais pontos de comunicação

Quanto mais serviços, maior a superfície que precisa ser observada.

</div>

<div>

### Comportamentos desconhecidos

Nem toda atividade suspeita corresponde a uma assinatura previamente conhecida.

</div>

<div>

### Maior acoplamento

Implementar a detecção dentro de cada aplicação distribui a lógica de segurança.

</div>

<div>

### Tecnologias diferentes

Cada backend pode utilizar linguagens e frameworks distintos.

</div>

</div>

<div class="takeaway">

**Ideia:** levar a análise para uma camada intermediária ao tráfego.

</div>

</div>

---

## A proposta

<div class="solution-flow">

<div class="flow-box">
<strong>Cliente</strong>
<span>Envia a requisição HTTP</span>
</div>

<div class="flow-arrow">→</div>

<div class="flow-box highlight">
<strong>Gateway</strong>
<span>Intercepta a requisição</span>
</div>

<div class="flow-arrow">→</div>

<div class="flow-box highlight">
<strong>Análise comportamental</strong>
<span>Extrai características e classifica</span>
</div>

<div class="flow-arrow">→</div>

<div class="flow-box">
<strong>API</strong>
<span>Recebe a requisição permitida</span>
</div>

</div>

<div class="process-line">

**Interceptar → analisar → classificar → responder**

</div>

<div class="takeaway">

**Objetivo:** realizar a detecção sem modificar o código-fonte da aplicação protegida.

</div>

---

<!-- _class: architecture -->

## Arquitetura implementada

<div class="architecture-image-full">

![Arquitetura do protótipo](./assets/architecture.png)

</div>

<div class="takeaway">

**Ponto central:** a aplicação protegida não possui dependência direta do mecanismo de detecção.

</div>

---

## Como uma requisição é analisada?

<div class="analysis-flow">

<div class="analysis-step">
<span class="step-number">1</span>
<strong>Requisição HTTP</strong>
<small>Dados observados pelo gateway</small>
</div>

<div class="analysis-arrow">→</div>

<div class="analysis-step">
<span class="step-number">2</span>
<strong>Características</strong>
<small>Método, rota, payload, frequência...</small>
</div>

<div class="analysis-arrow">→</div>

<div class="analysis-step highlight-step">
<span class="step-number">3</span>
<strong>Isolation Forest</strong>
<small>Calcula um score para a observação</small>
</div>

<div class="analysis-arrow">→</div>

<div class="analysis-step">
<span class="step-number">4</span>
<strong>Decisão</strong>
<small>Normal ou anômala</small>
</div>

</div>

<div class="takeaway">

**Ideia central:** o modelo analisa uma representação do comportamento da requisição, e não a requisição HTTP completa.

</div>

---

## Como a solução foi avaliada?

<div class="evaluation-grid">

<div class="evaluation-card">

### Detecção

<div class="dataset-row">
<strong>Treinamento</strong>
<span>2.066 normais</span>
</div>

<div class="dataset-row">
<strong>Validação</strong>
<span>507 normais</span>
</div>

<div class="dataset-row">
<strong>Teste</strong>
<span>570 normais + 496 anômalas</span>
</div>

<div class="scenario-list">
Burst · Payload · Query Params · Route Diversification · Method-Route
</div>

</div>

<div class="evaluation-card">

### Latência

<div class="profile-row">
<strong>P0</strong>
<span>Acesso direto à API</span>
</div>

<div class="profile-row">
<strong>P1</strong>
<span>Gateway sem análise</span>
</div>

<div class="profile-row">
<strong>P2</strong>
<span>Solução completa</span>
</div>

<div class="latency-summary">
5 execuções por perfil<br>
500 medições válidas por perfil
</div>

</div>

</div>

<div class="takeaway">

**Princípio experimental:** o conjunto de teste permaneceu separado do treinamento e da calibração do modelo.

</div>

---

## Resultado global da detecção

<div class="metrics-grid">

<div class="metric-card">
<div class="metric-value">86,11%</div>
<div class="metric-label">Precisão</div>
</div>

<div class="metric-card">
<div class="metric-value">62,50%</div>
<div class="metric-label">Taxa de detecção</div>
</div>

<div class="metric-card">
<div class="metric-value">72,43%</div>
<div class="metric-label">F1-score</div>
</div>

<div class="metric-card">
<div class="metric-value">8,77%</div>
<div class="metric-label">Taxa de falsos positivos</div>
</div>

</div>

<div class="confusion-grid">

<div class="confusion-item">
<div class="confusion-number">310</div>
<div class="confusion-text">Verdadeiros positivos</div>
</div>

<div class="confusion-item">
<div class="confusion-number">520</div>
<div class="confusion-text">Verdadeiros negativos</div>
</div>

<div class="confusion-item">
<div class="confusion-number">50</div>
<div class="confusion-text">Falsos positivos</div>
</div>

<div class="confusion-item">
<div class="confusion-number">186</div>
<div class="confusion-text">Falsos negativos</div>
</div>

</div>

<div class="takeaway">

**Leitura principal:** o mecanismo apresentou boa precisão, mas ainda deixou uma parcela relevante das anomalias sem detecção.

</div>

---

## Resultado por cenário

<div class="scenario-results">

<div class="scenario-row">
<div class="scenario-name">Payload atípico</div>
<div class="scenario-bar">
<div class="scenario-fill full"></div>
</div>
<div class="scenario-value">100%</div>
</div>

<div class="scenario-row">
<div class="scenario-name">Parâmetros de consulta</div>
<div class="scenario-bar">
<div class="scenario-fill full"></div>
</div>
<div class="scenario-value">100%</div>
</div>

<div class="scenario-row">
<div class="scenario-name">Método-rota</div>
<div class="scenario-bar">
<div class="scenario-fill full"></div>
</div>
<div class="scenario-value">100%</div>
</div>

<div class="scenario-row">
<div class="scenario-name">Rajada (Burst)</div>
<div class="scenario-bar">
<div class="scenario-fill low"></div>
</div>
<div class="scenario-value">10%</div>
</div>

<div class="scenario-row">
<div class="scenario-name">Diversificação de rotas</div>
<div class="scenario-bar">
<div class="scenario-fill zero"></div>
</div>
<div class="scenario-value">0%</div>
</div>

</div>

<div class="takeaway">

**Conclusão:** a eficácia da detecção dependeu da capacidade das características de representar cada tipo de comportamento anômalo.

</div>

---

## Impacto sobre a latência

<div class="latency-results">

<div class="latency-row">
<div class="latency-label">
<strong>P0</strong>
<span>Acesso direto</span>
</div>
<div class="latency-bar">
<div class="latency-fill p0"></div>
</div>
<div class="latency-value">10,82 ms</div>
</div>

<div class="latency-row">
<div class="latency-label">
<strong>P1</strong>
<span>Gateway</span>
</div>
<div class="latency-bar">
<div class="latency-fill p1"></div>
</div>
<div class="latency-value">13,42 ms</div>
</div>

<div class="latency-row">
<div class="latency-label">
<strong>P2</strong>
<span>Solução completa</span>
</div>
<div class="latency-bar">
<div class="latency-fill p2"></div>
</div>
<div class="latency-value">75,06 ms</div>
</div>

</div>

<div class="overhead-highlight">

<div>
<span>Gateway</span>
<strong>+2,60 ms</strong>
</div>

<div>
<span>Middleware de análise</span>
<strong>+61,64 ms</strong>
</div>

<div class="overhead-main">
<span>Overhead total</span>
<strong>+64,24 ms</strong>
</div>

</div>

<div class="takeaway">

**Trade-off:** o desacoplamento da análise trouxe como contrapartida um aumento mensurável no tempo de resposta.

</div>

---

## Conclusão

<div class="conclusion-question">

É possível detectar comportamentos anômalos em uma API sem alterar o código da aplicação protegida?

<div class="conclusion-answer">
Sim — no contexto experimental avaliado.
</div>

</div>

<div class="conclusion-grid">

<div class="conclusion-card">

### O que foi demonstrado

✓ Interceptação desacoplada  
✓ Detecção com modelo não supervisionado  
✓ Resposta automatizada  
✓ Avaliação de detecção e latência

</div>

<div class="conclusion-card">

### Limitações observadas

Detecção variou entre os cenários

Overhead médio de **+64,24 ms**

Avaliação realizada em ambiente controlado

</div>

</div>

<div class="future-line">

<strong>Próximos passos:</strong> novas características · outros algoritmos · escalabilidade · diferentes tecnologias de backend

</div>