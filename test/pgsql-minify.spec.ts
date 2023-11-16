import { lex, minify, Token, PgSqlMinifyOptions } from '../src/pgsql-minify';

describe('lex', () => {
    const testCases: ReadonlyArray<[string, ReadonlyArray<Token>]> = [
        [
            `select 123`,
            [
                [`k`, `select`],
                [`0`, `123`]
            ]
        ],
        [
            `select   'abc'`,
            [
                [`k`, `select`],
                [`'`, `'abc'`]
            ]
        ],
        [
            `select   --   some comment\n123-1`,
            [
                [`k`, `select`],
                [`c`, `some comment`],
                [`0`, `123`],
                [`o`, `-`],
                [`0`, `1`]
            ]
        ],
        [
            `select\n/*\n this   is\n   a\ncomment\n  */\tid from somewhere`,
            [
                [`k`, `select`],
                [`c`, `this is a comment`],
                [`i`, `id`],
                [`k`, `from`],
                [`i`, `somewhere`]
            ]
        ]
    ];

    it('Correctly lexes SQL statements', () => {
        for (const test of testCases) {
            expect(lex(test[0])).toEqual(test[1]);
        }
    });
});

describe('minify', () => {
    it(`Correctly minifies SQL statements`, () => {
        //
        // Note that not all these test cases are valid SQL. Some are deliberately 'broken' to
        // ensure as complete coverage as possible.
        //
        const testCases: ReadonlyArray<[string, string]> = [
            [``, ``],
            [`Select   ( 2*10/x )\n;`, `select (2 * 10 / x);`],
            [`SELECT\n'abc'`, `select 'abc'`],
            [`SELECT\n'a''bc'`, `select 'a''bc'`],
            [`SELECT some_column FROM big_table`, `select some_column from big_table`],
            [`SELECT some_column, ( (b||c)-d) FROM big_table`, `select some_column, ((b || c) - d) from big_table`],
            [
                `select 0\nfrom\tsomewhere\nwhere $1 > a\nor $2 :: int < 20`,
                'select 0 from somewhere where $1 > a or $2::int < 20'
            ],
            [`select  $abc$x$abc$ AS "hello world"`, `select $abc$x$abc$ as "hello world"`],
            [`select  0 AS "hello`, `select 0 as`],
            [`SELECT\n$$abc\ndef$$\nFROM\tanywhere`, `select $$abc\ndef$$ from anywhere`],
            [`select -- some comment\n123-1;`, `select 123 - 1;`],
            [`select /*\na\nmulti\nline\ncomment */\n\t0+id from customer`, `select 0 + id from customer`],
            [`\n\tselect   /* oh oh`, `select`],
            [`select  .12 - b'10'  +    B'10101'`, `select .12 - b'10' + b'10101'`],
            [`select  .12 - ( b'10'  +    B'10101'  )`, `select .12 - (b'10' + b'10101')`],
            [`select x'abc123'  ..  X'012def'; `, `select x'abc123' .. x'012def';`],
            [`SeLeCt  t.col1   from  sometable as t`, `select t.col1 from sometable as t`],
            [`select   somearray [ 1 : 2 ]\nfrom sometable;`, `select somearray [1:2] from sometable;`],
            [`select e'abc',  E'DeF'  from eskimo ; `, `select e'abc', e'DeF' from eskimo;`],
            [
                `select  U&'\\0441\\043B\\043E\\043D', u&'hello'   from   unusual_table;`,
                `select u&'\\0441\\043B\\043E\\043D', u&'hello' from unusual_table;`
            ],
            [
                `select  col1  as   u&"d\\0061t\\+000061" from nowhere    `,
                `select col1 as u&"d\\0061t\\+000061" from nowhere`
            ],
            [`select  pillock from    _underscore`, `select pillock from _underscore`],
            [`select   +`, `select`],
            [`select   +--`, `select`],
            [`select   +/*`, `select`],
            [`select   abc *+ def from blah`, `select abc def from blah`],
            [`select   abc =- def from blah`, `select abc def from blah`],
            [`select   abc @- def from blah`, `select abc @- def from blah`],
            [` select x'abcdefg from pfft`, `select from pfft`],
            [` select b'010110x from pfft`, `select from pfft`],
            [`  select  $1`, `select $1`],
            [`select $$abc`, `select`],
            [`   select   $abc$hello$ab world$abc$`, `select $abc$hello$ab world$abc$`],
            [`select  3.1415e-5 from  doofus`, `select 3.1415e-5 from doofus`],
            [`select  3.1415e5 from  doofus`, `select 3.1415e5 from doofus`],
            [`select  3.1415e+x from  doofus`, `select x from doofus`],
            [`select  3.1415ex from  doofus`, `select x from doofus`],
            [`select  3.1415e-1e5 from  doofus`, `select 5 from doofus`],
            [`  select  3.1415e`, `select`],
            [`  select 3.13.4 from doofus`, `select 4 from doofus`],
            [` select 'abc`, `select`],
            [`select 😃 `, `select`],
            [` select  u&?`, `select`]
        ];

        for (const test of testCases) {
            expect(minify(test[0])).toEqual(test[1]);
        }
    });

    it('Correctly minifies SQL statements including comments', () => {
        const testCases: ReadonlyArray<[string, string]> = [
            [`select  --   hello\n 123;`, `select /* hello */ 123;`],
            [`select\n/*\n     hello\n\n\n\tworld\n\n*\n\n*/123+1`, `select /* hello world * */ 123 + 1`],
            [
                `select --  comment one\n\t/*\ncomment\n\t\ttwo */'abc'`,
                `select /* comment one */ /* comment two */ 'abc'`
            ]
        ];
        const options: PgSqlMinifyOptions = { includeComments: true };
        for (const test of testCases) {
            expect(minify(test[0], options)).toEqual(test[1]);
        }
    });

    it('Correctly removes a trailing semicolon', () => {
        const testCases: ReadonlyArray<[string, string]> = [
            [`select  --   hello\n 123;`, `select 123`],
            [`select\n/*\n     hello\n\n\n\tworld\n\n*\n\n*/123+1`, `select 123 + 1`],
            [`;`, `;`]
        ];
        const options: PgSqlMinifyOptions = { includeTrailingSemicolon: false };
        for (const test of testCases) {
            expect(minify(test[0], options)).toEqual(test[1]);
        }
    });
});
