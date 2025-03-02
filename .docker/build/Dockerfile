ARG node_version=18

FROM node:$node_version as base

WORKDIR /var/www/html

COPY . .

RUN \
    npm i

COPY ./.docker/build/app/entrypoint.sh  /usr/local/bin/

ENTRYPOINT [ "entrypoint.sh" ]
