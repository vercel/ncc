// CJS require of an ESM-only package (exports.import, no require/default).
// https://github.com/vercel/ncc/issues/1311
module.exports = {
  load: () => require('@test/import-only')
};
