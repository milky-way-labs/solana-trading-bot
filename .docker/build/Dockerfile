ARG node_version=18

FROM node:$node_version as base

WORKDIR /var/www/html

COPY ./.docker/build/app/entrypoint.sh  /usr/local/bin/

COPY . .

RUN \
    npm i

ENTRYPOINT [ "entrypoint.sh" ]
