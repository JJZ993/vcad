#!/bin/bash
cd "$(dirname "$0")"
set -a
source ../../.env
set +a
exec node --loader ts-node/esm src/cli.ts annotate -i data/raw/all.jsonl -o data/annotated/all.jsonl --prompts 5
