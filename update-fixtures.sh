yarn run build
jest test/unit
for f in test/unit/*; do mv $f/actual.js $f/output.js; done
node --expose-gc node_modules/.bin/jest --coverage --globals "{\"coverage\":true}" test/unit
for f in test/unit/*; do mv $f/actual.js $f/output-coverage.js; done
