#!/bin/sh
set -eu

printf 'npm token: '
read -rs TOKEN

npm publish                                \
    --access   public                      \
    --registry https://registry.npmjs.org/ \
    --//registry.npmjs.org/:_authToken="$TOKEN"
