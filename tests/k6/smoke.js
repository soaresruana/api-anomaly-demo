import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:8000';
const RUN_ID = __ENV.RUN_ID || 'pilot-k6-smoke-001';

export const options = {
  vus: 1,
  iterations: 3,
};

export default function () {
  const headers = {
    'X-Experiment-Client-Id': `k6-smoke-${RUN_ID}`,
    'X-Experiment-Run-Id': RUN_ID,
    'X-Experiment-Scenario': 'normal-smoke',
    'X-Experiment-Expected-Class': 'normal',
  };

  const response = http.get(
    `${BASE_URL}/products`,
    {
      headers,
      tags: {
        experiment_scenario: 'normal-smoke',
      },
    }
  );

  check(response, {
    'GET /products returned 200': (r) => r.status === 200,
  });

  sleep(1);
}