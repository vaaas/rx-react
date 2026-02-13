#!/bin/sh
tag=rx-react

inContainer() {
    podman run -v ./:/app -i -t $tag "$@"
}

case $1 in
    build) podman build -t $tag -f ./Containerfile . ;;
    setup) inContainer npm i                         ;;
    shell) inContainer /bin/sh                       ;;
    npm)   shift 1 ; inContainer npm "$@"            ;;
    npx)   shift 1 ; inContainer npx "$@"            ;;
esac
