# Swarm

```shell
cp ../../../.env app/.env
```

```shell
docker run -d \
  -v ./app/.env:/var/www/html/.env \
  ghcr.io/milky-way-labs/solana-trading-bot:latest
```
