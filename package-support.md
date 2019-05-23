## ncc Package Configurations

Packages that need specific configurations for ncc support are included below.

If you are having trouble running a package with ncc, try searching for it in the [issue queue](https://github.com/zeit/ncc/issues) or posting an issue.

### Sequelize

For example, with the `mariadb` dialect:

```js
const db = new Sequelize({
  dialect: 'mariadb',
  dialectModule: require('mariadb')
});
```
