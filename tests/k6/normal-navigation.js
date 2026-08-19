import http from 'k6/http';
import { check, sleep } from 'k6';
import exec from 'k6/execution';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const RUN_ID = __ENV.RUN_ID || 'pilot-navigation-001';

export const options = {
    vus: 1,
    iterations: 5,
};

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomSleep(min, max) {
    const duration = Math.random() * (max - min) + min;
    sleep(duration);
}

function experimentHeaders(clientId) {
    return {
        'X-Experiment-Client-Id': clientId,
        'X-Experiment-Run-Id': RUN_ID,
        'X-Experiment-Scenario': 'normal-navigation',
        'X-Experiment-Expected-Class': 'normal',
    };
}

export default function () {
    const vuId = exec.vu.idInTest;
    const clientId = `navigation-client-${vuId}`;

    const username = `pilot-user-${vuId}`;
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

    randomSleep(0.8, 2.0);

    //
    // 2. Listagem de produtos
    //
    const productListResponse = http.get(
        `${BASE_URL}/products`,
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

    check(productListResponse, {
        'products returned 200': (r) => r.status === 200,
    });

    randomSleep(0.7, 2.2);

    //
    // 3. Visualização de um produto
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

    check(productResponse, {
        'product detail returned 200': (r) => r.status === 200,
    });

    //
    // 4. Em parte das navegações, usuário visualiza
    //    um segundo produto antes de abandonar.
    //
    if (Math.random() < 0.4) {
        randomSleep(0.6, 1.8);

        let secondProductId = randomInt(1, 5);

        while (secondProductId === productId) {
            secondProductId = randomInt(1, 5);
        }

        const secondProductResponse = http.get(
            `${BASE_URL}/products/${secondProductId}`,
            {
                headers: {
                    ...experimentHeaders(clientId),
                    Authorization: `Bearer ${token}`,
                },
                tags: {
                    step: 'second-product-detail',
                },
            }
        );

        check(secondProductResponse, {
            'second product returned 200': (r) =>
                r.status === 200,
        });
    }

    //
    // Usuário encerra/abandona a navegação.
    //
    randomSleep(0.8, 2.0);
}