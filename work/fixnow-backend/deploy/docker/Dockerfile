FROM node:22-bookworm-slim

WORKDIR /app
COPY server.js README.md ./

ENV PORT=4180
ENV DATA_DIR=/data
ENV DB_FILE=/data/fixnow.sqlite
ENV SEED_DEMO_ACCOUNTS=0

RUN mkdir -p /data

EXPOSE 4180
CMD ["node", "server.js"]
