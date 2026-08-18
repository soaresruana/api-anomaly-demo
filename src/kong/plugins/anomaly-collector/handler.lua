local http = require "resty.http"
local cjson = require "cjson.safe"

local AnomalyCollector = {
  PRIORITY = 1000,
  VERSION = "0.3.0",
}

local ANOMALY_SERVICE_URL =
  "http://anomaly-service:8090/events"


local function count_table_keys(tbl)
  local count = 0

  if not tbl then
    return count
  end

  for _ in pairs(tbl) do
    count = count + 1
  end

  return count
end


function AnomalyCollector:access(conf)
  local method =
    kong.request.get_method()

  local path =
    kong.request.get_path()

  local query =
    kong.request.get_query()

  local query_param_count =
    count_table_keys(query)

  local content_length =
    tonumber(
      kong.request.get_header("content-length")
    ) or 0

  local client_id =
    kong.request.get_header(
      "x-experiment-client-id"
    )

  local scenario =
    kong.request.get_header(
      "x-experiment-scenario"
    )

  local expected_class =
    kong.request.get_header(
      "x-experiment-expected-class"
    )

  local request_id =
    ngx.var.kong_request_id

  local timestamp_ms =
    math.floor(ngx.now() * 1000)

  local run_id =
    kong.request.get_header(
      "x-experiment-run-id"
    )

  local event = {
      request_id = request_id,
      client_id = client_id,

      run_id = run_id,
      scenario = scenario,
      expected_class = expected_class,

      timestamp_ms = timestamp_ms,
      http_method = method,
      request_path = path,
      payload_size_bytes = content_length,
      query_param_count = query_param_count,
  }

  kong.log.notice(
    "[ANOMALY_COLLECTOR] ",
    cjson.encode(event)
  )

  local httpc = http.new()

  httpc:set_timeout(1000)

  local response, err =
    httpc:request_uri(
      ANOMALY_SERVICE_URL,
      {
        method = "POST",
        body = cjson.encode(event),
        headers = {
          ["Content-Type"] = "application/json",
        },
      }
    )

  if err then
    kong.log.err(
      "[ANOMALY_SERVICE_ERROR] ",
      err
    )

    return
  end

  if response.status < 200
      or response.status >= 300 then

    kong.log.err(
      "[ANOMALY_SERVICE_ERROR] status=",
      response.status
    )

    return
  end

  kong.log.notice(
    "[ANOMALY_SERVICE_OK] request_id=",
    request_id,
    " status=",
    response.status
  )
end


return AnomalyCollector