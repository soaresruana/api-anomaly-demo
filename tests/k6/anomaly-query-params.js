import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

const BASE_URL =
    __ENV.BASE_URL || 'http://localhost:8000';

const RUN_ID = __ENV.RUN_ID;

if (!RUN_ID) {
    throw new Error('RUN_ID is required.');
}

const VUS =
    Number(__ENV.VUS || 1);

const ITERATIONS_PER_VU =
    Number(__ENV.ITERATIONS_PER_VU || 1);

const NORMAL_SLEEP_SECONDS =
    Number(__ENV.NORMAL_SLEEP_SECONDS || 1.2);

const QUERY_PARAM_COUNT =
    Number(__ENV.QUERY_PARAM_COUNT || 10);

export const options = {
    scenarios: {
        anomaly_query_params: {
            executor: 'per-vu-iterations',
            vus: VUS,
            iterations: ITERATIONS_PER_VU,
            maxDuration: '5m',
        },
    },
};

function warmupHeaders(clientId) {
    return {
        'X-Experiment-Client-Id': clientId,
        'X-Experiment-Run-Id': RUN_ID,
        'X-Experiment-Scenario':
            'anomaly-query-params-warmup',
        'X-Experiment-Expected-Class': 'normal',
    };
}

function anomalyHeaders(clientId) {
    return {
        'X-Experiment-Client-Id': clientId,
        'X-Experiment-Run-Id': RUN_ID,
        'X-Experiment-Scenario':
            'anomaly-query-params',
        'X-Experiment-Expected-Class': 'anomaly',
    };
}

function buildAnomalousProductsUrl() {
    const params = [];

    for (
        let index = 1;
        index <= QUERY_PARAM_COUNT;
        index++
    ) {
        params.push(`param${index}=${index}`);
    }

    return `${BASE_URL}/products?${params.join('&')}`;
}

export default function () {
    const vuId = exec.vu.idInTest;

    const clientId =
        `query-client-${vuId}-${__ITER}`;

    // Normal warmup on a second known route.
    const warmupResponse = http.get(
        `${BASE_URL}/products/1`,
        {
            headers: warmupHeaders(clientId),
            tags: {
                step: 'warmup',
            },
        }
    );

    check(warmupResponse, {
        'warmup returned 200':
            (r) => r.status === 200,
    });

    // Keep temporal behavior inside the normal baseline.
    sleep(NORMAL_SLEEP_SECONDS);

    const anomalyResponse = http.get(
        buildAnomalousProductsUrl(),
        {
            headers: anomalyHeaders(clientId),
            tags: {
                step: 'many-query-params',
            },
        }
    );

    check(anomalyResponse, {
        'products returned 200':
            (r) => r.status === 200,
    });
}