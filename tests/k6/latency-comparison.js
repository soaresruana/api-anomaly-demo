import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate } from 'k6/metrics';

const PROFILE = (__ENV.PROFILE || '').toUpperCase();

if (!['P0', 'P1', 'P2'].includes(PROFILE)) {
    throw new Error(
        'PROFILE is required and must be P0, P1 or P2.'
    );
}

const DEFAULT_BASE_URL =
    PROFILE === 'P0'
        ? 'http://localhost:8080'
        : 'http://localhost:8000';

const BASE_URL =
    __ENV.BASE_URL || DEFAULT_BASE_URL;

const WARMUP_ITERATIONS =
    Number(__ENV.WARMUP_ITERATIONS || 20);

const MEASURED_ITERATIONS =
    Number(__ENV.MEASURED_ITERATIONS || 100);

const SLEEP_SECONDS =
    Number(__ENV.SLEEP_SECONDS || 1.2);

const RUN_ID =
    __ENV.RUN_ID ||
    `latency-${PROFILE.toLowerCase()}-${Date.now()}`;

const CLIENT_ID =
    __ENV.CLIENT_ID ||
    `latency-${PROFILE.toLowerCase()}-client-1`;

/*
 * Métrica oficial de latência.
 *
 * As iterações de warm-up NÃO são adicionadas
 * a esta métrica.
 */
const measuredLatency =
    new Trend('measured_http_req_duration', true);

const requestErrors =
    new Rate('measured_request_errors');


export const options = {
    scenarios: {
        latency: {
            executor: 'per-vu-iterations',

            // Deliberadamente 1 VU:
            // este experimento mede latência/overhead,
            // não escalabilidade ou concorrência.
            vus: 1,

            iterations:
                WARMUP_ITERATIONS +
                MEASURED_ITERATIONS,

            maxDuration: '30m',
        },
    },

    discardResponseBodies: true,

    summaryTrendStats: [
        'avg',
        'min',
        'med',
        'p(95)',
        'p(99)',
        'max',
    ],
};


/*
 * Como o experimento usa apenas 1 VU,
 * este contador representa de forma determinística
 * a posição da requisição dentro da execução.
 */
let iteration = 0;


function experimentHeaders() {
    return {
        'X-Experiment-Run-Id': RUN_ID,
        'X-Experiment-Client-Id': CLIENT_ID,
        'X-Experiment-Scenario': 'latency-comparison',
        'X-Experiment-Expected-Class': 'normal',
    };
}


export default function () {
    const currentIteration = iteration++;

    const isWarmup =
        currentIteration < WARMUP_ITERATIONS;

    /*
     * Mantemos exatamente a mesma requisição
     * nos três perfis.
     *
     * P0:
     * k6 -> API Demo
     *
     * P1:
     * k6 -> Kong -> API Demo
     *
     * P2:
     * k6 -> Kong -> anomaly-collector
     *    -> Anomaly Service -> modelo
     *    -> Kong -> API Demo
     */
    const response = http.get(
        `${BASE_URL}/products/1`,
        {
            headers: experimentHeaders(),

            tags: {
                profile: PROFILE,
                phase: isWarmup
                    ? 'warmup'
                    : 'measured',
            },
        }
    );

    const ok = check(response, {
        'status is 200': (r) =>
            r.status === 200,
    });

    /*
     * O http_req_duration padrão do k6 contém
     * warm-up + medição.
     *
     * Para os resultados oficiais, usamos apenas
     * measured_http_req_duration.
     */
    if (!isWarmup) {
        measuredLatency.add(
            response.timings.duration,
            {
                profile: PROFILE,
            }
        );

        requestErrors.add(
            !ok,
            {
                profile: PROFILE,
            }
        );
    }

    /*
     * Mantém a geração de tráfego sequencial e
     * controlada. O sleep NÃO entra em
     * response.timings.duration.
     */
    sleep(SLEEP_SECONDS);
}