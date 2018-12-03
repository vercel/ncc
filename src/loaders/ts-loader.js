// we re-export so that we generate a unique
// optional bundle for the ts-loader, that
// doesn't get loaded unless the user is
// compiling typescript
module.exports = require("ts-loader");
