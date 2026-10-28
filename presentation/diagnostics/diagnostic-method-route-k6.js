import http from 'k6/http';
import { sleep } from 'k6';

const BASE_URL = 'http://localhost:8000';

const CLIENTS_PER_GROUP = 20;
const EXECUTION_ID = `${Date.now()}`;

export const options = {
  scenarios: {
    diagnostic_method_route: {
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

/*
 * ============================================================
 * HISTORICO CURTO
 * ============================================================
 */

function runShort(index, anomalous) {
  const type = anomalous
    ? 'short-method-route'
    : 'short-normal-get';

  const runId =
    `diag-method-${type}-${EXECUTION_ID}`;

  const clientId =
    `method-${type}-${EXECUTION_ID}-${index}`;

  const h = headers(
    runId,
    clientId,
    type,
    anomalous ? 'anomaly' : 'normal'
  );

  // Warm-up
  const warmup = http.get(
    `${BASE_URL}/products/1`,
    h
  );

  sleep(1.2);

  // Segunda request
  const result = anomalous
    ? http.get(`${BASE_URL}/orders`, h)
    : http.get(`${BASE_URL}/products?page=1`, h);

  return {
    warmup: warmup.status,
    final: result.status,
  };
}

/*
 * ============================================================
 * HISTORICO ESTABELECIDO
 * ============================================================
 */

function buildEstablishedHistory(
  group,
  index,
  expectedClass
) {
  const runId =
    `diag-method-${group}-${EXECUTION_ID}`;

  const clientId =
    `method-${group}-${EXECUTION_ID}-${index}`;

  const h = headers(
    runId,
    clientId,
    group,
    expectedClass
  );

  // N1 - warm-up
  login(h);

  sleep(1.42);

  // N2
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

  // N6 - comportamento normal conhecido
  const control = http.get(
    `${BASE_URL}/products?page=1`,
    h
  );

  sleep(1.2);

  return {
    h,
    controlStatus: control.status,
  };
}

function runEstablishedKnownGet(index) {
  const state = buildEstablishedHistory(
    'established-known-get',
    index,
    'normal'
  );

  const result = http.get(
    `${BASE_URL}/products?page=1`,
    state.h
  );

  return {
    control: state.controlStatus,
    final: result.status,
  };
}

function runEstablishedKnownOrdersRoute(index) {
  const state = buildEstablishedHistory(
    'established-known-orders',
    index,
    'normal'
  );

  const result = normalOrder(state.h);

  return {
    control: state.controlStatus,
    final: result.status,
  };
}

function runEstablishedMethodRouteAnomaly(index) {
  const state = buildEstablishedHistory(
    'established-method-route',
    index,
    'anomaly'
  );

  // GET e /orders existem individualmente no baseline,
  // mas esta combinacao nao.
  const result = http.get(
    `${BASE_URL}/orders`,
    state.h
  );

  return {
    control: state.controlStatus,
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
    'DIAGNOSTICO - METHOD-ROUTE / HISTORICO'
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
   * GRUPO 1 - SHORT NORMAL
   * ==========================================================
   */

  console.log('');
  console.log(
    '=== GRUPO 1 - HISTORICO CURTO + GET NORMAL ==='
  );

  let shortNormalBlocked = 0;
  let shortNormalAllowed = 0;
  let shortNormalOther = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const r = runShort(i, false);

    if (r.final === 403) {
      shortNormalBlocked++;
    } else if (r.final === 200) {
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

  /*
   * ==========================================================
   * GRUPO 2 - SHORT METHOD-ROUTE
   * ==========================================================
   */

  console.log('');
  console.log(
    '=== GRUPO 2 - HISTORICO CURTO + GET /orders ==='
  );

  let shortAnomalyBlocked = 0;
  let shortAnomalyBackend405 = 0;
  let shortAnomalyOther = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const r = runShort(i, true);

    if (r.final === 403) {
      shortAnomalyBlocked++;
    } else if (r.final === 405) {
      shortAnomalyBackend405++;
    } else {
      shortAnomalyOther++;
    }

    console.log(
      `[SHORT GET /orders ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `warmup=${r.warmup} final=${r.final}`
    );

    sleep(0.2);
  }

  /*
   * ==========================================================
   * GRUPO 3 - ESTABLISHED KNOWN GET
   * ==========================================================
   */

  console.log('');
  console.log(
    '=== GRUPO 3 - HISTORICO ESTABELECIDO + GET CONHECIDO ==='
  );

  let knownGetAllowed = 0;
  let knownGetBlocked = 0;
  let knownGetOther = 0;
  let knownGetControlOk = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const r = runEstablishedKnownGet(i);

    if (r.control === 200) {
      knownGetControlOk++;
    }

    if (r.final === 200) {
      knownGetAllowed++;
    } else if (r.final === 403) {
      knownGetBlocked++;
    } else {
      knownGetOther++;
    }

    console.log(
      `[ESTABLISHED KNOWN GET ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `control=${r.control} final=${r.final}`
    );

    sleep(0.2);
  }

  /*
   * ==========================================================
   * GRUPO 4 - ESTABLISHED /orders WITH KNOWN METHOD
   * ==========================================================
   */

  console.log('');
  console.log(
    '=== GRUPO 4 - HISTORICO ESTABELECIDO + POST /orders ==='
  );

  let knownOrdersAllowed = 0;
  let knownOrdersBlocked = 0;
  let knownOrdersOther = 0;
  let knownOrdersControlOk = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const r = runEstablishedKnownOrdersRoute(i);

    if (r.control === 200) {
      knownOrdersControlOk++;
    }

    if (r.final === 201) {
      knownOrdersAllowed++;
    } else if (r.final === 403) {
      knownOrdersBlocked++;
    } else {
      knownOrdersOther++;
    }

    console.log(
      `[ESTABLISHED POST /orders ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `control=${r.control} final=${r.final}`
    );

    sleep(0.2);
  }

  /*
   * ==========================================================
   * GRUPO 5 - ESTABLISHED METHOD-ROUTE ANOMALY
   * ==========================================================
   */

  console.log('');
  console.log(
    '=== GRUPO 5 - HISTORICO ESTABELECIDO + GET /orders ==='
  );

  let anomalyBlocked = 0;
  let anomalyBackend405 = 0;
  let anomalyOther = 0;
  let anomalyControlOk = 0;

  for (let i = 0; i < CLIENTS_PER_GROUP; i++) {
    const r = runEstablishedMethodRouteAnomaly(i);

    if (r.control === 200) {
      anomalyControlOk++;
    }

    if (r.final === 403) {
      anomalyBlocked++;
    } else if (r.final === 405) {
      anomalyBackend405++;
    } else {
      anomalyOther++;
    }

    console.log(
      `[ESTABLISHED GET /orders ${i + 1}/${CLIENTS_PER_GROUP}] ` +
      `control=${r.control} final=${r.final}`
    );

    sleep(0.2);
  }

  /*
   * ==========================================================
   * RESULTADO
   * ==========================================================
   */

  console.log('');
  console.log('');
  console.log(
    '============================================================'
  );
  console.log(
    'RESULTADO DO DIAGNOSTICO - METHOD-ROUTE'
  );
  console.log(
    '============================================================'
  );

  console.log('');
  console.log(
    '1. HISTORICO CURTO - GET NORMAL'
  );
  console.log(
    `   Permitidas (200): ${shortNormalAllowed}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas (403): ${shortNormalBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Outros         : ${shortNormalOther}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Taxa bloqueio  : ${percent(
      shortNormalBlocked,
      CLIENTS_PER_GROUP
    )}%`
  );

  console.log('');
  console.log(
    '2. HISTORICO CURTO - GET /orders'
  );
  console.log(
    `   Bloqueadas middleware (403): ${shortAnomalyBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Chegaram backend (405)     : ${shortAnomalyBackend405}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Outros                     : ${shortAnomalyOther}/${CLIENTS_PER_GROUP}`
  );

  console.log('');
  console.log(
    '3. HISTORICO ESTABELECIDO - GET CONHECIDO'
  );
  console.log(
    `   Controle previo 200: ${knownGetControlOk}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Permitidas (200)   : ${knownGetAllowed}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas (403)   : ${knownGetBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Outros             : ${knownGetOther}/${CLIENTS_PER_GROUP}`
  );

  console.log('');
  console.log(
    '4. HISTORICO ESTABELECIDO - POST /orders'
  );
  console.log(
    `   Controle previo 200: ${knownOrdersControlOk}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Permitidas (201)   : ${knownOrdersAllowed}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas (403)   : ${knownOrdersBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Outros             : ${knownOrdersOther}/${CLIENTS_PER_GROUP}`
  );

  console.log('');
  console.log(
    '5. HISTORICO ESTABELECIDO - GET /orders'
  );
  console.log(
    `   Controle previo 200       : ${anomalyControlOk}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Bloqueadas middleware 403 : ${anomalyBlocked}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Chegaram backend 405      : ${anomalyBackend405}/${CLIENTS_PER_GROUP}`
  );
  console.log(
    `   Outros                    : ${anomalyOther}/${CLIENTS_PER_GROUP}`
  );

  console.log('');
  console.log(
    '------------------------------------------------------------'
  );
  console.log('LEITURA RAPIDA');

  console.log(
    `Curto / GET normal : ${percent(
      shortNormalBlocked,
      CLIENTS_PER_GROUP
    )}% bloqueado`
  );

  console.log(
    `Curto / GET orders : ${percent(
      shortAnomalyBlocked,
      CLIENTS_PER_GROUP
    )}% bloqueado`
  );

  console.log(
    `Estab. / GET normal: ${percent(
      knownGetBlocked,
      CLIENTS_PER_GROUP
    )}% bloqueado`
  );

  console.log(
    `Estab. / POST orders: ${percent(
      knownOrdersBlocked,
      CLIENTS_PER_GROUP
    )}% bloqueado`
  );

  console.log(
    `Estab. / GET orders: ${percent(
      anomalyBlocked,
      CLIENTS_PER_GROUP
    )}% bloqueado pelo middleware`
  );

  console.log(
    '============================================================'
  );
}