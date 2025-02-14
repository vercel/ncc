# unit test drafts for node targets

playground to get going on the https://github.com/vercel/ncc/issues/1247 while i get a hang of ncc test infra and how to fix node gyp issues.

currently, i dont understand why webpack with node16 target compile into v into u regexp flag and why usage of Set.prototype.difference doesnt bring in core-js imports if

```
cd test/unit/node2020
npx webpack
```
