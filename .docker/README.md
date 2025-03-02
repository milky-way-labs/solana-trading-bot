# Docker

## Build

[build/README.md](build/README.md)

## Run

```shell
docker run -d \
  --env-file ../.env \
  --name solana_trading_bot \
  ghcr.io/milky-way-labs/solana-trading-bot:latest
```

## Stop

```shell
docker stop solana_trading_bot
```
