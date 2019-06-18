## ncc Package Configurations

Packages that need specific configurations for ncc support are included below.

If you are having trouble running a package with ncc, try searching for it in the [issue queue](https://github.com/zeit/ncc/issues) or posting an issue.

### `sequelize`

For example, with the `mariadb` dialect:

```js
const Sequelize = require('sequelize');
const db = new Sequelize({
  dialect: 'mariadb',
  dialectModule: require('mariadb')
});
```

The important part here is defining `dialectModule`.

### `@google-cloud/vision`

Add `google-proto-files` in your `package.json` dependencies.

```json
{
  "name": "example",
  "main": "index.js",
  "dependencies": {
    "@google-cloud/vision": "1.1.1",
    "google-proto-files": "1.0.1"
  }
}
```
