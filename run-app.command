#!/bin/bash
cd "$(dirname "$0")"
echo "Cleaning cache and fixing permissions..."
rm -rf .next
chmod -R +x node_modules/.bin
echo "Starting CF-Command-Center..."
./node_modules/.bin/node ./node-v20.11.1-darwin-arm64/lib/node_modules/npm/bin/npm-cli.js run dev
