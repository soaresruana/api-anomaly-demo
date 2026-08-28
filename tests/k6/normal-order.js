import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const RUN_ID = __ENV.RUN_ID;

if (!RUN_ID) {
    throw new Error('RUN_ID is required.');
}

const VUS = Number(__ENV.VUS || 1);
const ITERATIONS_PER_VU =
    Number(__ENV.ITERATIONS_PER_VU || 3);

export const options = {
    scenarios: {
        normal_order: {
            executor: 'per-vu-iterations',
            vus: VUS,
            iterations: ITERATIONS_PER_VU,
            maxDuration: '10m',
        },
    },
};

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomSleep(min, max) {
    sleep(Math.random() * (max - min) + min);
}

function buildProductsUrl() {
    const choice = Math.random();

    if (choice < 0.4) {
        return `${BASE_URL}/products`;
    }

    if (choice < 0.6) {
        return `${BASE_URL}/products?page=1`;
    }

    const category =
        Math.random() < 0.5
            ? 'electronics'
            : 'books';

    if (choice < 0.8) {
        return `${BASE_URL}/products?category=${category}`;
    }

    return `${BASE_URL}/products?page=1&category=${category}`;
}

function experimentHeaders(clientId) {
    return {
        'X-Experiment-Client-Id': clientId,
        'X-Experiment-Run-Id': RUN_ID,
        'X-Experiment-Scenario': 'normal-order',
        'X-Experiment-Expected-Class': 'normal',
    };
}

export default function () {
    const vuId = exec.vu.idInTest;
    const clientId = `order-client-${vuId}`;

    const username = `order-user-${vuId}`;
    const password = 'demo-password';

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
        'login returned 200': (r) => r.status === 200,
    });

    if (!loginOk) {
        return;
    }

    const token = loginResponse.json().token;

    const tokenOk = check(token, {
        'login returned token': (value) =>
            typeof value === 'string' && value.length > 0,
    });

    if (!tokenOk) {
        return;
    }

    randomSleep(0.8, 1.8);

    //
    // 2. Lista produtos
    //
    const productsResponse = http.get(
        buildProductsUrl(),
        {
            headers: {
                ...experimentHeaders(clientId),
                Authorization: `Bearer ${token}`,
            },
            tags: {
                step: 'product-list',
            },
        }
    );

    const productsOk = check(productsResponse, {
        'products returned 200': (r) => r.status === 200,
    });

    if (!productsOk) {
        return;
    }

    randomSleep(0.7, 1.8);

    //
    // 3. Escolhe e visualiza produto
    //
    const productId = randomInt(1, 5);

    const productResponse = http.get(
        `${BASE_URL}/products/${productId}`,
        {
            headers: {
                ...experimentHeaders(clientId),
                Authorization: `Bearer ${token}`,
            },
            tags: {
                step: 'product-detail',
            },
        }
    );

    const productOk = check(productResponse, {
        'product detail returned 200': (r) =>
            r.status === 200,
    });

    if (!productOk) {
        return;
    }

    randomSleep(0.8, 2.0);

    //
    // 4. Cria pedido
    //
    const quantity = randomInt(1, 3);

    const orderBody = {
        productId,
        quantity,
        notes:
            Math.random() < 0.5
                ? `Pilot order from ${clientId}`
                : null,
    };

    const createOrderResponse = http.post(
        `${BASE_URL}/orders`,
        JSON.stringify(orderBody),
        {
            headers: {
                ...experimentHeaders(clientId),
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            tags: {
                step: 'create-order',
            },
        }
    );

    const orderCreated = check(createOrderResponse, {
        'order returned 201': (r) => r.status === 201,
    });

    if (!orderCreated) {
        return;
    }

    const createdOrder = createOrderResponse.json();
    const orderId = createdOrder.id;

    const orderIdOk = check(orderId, {
        'created order returned id': (value) =>
            Number.isInteger(value) && value > 0,
    });

    if (!orderIdOk) {
        return;
    }

    randomSleep(0.5, 1.5);

    //
    // 5. Consulta o pedido recém-criado
    //
    const getOrderResponse = http.get(
        `${BASE_URL}/orders/${orderId}`,
        {
            headers: {
                ...experimentHeaders(clientId),
                Authorization: `Bearer ${token}`,
            },
            tags: {
                step: 'get-order',
            },
        }
    );

    check(getOrderResponse, {
        'created order can be retrieved': (r) =>
            r.status === 200,
    });

    randomSleep(0.8, 1.8);
}