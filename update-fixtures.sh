#!/usr/bin/env bash

yarn run build

node_modules/.bin/jest test/unit

for f in test/unit/*; do
    if [ -e "${f}/actual.js" ]; then
        mv "${f}/actual.js" "${f}/output.js"
    fi
done

for f in test/unit/*; do
    if [ -e "${f}/actual.js.map" ]; then
        mv "${f}/actual.js.map" "${f}/output.js.map"
    fi
done

node --expose-gc node_modules/.bin/jest --coverage --globals "{\"coverage\":true}" test/unit

for f in test/unit/*; do
    if [ -e "${f}/actual.js" ]; then
        mv "${f}/actual.js" "${f}/output-coverage.js"
    fi
done

for f in test/unit/*; do
    if [ -e "${f}/actual.js.map" ]; then
        mv "${f}/actual.js.map" "${f}/output-coverage.js.map"
    fi
done
