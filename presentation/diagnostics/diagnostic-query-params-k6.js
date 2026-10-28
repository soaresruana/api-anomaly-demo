import http from 'k6/http';
import { sleep } from 'k6';

export const options = {
  vus: 1,
  iterations: 1,
  discardResponseBodies: true,
};

const BASE_URL = 'http://localhost:8000';

// Quantidade de clientes independentes por grupo.
const CLIENTS_PER_GROUP = 20;

// Identificador unico desta execucao.
const EXECUTION_ID = `${Date.now()}`;

function buildHeaders(runId, clientId) {
  return {
    headers: {
      'X-Experiment-Run-Id': runId,
      'X-Experiment-Client-Id': clientId,
    },
  };
}

function login(headers) {
  return http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      username: 'demo-user',
      password: 'demo-password',
    }),
    {
      headers: {
        ...headers.headers,
        'Content-Type': 'application/json',
      },
    }
  );
}

function normalQueryUrl() {
  return `${BASE_URL}/products?page=1`;
}

function anomalyQueryUrl() {
  return (
    `${BASE_URL}/products` +
    `?p1=1` +
    `&p2=2` +
    `&p3=3` +
    `&p4=4` +
    `&p5=5` +
    `&p6=6` +
    `&p7=7` +
    `&p8=8` +
    `&p9=9` +
    `&p10=10`
  );
}

/*
 * ------------------------------------------------------------
 * HISTORICO CURTO
 * ------------------------------------------------------------
 *
 * Reproduz exatamente a estrutura que nos chamou atencao:
 *
 * 1. primeira request = warm-up
 * 2. sleep ~1.2s
 * 3. segunda request = observacao avaliada
 *
 * O objetivo e comparar:
 *
 * normal:  /products?page=1
 * anomaly: /products com 10 query params
 *
 * Mantendo o restante do contexto praticamente igual.
 */

function runShortHistoryClient(group, index, anomalous) {
  const runId =
    `diag-${group}-${EXECUTION_ID}`;

  const clientId =
    `client-${group}-${EXECUTION_ID}-${index}`;

  const headers = buildHeaders(runId, clientId);

  // Primeira observacao.
  // Deve ser warm-up e nao elegivel para inferencia.
  const warmup = http.get(
    `${BASE_URL}/products/1`,
    headers
  );

  sleep(1.2);

  // Segunda observacao: esta e a request que queremos analisar.
  const result = anomalous
    ? http.get(anomalyQueryUrl(), headers)
    : http.get(normalQueryUrl(), headers);

  return {
    warmupStatus: warmup.status,
    finalStatus: result.status,
  };
}

/*
 * ------------------------------------------------------------
 * HISTORICO ESTABELECIDO
 * ------------------------------------------------------------
 *
 * Reproduz o perfil de navegacao que ja vimos resultar em
 * comportamento normal depois da construcao do estado.
 *
 * Depois de construir o mesmo historico, a ultima request muda:
 *
 * normal:  /products?page=1
 * anomaly: /products com 10 query params
 */

function runEstablishedHistoryClient(
  group,
  index,
  anomalous
) {
  const runId =
    `diag-${group}-${EXECUTION_ID}`;

  const clientId =
    `client-${group}-${EXECUTION_ID}-${index}`;

  const headers = buildHeaders(runId, clientId);

  // N1
  // Primeira observacao / warm-up.
  login(headers);

  sleep(1.42);

  // N2
  http.get(
    `${BASE_URL}/products?page=1&category=electronics`,
    headers
  );

  sleep(1.007);

  // N3
  http.get(
    `${BASE_URL}/products/1`,
    headers
  );

  sleep(1.028);

  // N4
  http.get(
    `${BASE_URL}/products/2`,
    headers
  );

  sleep(1.766);

  // N5
  login(headers);

  sleep(0.98);

  // N6
  // Observacao que queremos comparar entre os grupos.
  const result = anomalous
    ? http.get(anomalyQueryUrl(), headers)
    : http.get(normalQueryUrl(), headers);

  return {
    finalStatus: result.status,
  };
}

function percentage(value, total) {
  return ((value / total) * 100).toFixed(1);
}

export default function () {
  console.log(
    '============================================================'
  );
  console.log(
    'DIAGNOSTICO - QUERY PARAMETERS / HISTORICO'
  );
  console.log(
    `Execucao: ${EXECUTION_ID}`
  );
  console.log(
    `Clientes por grupo: ${CLIENTS_PER_GROUP}`
  );
  console.log(
    '============================================================'
  );

  /*
   * ==========================================================
   * GRUPO 1
   * HISTORICO CURTO + REQUEST NORMAL
   * ==========================================================
   */

  console.log('');
  console.log(
    '=== GRUPO 1 - HISTORICO CURTO + NORMAL ==='
  );

  let shortNormalBlocked = 0;
  let shortNormalAllowed = 0;
  let shortNormalWarmupUnexpected = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const result = runShortHistoryClient(
      'short-normal',
      i,
      false
    );

    if (result.warmupStatus !== 200) {
      shortNormalWarmupUnexpected++;
    }

    if (result.finalStatus === 403) {
      shortNormalBlocked++;
    }

    if (result.finalStatus === 200) {
      shortNormalAllowed++;
    }

    console.log(
      `[SHORT NORMAL ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `warmup=${result.warmupStatus} ` +
      `final=${result.finalStatus}`
    );

    sleep(0.2);
  }

  /*
   * ==========================================================
   * GRUPO 2
   * HISTORICO CURTO + 10 QUERY PARAMS
   * ==========================================================
   */

  console.log('');
  console.log(
    '=== GRUPO 2 - HISTORICO CURTO + 10 PARAMS ==='
  );

  let shortAnomalyBlocked = 0;
  let shortAnomalyAllowed = 0;
  let shortAnomalyWarmupUnexpected = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const result = runShortHistoryClient(
      'short-anomaly',
      i,
      true
    );

    if (result.warmupStatus !== 200) {
      shortAnomalyWarmupUnexpected++;
    }

    if (result.finalStatus === 403) {
      shortAnomalyBlocked++;
    }

    if (result.finalStatus === 200) {
      shortAnomalyAllowed++;
    }

    console.log(
      `[SHORT 10 PARAMS ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `warmup=${result.warmupStatus} ` +
      `final=${result.finalStatus}`
    );

    sleep(0.2);
  }

  /*
   * ==========================================================
   * GRUPO 3
   * HISTORICO ESTABELECIDO + REQUEST NORMAL
   * ==========================================================
   */

  console.log('');
  console.log(
    '=== GRUPO 3 - HISTORICO ESTABELECIDO + NORMAL ==='
  );

  let establishedNormalBlocked = 0;
  let establishedNormalAllowed = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const result = runEstablishedHistoryClient(
      'established-normal',
      i,
      false
    );

    if (result.finalStatus === 403) {
      establishedNormalBlocked++;
    }

    if (result.finalStatus === 200) {
      establishedNormalAllowed++;
    }

    console.log(
      `[ESTABLISHED NORMAL ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `final=${result.finalStatus}`
    );

    sleep(0.2);
  }

  /*
   * ==========================================================
   * GRUPO 4
   * HISTORICO ESTABELECIDO + 10 QUERY PARAMS
   * ==========================================================
   */

  console.log('');
  console.log(
    '=== GRUPO 4 - HISTORICO ESTABELECIDO + 10 PARAMS ==='
  );

  let establishedAnomalyBlocked = 0;
  let establishedAnomalyAllowed = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const result = runEstablishedHistoryClient(
      'established-anomaly',
      i,
      true
    );

    if (result.finalStatus === 403) {
      establishedAnomalyBlocked++;
    }

    if (result.finalStatus === 200) {
      establishedAnomalyAllowed++;
    }

    console.log(
      `[ESTABLISHED 10 PARAMS ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `final=${result.finalStatus}`
    );

    sleep(0.2);
  }

  /*
   * ==========================================================
   * RESUMO
   * ==========================================================
   */

  console.log('');
  console.log('');
  console.log(
    '============================================================'
  );
  console.log(
    'RESULTADO DO DIAGNOSTICO'
  );
  console.log(
    '============================================================'
  );

  console.log('');
  console.log(
    '1. HISTORICO CURTO - NORMAL'
  );
  console.log(
    `   Permitidas (200): ${shortNormalAllowed}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas (403): ${shortNormalBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Taxa de bloqueio: ${percentage(
      shortNormalBlocked,
      CLIENTS_PER_GROUP
    )}%`
  );

  console.log('');
  console.log(
    '2. HISTORICO CURTO - 10 QUERY PARAMS'
  );
  console.log(
    `   Permitidas (200): ${shortAnomalyAllowed}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas (403): ${shortAnomalyBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Taxa de bloqueio: ${percentage(
      shortAnomalyBlocked,
      CLIENTS_PER_GROUP
    )}%`
  );

  console.log('');
  console.log(
    '3. HISTORICO ESTABELECIDO - NORMAL'
  );
  console.log(
    `   Permitidas (200): ${establishedNormalAllowed}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas (403): ${establishedNormalBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Taxa de bloqueio: ${percentage(
      establishedNormalBlocked,
      CLIENTS_PER_GROUP
    )}%`
  );

  console.log('');
  console.log(
    '4. HISTORICO ESTABELECIDO - 10 QUERY PARAMS'
  );
  console.log(
    `   Permitidas (200): ${establishedAnomalyAllowed}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas (403): ${establishedAnomalyBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Taxa de bloqueio: ${percentage(
      establishedAnomalyBlocked,
      CLIENTS_PER_GROUP
    )}%`
  );

  console.log('');
  console.log(
    '------------------------------------------------------------'
  );

  console.log(
    'LEITURA RAPIDA'
  );

  console.log(
    `Historico curto: normal bloqueado em ` +
    `${percentage(shortNormalBlocked, CLIENTS_PER_GROUP)}%`
  );

  console.log(
    `Historico curto: 10 params bloqueado em ` +
    `${percentage(shortAnomalyBlocked, CLIENTS_PER_GROUP)}%`
  );

  console.log(
    `Historico estabelecido: normal bloqueado em ` +
    `${percentage(establishedNormalBlocked, CLIENTS_PER_GROUP)}%`
  );

  console.log(
    `Historico estabelecido: 10 params bloqueado em ` +
    `${percentage(establishedAnomalyBlocked, CLIENTS_PER_GROUP)}%`
  );

  console.log(
    '============================================================'
  );
}