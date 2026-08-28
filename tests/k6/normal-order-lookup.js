import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';

// Usado somente para preparar dados.
// Não passa pelo Kong.
const API_DIRECT_URL =
    __ENV.API_DIRECT_URL || 'http://localhost:8080';

const RUN_ID = __ENV.RUN_ID;

if (!RUN_ID) {
    throw new Error('RUN_ID is required.');
}

const VUS = Number(__ENV.VUS || 1);
const ITERATIONS_PER_VU =
    Number(__ENV.ITERATIONS_PER_VU || 5);

export const options = {
    scenarios: {
        normal_order_lookup: {
            executor: 'per-vu-iterations',
            vus: VUS,
            iterations: ITERATIONS_PER_VU,
            maxDuration: '10m',
        },
    },
};

function randomInt(min, max) {
    return Math.floor(
        Math.random() * (max - min + 1)
    ) + min;
}

function randomSleep(min, max) {
    sleep(
        Math.random() * (max - min) + min
    );
}

function experimentHeaders(clientId) {
    return {
        'X-Experiment-Client-Id': clientId,
        'X-Experiment-Run-Id': RUN_ID,
        'X-Experiment-Scenario':
            'normal-order-lookup',
        'X-Experiment-Expected-Class':
            'normal',
    };
}


//
// Preparação dos pedidos usados pelo N3.
//
// É executado antes das iterações e chama
// diretamente a API Demo em :8080,
// portanto não entra no dataset experimental.
//
export function setup() {
    const orderIds = [];

    for (let productId = 1; productId <= 3; productId++) {
        const response = http.post(
            `${API_DIRECT_URL}/orders`,
            JSON.stringify({
                productId,
                quantity: 1,
                notes: 'N3 pilot setup',
            }),
            {
                headers: {
                    'Content-Type': 'application/json',
                },
            }
        );

        if (response.status !== 201) {
            throw new Error(
                `Unable to create setup order. Status: ${response.status}`
            );
        }

        const order = response.json();

        if (!order.id) {
            throw new Error(
                'Setup order did not return an id.'
            );
        }

        orderIds.push(order.id);
    }

    return {
        orderIds,
    };
}


export default function (data) {
    const vuId = exec.vu.idInTest;

    const clientId =
        `order-lookup-client-${vuId}`;

    const username =
        `lookup-user-${vuId}`;

    const password =
        'demo-password';

    //
    // 1. Login
    //
    const loginResponse = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({
            username,
            password,
        }),
        {
            headers: {
                ...experimentHeaders(clientId),
                'Content-Type': 'application/json',
            },
            tags: {
                step: 'login',
            },
        }
    );

    const loginOk = check(loginResponse, {
        'login returned 200':
            (r) => r.status === 200,
    });

    if (!loginOk) {
        return;
    }

    const token =
        loginResponse.json().token;

    const tokenOk = check(token, {
        'login returned token':
            (value) =>
                typeof value === 'string'
                && value.length > 0,
    });

    if (!tokenOk) {
        return;
    }

    randomSleep(0.5, 1.5);

    //
    // 2. Seleciona um pedido existente
    //
    const index =
        randomInt(0, data.orderIds.length - 1);

    const orderId =
        data.orderIds[index];

    const orderResponse = http.get(
        `${BASE_URL}/orders/${orderId}`,
        {
            headers: {
                ...experimentHeaders(clientId),
                Authorization:
                    `Bearer ${token}`,
            },
            tags: {
                step: 'order-lookup',
            },
        }
    );

    check(orderResponse, {
        'order lookup returned 200':
            (r) => r.status === 200,
    });

    randomSleep(0.7, 1.5);
}