import http from 'k6/http';
import { sleep } from 'k6';

const BASE_URL = 'http://localhost:8000';

const CLIENTS_PER_GROUP = 20;
const EXECUTION_ID = `${Date.now()}`;

export const options = {
  scenarios: {
    diagnostic_payload: {
      executor: 'shared-iterations',
      vus: 1,
      iterations: 1,
      maxDuration: '15m',
    },
  },
  discardResponseBodies: true,
};

function headers(runId, clientId, scenario, expectedClass) {
  return {
    headers: {
      'X-Experiment-Run-Id': runId,
      'X-Experiment-Client-Id': clientId,
      'X-Experiment-Scenario': scenario,
      'X-Experiment-Expected-Class': expectedClass,
    },
  };
}

function login(h) {
  return http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      username: 'diagnostic-user',
      password: 'demo-password',
    }),
    {
      headers: {
        ...h.headers,
        'Content-Type': 'application/json',
      },
    }
  );
}

function normalOrder(h) {
  return http.post(
    `${BASE_URL}/orders`,
    JSON.stringify({
      productId: 1,
      quantity: 1,
      notes: 'Normal diagnostic order',
    }),
    {
      headers: {
        ...h.headers,
        'Content-Type': 'application/json',
      },
    }
  );
}

function largePayloadOrder(h) {
  return http.post(
    `${BASE_URL}/orders`,
    JSON.stringify({
      productId: 1,
      quantity: 1,
      notes: 'A'.repeat(1024),
    }),
    {
      headers: {
        ...h.headers,
        'Content-Type': 'application/json',
      },
    }
  );
}

function runShortHistory(index, anomalous) {
  const type = anomalous
    ? 'short-large-payload'
    : 'short-normal-payload';

  const runId =
    `diag-payload-${type}-${EXECUTION_ID}`;

  const clientId =
    `payload-${type}-${EXECUTION_ID}-${index}`;

  const h = headers(
    runId,
    clientId,
    type,
    anomalous ? 'anomaly' : 'normal'
  );

  // Primeira request: warm-up
  const warmup = login(h);

  sleep(1.2);

  // Segunda request: observacao avaliada
  const result = anomalous
    ? largePayloadOrder(h)
    : normalOrder(h);

  return {
    warmup: warmup.status,
    final: result.status,
  };
}

function runEstablishedHistory(index, anomalous) {
  const type = anomalous
    ? 'established-large-payload'
    : 'established-normal-payload';

  const runId =
    `diag-payload-${type}-${EXECUTION_ID}`;

  const clientId =
    `payload-${type}-${EXECUTION_ID}-${index}`;

  const h = headers(
    runId,
    clientId,
    type,
    anomalous ? 'anomaly' : 'normal'
  );

  // N1 - warm-up
  login(h);

  sleep(1.42);

  // N2 - pode ocorrer FP no inicio
  http.get(
    `${BASE_URL}/products?page=1&category=electronics`,
    h
  );

  sleep(1.007);

  // N3
  http.get(
    `${BASE_URL}/products/1`,
    h
  );

  sleep(1.028);

  // N4
  http.get(
    `${BASE_URL}/products/2`,
    h
  );

  sleep(1.766);

  // N5
  login(h);

  sleep(0.98);

  // N6 - confirma perfil normal estabelecido
  const control = http.get(
    `${BASE_URL}/products?page=1`,
    h
  );

  sleep(1.2);

  // N7 - unica diferenca entre os grupos:
  // payload normal OU payload de 1024 chars
  const result = anomalous
    ? largePayloadOrder(h)
    : normalOrder(h);

  return {
    control: control.status,
    final: result.status,
  };
}

function percent(value, total) {
  return ((value / total) * 100).toFixed(1);
}

export default function () {
  console.log(
    '============================================================'
  );
  console.log(
    'DIAGNOSTICO - PAYLOAD SIZE / HISTORICO'
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

  // ==========================================================
  // GRUPO 1 - HISTORICO CURTO + PAYLOAD NORMAL
  // ==========================================================

  console.log('');
  console.log(
    '=== GRUPO 1 - HISTORICO CURTO + PAYLOAD NORMAL ==='
  );

  let shortNormalBlocked = 0;
  let shortNormalAllowed = 0;
  let shortNormalOther = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const r = runShortHistory(i, false);

    if (r.final === 403) {
      shortNormalBlocked++;
    } else if (r.final === 201) {
      shortNormalAllowed++;
    } else {
      shortNormalOther++;
    }

    console.log(
      `[SHORT NORMAL ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `warmup=${r.warmup} final=${r.final}`
    );

    sleep(0.2);
  }

  // ==========================================================
  // GRUPO 2 - HISTORICO CURTO + PAYLOAD 1024
  // ==========================================================

  console.log('');
  console.log(
    '=== GRUPO 2 - HISTORICO CURTO + PAYLOAD 1024 ==='
  );

  let shortAnomalyBlocked = 0;
  let shortAnomalyAllowed = 0;
  let shortAnomalyOther = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const r = runShortHistory(i, true);

    if (r.final === 403) {
      shortAnomalyBlocked++;
    } else if (r.final === 201) {
      shortAnomalyAllowed++;
    } else {
      shortAnomalyOther++;
    }

    console.log(
      `[SHORT PAYLOAD 1024 ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `warmup=${r.warmup} final=${r.final}`
    );

    sleep(0.2);
  }

  // ==========================================================
  // GRUPO 3 - HISTORICO ESTABELECIDO + PAYLOAD NORMAL
  // ==========================================================

  console.log('');
  console.log(
    '=== GRUPO 3 - HISTORICO ESTABELECIDO + PAYLOAD NORMAL ==='
  );

  let establishedNormalBlocked = 0;
  let establishedNormalAllowed = 0;
  let establishedNormalOther = 0;

  let establishedNormalControlOk = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const r = runEstablishedHistory(i, false);

    if (r.control === 200) {
      establishedNormalControlOk++;
    }

    if (r.final === 403) {
      establishedNormalBlocked++;
    } else if (r.final === 201) {
      establishedNormalAllowed++;
    } else {
      establishedNormalOther++;
    }

    console.log(
      `[ESTABLISHED NORMAL ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `control=${r.control} final=${r.final}`
    );

    sleep(0.2);
  }

  // ==========================================================
  // GRUPO 4 - HISTORICO ESTABELECIDO + PAYLOAD 1024
  // ==========================================================

  console.log('');
  console.log(
    '=== GRUPO 4 - HISTORICO ESTABELECIDO + PAYLOAD 1024 ==='
  );

  let establishedAnomalyBlocked = 0;
  let establishedAnomalyAllowed = 0;
  let establishedAnomalyOther = 0;

  let establishedAnomalyControlOk = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const r = runEstablishedHistory(i, true);

    if (r.control === 200) {
      establishedAnomalyControlOk++;
    }

    if (r.final === 403) {
      establishedAnomalyBlocked++;
    } else if (r.final === 201) {
      establishedAnomalyAllowed++;
    } else {
      establishedAnomalyOther++;
    }

    console.log(
      `[ESTABLISHED PAYLOAD 1024 ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `control=${r.control} final=${r.final}`
    );

    sleep(0.2);
  }

  // ==========================================================
  // RESULTADO
  // ==========================================================

  console.log('');
  console.log('');
  console.log(
    '============================================================'
  );
  console.log(
    'RESULTADO DO DIAGNOSTICO - PAYLOAD'
  );
  console.log(
    '============================================================'
  );

  console.log('');
  console.log(
    '1. HISTORICO CURTO - PAYLOAD NORMAL'
  );
  console.log(
    `   Permitidas (201): ${shortNormalAllowed}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas (403): ${shortNormalBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Outros status   : ${shortNormalOther}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Taxa bloqueio   : ${percent(
      shortNormalBlocked,
      CLIENTS_PER_GROUP
    )}%`
  );

  console.log('');
  console.log(
    '2. HISTORICO CURTO - PAYLOAD 1024'
  );
  console.log(
    `   Permitidas (201): ${shortAnomalyAllowed}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas (403): ${shortAnomalyBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Outros status   : ${shortAnomalyOther}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Taxa bloqueio   : ${percent(
      shortAnomalyBlocked,
      CLIENTS_PER_GROUP
    )}%`
  );

  console.log('');
  console.log(
    '3. HISTORICO ESTABELECIDO - PAYLOAD NORMAL'
  );
  console.log(
    `   Controle normal 200: ${establishedNormalControlOk}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Permitidas (201): ${establishedNormalAllowed}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas (403): ${establishedNormalBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Outros status   : ${establishedNormalOther}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Taxa bloqueio   : ${percent(
      establishedNormalBlocked,
      CLIENTS_PER_GROUP
    )}%`
  );

  console.log('');
  console.log(
    '4. HISTORICO ESTABELECIDO - PAYLOAD 1024'
  );
  console.log(
    `   Controle normal 200: ${establishedAnomalyControlOk}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Permitidas (201): ${establishedAnomalyAllowed}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas (403): ${establishedAnomalyBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Outros status   : ${establishedAnomalyOther}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Taxa bloqueio   : ${percent(
      establishedAnomalyBlocked,
      CLIENTS_PER_GROUP
    )}%`
  );

  console.log('');
  console.log(
    '------------------------------------------------------------'
  );
  console.log('LEITURA RAPIDA');

  console.log(
    `Curto / normal      : ${percent(
      shortNormalBlocked,
      CLIENTS_PER_GROUP
    )}% bloqueado`
  );

  console.log(
    `Curto / payload1024 : ${percent(
      shortAnomalyBlocked,
      CLIENTS_PER_GROUP
    )}% bloqueado`
  );

  console.log(
    `Estab. / normal     : ${percent(
      establishedNormalBlocked,
      CLIENTS_PER_GROUP
    )}% bloqueado`
  );

  console.log(
    `Estab. / payload1024: ${percent(
      establishedAnomalyBlocked,
      CLIENTS_PER_GROUP
    )}% bloqueado`
  );

  console.log(
    '============================================================'
  );
}