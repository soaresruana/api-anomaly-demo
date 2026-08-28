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

const LARGE_NOTES_SIZE =
    Number(__ENV.LARGE_NOTES_SIZE || 1024);

export const options = {
    scenarios: {
        anomaly_payload: {
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
            'anomaly-payload-warmup',
        'X-Experiment-Expected-Class': 'normal',
        'Content-Type': 'application/json',
    };
}

function anomalyHeaders(clientId) {
    return {
        'X-Experiment-Client-Id': clientId,
        'X-Experiment-Run-Id': RUN_ID,
        'X-Experiment-Scenario': 'anomaly-payload',
        'X-Experiment-Expected-Class': 'anomaly',
        'Content-Type': 'application/json',
    };
}

export default function () {
    const vuId = exec.vu.idInTest;

    const clientId =
        `payload-client-${vuId}-${__ITER}`;

    // Normal warmup request.
    const loginResponse = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({
            username: `payload-user-${vuId}`,
            password: 'demo-password',
        }),
        {
            headers: warmupHeaders(clientId),
            tags: {
                step: 'warmup',
            },
        }
    );

    check(loginResponse, {
        'warmup returned 200':
            (r) => r.status === 200,
    });

    // Keep temporal behavior inside the normal baseline.
    sleep(NORMAL_SLEEP_SECONDS);

    const largeNotes =
        'A'.repeat(LARGE_NOTES_SIZE);

    const orderResponse = http.post(
        `${BASE_URL}/orders`,
        JSON.stringify({
            productId: 1,
            quantity: 1,
            notes: largeNotes,
        }),
        {
            headers: anomalyHeaders(clientId),
            tags: {
                step: 'large-payload',
            },
        }
    );

    check(orderResponse, {
        'order returned 201':
            (r) => r.status === 201,
    });
}