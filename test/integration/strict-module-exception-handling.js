try {
  require('./include/throwing')
} catch (err) {}

let threw = false
try {
  require('./include/throwing')
} catch (err) {
  threw = true
}

if (!threw) {
  process.exit(1)
}
