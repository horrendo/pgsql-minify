# pgsql-minify

A simple typescript library to generate a minified version of a valid Postgres SQL statement.

## Installation

```
npm install pgsql-minify
```

Or

```
yarn add pgsql-minify
```

## Usage

```typescript
import { minify } from 'pgsql-minify';
:
const rawSQL = `select col1, col2,\n\tcol3\nFROM\tsome_table;`;
const niceSQL = minify(rawSQL); // select col1, col2, col3 from some_table;
```

## Maintainer

-   Steve Baldwin
