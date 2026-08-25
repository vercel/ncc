const rspackNotFoundError = /^RspackResolver\((?:NotFound|MatchedAliasNotFound|ExtensionAlias)\b/;

module.exports = function isResolverNotFoundError(err) {
  if (!err) return false;
  if (err.code === 'MODULE_NOT_FOUND' || err.code === 'ModuleNotFoundError') return true;
  if (err.name === 'ModuleNotFoundError') return true;
  if (!err.message) return false;
  return rspackNotFoundError.test(err.message) ||
    err.message.startsWith("Can't resolve") ||
    err.message.startsWith("Cannot resolve");
};
