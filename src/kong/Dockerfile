FROM kong:3.9.3

USER root

COPY ./plugins/anomaly-collector \
    /usr/local/share/lua/5.1/kong/plugins/anomaly-collector

USER kong