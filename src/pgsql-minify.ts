export type TokenType =
    | `` // unknown (used by minifier)
    | `(`
    | `)`
    | `[`
    | `]`
    | `,`
    | `;`
    | `.`
    | `..`
    | `:`
    | `::`
    | `k` // keyword
    | `i` // identifier
    | `o` // operator
    | `'` // string constant
    | `0` // numeric constant
    | `"` // quoted identifier
    | `$` // positional parameter
    | `b` // binary bit-string
    | `x` // hex bit-string
    | `c`; // comment

export type Token = [TokenType, string?];
export interface PgSqlMinifyOptions {
    keywords?: Set<string>;
    includeComments?: boolean;
    includeTrailingSemicolon?: boolean;
}

const defaultKeywords = new Set(
    (
        `all analyse analyze and any array as asc asymmetric authorization between bigint binary bit ` +
        `boolean both case cast character check collate collation column concurrently constraint create ` +
        `cross current_catalog current_date current_role current_schema current_time current_timestamp ` +
        `current_user dec decimal default deferrable desc distinct do else end except exists extract ` +
        `false fetch float for foreign freeze from full grant group grouping having ilike in initially ` +
        `inner inout int integer intersect interval into is isnull join lateral leading least left like ` +
        `limit localtime localtimestamp national natural nchar none not notnull null nullif numeric offset ` +
        `on only or order out outer overlaps overlay placing position precision primary real references ` +
        `returning right row select session_user setof similar smallint some symmetric table tablesample ` +
        `then time timestamp to trailing treat trim true union unique user using values variadic verbose ` +
        `when where window with xmlattributes xmlconcat xmlelement xmlexists xmlforest xmlnamespaces ` +
        `xmlparse xmlpi xmlroot xmlserialize xmltable`
    ).split(/\s+/)
);

/**
 * 
 * @param rawSQL - A valid SQL statement to lexically analyze
 * @param options - An optional instance of PgSqlMinifyOptions to override default behaviour
 *
 * This function will return a 'minimised' representation of a valid SQL statement.
 * It does this by processing the raw SQL statement with a lexical analyser (lexer)
 * to break down the statement into tokens. It then generates a minified version
 * of the statement by re-assembling the tokens with minimal spacing and conversion
 * of identifiers and keywords to lower case for consistency.
 *

 */
export function lex(rawSQL: string, options?: PgSqlMinifyOptions): Token[] {
    const tokens: [TokenType, string?][] = [];
    const keywords = (options && options.keywords) || defaultKeywords;
    const eos = rawSQL.length - 1;
    if (eos < 0) {
        return [];
    }
    let pos = 0;
    // eslint-disable-next-line no-empty
    do {} while (nextToken());
    return tokens;

    function nextToken(): boolean {
        const c = currentChar();
        if (c === undefined) {
            return false;
        }
        switch (c) {
            case ' ':
            case '\t':
            case '\n':
                break;
            case '(':
            case ')':
            case '[':
            case ']':
            case ',':
                tokens.push([c]);
                break;
            case ';':
                tokens.push([c]);
                return false;
            case `"`:
                quotedIdentifier();
                break;
            case `'`:
                stringConstant();
                break;
            case '$':
                isDigit(peekNextChar()) ? positionalParameter() : dollarQuote();
                break;
            case '-':
                peekNextChar() === '-' ? commentToEol() : operator(c);
                break;
            case '+':
            case '*':
            case '<':
            case '>':
            case '=':
            case '~':
            case '!':
            case '@':
            case '#':
            case '%':
            case '^':
            case '&':
            case '|':
            case '`':
            case '?':
                operator(c);
                break;
            case '/':
                peekNextChar() === '*' ? commentToStarSlash() : operator(c);
                break;
            case '0':
            case '1':
            case '2':
            case '3':
            case '4':
            case '5':
            case '6':
            case '7':
            case '8':
            case '9':
                numericConstant(c);
                break;
            case '.':
                const n = peekNextChar();
                if (isDigit(n)) {
                    numericConstant(c);
                } else {
                    if (n == '.') {
                        ++pos;
                        tokens.push(['..']);
                    } else {
                        tokens.push(['.']);
                    }
                }
                break;
            case ':':
                if (peekNextChar() === c) {
                    ++pos;
                    tokens.push(['::']);
                } else {
                    tokens.push([c]);
                }
                break;
            case 'b':
            case 'B':
                peekNextChar() === `'` ? binaryBitString() : identifierOrKeyword(c);
                break;
            case 'e':
            case 'E':
                peekNextChar() === `'` ? stringConstant(false, true) : identifierOrKeyword(c);
                break;
            case 'x':
            case 'X':
                peekNextChar() === `'` ? hexBitString() : identifierOrKeyword(c);
                break;
            case 'u':
            case 'U':
                if (peekNextChar() === '&') {
                    const n = peekNextChar(1);
                    if (n === `"`) {
                        pos += 2;
                        quotedIdentifier(true);
                    } else {
                        if (n === `'`) {
                            pos += 2;
                            stringConstant(true);
                        }
                    }
                } else {
                    identifierOrKeyword(c);
                }
                break;
            default:
                if (isLetter(c) || c === '_') {
                    identifierOrKeyword(c);
                }
        }
        return true;
    }

    function identifierOrKeyword(firstChar: string): void {
        let value = firstChar;
        while (true) {
            const c = currentChar();
            if (c === undefined) {
                break;
            }
            if (isAlphaNumeric(c) || c === '_' || c === '$') {
                value += c;
            } else {
                --pos;
                break;
            }
        }
        tokens.push([keywords.has(value.toLowerCase()) ? 'k' : 'i', value]);
    }

    function operator(firstChar: string): void {
        let value = firstChar;
        let valid = false;
        let prev = '';
        while (true) {
            const c = currentChar();
            if (c === undefined) {
                break;
            }
            if (c === '-' && prev === '-') {
                break;
            }
            if (c === '*' && prev === '/') {
                break;
            }
            if (
                !['+', '/', '<', '>', '=', '~', '!', '@', '#', '%', '^', '&', '|', '`', '?', '-', '/', '*'].includes(c)
            ) {
                --pos;
                valid = true;
                break;
            }
            value += c;
            prev = c;
        }
        if (valid) {
            if (value.length > 1 && (prev === '+' || prev === '-')) {
                if (!['~', '!', '@', '#', '%', '^', '&', '|', '`', '?'].some((v) => value.indexOf(v) >= 0)) {
                    valid = false;
                }
            }
            if (valid) {
                tokens.push(['o', value]);
            }
        }
    }

    function hexBitString(): void {
        let value = `x'`;
        ++pos;
        let valid = false;
        while (true) {
            const c = currentChar();
            if (c === `'`) {
                valid = true;
                value += c;
                break;
            }
            if (c !== undefined && isHexDigit(c)) {
                value += c;
            } else {
                break;
            }
        }
        if (valid) {
            tokens.push(['x', value]);
        }
    }

    function binaryBitString(): void {
        let value = `b'`;
        ++pos;
        let valid = false;
        while (true) {
            const c = currentChar();
            if (c === `'`) {
                valid = true;
                value += c;
                break;
            }
            if (c === '0' || c === '1') {
                value += c;
            } else {
                break;
            }
        }
        if (valid) {
            tokens.push(['b', value]);
        }
    }

    function positionalParameter(): void {
        let value = '$';
        while (true) {
            const c = currentChar();
            if (c === undefined) {
                break;
            }
            if (isDigit(c)) {
                value += c;
            } else {
                --pos;
                break;
            }
        }
        tokens.push(['$', value]);
    }

    function dollarQuote(): void {
        let value = '$';
        let valid = false;
        let first = true;
        let gotIdent = false;
        let gotPossibleIdent = false;
        let possibleIdentIdx = 0;
        let ident = '$';
        while (true) {
            const c = currentChar();
            if (
                c === undefined ||
                (first && !isLetter(c) && c !== '$') ||
                !(isAlphaNumeric(c) || c === '_' || c === '$' || gotIdent)
            ) {
                break;
            }
            first = false;
            value += c;
            if (!gotIdent) {
                ident += c;
            }
            if (c === '$') {
                if (gotPossibleIdent && possibleIdentIdx + 2 === ident.length) {
                    valid = true;
                    break;
                }
                if (gotIdent) {
                    gotPossibleIdent = true;
                    possibleIdentIdx = 0;
                } else {
                    gotIdent = true;
                }
            } else {
                if (gotPossibleIdent) {
                    if (ident[++possibleIdentIdx] !== c) {
                        gotPossibleIdent = false;
                    }
                }
            }
        }
        if (valid) {
            tokens.push([`'`, value]);
        }
    }

    function isHexDigit(val: string): boolean {
        return isDigit(val) || ['a', 'b', 'c', 'd', 'e', 'f'].includes(val.toLowerCase());
    }

    function isDigit(val?: string): boolean {
        return val === undefined ? false : !isNaN(parseInt(val));
    }

    function isLetter(val: string): boolean {
        return val.toLowerCase() != val.toUpperCase();
    }

    function isAlphaNumeric(val: string): boolean {
        return isLetter(val) || isDigit(val);
    }

    function numericConstant(firstChar: string): void {
        let value = firstChar;
        let seenDot = firstChar === '.';
        let seenDigit = isDigit(firstChar);
        let seenE = false;
        let valid = false;
        let c: string | undefined = undefined;
        while (true) {
            c = currentChar();
            if (c === undefined) {
                valid = true;
                break;
            }
            if (isDigit(c)) {
                value += c;
                seenDigit = true;
                continue;
            }
            if (c === '.') {
                if (seenDot || seenE) {
                    break;
                }
                seenDot = true;
                value += c;
                continue;
            }
            if (c === 'e' || c === 'E') {
                if (seenE || !seenDigit) {
                    break;
                }
                seenE = true;
                value += c;
                c = peekNextChar();
                if (c === undefined) {
                    break;
                }
                if (isDigit(c)) {
                    value += currentChar();
                    continue;
                }
                if (c === '+' || c === '-') {
                    value += currentChar();
                    c = peekNextChar();
                    if (c === undefined || !isDigit(c)) {
                        break;
                    }
                    continue;
                }
                break;
            }
            valid = !isLetter(c); // non-alpha means end of numeric literal. Alpha means error.
            break;
        }
        if (valid) {
            if (c !== undefined) {
                --pos;
            }
            tokens.push(['0', value]);
        }
    }

    function stringConstant(isUnicode = false, isEscaped = false): void {
        let value = isUnicode ? `u&'` : isEscaped ? `e${currentChar()}` : `'`;
        let gotEnd = false;
        while (true) {
            const c = currentChar();
            if (c === undefined) {
                break;
            }
            value += c;
            if (c === `'`) {
                const n = peekNextChar();
                if (n === undefined) {
                    gotEnd = true;
                    break;
                }
                if (n === `'`) {
                    value += `'`;
                    ++pos;
                } else {
                    gotEnd = true;
                    break;
                }
            }
        }
        if (gotEnd) {
            tokens.push([`'`, value]);
        }
    }

    function quotedIdentifier(isUnicode = false): void {
        let value = isUnicode ? `u&"` : `"`;
        let valid = false;
        while (true) {
            const c = currentChar();
            if (c === undefined) {
                break;
            }
            value += c;
            if (c === '"') {
                valid = true;
                break;
            }
        }
        if (value.length > 2 && valid) {
            tokens.push(['"', value]);
        }
    }

    function commentToStarSlash(): void {
        let value = '';
        pos++; // Skip over 2nd '-'
        let gotEnd = false;
        while (true) {
            const c = currentChar();
            const n = peekNextChar();
            if (c === undefined || n === undefined) {
                break;
            }
            if (c === '*' && n === '/') {
                ++pos;
                gotEnd = true;
                break;
            }
            value += c;
        }
        if (gotEnd) {
            tokens.push(['c', value.trim().replace(/\s{1,}/g, ' ')]);
        }
    }

    function commentToEol(): void {
        let value = '';
        pos++; // Skip over 2nd '-'
        while (true) {
            const c = currentChar();
            if (c === undefined || c == `\n`) {
                break;
            }
            value += c;
        }
        tokens.push(['c', value.trim().replace(/\s{2,}/g, ' ')]);
    }

    function currentChar(skip = 0): string | undefined {
        pos += skip;
        if (pos <= eos) {
            return rawSQL[pos++];
        }
        return undefined;
    }

    function peekNextChar(offset = 0): string | undefined {
        const peekPos = pos + offset;
        return peekPos <= eos ? rawSQL[peekPos] : undefined;
    }
}

/**
 *
 * @param rawSQL - A valid SQL statement to lexically analyze
 * @param options - An optional instance of PgSqlMinifyOptions to override default behaviour
 *
 * This function returns a consistently formatted version of a valid SQL statement with minimal spaces
 * to ensure readability.
 */
export function minify(rawSQL: string, options?: PgSqlMinifyOptions): string {
    const tokens = lex(rawSQL, options);
    const includeComments = options?.includeComments ?? false;
    const includeTrailingSemicolon = options?.includeTrailingSemicolon ?? true;
    if (tokens.length === 0) {
        return '';
    }
    let prevType: TokenType = ``;
    let minified = '';
    for (const token of tokens) {
        const noSpace = [``, `(`, `[`, `::`, `:`, `.`].includes(prevType);
        if (token[0] === `c`) {
            if (includeComments) {
                minified += ` /* ${token[1]} */`;
            }
        } else if (token[0] === `;` && tokens.length > 1 && !includeTrailingSemicolon) {
            continue;
        } else if ([`)`, `]`, `;`, `,`, `::`, `:`, `.`].includes(token[0])) {
            minified += token[0];
        } else if (token[0] === `..`) {
            minified += ` ..`;
        } else if (token[0] === `(`) {
            if (prevType === `k` || prevType === `o` || prevType === `,`) {
                minified += ' ';
            }
            minified += token[0];
        } else if (token[0] === `[`) {
            if (!noSpace) {
                minified += ' ';
            }
            minified += token[0];
        } else if (token[0] === `k` || token[0] === 'i') {
            if (!noSpace) {
                minified += ' ';
            }
            minified += token[1]?.toLowerCase();
        } else {
            if (!noSpace) {
                minified += ' ';
            }
            minified += token[1];
        }
        prevType = token[0];
    }
    return minified;
}
