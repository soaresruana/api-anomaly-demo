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

export const options = {
    scenarios: {
        anomaly_route_diversification: {
            executor: 'per-vu-iterations',
            vus: VUS,
            iterations: ITERATIONS_PER_VU,
            maxDuration: '5m',
        },
    },
};

function normalHeaders(clientId, contentType = false) {
    const headers = {
        'X-Experiment-Client-Id': clientId,
        'X-Experiment-Run-Id': RUN_ID,
        'X-Experiment-Scenario':
            'anomaly-route-diversification-prelude',
        'X-Experiment-Expected-Class': 'normal',
    };

    if (contentType) {
        headers['Content-Type'] = 'application/json';
    }

    return headers;
}

function anomalyHeaders(clientId) {
    return {
        'X-Experiment-Client-Id': clientId,
        'X-Experiment-Run-Id': RUN_ID,
        'X-Experiment-Scenario':
            'anomaly-route-diversification',
        'X-Experiment-Expected-Class': 'anomaly',
    };
}

function normalSleep() {
    sleep(NORMAL_SLEEP_SECONDS);
}

export default function () {
    const vuId = exec.vu.idInTest;

    const clientId =
        `route-client-${vuId}-${__ITER}`;

    //
    // Build a normal history containing
    // the five routes observed in the baseline.
    //

    // 1. /products/{id}
    // First request is the BehaviorTracker warmup.
    const productResponse = http.get(
        `${BASE_URL}/products/1`,
        {
            headers: normalHeaders(clientId),
            tags: {
                step: 'normal-product-detail',
            },
        }
    );

    check(productResponse, {
        'product returned 200':
            (r) => r.status === 200,
    });

    normalSleep();

    // 2. /products
    const productsResponse = http.get(
        `${BASE_URL}/products`,
        {
            headers: normalHeaders(clientId),
            tags: {
                step: 'normal-products',
            },
        }
    );

    check(productsResponse, {
        'products returned 200':
            (r) => r.status === 200,
    });

    normalSleep();

    // 3. /auth/login
    const loginResponse = http.post(
        `${BASE_URL}/auth/login`,
        JSON.stringify({
            username: `route-user-${vuId}`,
            password: 'demo-password',
        }),
        {
            headers:
                normalHeaders(clientId, true),
            tags: {
                step: 'normal-login',
            },
        }
    );

    check(loginResponse, {
        'login returned 200':
            (r) => r.status === 200,
    });

    normalSleep();

    // 4. /orders
    const createOrderResponse = http.post(
        `${BASE_URL}/orders`,
        JSON.stringify({
            productId: 1,
            quantity: 1,
            notes: null,
        }),
        {
            headers:
                normalHeaders(clientId, true),
            tags: {
                step: 'normal-create-order',
            },
        }
    );

    const orderCreated = check(
        createOrderResponse,
        {
            'order returned 201':
                (r) => r.status === 201,
        }
    );

    if (!orderCreated) {
        return;
    }

    const orderId =
        createOrderResponse.json().id;

    normalSleep();

    // 5. /orders/{id}
    const orderResponse = http.get(
        `${BASE_URL}/orders/${orderId}`,
        {
            headers: normalHeaders(clientId),
            tags: {
                step: 'normal-order-detail',
            },
        }
    );

    check(orderResponse, {
        'order lookup returned 200':
            (r) => r.status === 200,
    });

    normalSleep();

    //
    // From this point onward, every new route
    // exceeds the baseline maximum of five
    // distinct routes in the 30-second window.
    //

    const unusualRoutes = [
        '/catalog',
        '/search',
        '/profile',
        '/reports',
        '/settings',
        '/analytics',
    ];

    for (const route of unusualRoutes) {
        const response = http.get(
            `${BASE_URL}${route}`,
            {
                headers:
                    anomalyHeaders(clientId),
                tags: {
                    step:
                        'route-diversification',
                },
            }
        );

        check(response, {
            'unusual route returned 404':
                (r) => r.status === 404,
        });

        normalSleep();
    }
}