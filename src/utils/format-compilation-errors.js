module.exports = function formatCompilationErrors(errors) {
  return errors.map(err => {
    const message = err && err.message ? err.message : String(err);
    const withoutStackFrames = message
      .split('\n')
      .filter(line => !line.trim().startsWith('at '))
      .join('\n');
    return withoutStackFrames.trim() ? withoutStackFrames : message;
  }).join('\n');
};
