# API Anomaly Detection Middleware

Protótipo experimental de um **middleware inteligente e desacoplado para detecção de anomalias em requisições de APIs**, desenvolvido como parte de um Trabalho de Conclusão de Curso em Análise e Desenvolvimento de Sistemas.

A solução intercepta tráfego HTTP por meio do **Kong Gateway**, envia atributos das requisições para um serviço independente de análise comportamental e utiliza **Isolation Forest** para identificar comportamentos anômalos. O mecanismo de detecção permanece externo à aplicação protegida, sem exigir alterações em seu código-fonte.

> Neste projeto, o termo *middleware inteligente* representa a camada lógica formada pela integração entre o gateway e o serviço de análise comportamental, e não um único componente isolado.

## Arquitetura

```mermaid
flowchart LR
    C[Cliente / scripts k6] --> K[Kong Gateway]
    K -->|POST /events| A[Anomaly Service]
    A -->|classificação| K
    A --> E[(SQLite experimental)]
    K -->|requisição permitida| API[API Demo .NET]
    K -->|anomalia em modo block| B[HTTP 403]
    API --> D[(SQLite da aplicação)]
```

Principais componentes:

| Componente | Tecnologia | Responsabilidade |
|---|---|---|
| API Demo | ASP.NET Core / .NET 10 | Backend experimental |
| Kong Gateway | Kong 3.9.3 | Proxy, roteamento e interceptação |
| Plugin `anomaly-collector` | Lua | Coleta de atributos, comunicação com o serviço de análise e aplicação da decisão |
| Anomaly Service | Python 3.13 / FastAPI 0.141.1 | Processamento comportamental e inferência |
| Modelo | Isolation Forest / scikit-learn 1.9.0 | Detecção não supervisionada de anomalias |
| Persistência | SQLite | Dados da aplicação e dados experimentais em bases separadas |
| Geração de tráfego | k6 | Cenários experimentais e medições de latência |
| Infraestrutura | Docker / Docker Compose | Isolamento e integração dos serviços |

## Fluxo de processamento

1. O cliente envia uma requisição ao Kong Gateway.
2. O plugin Lua extrai atributos da requisição e chama `POST /events` no Anomaly Service.
3. O Anomaly Service normaliza a rota, atualiza o estado comportamental e calcula as características derivadas.
4. Eventos elegíveis são submetidos ao pré-processador e ao Isolation Forest quando o modelo está carregado.
5. O evento e, quando disponíveis, suas características comportamentais são persistidos.
6. A classificação é devolvida ao Kong.
7. O gateway aplica a política configurada:
   - `log_only`: registra a decisão e permite a requisição;
   - `block`: bloqueia anomalias com HTTP `403` e permite requisições normais.
8. Na ausência de classificação, a requisição é permitida. Falhas de comunicação ou respostas inválidas seguem estratégia *fail-open*.

## Características utilizadas pelo modelo

O conjunto atual utiliza sete características:

- `http_method`
- `route`
- `payload_size_bytes`
- `query_param_count`
- `inter_arrival_ms`
- `requests_last_10s`
- `distinct_routes_last_30s`

As características `http_method` e `route` passam por *one-hot encoding*. As demais são convertidas para `float64` sem padronização adicional.

Campos de controle experimental, como `run_id`, `client_id`, `scenario`, `expected_class` e `request_id`, **não são utilizados como atributos preditivos**.

O estado comportamental é isolado pela combinação `(run_id, client_id)`. A primeira requisição de cada estado é utilizada como aquecimento e não é submetida ao modelo porque ainda não existe valor anterior para o cálculo de `inter_arrival_ms`.

## Estrutura do projeto

```text
api-anomaly-detection/
├── compose.yaml
├── global.json
├── README.md
├── data/
│   └── official/
│       └── experiment-official.db
├── scripts/
│   ├── reproduce-official-evaluation.ps1
│   └── reproduce-official-latency-analysis.ps1
├── presentation/
├── src/
│   ├── anomaly-service/
│   │   ├── app/
│   │   │   ├── persistence/
│   │   │   └── services/
│   │   ├── Dockerfile
│   │   └── requirements.txt
│   ├── api-demo/
│   │   ├── Controllers/
│   │   ├── Data/
│   │   ├── Migrations/
│   │   ├── Models/
│   │   ├── Dockerfile
│   │   └── ApiDemo.csproj
│   └── kong/
│       ├── plugins/anomaly-collector/
│       ├── Dockerfile
│       └── kong.yml
├── tests/
│   └── k6/
│       ├── normal-navigation.js
│       ├── normal-order.js
│       ├── normal-order-lookup.js
│       ├── anomaly-burst.js
│       ├── anomaly-payload.js
│       ├── anomaly-query-params.js
│       ├── anomaly-route-diversification.js
│       ├── anomaly-method-route.js
│       ├── latency-comparison.js
│       └── smoke.js
└── results/
    ├── detection/
    │   └── official/
    │       ├── experiment-official.sha256
    │       └── evaluation-output.txt
    └── latency/
        ├── official/
        ├── pilot-sequential/
        └── P0/
```

Diretórios locais de IDE, ambientes virtuais e artefatos de build não fazem parte da estrutura versionada do projeto.

O arquivo `src/api-demo/api-demo.db` pertence à aplicação de demonstração e é mantido separado da base experimental utilizada pela avaliação. O conjunto oficial da pesquisa está preservado exclusivamente em `data/official/experiment-official.db`.

## Pré-requisitos

Para executar a arquitetura completa, é necessário ter **Docker Engine + Docker Compose**.

Para executar os scripts experimentais diretamente no host, também é necessário instalar o **k6**.

Os scripts de reprodução em `scripts/` são escritos em PowerShell. No Windows, podem ser executados diretamente em uma sessão PowerShell; no macOS ou Linux, é necessário o **PowerShell 7+ (`pwsh`)**.

## Executando o ambiente

A partir da raiz do repositório:

```powershell
docker compose up --build -d
```

Verifique os contêineres:

```powershell
docker compose ps
```

Serviços expostos localmente:

| Serviço | Endereço |
|---|---|
| Kong Proxy | `http://localhost:8000` |
| Kong Admin API | `http://localhost:8001` |
| API Demo direta | `http://localhost:8080` |
| Anomaly Service | `http://localhost:8090` |

### Verificação do Anomaly Service

No PowerShell:

```powershell
Invoke-RestMethod http://localhost:8090/health
```

Exemplo de resposta:

```json
{
  "status": "ok",
  "model_loaded": false
}
```

`model_loaded` será `true` quando o artefato treinado estiver disponível e tiver sido carregado na inicialização do serviço.

### Requisição pela camada de gateway

```powershell
Invoke-RestMethod http://localhost:8000/products
```

### Smoke test

```powershell
k6 run .\tests\k6\smoke.js
```

## Treinamento e avaliação do modelo

O treinamento é realizado offline a partir dos eventos persistidos na base experimental. Os conjuntos de treinamento, validação e teste são selecionados por identificadores explícitos de execução definidos em:

```text
src/anomaly-service/app/persistence/dataset_repository.py
```

Com os dados experimentais disponíveis no volume do Anomaly Service, o modelo pode ser treinado com:

```powershell
docker exec anomaly-service python -m app.services.model_training
```

O artefato produzido contém o pré-processador, o Isolation Forest, o limiar calibrado e a taxa-alvo de falsos positivos.

Como o modelo é carregado durante a inicialização do serviço, após o treinamento execute:

```powershell
docker compose restart anomaly-service
```

Confirme o carregamento:

```powershell
Invoke-RestMethod http://localhost:8090/health
```

A avaliação dos conjuntos definidos pode ser executada com:

```powershell
docker exec anomaly-service python -m app.services.model_evaluation
```

O conjunto de teste permanece separado das etapas de treinamento e calibração do limiar.

## Reprodutibilidade da avaliação oficial

O repositório preserva um snapshot imutável da base SQLite utilizada na avaliação oficial de detecção:

```text
data/official/experiment-official.db
```

Esse banco contém exclusivamente os **14 `run_id` oficiais** utilizados nas etapas de treinamento, validação e teste.

### Composição do snapshot

O snapshot preserva:

- **4.005** eventos em `request_events`;
- **4.005** registros em `behavioral_features`;
- **3.639** observações elegíveis para o modelo.

Distribuição das observações elegíveis:

| Conjunto | Observações |
|---|---:|
| Treinamento | 2.066 |
| Validação | 507 |
| Teste | 1.066 |
| **Total** | **3.639** |

Os registros não elegíveis são mantidos porque incluem requisições de aquecimento e outros eventos que fazem parte da execução experimental original, mesmo quando não são utilizados diretamente na inferência.

### Runs oficiais preservados

Treinamento:

```text
train-navigation-002
train-order-001
train-order-lookup-001
```

Validação:

```text
validation-navigation-001
validation-order-001
validation-order-lookup-001
```

Teste:

```text
test-normal-navigation-001
test-normal-order-001
test-normal-order-lookup-001
test-anomaly-burst-001
test-anomaly-payload-001
test-anomaly-query-params-001
test-anomaly-route-diversification-001
test-anomaly-method-route-001
```

### Verificação de integridade

O SHA-256 esperado para o snapshot oficial está armazenado em:

```text
results/detection/official/experiment-official.sha256
```

O hash validado durante a preservação do conjunto oficial foi:

```text
8F5CFF4CD5E0B970AD0914FD0813190AEE5A1FA31F39AB3678031111970658C8
```

### Reproduzindo a avaliação oficial

Com Docker disponível, execute na raiz do repositório.

Windows:

```powershell
.\scripts\reproduce-official-evaluation.ps1
```

macOS / Linux com PowerShell 7+:

```bash
pwsh ./scripts/reproduce-official-evaluation.ps1
```

O script:

1. valida o SHA-256 do banco oficial;
2. constrói e inicia o `anomaly-service` com as dependências declaradas em `requirements.txt`;
3. copia o snapshot SQLite oficial para o contêiner;
4. executa o `model_evaluation.py` original utilizando esse banco;
5. retreina o Isolation Forest;
6. recalibra o limiar com o conjunto de validação;
7. avalia o novo modelo sobre o conjunto oficial de teste.

O procedimento foi validado em um ambiente reconstruído e reproduziu os resultados numéricos oficiais.

### Resultado reproduzido

Limiar calibrado:

```text
-0.6541146807763656
```

Validação:

| Métrica | Resultado |
|---|---:|
| Observações | 507 |
| FP | 18 |
| TN | 489 |
| FPR | 3,55% |
| Accuracy | 96,45% |

Teste:

| Métrica | Resultado |
|---|---:|
| Observações | 1.066 |
| Normais | 570 |
| Anômalas | 496 |
| TP | 310 |
| FP | 50 |
| TN | 520 |
| FN | 186 |
| Precision | 86,11% |
| Recall | 62,50% |
| F1-score | 72,43% |
| FPR | 8,77% |
| Accuracy | 77,86% |

A saída completa da reprodução está preservada em:

```text
results/detection/official/evaluation-output.txt
```

### Reprodução da avaliação x nova geração experimental

A reprodução da **avaliação oficial** e a geração de um **novo conjunto experimental** são processos diferentes.

O snapshot SQLite preservado permite repetir o treinamento, a calibração e a avaliação utilizando exatamente os dados empregados no estudo.

Os scripts em `tests/k6/` também permitem executar novamente os cenários experimentais. Entretanto, alguns fluxos normais utilizam valores e intervalos aleatórios. Dessa forma, uma nova geração completa do tráfego preserva o desenho metodológico, mas pode produzir observações individuais e métricas diferentes.

Assim:

```text
snapshot oficial preservado
        ↓
mesmos dados
        ↓
reprodução exata da avaliação

nova execução dos scripts k6
        ↓
nova amostra experimental
        ↓
resultados potencialmente diferentes
```

## Cenários experimentais

Os scripts em `tests/k6/` implementam três fluxos de comportamento esperado — navegação por produtos, criação de pedidos e consulta de pedidos — e cinco cenários controlados de comportamento anômalo:

| Cenário | Comportamento |
|---|---|
| Burst | Aumento abrupto da frequência de requisições |
| Payload | Corpo de requisição com tamanho atípico |
| Query parameters | Quantidade elevada de parâmetros de consulta |
| Route diversification | Acesso a múltiplas rotas não observadas no histórico de referência |
| Method-route | Combinação incomum entre método HTTP e rota |

Os metadados `scenario` e `expected_class` são utilizados apenas como *ground truth* experimental e não entram no modelo.

## Avaliação de latência

O script `tests/k6/latency-comparison.js` suporta três perfis:

| Perfil | Caminho avaliado |
|---|---|
| P0 | k6 → API Demo |
| P1 | k6 → Kong → API Demo, sem análise comportamental |
| P2 | k6 → Kong → plugin → Anomaly Service → modelo → Kong → API Demo |

O protocolo utiliza um único usuário virtual, requisições sequenciais, 20 requisições de aquecimento e 100 medições por execução. A operação utilizada pelo script é `GET /products/1` e o intervalo padrão entre requisições é de `1.2 s`.

A avaliação oficial foi organizada em cinco blocos contrabalanceados, com 100 medições válidas por perfil em cada bloco, totalizando:

- 500 observações P0;
- 500 observações P1;
- 500 observações P2;
- **1.500 observações oficiais de latência**.

A configuração foi projetada para medir **overhead de latência em condições controladas**, e não throughput máximo ou escalabilidade.

## Reprodutibilidade da análise oficial de latência

As medições oficiais de latência estão preservadas em:

```text
results/latency/official/
```

O conjunto utilizado na análise contém **15 execuções válidas**, organizadas em cinco blocos experimentais, com **100 medições consideradas por execução**:

- 5 execuções P0;
- 5 execuções P1;
- 5 execuções P2;
- **1.500 observações oficiais no total**.

As 20 requisições iniciais de aquecimento de cada execução não fazem parte das estatísticas analisadas.

Para reproduzir a análise estatística sobre as medições oficiais, utilize:

Windows:

```powershell
.\scripts\reproduce-official-latency-analysis.ps1
```

macOS / Linux com PowerShell 7+:

```bash
pwsh ./scripts/reproduce-official-latency-analysis.ps1
```

O script:

1. valida a presença dos 15 arquivos oficiais;
2. confirma as 100 medições válidas de cada execução;
3. consolida 500 observações por perfil;
4. recalcula média, mediana, P95, P99, mínimo, máximo e desvio-padrão;
5. recalcula os overheads pareados por bloco e seus intervalos de confiança de 95%;
6. compara os valores recalculados com os resultados reportados no trabalho.

A reprodução validada produziu novamente:

| Comparação | Resultado |
|---|---:|
| P0 — média | 10,82 ms |
| P1 — média | 13,42 ms |
| P2 — média | 75,06 ms |
| P1 − P0 — Gateway | 2,60 ms |
| P2 − P1 — Middleware de análise | 61,64 ms |
| P2 − P0 — Solução completa | 64,24 ms |

Ao final, o script sinaliza `PASS` para os valores que coincidem, em duas casas decimais, com os resultados oficiais.

> A reprodução da latência corresponde à **reanálise das 1.500 medições oficiais preservadas**. Uma nova execução do teste de carga constitui uma nova coleta experimental e pode produzir tempos diferentes devido às condições do ambiente de execução.

## Resultados experimentais

O diretório `results/` preserva artefatos das avaliações de detecção e latência.

### Detecção

```text
results/detection/official/
├── experiment-official.sha256
└── evaluation-output.txt
```

A base correspondente está preservada em:

```text
data/official/experiment-official.db
```

As métricas globais reproduzidas sobre o conjunto oficial de teste foram:

```text
Precision = 86,11%
Recall    = 62,50%
F1-score  = 72,43%
FPR       = 8,77%
Accuracy  = 77,86%
```

### Latência

```text
results/latency/
├── official/          # execuções oficiais e arquivos consolidados
├── pilot-sequential/  # execuções piloto preservadas para rastreabilidade
└── P0/                # pré-validação do ambiente
```

A pasta `official/` contém as medições dos cinco blocos experimentais, os arquivos consolidados de perfil e overhead e uma execução inválida preservada para rastreabilidade.

As médias oficiais consolidadas foram:

| Perfil | Média |
|---|---:|
| P0 — acesso direto à API | 10,82 ms |
| P1 — passagem pelo Kong | 13,42 ms |
| P2 — fluxo completo | 75,06 ms |

O overhead médio observado entre P0 e P2 foi de aproximadamente **64,24 ms**.

## Persistência e volumes

O Docker Compose utiliza volumes separados para a API Demo e para o Anomaly Service:

- `api-demo-data`: dados da aplicação de demonstração;
- `anomaly-data`: base experimental e artefato do modelo.

Para encerrar os serviços sem remover os dados:

```powershell
docker compose down
```

> **Atenção:** `docker compose down -v` remove os volumes e, consequentemente, a base experimental e o artefato do modelo. Não utilize `-v` se quiser preservar os dados coletados no ambiente local.

O arquivo `data/official/experiment-official.db` é um snapshot versionado e independente do volume local `anomaly-data`.

## Limitações

Este repositório contém um **protótipo experimental**, não um produto de segurança pronto para produção.

A avaliação foi realizada em ambiente local e controlado. O estado comportamental é mantido em memória por uma única instância do Anomaly Service; não foi avaliado o compartilhamento de estado entre múltiplas réplicas. O estudo utiliza um conjunto específico de características, um único algoritmo não supervisionado e uma API de demonstração em .NET. Os experimentos de latência não representam testes de alta concorrência ou capacidade máxima de processamento.

Verificações diagnósticas adicionais realizadas após a avaliação principal evidenciaram **maior sensibilidade durante a formação inicial do histórico comportamental**. Em contextos com poucas observações anteriores, requisições normais e requisições definidas como anômalas nos cenários controlados puderam receber decisões semelhantes. Em históricos mais estabelecidos, alguns comportamentos originalmente classificados como anômalos deixaram de ultrapassar o limiar de decisão.

Esse comportamento não altera as métricas reportadas para o conjunto oficial preservado, mas limita interpretações causais sobre características isoladas. Como continuidade, recomenda-se investigar estratégias de *cold start*, quantidade mínima de histórico antes da aplicação de bloqueios, diferentes representações das características temporais e novos cenários de anomalia.

A independência tecnológica proposta é arquitetural: a detecção atua na camada HTTP e não depende do código-fonte do backend. O protótipo não foi comparado experimentalmente com aplicações implementadas em diferentes linguagens ou frameworks.

## Contexto acadêmico

Projeto desenvolvido para o Trabalho de Conclusão de Curso em **Análise e Desenvolvimento de Sistemas — Universidade do Vale do Rio dos Sinos (UNISINOS)**.

**Título do trabalho:** *Projeto e Avaliação de um Middleware Inteligente para Detecção de Anomalias em APIs: Uma Abordagem Desacoplada e Agnóstica para Arquiteturas de Microserviços.*

**Autora:** Ruana Boeira Soares
