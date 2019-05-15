const id = 'UNKNOWN';
if (id.startsWith('./') || id.startsWith('../')) {
  const e = new Error('Cannot find module "' + id + '".');
  e.code = 'MODULE_NOT_FOUND';
  throw e;
}
else {
  __non_webpack_require__(id);
}
