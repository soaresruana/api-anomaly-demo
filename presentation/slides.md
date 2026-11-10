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

## Do problema à proposta

<div class="split-layout">

<div class="split-panel">

### O problema

<div class="compact-list">

<div><strong>Mais pontos de comunicação</strong><span>Microserviços ampliam os fluxos que precisam ser observados.</span></div>

<div><strong>Comportamentos desconhecidos</strong><span>Nem toda atividade suspeita corresponde a uma assinatura conhecida.</span></div>

<div><strong>Acoplamento</strong><span>Levar a lógica de análise para cada backend aumenta a dependência da aplicação.</span></div>

</div>

</div>

<div class="split-panel proposed">

### A proposta

<div class="mini-flow">
<div class="mini-box">Cliente</div>
<div class="mini-arrow">→</div>
<div class="mini-box emphasis">Gateway</div>
<div class="mini-arrow">→</div>
<div class="mini-box emphasis">Análise</div>
<div class="mini-arrow">→</div>
<div class="mini-box">API</div>
</div>

<p class="proposal-text">Interceptar o tráfego, extrair características e realizar a classificação <strong>fora do código da aplicação protegida</strong>.</p>

</div>

</div>

<div class="takeaway">
<strong>Objetivo:</strong> avaliar a viabilidade de uma camada intermediária capaz de observar, classificar e responder a comportamentos anômalos.
</div>

---

<!-- _class: architecture -->

## Arquitetura implementada

<div class="architecture-image-full">

![Arquitetura do protótipo](./assets/architecture.png)

</div>

<div class="takeaway">
<strong>Ponto central:</strong> Kong e Anomaly Service formam o middleware lógico; a API .NET permanece independente do mecanismo de análise.
</div>

---

## Como funciona, como foi avaliado e como é reproduzido

<div class="three-grid">

<div class="compact-card">

### 1. Classificação

<div class="vertical-flow">
<span>Requisição HTTP</span>
<b>↓</b>
<span>7 características</span>
<b>↓</b>
<span>Isolation Forest</span>
<b>↓</b>
<span>score × limiar</span>
</div>

<small>Método, rota, payload, parâmetros e características do histórico recente.</small>

</div>

<div class="compact-card">

### 2. Avaliação

<div class="dataset-compact"><strong>Treino</strong><span>2.066 normais</span></div>
<div class="dataset-compact"><strong>Validação</strong><span>507 normais</span></div>
<div class="dataset-compact"><strong>Teste</strong><span>570 normais + 496 anômalas</span></div>

<div class="latency-mini">
<strong>Latência:</strong> P0 · P1 · P2<br>
500 medições válidas por perfil
</div>

</div>

<div class="compact-card repro-card">

### 3. Reprodutibilidade

<div class="repro-flow">
<span>SQLite oficial</span>
<b>↓</b>
<span>SHA-256</span>
<b>↓</b>
<span>Build do serviço</span>
<b>↓</b>
<span>Treino + calibração + teste</span>
</div>

<small>14 execuções oficiais · 4.005 eventos · 3.639 observações elegíveis</small>

</div>

</div>

<div class="demo-callout">
<strong>Demonstração</strong>
</div>

---

<!-- _class: diagnostic -->

## Análise complementar — sensibilidade ao histórico inicial

Os testes diagnósticos foram realizados **após a avaliação oficial** e não alteram suas métricas.

| Cenário | Histórico curto — normal | Histórico curto — anômalo | Histórico estabelecido — normal | Histórico estabelecido — anômalo |
|---|---:|---:|---:|---:|
| Query parameters | 20/20 bloqueadas | 20/20 bloqueadas | 0/20 bloqueadas | 0/20 bloqueadas |
| Payload | 20/20 bloqueadas | 20/20 bloqueadas | 0/20 bloqueadas | 0/20 bloqueadas |
| Method-route | 20/20 bloqueadas | 20/20 bloqueadas | 0/20 bloqueadas | 0/20 bloqueadas* |

<small>*No cenário Method-route com histórico estabelecido, GET /orders chegou ao backend e retornou HTTP 405.</small>

<div class="takeaway">
<strong>Leitura:</strong> os 100% observados no conjunto oficial não podem ser atribuídos exclusivamente à característica anômala testada; o período de <em>cold start</em> também influenciou a classificação.
</div>

---

## Conclusões, limitações e aprendizados

<div class="final-grid">

<div class="final-card">

### O que foi demonstrado

✓ Interceptação desacoplada  
✓ Modelo não supervisionado integrado ao fluxo  
✓ Resposta automatizada pelo gateway  
✓ Avaliação oficial reproduzível

</div>

<div class="final-card limits">

### Limitações identificadas

• Desempenho de classificação varia entre cenários  
• Sensibilidade ao histórico inicial (*cold start*)  
• Overhead médio de **+64,24 ms**  
• Avaliação em ambiente controlado

</div>

<div class="final-card learning">

### Aprendizados do curso aplicados

APIs e arquitetura · segurança  
Docker e integração de serviços  
Banco de dados · testes  
Aprendizado de máquina e análise de dados  
Método experimental e reprodutibilidade

</div>

</div>

<div class="future-line">
<strong>Próximos passos:</strong> estratégia de cold start · histórico mínimo · novas características · outros modelos · escalabilidade
</div>

<div class="closing-line">
A contribuição principal foi demonstrar a viabilidade da abordagem e, ao mesmo tempo, identificar com clareza seus custos e limites.
</div>
