import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 1,
  iterations: 1,
};

const BASE_URL = 'http://localhost:8000';

// Gera um identificador novo a cada execucao.
// Isso evita reutilizar historico de testes anteriores.
const EXECUTION_ID = `${Date.now()}`;

function buildHeaders(runId, clientId) {
  return {
    headers: {
      'X-Experiment-Run-Id': runId,
      'X-Experiment-Client-Id': clientId,
    },
  };
}

function logResult(label, response) {
  console.log(`${label} -> HTTP ${response.status}`);
}

export default function () {
  const normalRunId = `demo-k6-normal-${EXECUTION_ID}`;
  const normalClientId = `usuario-k6-normal-${EXECUTION_ID}`;

  const anomalyRunId = `demo-k6-query-${EXECUTION_ID}`;
  const anomalyClientId = `usuario-k6-query-${EXECUTION_ID}`;

  const normalHeaders = buildHeaders(
    normalRunId,
    normalClientId
  );

  const anomalyHeaders = buildHeaders(
    anomalyRunId,
    anomalyClientId
  );

  console.log('============================================================');
  console.log('DEMO K6 - Middleware de Deteccao de Anomalias em APIs');
  console.log(`Execucao: ${EXECUTION_ID}`);
  console.log('============================================================');

  console.log('');
  console.log('=== ETAPA 1 - ESTABELECIMENTO DO PERFIL NORMAL ===');
  console.log(`Run ID   : ${normalRunId}`);
  console.log(`Client ID: ${normalClientId}`);

  // ----------------------------------------------------------
  // N1 - Warm-up inicial
  // ----------------------------------------------------------
  let response = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      username: 'demo-user',
      password: 'demo-password',
    }),
    {
      headers: {
        ...normalHeaders.headers,
        'Content-Type': 'application/json',
      },
    }
  );

  logResult('N1 - Warm-up / login', response);

  sleep(1.42);

  // ----------------------------------------------------------
  // N2 - Formacao inicial de historico
  //
  // Como o historico ainda e pequeno, esta chamada pode ser
  // classificada como falso positivo. Ela nao e usada como
  // evidencia principal da demonstracao.
  // ----------------------------------------------------------
  response = http.get(
    `${BASE_URL}/products?page=1&category=electronics`,
    normalHeaders
  );

  logResult('N2 - Formacao de historico', response);

  sleep(1.007);

  // ----------------------------------------------------------
  // N3 - Continua formando historico
  // ----------------------------------------------------------
  response = http.get(
    `${BASE_URL}/products/1`,
    normalHeaders
  );

  logResult('N3 - Consulta de produto', response);

  sleep(1.028);

  // ----------------------------------------------------------
  // N4 - Continua formando historico
  // ----------------------------------------------------------
  response = http.get(
    `${BASE_URL}/products/2`,
    normalHeaders
  );

  logResult('N4 - Consulta de outro produto', response);

  sleep(1.766);

  console.log('');
  console.log('=== ETAPA 2 - DEMONSTRACAO DO COMPORTAMENTO NORMAL ===');

  // ----------------------------------------------------------
  // N5 - Perfil normal ja possui historico
  // ----------------------------------------------------------
  const normalLogin = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      username: 'demo-user',
      password: 'demo-password',
    }),
    {
      headers: {
        ...normalHeaders.headers,
        'Content-Type': 'application/json',
      },
    }
  );

  logResult(
    'N5 - Login do perfil conhecido',
    normalLogin
  );

  sleep(0.98);

  // ----------------------------------------------------------
  // N6 - Requisicao normal usada como evidencia da demo
  // Resultado esperado: HTTP 200
  // ----------------------------------------------------------
  const normalNavigation = http.get(
    `${BASE_URL}/products?page=1`,
    normalHeaders
  );

  logResult(
    'N6 - Navegacao normal',
    normalNavigation
  );

  console.log('');
  console.log('=== ETAPA 3 - CENARIO ANOMALO: QUERY PARAMETERS ===');
  console.log(`Run ID   : ${anomalyRunId}`);
  console.log(`Client ID: ${anomalyClientId}`);

  // ----------------------------------------------------------
  // A1 - Contexto independente do perfil normal.
  // Primeira chamada do cliente: warm-up.
  // ----------------------------------------------------------
  const anomalyWarmup = http.get(
    `${BASE_URL}/products/1`,
    anomalyHeaders
  );

  logResult(
    'A1 - Warm-up do perfil anomalo',
    anomalyWarmup
  );

  sleep(1.22);

  // ----------------------------------------------------------
  // A2 - Reproducao do cenario descrito no artigo:
  // GET /products contendo 10 query parameters.
  //
  // Resultado esperado: HTTP 403
  // ----------------------------------------------------------
  const anomalyRequest = http.get(
    `${BASE_URL}/products?p1=1&p2=2&p3=3&p4=4&p5=5&p6=6&p7=7&p8=8&p9=9&p10=10`,
    anomalyHeaders
  );

  logResult(
    'A2 - Requisicao com 10 query params',
    anomalyRequest
  );

  console.log('');
  console.log('============================================================');
  console.log('RESULTADO PRINCIPAL');
  console.log(`Normal - login             : HTTP ${normalLogin.status}`);
  console.log(`Normal - /products?page=1  : HTTP ${normalNavigation.status}`);
  console.log(`Anomalo - 10 query params  : HTTP ${anomalyRequest.status}`);
  console.log('============================================================');

  // ----------------------------------------------------------
  // Validacoes k6
  // ----------------------------------------------------------
  check(normalLogin, {
    'perfil normal - login permitido (200)': (res) =>
      res.status === 200,
  });

  check(normalNavigation, {
    'perfil normal - navegacao permitida (200)': (res) =>
      res.status === 200,
  });

  check(anomalyWarmup, {
    'perfil anomalo - warm-up permitido (200)': (res) =>
      res.status === 200,
  });

  check(anomalyRequest, {
    'perfil anomalo - 10 query params bloqueado (403)': (res) =>
      res.status === 403,
  });

  const demoOk =
    normalLogin.status === 200 &&
    normalNavigation.status === 200 &&
    anomalyWarmup.status === 200 &&
    anomalyRequest.status === 403;

  console.log('');

  if (demoOk) {
    console.log('DEMO OK');
    console.log('- comportamento normal permitido');
    console.log('- contexto anomalo inicializado corretamente');
    console.log('- requisicao com 10 query params bloqueada');
  } else {
    console.log(
      'DEMO NAO REPRODUZIU COMPLETAMENTE O RESULTADO ESPERADO'
    );
  }
}