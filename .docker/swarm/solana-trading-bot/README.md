# Swarm

Copy stack stack config

```shell
cp example.env .env
```

> Accertati che il file .env sia allineato con quello dell'applicazione. 


```shell
cp app/example.env app/.env
```

```shell
export $(grep -v '^#' .env | xargs) && \
docker \
  stack deploy \
    -c app.yml \
    solana_trading_bot
```
