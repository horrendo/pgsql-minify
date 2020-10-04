# pgsql-minify

A simple typescript library to generate a minified version of a valid Postgres SQL statement.

The minifier works by breaking the raw SQL statement into a collection of 'tokens' using a simple lexical analyzer (lexer), and then reconstructs the statement from the tokens using standardised case and spacing.

## Installation

```
npm install pgsql-minify
```

Or

```
yarn add pgsql-minify
```

## Quickstart

### Typescript

```typescript
import { minify } from 'pgsql-minify';
:
const rawSQL = `select col1, col2,\n\tcol3\nFROM\tsome_table;`;
const niceSQL = minify(rawSQL); // select col1, col2, col3 from some_table;
```

### Javascript

```javascript
const pgmin = require('pgsql-minify')
:
const rawSQL = 'select    abc  from       def   ;   ';
const niceSQL = pgmin.minify(rawSQL); // select abc from def;
```

## API and Components

In addition to the `minify` function seen above, the package also exposes a number of other components that may be useful if you want to roll your own minify function.

### `TokenType`

A single character string representing the 'type' of a token discovered while parsing a raw SQL string. One of:

-   `(`
-   `)`
-   `[`
-   `]`
-   `,`
-   `;`
-   `.`
-   `..`
-   `:`
-   `::`
-   `k` (keyword)
-   `i` (identifier)
-   `o` (operator)
-   `'` (string constant)
-   `0` (numeric constant)
-   `"` (quoted identifier)
-   `$` (positional parameter)
-   `b` (binary bit-string)
-   `x` (hex bit-string)
-   `c` (comment)

### `Token`

A Tuple comprised of a `TokenType` and an optional `string` holding the 'value' of the token. From the above list, token types `k`, `i`, `o`, `'`, `0`, `"`, `$`, `b`, `x`, and `c` will have a value.

### `PgSqlMinifyOptions`

An interface defining options that may be passed to the `minify` or `lex` functions. It contains the following (optional) members:

-   `keywords` - a `Set` of `string` values defining the subset of identifiers that are considered keywords. The main difference between a keyword and an identifier is that the `minify` function will insert a space between a keyword and
    a `(` token, but will not insert a space between and identifier and a `(` token.
-   `includeComments` - a boolean value that defaults to false that controls whether the `minify` function includes comment
    tokens or skips them. Because the `minify` function attempts to generate SQL without newline characters, any 'to end of line' comments are converted to C-style comments, newlines and tabs are converted to a single space, and consecutive whitespace characters are ignored.

### `lex`

A function that analyzes a raw (valid) SQL string and returns an array of `Token` tuples. For example:

```typescript
import { lex } from 'pgsql-minify';
:
const rawSQL = 'select    abc  from       def   ;   ';
const tokens = lex(rawSQL); // [[ 'k', 'select' ], [ 'i', 'abc' ], [ 'k', 'from' ], [ 'i', 'def' ], [ ';' ]]
:
```

The function takes an instance of `PgSqlMinifyOptions` as an optional second parameter to allow the default set of keywords
to be overridden.

### `minify`

A function that converts a raw (valid) SQL string into a standardised, 'minified' format with minimal whitespace. Here are
some examples of actual output from the `minify` function:

(before)

```sql

select  col1,  col2,col3,
        col4, ( col5+(col6*col7)  )
from    sometable as t1
    join  othertable as t2
        on  t2.st_id = t1.id
;
```

(after)

```sql
select col1, col2, col3, col4, (col5 + (col6 * col7)) from sometable as t1 join othertable as t2 on t2.st_id = t1.id;
```

(before)

```sql
select ts -- This is the row creation timestamp
from   blah
Order
BY     1
;
```

(after - excluding comments)

```sql
select ts from blah order by 1;
```

(after - including comments)

```sql
select ts /* This is the row creation timestamp */ from blah order by 1;
```

## Maintainer

-   Steve Baldwin (steve.baldwin@gmail.com)
