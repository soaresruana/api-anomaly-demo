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

const BURST_REQUESTS =
    Number(__ENV.BURST_REQUESTS || 20);

const BURST_SLEEP_SECONDS =
    Number(__ENV.BURST_SLEEP_SECONDS || 0.1);

export const options = {
    scenarios: {
        anomaly_burst: {
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
        'X-Experiment-Scenario': 'anomaly-burst-warmup',
        'X-Experiment-Expected-Class': 'normal',
    };
}

function anomalyHeaders(clientId) {
    return {
        'X-Experiment-Client-Id': clientId,
        'X-Experiment-Run-Id': RUN_ID,
        'X-Experiment-Scenario': 'anomaly-burst',
        'X-Experiment-Expected-Class': 'anomaly',
    };
}

export default function () {
    const vuId = exec.vu.idInTest;

    // Cada iteração representa uma sequência
    // comportamental independente.
    const clientId =
        `burst-client-${vuId}-${__ITER}`;

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

    sleep(BURST_SLEEP_SECONDS);

    for (
        let requestIndex = 0;
        requestIndex < BURST_REQUESTS;
        requestIndex++
    ) {
        const response = http.get(
            `${BASE_URL}/products`,
            {
                headers:
                    anomalyHeaders(clientId),
                tags: {
                    step: 'burst',
                },
            }
        );

        check(response, {
            'products returned 200':
                (r) => r.status === 200,
        });

        if (
            requestIndex
            < BURST_REQUESTS - 1
        ) {
            sleep(BURST_SLEEP_SECONDS);
        }
    }
}