```shell
cp example.env .env
```

```shell
docker secret create solana_trading_bot_env ../../../.env
```

```shell
export $(grep -v '^#' .env | xargs) && \
docker \
  stack deploy \
    -c app.yml \
    solana_trading_bot
```
